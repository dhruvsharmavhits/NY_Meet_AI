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
  const localIceCandidateCountsRef = useRef<Record<string, number>>({});
  const remoteIceCandidateCountsRef = useRef<Record<string, number>>({});
  const ontrackFiredRef = useRef<Record<string, Set<string>>>({});


  const createPeerConnection = useCallback((sid: string) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        localIceCandidateCountsRef.current[sid] = (localIceCandidateCountsRef.current[sid] ?? 0) + 1;
      } else {
      }
      if (event.candidate) {
        getSocket().emit("signal", { to: sid, type: "ice-candidate", payload: event.candidate });
      }
    };
    pc.onicegatheringstatechange = () => {
    };
    pc.oniceconnectionstatechange = () => {
    };
    pc.onconnectionstatechange = () => {
    };
    pc.onsignalingstatechange = () => {
    };
    pc.ontrack = (event) => {
      (ontrackFiredRef.current[sid] ??= new Set()).add(event.track.kind);
      let isScreen = false;

      if (event.track.kind === "video") {
        const videoTransceivers = pc
          .getTransceivers()
          .filter(
            (transceiver) =>
              transceiver.receiver.track?.kind === "video"
          );

        const transceiverIndex = event.transceiver
          ? videoTransceivers.indexOf(event.transceiver)
          : -1;

        isScreen = transceiverIndex > 0;

      }

      const streamsRef = isScreen
        ? remoteScreenMediaStreamsRef
        : remoteMediaStreamsRef;
      const prevStream = streamsRef.current[sid];
      const existingTracks = prevStream ? prevStream.getTracks().filter((t) => t !== event.track) : [];
      const stream = new MediaStream([...existingTracks, event.track]);
      streamsRef.current[sid] = stream;
      if (isScreen) {
        setRemoteScreenStreams((prev) => ({ ...prev, [sid]: stream }));
      } else {
        setRemoteStreams((prev) => ({ ...prev, [sid]: stream }));
      }
    };

    peerConnections.current[sid] = pc;
    return pc;
  }, []);

  const attachOutgoingTracksAsOfferer = useCallback(
    async (sid: string, pc: RTCPeerConnection) => {
      const stream = localStreamRef.current;
      const audioTrack = stream?.getAudioTracks()[0] ?? null;
      if (audioTrack) {
      }
      const videoTrack = cameraTrackRef.current;


      const audioTransceiver = pc.addTransceiver("audio", {
        direction: "sendrecv",
      });

      audioSendersRef.current[sid] = audioTransceiver.sender;

      if (audioTrack) {
        try {
          await audioTransceiver.sender.replaceTrack(audioTrack);
          const audioSender = audioTransceiver.sender;

        } catch (err) {
          throw err;
        }
      }

      const videoTransceiver = pc.addTransceiver("video", {
        direction: "sendrecv",
      });

      videoSendersRef.current[sid] = videoTransceiver.sender;

      if (videoTrack) {
        videoTransceiver.sender
          .replaceTrack(videoTrack)
          .then(() => {
            if (stream) {
              videoTransceiver.sender.setStreams(stream);
            }

          })
          .catch((err) => {
          });
      }

    },
    []
  );

  const attachOutgoingTracksAsAnswerer = useCallback(
    async (sid: string, pc: RTCPeerConnection) => {
      const stream = localStreamRef.current;

      const audioTrack = stream?.getAudioTracks()[0] ?? null;
      if (audioTrack) {
      }
      const videoTrack = cameraTrackRef.current;


      const audioTransceiver = pc
        .getTransceivers()
        .find(
          (t) =>
            t.receiver.track?.kind === "audio"
        );

      if (!audioTransceiver) {
      } else {
        audioTransceiver.direction = "sendrecv";

        if (audioTrack) {
          try {
            await audioTransceiver.sender.replaceTrack(audioTrack);
            const audioSender = audioTransceiver.sender;

            const statsInterval = window.setInterval(async () => {
              if (pc.connectionState === "closed") {
                window.clearInterval(statsInterval);
                return;
              }


            }, 3000);
          } catch (err) {
            throw err;
          }
        }

        audioSendersRef.current[sid] = audioTransceiver.sender;
      }

      const videoTransceiver = pc
        .getTransceivers()
        .find(
          (t) =>
            t.receiver.track?.kind === "video"
        );

      if (videoTransceiver) {
        videoTransceiver.direction = "sendrecv";

        if (videoTrack) {
          videoTransceiver.sender
            .replaceTrack(videoTrack)
            .catch((err) => {
            });
        }

        videoSendersRef.current[sid] = videoTransceiver.sender;
      }
    },
    []
  );

  const closePeerConnection = useCallback((sid: string) => {
    peerConnections.current[sid]?.close();
    delete peerConnections.current[sid];
    delete videoSendersRef.current[sid];
    delete audioSendersRef.current[sid];
    delete screenSendersRef.current[sid];
    delete remoteMediaStreamsRef.current[sid];
    delete remoteScreenMediaStreamsRef.current[sid];
    delete localIceCandidateCountsRef.current[sid];
    delete remoteIceCandidateCountsRef.current[sid];
    delete ontrackFiredRef.current[sid];
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
    const stream = initialStream;

    async function start() {
      if (cancelled) return;
      micOnRef.current = initialMicOn;
      cameraOnRef.current = initialCameraOn;
      setMicOn(initialMicOn);
      setCameraOn(initialCameraOn);
      const socket = getSocket();

      if (stream) {
        localStreamRef.current = stream;
        cameraTrackRef.current = stream.getVideoTracks()[0] ?? null;
        const audioTrack = stream.getAudioTracks()[0];
        setLocalStream(stream);
        if (audioTrack) audioTrack.enabled = initialMicOn;
        if (cameraTrackRef.current) cameraTrackRef.current.enabled = initialCameraOn;

        setLocalStream(stream);

        stopAudioCaptureRef.current?.();
        stopAudioCaptureRef.current = audioTrack
          ? startAudioCapture(stream, activeRoomCode, socket)
          : null;
      }

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

            await attachOutgoingTracksAsOfferer(peer.sid, pc);

            if (peer.screen_sharing) {
              const screenRecvTransceiver = pc.addTransceiver("video", {
                direction: "recvonly",
              });

            }

            const offer = await pc.createOffer();

            await pc.setLocalDescription(offer);


            socket.emit("signal", {
              to: peer.sid,
              type: "offer",
              payload: pc.localDescription,
            });
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
            const offerSdp = (payload as RTCSessionDescriptionInit).sdp;
            await pc.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit));
            await attachOutgoingTracksAsAnswerer(from, pc);

if (screenSharingRef.current && screenTrackRef.current) {
  const videoTransceivers = pc
    .getTransceivers()
    .filter(
      (t) =>
        t.receiver.track?.kind === "video"
    );

  const screenTransceiver = videoTransceivers[1];

  if (screenTransceiver) {
    screenTransceiver.direction = "sendrecv";

    await screenTransceiver.sender.replaceTrack(
      screenTrackRef.current
    );

    screenSendersRef.current[from] = screenTransceiver.sender;

  } else {
  }
}
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit("signal", { to: from, type: "answer", payload: pc.localDescription });
          } else if (type === "answer") {
            const pc = peerConnections.current[from];
            if (!pc) {
              return;
            }
            await pc.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit));
          } else if (type === "ice-candidate") {
            const pc = peerConnections.current[from];
            if (!pc) {
              return;
            }
            try {
              await pc.addIceCandidate(new RTCIceCandidate(payload as RTCIceCandidateInit));
              remoteIceCandidateCountsRef.current[from] = (remoteIceCandidateCountsRef.current[from] ?? 0) + 1;
            } catch (err) {
            }
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
    } else {
    }
  }, [roomCode]);

  const toggleCamera = useCallback(async () => {
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
        sender.replaceTrack(null).catch(() => { });
      });

      cameraOnRef.current = false;
      setCameraOn(false);
      if (roomCode) {
        getSocket().emit("media-state", { room_code: roomCode, mic_on: micOnRef.current, camera_on: false });
      }
      return;
    }

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
        sender.replaceTrack(newTrack).catch((err) => {
        });

        if (localStreamRef.current) {
          sender.setStreams(localStreamRef.current);
        }
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
      sender.replaceTrack(null).catch(() => { });
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

      await Promise.all(
        Object.entries(peerConnections.current).map(async ([sid, pc]) => {
          if (pc.signalingState !== "stable") {
            return;
          }

          const screenTransceiver = pc.addTransceiver(screenTrack, {
            direction: "sendrecv",
          });

          screenSendersRef.current[sid] = screenTransceiver.sender;

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          getSocket().emit("signal", {
            to: sid,
            type: "offer",
            payload: pc.localDescription,
          });
        })
      );

      screenTrack.onended = () => stopScreenShare();

      setScreenSharing(true);
      if (roomCode) {
        getSocket().emit("screen-share-state", { room_code: roomCode, sharing: true });
      }
    } catch {
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