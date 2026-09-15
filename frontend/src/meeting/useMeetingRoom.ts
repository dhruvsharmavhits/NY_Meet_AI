import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket, disconnectSocket } from "@/services/socket";
import { startAudioCapture } from "@/meeting/audioCapture";
import { attachPeerDiagnostics, logDevices, logStream, logTrackEvent } from "@/meeting/mediaDiagnostics";
import { fetchIceServers } from "@/services/api";
import type { Caption, ChatMessage, Participant } from "@/meeting/types";


const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

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
  accessToken?: string;
}

export function useMeetingRoom({
  roomCode,
  enabled,
  initialStream,
  initialMicOn,
  initialCameraOn,
  accessToken,
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
  const [micConnecting, setMicConnecting] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consultationEnded, setConsultationEnded] = useState(false);
  const [joinRejected, setJoinRejected] = useState(false);

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
  const stopScreenShareRef = useRef<(() => void) | null>(null);
  const everConnectedRef = useRef(false);
  const consultationEndedRef = useRef(false);
  const localIceCandidateCountsRef = useRef<Record<string, number>>({});
  const remoteIceCandidateCountsRef = useRef<Record<string, number>>({});
  const ontrackFiredRef = useRef<Record<string, Set<string>>>({});
  const peerDiagnosticsRef = useRef<Record<string, () => void>>({});
  const iceServersRef = useRef<RTCIceServer[]>(ICE_SERVERS.iceServers ?? []);
  const offererForRef = useRef<Record<string, boolean>>({});
  const iceRestartAttemptsRef = useRef<Record<string, number>>({});
  const iceRestartTimersRef = useRef<Record<string, number>>({});


  // ICE restart is the standard recovery when connectivity checks fail (bad
  // relay, NAT rebinding, network switch). Only the original offerer drives
  // it; the answerer asks the offerer to do it over the existing signal
  // channel. Bounded attempts with backoff so a genuinely unreachable peer
  // doesn't loop forever.
  const requestIceRestart = useCallback((sid: string, pc: RTCPeerConnection) => {
    const attempts = iceRestartAttemptsRef.current[sid] ?? 0;
    if (attempts >= 3 || pc.signalingState === "closed") return;
    if (iceRestartTimersRef.current[sid]) return;

    const delay = 1000 * Math.pow(2, attempts);
    iceRestartTimersRef.current[sid] = window.setTimeout(async () => {
      delete iceRestartTimersRef.current[sid];
      if (peerConnections.current[sid] !== pc || pc.signalingState === "closed") return;
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") return;
      iceRestartAttemptsRef.current[sid] = attempts + 1;
      console.log(`[diag] pc ${sid.slice(0, 6)} ICE restart attempt ${attempts + 1}`);

      if (!offererForRef.current[sid]) {
        getSocket().emit("signal", { to: sid, type: "ice-restart", payload: {} });
        return;
      }
      try {
        pc.restartIce();
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);
        getSocket().emit("signal", { to: sid, type: "offer", payload: pc.localDescription });
      } catch (err) {
        console.log(`[diag] pc ${sid.slice(0, 6)} ICE restart failed ${String(err)}`);
      }
    }, delay);
  }, []);

  const createPeerConnection = useCallback((sid: string) => {
    const pc = new RTCPeerConnection({ ...ICE_SERVERS, iceServers: iceServersRef.current });

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
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
        iceRestartAttemptsRef.current[sid] = 0;
      } else if (pc.iceConnectionState === "failed") {
        requestIceRestart(sid, pc);
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") requestIceRestart(sid, pc);
    };
    pc.onsignalingstatechange = () => {
    };
    pc.ontrack = (event) => {
      (ontrackFiredRef.current[sid] ??= new Set()).add(event.track.kind);
      logTrackEvent(`ontrack from ${sid.slice(0, 6)}`, event.track);
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

      if (isScreen) {
        // A peer may share several times over the call; each share must
        // replace the previous track, never accumulate next to it (a <video>
        // only plays the first track of its stream, so stale muted tracks
        // in front of the live one render as a black screen).
        const stream = new MediaStream([event.track]);
        remoteScreenMediaStreamsRef.current[sid] = stream;
        setRemoteScreenStreams((prev) => ({ ...prev, [sid]: stream }));
        return;
      }

      const prevStream = remoteMediaStreamsRef.current[sid];
      const existingTracks = prevStream
        ? prevStream.getTracks().filter((t) => t !== event.track && t.kind !== event.track.kind)
        : [];
      const stream = new MediaStream([...existingTracks, event.track]);
      remoteMediaStreamsRef.current[sid] = stream;
      setRemoteStreams((prev) => ({ ...prev, [sid]: stream }));
    };

    peerDiagnosticsRef.current[sid]?.();
    peerDiagnosticsRef.current[sid] = attachPeerDiagnostics(sid, pc);
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
    peerDiagnosticsRef.current[sid]?.();
    delete peerDiagnosticsRef.current[sid];
    if (iceRestartTimersRef.current[sid]) window.clearTimeout(iceRestartTimersRef.current[sid]);
    delete iceRestartTimersRef.current[sid];
    delete iceRestartAttemptsRef.current[sid];
    delete offererForRef.current[sid];
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
      try {
        const servers = await fetchIceServers();
        if (servers.length > 0) iceServersRef.current = servers;
        console.log(`[diag] ice servers ${JSON.stringify(servers.map((s) => s.urls))}`);
      } catch (err) {
        console.log(`[diag] ice-servers fetch failed, using defaults ${String(err)}`);
      }
      if (cancelled) return;
      micOnRef.current = initialMicOn;
      cameraOnRef.current = initialCameraOn;
      setMicOn(initialMicOn);
      setCameraOn(initialCameraOn);
      const socket = getSocket();

      if (stream) {
        localStreamRef.current = stream;
        logStream("local stream at call start", stream);
        stream.getTracks().forEach((t) => logTrackEvent("local track", t));
        logDevices("at call start");
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
          access_token: accessToken,
          admin_token: typeof window !== "undefined" ? localStorage.getItem("admin_token") : null,
        });
      });

      socket.on("join-rejected", () => {
        setJoinRejected(true);
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
        if (everConnectedRef.current && !consultationEndedRef.current) setReconnecting(true);
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
            offererForRef.current[peer.sid] = true;

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

            // Any video transceiver beyond the first (camera) one is a
            // screen-share m-line. Exactly one of them may carry our own
            // screen track (the one we already used with this peer, or the
            // recvonly one a newly joined peer opened for our ongoing share);
            // every other one is explicitly recvonly so the answer accepts the
            // incoming video.
            const screenTransceivers = pc
              .getTransceivers()
              .filter((t) => t.receiver.track?.kind === "video")
              .slice(1);
            const sharing = screenSharingRef.current && screenTrackRef.current;
            let own = screenTransceivers.find((t) => t.sender === screenSendersRef.current[from]);
            if (sharing && !own) own = screenTransceivers[screenTransceivers.length - 1];
            for (const t of screenTransceivers) {
              if (sharing && t === own) {
                t.direction = "sendrecv";
                await t.sender.replaceTrack(screenTrackRef.current);
                screenSendersRef.current[from] = t.sender;
              } else {
                t.direction = "recvonly";
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
          } else if (type === "ice-restart") {
            const pc = peerConnections.current[from];
            if (!pc || !offererForRef.current[from] || pc.signalingState !== "stable") return;
            try {
              pc.restartIce();
              const offer = await pc.createOffer({ iceRestart: true });
              await pc.setLocalDescription(offer);
              socket.emit("signal", { to: from, type: "offer", payload: pc.localDescription });
            } catch (err) {
              console.log(`[diag] pc ${from.slice(0, 6)} ICE restart (requested) failed ${String(err)}`);
            }
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

      socket.on("consultation-ended", () => {
        consultationEndedRef.current = true;
        setConsultationEnded(true);
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

      // only one person can share at a time — the server tells us when
      // someone else started sharing while we were already sharing
      socket.on("force-stop-screen-share", () => {
        stopScreenShareRef.current?.();
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
      socket.off("consultation-ended");
      socket.off("join-rejected");
      socket.off("chat-message");
      socket.off("caption");
      socket.off("partial-transcript");
      socket.off("media-state");
      socket.off("screen-share-state");
      socket.off("force-stop-screen-share");
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

  const toggleMic = useCallback(async () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      micOnRef.current = track.enabled;
      setMicOn(track.enabled);
      if (roomCode) {
        getSocket().emit("media-state", { room_code: roomCode, mic_on: track.enabled, camera_on: cameraOnRef.current });
      }
      return;
    }

    // No mic track yet — either permission was never granted or no device was
    // found when the call started. Re-request it now instead of silently
    // doing nothing, mirroring toggleCamera's re-acquisition below.
    setMicConnecting(true);
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
      const newTrack = audioStream.getAudioTracks()[0];
      if (!newTrack) return;

      if (localStreamRef.current) {
        localStreamRef.current.addTrack(newTrack);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      } else {
        const newStream = new MediaStream([newTrack]);
        localStreamRef.current = newStream;
        setLocalStream(newStream);
      }

      Object.values(audioSendersRef.current).forEach((sender) => {
        sender.replaceTrack(newTrack).catch(() => {});
      });

      // captions/transcript are driven off a separate capture pipeline that
      // only ever starts if a mic track existed at call setup — start it now
      // since this is the first time one has actually become available.
      if (!stopAudioCaptureRef.current && roomCode && localStreamRef.current) {
        stopAudioCaptureRef.current = startAudioCapture(localStreamRef.current, roomCode, getSocket());
      }

      micOnRef.current = true;
      setMicOn(true);
      if (roomCode) {
        getSocket().emit("media-state", { room_code: roomCode, mic_on: true, camera_on: cameraOnRef.current });
      }
    } catch (err) {
      console.error("Unable to start microphone", err);
    } finally {
      setMicConnecting(false);
    }
  }, [roomCode]);

  const toggleCamera = useCallback(async () => {
    if (cameraOnRef.current) {
      const local = localStreamRef.current;
      if (local) {
        local.getVideoTracks().forEach((track) => {
          track.stop();
          local.removeTrack(track);
        });
        setLocalStream(new MediaStream(local.getTracks()));
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
      // The join flow hands us a camera track that is already granted but
      // disabled. Re-enable it instead of acquiring a second one — otherwise
      // the stream ends up with two video tracks and the tile renders the
      // first (disabled) one as a black screen.
      let newTrack = localStreamRef.current?.getVideoTracks().find((t) => t.readyState === "live") ?? null;
      if (newTrack) {
        newTrack.enabled = true;
        setLocalStream(new MediaStream(localStreamRef.current!.getTracks()));
      } else {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        newTrack = videoStream.getVideoTracks()[0];
        if (localStreamRef.current) {
          localStreamRef.current.getVideoTracks().forEach((t) => localStreamRef.current?.removeTrack(t));
          localStreamRef.current.addTrack(newTrack);
          setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        } else {
          const newStream = new MediaStream([newTrack]);
          localStreamRef.current = newStream;
          setLocalStream(newStream);
        }
      }
      cameraTrackRef.current = newTrack;
      const cameraTrack = newTrack;

      Object.values(videoSendersRef.current).forEach((sender) => {
        sender.replaceTrack(cameraTrack).catch(() => {});
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
  stopScreenShareRef.current = stopScreenShare;

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
      setScreenSharing(true);

      // must reach the server (and force-stop any other current sharer)
      // BEFORE the renegotiation offer below reaches them — otherwise they
      // process our offer while still believing they're sharing too, and
      // attach their own stale screen track onto the transceiver we just
      // created for this one, corrupting it so our video never renders on
      // their side.
      if (roomCode) {
        getSocket().emit("screen-share-state", { room_code: roomCode, sharing: true });
      }

      await Promise.all(
        Object.entries(peerConnections.current).map(async ([sid, pc]) => {
          if (pc.signalingState !== "stable") {
            return;
          }

          // Re-use the m-line from a previous share with this peer rather
          // than adding a new one every time.
          const existingSender = screenSendersRef.current[sid];
          const existing = existingSender
            ? pc.getTransceivers().find((t) => t.sender === existingSender && t.currentDirection !== "stopped")
            : undefined;
          if (existing) {
            existing.direction = "sendrecv";
            await existing.sender.replaceTrack(screenTrack);
          } else {
            const screenTransceiver = pc.addTransceiver(screenTrack, { direction: "sendrecv" });
            screenSendersRef.current[sid] = screenTransceiver.sender;
          }

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
    micConnecting,
    cameraOn,
    screenSharing,
    connected,
    reconnecting,
    error,
    consultationEnded,
    joinRejected,
    sendChat,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
  };
}