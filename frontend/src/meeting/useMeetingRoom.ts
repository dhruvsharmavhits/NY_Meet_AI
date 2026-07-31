import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket, disconnectSocket } from "@/services/socket";
import { startAudioCapture } from "@/meeting/audioCapture";
import type { Caption, ChatMessage, Participant } from "@/meeting/types";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

interface UseMeetingRoomOptions {
  roomCode: string | undefined;
  enabled: boolean;
  /** Camera/mic stream already acquired in the pre-join lobby (may be null if neither device is available). */
  initialStream: MediaStream | null;
  initialMicOn: boolean;
  initialCameraOn: boolean;
}

export function useMeetingRoom({
  roomCode,
  enabled,
  initialStream,
  initialMicOn,
  initialCameraOn,
}: UseMeetingRoomOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [participants, setParticipants] = useState<Record<string, Participant>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [partialCaptions, setPartialCaptions] = useState<Record<string, string>>({});
  const [micOn, setMicOn] = useState(initialMicOn);
  const [cameraOn, setCameraOn] = useState(initialCameraOn);
  const [screenSharing, setScreenSharing] = useState(false);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const peerConnections = useRef<Record<string, RTCPeerConnection>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const stopAudioCaptureRef = useRef<(() => void) | null>(null);
  const everConnectedRef = useRef(false);

  const createPeerConnection = useCallback((sid: string) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    localStreamRef.current?.getTracks().forEach((track) => {
      pc.addTrack(track, localStreamRef.current as MediaStream);
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        getSocket().emit("signal", { to: sid, type: "ice-candidate", payload: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      setRemoteStreams((prev) => ({ ...prev, [sid]: event.streams[0] }));
    };

    peerConnections.current[sid] = pc;
    return pc;
  }, []);

  const closePeerConnection = useCallback((sid: string) => {
    peerConnections.current[sid]?.close();
    delete peerConnections.current[sid];
    setRemoteStreams((prev) => {
      const next = { ...prev };
      delete next[sid];
      return next;
    });
    setParticipants((prev) => {
      const next = { ...prev };
      delete next[sid];
      return next;
    });
  }, []);

  useEffect(() => {
    if (!enabled || !roomCode) return;
    const activeRoomCode = roomCode;

    let cancelled = false;
    // The lobby already acquired (and let the user preview/toggle) the
    // camera/mic stream — this hook just takes ownership of it rather than
    // requesting devices again.
    const stream = initialStream;

    async function start() {
      if (cancelled) return;

      if (stream) {
        localStreamRef.current = stream;
        cameraTrackRef.current = stream.getVideoTracks()[0] ?? null;
        setLocalStream(stream);
      }

      const socket = getSocket();
      socket.connect();

      socket.on("connect", () => {
        setConnected(true);
        setReconnecting(false);
        everConnectedRef.current = true;
        socket.emit("join-room", { room_code: activeRoomCode });
        if (stream) {
          stopAudioCaptureRef.current?.();
          stopAudioCaptureRef.current = startAudioCapture(stream, activeRoomCode, socket);
        }
      });

      socket.on("connect_error", () => {
        if (everConnectedRef.current) {
          setReconnecting(true);
        } else {
          setError("Could not connect to the meeting server. Retrying...");
        }
      });

      socket.on("disconnect", () => {
        setConnected(false);
        if (everConnectedRef.current) setReconnecting(true);
        Object.keys(peerConnections.current).forEach((sid) => peerConnections.current[sid].close());
        peerConnections.current = {};
        setRemoteStreams({});
        setParticipants({});
        // socket.io-client auto-reconnects; on reconnect the "connect" handler
        // re-emits join-room and rebuilds the mesh from scratch with fresh sids.
      });

      socket.on(
        "existing-peers",
        async (data: { peers: { sid: string; user_id: string; full_name: string }[] }) => {
          for (const peer of data.peers) {
            setParticipants((prev) => ({ ...prev, [peer.sid]: peer }));
            const pc = createPeerConnection(peer.sid);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit("signal", { to: peer.sid, type: "offer", payload: pc.localDescription });
          }
        }
      );

      socket.on("peer-joined", (peer: Participant) => {
        setParticipants((prev) => ({ ...prev, [peer.sid]: peer }));
      });

      socket.on(
        "signal",
        async (data: { from: string; type: string; payload: RTCSessionDescriptionInit | RTCIceCandidateInit }) => {
          const { from, type, payload } = data;

          if (type === "offer") {
            const pc = peerConnections.current[from] ?? createPeerConnection(from);
            await pc.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit("signal", { to: from, type: "answer", payload: pc.localDescription });
          } else if (type === "answer") {
            const pc = peerConnections.current[from];
            await pc?.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit));
          } else if (type === "ice-candidate") {
            const pc = peerConnections.current[from];
            await pc?.addIceCandidate(new RTCIceCandidate(payload as RTCIceCandidateInit));
          }
        }
      );

      socket.on("peer-left", (data: { sid: string }) => {
        closePeerConnection(data.sid);
      });

      socket.on("chat-message", (msg: ChatMessage) => {
        setMessages((prev) => [...prev, msg]);
      });

      socket.on("caption", (caption: Caption) => {
        setCaptions((prev) => [...prev.slice(-49), caption]);
        setPartialCaptions((prev) => {
          const next = { ...prev };
          delete next[caption.sid];
          return next;
        });
      });

      socket.on("partial-transcript", (data: { sid: string; text: string }) => {
        setPartialCaptions((prev) => ({ ...prev, [data.sid]: data.text }));
      });
    }

    start();

    return () => {
      cancelled = true;
      const socket = getSocket();
      if (roomCode) socket.emit("leave-room", { room_code: roomCode });
      socket.off("connect");
      socket.off("connect_error");
      socket.off("disconnect");
      socket.off("existing-peers");
      socket.off("peer-joined");
      socket.off("signal");
      socket.off("peer-left");
      socket.off("chat-message");
      socket.off("caption");
      socket.off("partial-transcript");
      disconnectSocket();

      stopAudioCaptureRef.current?.();
      stopAudioCaptureRef.current = null;

      Object.keys(peerConnections.current).forEach((sid) => peerConnections.current[sid].close());
      peerConnections.current = {};

      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
      setRemoteStreams({});
      setParticipants({});
      setConnected(false);
      setReconnecting(false);
      setError(null);
      everConnectedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, enabled, initialStream, createPeerConnection, closePeerConnection]);

  const sendChat = useCallback(
    (text: string) => {
      if (!roomCode || !text.trim()) return;
      // Don't append locally — the server broadcasts chat-message back to the
      // sender too (room broadcast includes everyone), so appending here as
      // well would show the sender's own message twice.
      getSocket().emit("chat-message", { room_code: roomCode, text, ts: Date.now() });
    },
    [roomCode]
  );

  const toggleMic = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setMicOn(track.enabled);
    }
  }, []);

  const toggleCamera = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setCameraOn(track.enabled);
    }
  }, []);

  const toggleScreenShare = useCallback(async () => {
    if (!localStreamRef.current) return;

    if (!screenSharing) {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];

      Object.values(peerConnections.current).forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        sender?.replaceTrack(screenTrack);
      });

      screenTrack.onended = () => {
        const cameraTrack = cameraTrackRef.current;
        if (cameraTrack) {
          Object.values(peerConnections.current).forEach((pc) => {
            const sender = pc.getSenders().find((s) => s.track?.kind === "video");
            sender?.replaceTrack(cameraTrack);
          });
        }
        setScreenSharing(false);
      };

      setScreenSharing(true);
    } else {
      const cameraTrack = cameraTrackRef.current;
      if (cameraTrack) {
        Object.values(peerConnections.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          sender?.replaceTrack(cameraTrack);
        });
      }
      setScreenSharing(false);
    }
  }, [screenSharing]);

  return {
    localStream,
    remoteStreams,
    participants,
    messages,
    captions,
    partialCaptions,
    micOn,
    cameraOn,
    screenSharing,
    connected,
    reconnecting,
    error,
    sendChat,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
  };
}
