import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket, disconnectSocket } from "@/services/socket";
import { startAudioCapture } from "@/meeting/audioCapture";
import type { Caption, ChatMessage, Participant } from "@/meeting/types";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
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
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [remoteScreenStreams, setRemoteScreenStreams] = useState<Record<string, MediaStream>>({});
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
  const videoSendersRef = useRef<Record<string, RTCRtpSender>>({});
  const audioSendersRef = useRef<Record<string, RTCRtpSender>>({});
  const screenSendersRef = useRef<Record<string, RTCRtpSender>>({});
  const outgoingStreamRef = useRef<MediaStream | null>(null);
  if (outgoingStreamRef.current === null && typeof window !== "undefined") {
    outgoingStreamRef.current = new MediaStream();
  }
  const remoteMediaStreamsRef = useRef<Record<string, MediaStream>>({});
  const remoteScreenMediaStreamsRef = useRef<Record<string, MediaStream>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenSharingRef = useRef(false);
  const micOnRef = useRef(initialMicOn);
  const cameraOnRef = useRef(initialCameraOn);
  const stopAudioCaptureRef = useRef<(() => void) | null>(null);
  const everConnectedRef = useRef(false);

  const createPeerConnection = useCallback((sid: string) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        getSocket().emit("signal", { to: sid, type: "ice-candidate", payload: event.candidate });
      }
    };
    pc.ontrack = (event) => {
      // Don't rely on event.streams[0] — whether it's populated depends on
      // both sides correctly negotiating an msid/stream grouping, which the
      // answerer's reused (auto-created-by-setRemoteDescription) transceiver
      // does not do by default, leaving it empty. Build our own per-peer
      // MediaStream from whatever tracks arrive instead — robust regardless
      // of msid negotiation. The screen track is sent via addTrack() with no
      // stream, so an empty event.streams also doubles as the camera/screen
      // signal for video tracks.
      const isScreen = event.track.kind === "video" && event.streams.length === 0;
      const streamsRef = isScreen ? remoteScreenMediaStreamsRef : remoteMediaStreamsRef;
      let stream = streamsRef.current[sid];
      if (!stream) {
        stream = new MediaStream();
        streamsRef.current[sid] = stream;
      }
      if (!stream.getTracks().includes(event.track)) {
        stream.addTrack(event.track);
      }
      if (isScreen) {
        setRemoteScreenStreams((prev) => ({ ...prev, [sid]: stream }));
      } else {
        setRemoteStreams((prev) => ({ ...prev, [sid]: stream }));
      }
    };

    peerConnections.current[sid] = pc;
    return pc;
  }, []);

  // As the OFFERER (we're initiating this connection, before any remote
  // description exists), we must create our own audio/video transceivers —
  // there's nothing yet for us to reuse.
  const attachOutgoingTracksAsOfferer = useCallback((sid: string, pc: RTCPeerConnection) => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0] ?? null;
    const videoTrack = cameraTrackRef.current;
    const streams = outgoingStreamRef.current ? [outgoingStreamRef.current] : undefined;

    const audioTransceiver = pc.addTransceiver(audioTrack ?? "audio", { direction: "sendrecv", streams });
    audioSendersRef.current[sid] = audioTransceiver.sender;

    const videoTransceiver = pc.addTransceiver(videoTrack ?? "video", { direction: "sendrecv", streams });
    videoSendersRef.current[sid] = videoTransceiver.sender;
  }, []);

  // As the ANSWERER, setRemoteDescription(offer) auto-creates a local
  // transceiver per incoming m-line (recvonly by default, no track). Reuse
  // those — do NOT pre-create our own transceivers via addTransceiver()
  // before setRemoteDescription(): Chromium does not match/reuse them against
  // the incoming offer, so they end up orphaned (mid stays null) while a
  // fresh recvonly-only transceiver handles the real connection — silently
  // dropping our outgoing audio/video to this peer from the very start.
  const attachOutgoingTracksAsAnswerer = useCallback((sid: string, pc: RTCPeerConnection) => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0] ?? null;
    const videoTrack = cameraTrackRef.current;

    const audioTransceiver = pc.getTransceivers().find((t) => t.receiver.track?.kind === "audio");
    if (audioTransceiver) {
      audioTransceiver.direction = "sendrecv";
      audioTransceiver.sender.setStreams?.(outgoingStreamRef.current ?? new MediaStream());
      if (audioTrack) audioTransceiver.sender.replaceTrack(audioTrack).catch(() => {});
      audioSendersRef.current[sid] = audioTransceiver.sender;
    }

    const videoTransceiver = pc.getTransceivers().find((t) => t.receiver.track?.kind === "video");
    if (videoTransceiver) {
      videoTransceiver.direction = "sendrecv";
      videoTransceiver.sender.setStreams?.(outgoingStreamRef.current ?? new MediaStream());
      if (videoTrack) videoTransceiver.sender.replaceTrack(videoTrack).catch(() => {});
      videoSendersRef.current[sid] = videoTransceiver.sender;
    }
  }, []);

  const closePeerConnection = useCallback((sid: string) => {
    peerConnections.current[sid]?.close();
    delete peerConnections.current[sid];
    delete videoSendersRef.current[sid];
    delete audioSendersRef.current[sid];
    delete screenSendersRef.current[sid];
    delete remoteMediaStreamsRef.current[sid];
    delete remoteScreenMediaStreamsRef.current[sid];
    setRemoteStreams((prev) => {
      const next = { ...prev };
      delete next[sid];
      return next;
    });
    setRemoteScreenStreams((prev) => {
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
      micOnRef.current = initialMicOn;
      cameraOnRef.current = initialCameraOn;
      setMicOn(initialMicOn);
      setCameraOn(initialCameraOn);
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
        socket.emit("join-room", {
          room_code: activeRoomCode,
          mic_on: micOnRef.current,
          camera_on: cameraOnRef.current,
        });
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
        videoSendersRef.current = {};
        audioSendersRef.current = {};
        screenSendersRef.current = {};
        remoteMediaStreamsRef.current = {};
        remoteScreenMediaStreamsRef.current = {};
        setRemoteStreams({});
        setRemoteScreenStreams({});
        setParticipants({});
        // socket.io-client auto-reconnects; on reconnect the "connect" handler
        // re-emits join-room and rebuilds the mesh from scratch with fresh sids.
      });

      socket.on(
        "existing-peers",
        async (data: {
          peers: { sid: string; user_id: string; full_name: string; mic_on?: boolean; camera_on?: boolean; screen_sharing?: boolean }[];
        }) => {
          for (const peer of data.peers) {
            setParticipants((prev) => ({
              ...prev,
              [peer.sid]: {
                sid: peer.sid,
                user_id: peer.user_id,
                full_name: peer.full_name,
                micOn: peer.mic_on ?? true,
                cameraOn: peer.camera_on ?? true,
                screenSharing: peer.screen_sharing ?? false,
              },
            }));
            const pc = createPeerConnection(peer.sid);
            attachOutgoingTracksAsOfferer(peer.sid, pc);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit("signal", { to: peer.sid, type: "offer", payload: pc.localDescription });
          }
        }
      );

      socket.on(
        "peer-joined",
        (peer: { sid: string; user_id: string; full_name: string; mic_on?: boolean; camera_on?: boolean; screen_sharing?: boolean }) => {
          setParticipants((prev) => ({
            ...prev,
            [peer.sid]: {
              sid: peer.sid,
              user_id: peer.user_id,
              full_name: peer.full_name,
              micOn: peer.mic_on ?? true,
              cameraOn: peer.camera_on ?? true,
              screenSharing: peer.screen_sharing ?? false,
            },
          }));
        }
      );

      socket.on(
        "signal",
        async (data: { from: string; type: string; payload: RTCSessionDescriptionInit | RTCIceCandidateInit }) => {
          const { from, type, payload } = data;

          if (type === "offer") {
            const pc = peerConnections.current[from] ?? createPeerConnection(from);
            await pc.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit));
            attachOutgoingTracksAsAnswerer(from, pc);
            if (screenSharingRef.current && screenTrackRef.current && !screenSendersRef.current[from]) {
              screenSendersRef.current[from] = pc.addTrack(screenTrackRef.current);
            }
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

      socket.on("media-state", (data: { sid: string; mic_on: boolean; camera_on: boolean }) => {
        setParticipants((prev) => {
          const p = prev[data.sid];
          if (!p) return prev;
          return { ...prev, [data.sid]: { ...p, micOn: data.mic_on, cameraOn: data.camera_on } };
        });
      });

      socket.on("screen-share-state", (data: { sid: string; sharing: boolean }) => {
        setParticipants((prev) => {
          const p = prev[data.sid];
          if (!p) return prev;
          return { ...prev, [data.sid]: { ...p, screenSharing: data.sharing } };
        });
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
      socket.off("media-state");
      socket.off("screen-share-state");
      disconnectSocket();

      stopAudioCaptureRef.current?.();
      stopAudioCaptureRef.current = null;

      Object.keys(peerConnections.current).forEach((sid) => peerConnections.current[sid].close());
      peerConnections.current = {};
      videoSendersRef.current = {};
      audioSendersRef.current = {};
      screenSendersRef.current = {};
      remoteMediaStreamsRef.current = {};
      remoteScreenMediaStreamsRef.current = {};

      screenTrackRef.current?.stop();
      screenTrackRef.current = null;
      screenSharingRef.current = false;
      setScreenStream(null);
      setRemoteScreenStreams({});

      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      cameraTrackRef.current = null;
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
      micOnRef.current = track.enabled;
      setMicOn(track.enabled);
      if (roomCode) {
        getSocket().emit("media-state", { room_code: roomCode, mic_on: track.enabled, camera_on: cameraOnRef.current });
      }
    }
  }, [roomCode]);

  const toggleCamera = useCallback(async () => {
    // Turn camera OFF — stop the hardware track (release the camera light)
    // and tell every connection to stop sending video, the same way the
    // pre-join lobby's toggle behaves.
    if (cameraOnRef.current) {
      const track = localStreamRef.current?.getVideoTracks()[0];
      if (track) {
        track.stop();
        localStreamRef.current?.removeTrack(track);
        if (localStreamRef.current) {
          setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        }
      }
      cameraTrackRef.current = null;

      Object.values(videoSendersRef.current).forEach((sender) => {
        sender.replaceTrack(null).catch(() => {});
      });

      cameraOnRef.current = false;
      setCameraOn(false);
      if (roomCode) {
        getSocket().emit("media-state", { room_code: roomCode, mic_on: micOnRef.current, camera_on: false });
      }
      return;
    }

    // Turn camera ON — (re)acquire the device and swap it into every
    // connection via replaceTrack, no renegotiation needed since the video
    // transceiver was created up front for every peer connection.
    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const newTrack = videoStream.getVideoTracks()[0];
      cameraTrackRef.current = newTrack;

      if (localStreamRef.current) {
        localStreamRef.current.addTrack(newTrack);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      } else {
        const newStream = new MediaStream([newTrack]);
        localStreamRef.current = newStream;
        setLocalStream(newStream);
      }

      Object.values(videoSendersRef.current).forEach((sender) => {
        sender.replaceTrack(newTrack).catch(() => {});
      });

      cameraOnRef.current = true;
      setCameraOn(true);
      if (roomCode) {
        getSocket().emit("media-state", { room_code: roomCode, mic_on: micOnRef.current, camera_on: true });
      }
    } catch (err) {
      console.error("Unable to start camera", err);
    }
  }, [roomCode]);

  const stopScreenShare = useCallback(() => {
    screenTrackRef.current?.stop();
    screenTrackRef.current = null;
    screenSharingRef.current = false;
    setScreenStream(null);

    Object.values(screenSendersRef.current).forEach((sender) => {
      sender.replaceTrack(null).catch(() => {});
    });

    setScreenSharing(false);
    if (roomCode) {
      getSocket().emit("screen-share-state", { room_code: roomCode, sharing: false });
    }
  }, [roomCode]);

  const toggleScreenShare = useCallback(async () => {
    if (screenSharingRef.current) {
      stopScreenShare();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = stream.getVideoTracks()[0];
      screenTrackRef.current = screenTrack;
      screenSharingRef.current = true;
      setScreenStream(stream);

      // Sent as its own track/transceiver (not swapped into the camera's via
      // replaceTrack) so remote participants keep seeing the camera feed too
      // — this needs a renegotiation round trip per peer connection.
      await Promise.all(
        Object.entries(peerConnections.current).map(async ([sid, pc]) => {
          screenSendersRef.current[sid] = pc.addTrack(screenTrack);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          getSocket().emit("signal", { to: sid, type: "offer", payload: pc.localDescription });
        })
      );

      // Fires when the browser's native "Stop sharing" control is used
      // instead of our in-app toolbar button.
      screenTrack.onended = () => stopScreenShare();

      setScreenSharing(true);
      if (roomCode) {
        getSocket().emit("screen-share-state", { room_code: roomCode, sharing: true });
      }
    } catch {
      // user cancelled the share picker — nothing to do
    }
  }, [roomCode, stopScreenShare]);

  return {
    localStream,
    screenStream,
    remoteStreams,
    remoteScreenStreams,
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
