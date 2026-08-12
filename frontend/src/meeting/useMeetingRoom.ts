import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket, disconnectSocket } from "@/services/socket";
import { startAudioCapture } from "@/meeting/audioCapture";
import type { Caption, ChatMessage, Participant } from "@/meeting/types";

// Stringified inline (not passed as a separate console arg) so a plain
// copy-paste of the console — which collapses object args to the literal
// text "Object" — still captures every field.
const rtcLog = (msg: string, data?: unknown) =>
  console.log(`[rtc] ${msg}${data !== undefined ? " " + JSON.stringify(data) : ""}`);

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
  // if (outgoingStreamRef.current === null && typeof window !== "undefined") {
  //   outgoingStreamRef.current = new MediaStream();
  // }
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

  const logPeerState = useCallback((sid: string, pc: RTCPeerConnection) => {
    rtcLog("peer state", {
      sid,
      signalingState: pc.signalingState,
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
      iceGatheringState: pc.iceGatheringState,
      hasLocalDescription: !!pc.localDescription,
      hasRemoteDescription: !!pc.remoteDescription,
      localIceCandidates: localIceCandidateCountsRef.current[sid] ?? 0,
      remoteIceCandidates: remoteIceCandidateCountsRef.current[sid] ?? 0,
      ontrackFired: Array.from(ontrackFiredRef.current[sid] ?? []),
    });
  }, []);

  const createPeerConnection = useCallback((sid: string) => {
    rtcLog("createPeerConnection", { sid });
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        localIceCandidateCountsRef.current[sid] = (localIceCandidateCountsRef.current[sid] ?? 0) + 1;
        rtcLog("onicecandidate -> sending", { sid, type: event.candidate.type, protocol: event.candidate.protocol });
      } else {
        rtcLog("onicecandidate: gathering complete", { sid });
      }
      logPeerState(sid, pc);
      if (event.candidate) {
        getSocket().emit("signal", { to: sid, type: "ice-candidate", payload: event.candidate });
      }
    };
    pc.onicegatheringstatechange = () => {
      rtcLog("iceGatheringState", { sid, state: pc.iceGatheringState });
      logPeerState(sid, pc);
    };
    pc.oniceconnectionstatechange = () => {
      rtcLog("iceConnectionState", { sid, state: pc.iceConnectionState });
      logPeerState(sid, pc);
    };
    pc.onconnectionstatechange = () => {
      rtcLog("connectionState", { sid, state: pc.connectionState });
      logPeerState(sid, pc);
    };
    pc.onsignalingstatechange = () => {
      rtcLog("signalingState", { sid, state: pc.signalingState });
      logPeerState(sid, pc);
    };
    pc.ontrack = (event) => {
      (ontrackFiredRef.current[sid] ??= new Set()).add(event.track.kind);
      rtcLog("ontrack", {
        sid,
        kind: event.track.kind,
        trackId: event.track.id,
        readyState: event.track.readyState,
        muted: event.track.muted,
        enabled: event.track.enabled,
        streamsCount: event.streams.length,
      });
      logPeerState(sid, pc);
      if (event.track.kind === "audio") {
        const trackId = event.track.id;
        const intervalId = window.setInterval(async () => {
          if (pc.connectionState === "closed") {
            window.clearInterval(intervalId);
            return;
          }
          logPeerState(sid, pc);
          const stats = await pc.getStats(event.track);
          stats.forEach((report) => {
            if (report.type === "inbound-rtp" && report.kind === "audio") {
              rtcLog("inbound audio stats", {
                sid,
                trackId,
                bytesReceived: report.bytesReceived,
                packetsReceived: report.packetsReceived,
                packetsLost: report.packetsLost,
                audioLevel: report.audioLevel,
                jitter: report.jitter,
              });
            }
          });
        }, 3000);
        event.track.addEventListener("ended", () => window.clearInterval(intervalId));
      }

      if (event.track.kind === "audio") {
        console.log("[rtc] REMOTE AUDIO TRACK INITIAL", {
          sid,
          id: event.track.id,
          enabled: event.track.enabled,
          muted: event.track.muted,
          readyState: event.track.readyState,
        });

        event.track.onunmute = () => {
          console.log("[rtc] 🔊 REMOTE AUDIO TRACK UNMUTED", {
            sid,
            id: event.track.id,
            enabled: event.track.enabled,
            muted: event.track.muted,
            readyState: event.track.readyState,
          });
        };

        event.track.onmute = () => {
          console.log("[rtc] 🔇 REMOTE AUDIO TRACK MUTED", {
            sid,
            id: event.track.id,
            enabled: event.track.enabled,
            muted: event.track.muted,
            readyState: event.track.readyState,
          });
        };
      }
      // Don't rely on event.streams[0] — whether it's populated depends on
      // both sides correctly negotiating an msid/stream grouping, which the
      // answerer's reused (auto-created-by-setRemoteDescription) transceiver
      // does not do by default, leaving it empty. Build our own per-peer
      // MediaStream from whatever tracks arrive instead — robust regardless
      // of msid negotiation. The screen track is sent via addTrack() with no
      // stream, so an empty event.streams also doubles as the camera/screen
      // signal for video tracks.
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

        // Video transceiver #0 = camera
        // Video transceiver #1+ = screen share
        isScreen = transceiverIndex > 0;

        rtcLog("video track classification", {
          sid,
          trackId: event.track.id,
          transceiverIndex,
          videoTransceiverCount: videoTransceivers.length,
          isScreen,
        });
      }

      const streamsRef = isScreen
        ? remoteScreenMediaStreamsRef
        : remoteMediaStreamsRef;
      const prevStream = streamsRef.current[sid];
      // Always build a *new* MediaStream instance rather than mutating the
      // previous one in place. VideoTile's srcObject-assignment effect is
      // keyed on stream identity ([stream] dependency) — if audio and video
      // tracks for the same peer arrive in separate ontrack events (which
      // real network jitter makes common, unlike same-tick local testing),
      // mutating the existing stream leaves that identity unchanged, so the
      // effect never reruns and the second track (often audio) never gets
      // attached to the <video> element even though it keeps playing.
      const existingTracks = prevStream ? prevStream.getTracks().filter((t) => t !== event.track) : [];
      const stream = new MediaStream([...existingTracks, event.track]);
      streamsRef.current[sid] = stream;
      rtcLog("ontrack -> stream updated", {
        sid,
        isScreen,
        streamId: stream.id,
        trackKinds: stream.getTracks().map((t) => t.kind),
      });
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
  const attachOutgoingTracksAsOfferer = useCallback(
    async (sid: string, pc: RTCPeerConnection) => {
      const stream = localStreamRef.current;
      rtcLog("LOCAL MEDIA BEFORE PEER ATTACH", {
        streamExists: !!stream,
        streamId: stream?.id ?? null,
        trackKinds: stream?.getTracks().map((t) => ({
          kind: t.kind,
          id: t.id,
          enabled: t.enabled,
          muted: t.muted,
          readyState: t.readyState,
        })),
        audioTracks: stream?.getAudioTracks().length ?? 0,
        videoTracks: stream?.getVideoTracks().length ?? 0,
        cameraRef: cameraTrackRef.current
          ? {
            id: cameraTrackRef.current.id,
            enabled: cameraTrackRef.current.enabled,
            readyState: cameraTrackRef.current.readyState,
          }
          : null,
      });
      const audioTrack = stream?.getAudioTracks()[0] ?? null;
      if (audioTrack) {
        rtcLog("INITIAL AUDIO TRACK STATE", {
          id: audioTrack.id,
          enabled: audioTrack.enabled,
          muted: audioTrack.muted,
          readyState: audioTrack.readyState,
          settings: audioTrack.getSettings(),
        });
      }
      const videoTrack = cameraTrackRef.current;

      rtcLog("attachOutgoingTracksAsOfferer", {
        sid,
        hasAudioTrack: !!audioTrack,
        audioTrackEnabled: audioTrack?.enabled,
        audioTrackReadyState: audioTrack?.readyState,
        hasVideoTrack: !!videoTrack,
      });

      // ALWAYS create the audio transceiver.
      // Audio must NOT depend on camera state.
      const audioTransceiver = pc.addTransceiver("audio", {
        direction: "sendrecv",
      });

      audioSendersRef.current[sid] = audioTransceiver.sender;

      if (audioTrack) {
        try {
          await audioTransceiver.sender.replaceTrack(audioTrack);
          const audioSender = audioTransceiver.sender;

          const statsInterval = window.setInterval(async () => {
            if (pc.connectionState === "closed") {
              window.clearInterval(statsInterval);
              return;
            }

            const stats = await pc.getStats(audioSender.track);

            stats.forEach((report) => {
              if (report.type === "outbound-rtp" && report.kind === "audio") {
                rtcLog("OUTBOUND AUDIO STATS", {
                  sid,
                  senderTrackId: audioSender.track?.id ?? null,
                  trackEnabled: audioSender.track?.enabled ?? null,
                  trackReadyState: audioSender.track?.readyState ?? null,
                  bytesSent: report.bytesSent,
                  packetsSent: report.packetsSent,
                  audioLevel: report.audioLevel ?? null,
                });
              }
            });
          }, 3000);
          rtcLog("offerer audio attached BEFORE offer", {
            sid,
            trackId: audioTrack.id,
            enabled: audioTrack.enabled,
            readyState: audioTrack.readyState,
            senderTrackId: audioTransceiver.sender.track?.id ?? null,
          });
        } catch (err) {
          rtcLog("audio replaceTrack failed", {
            sid,
            error: String(err),
          });
          throw err;
        }
      }

      // ALWAYS create the video transceiver too.
      // If camera is off, it simply has no video track.
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

            rtcLog("answerer video attached", {
              sid,
              trackId: videoTrack.id,
              readyState: videoTrack.readyState,
            });
          })
          .catch((err) => {
            rtcLog("answerer video replaceTrack FAILED", {
              sid,
              error: String(err),
            });
          });
      }

      rtcLog("outgoing tracks attached", {
        sid,
        audioSenderTrack: audioTransceiver.sender.track?.id ?? null,
        videoSenderTrack: videoTransceiver.sender.track?.id ?? null,
      });
    },
    []
  );

  // As the ANSWERER, setRemoteDescription(offer) auto-creates a local
  // transceiver per incoming m-line (recvonly by default, no track). Reuse
  // those — do NOT pre-create our own transceivers via addTransceiver()
  // before setRemoteDescription(): Chromium does not match/reuse them against
  // the incoming offer, so they end up orphaned (mid stays null) while a
  // fresh recvonly-only transceiver handles the real connection — silently
  // dropping our outgoing audio/video to this peer from the very start.
  const attachOutgoingTracksAsAnswerer = useCallback(
    async (sid: string, pc: RTCPeerConnection) => {
      const stream = localStreamRef.current;

      const audioTrack = stream?.getAudioTracks()[0] ?? null;
      if (audioTrack) {
        rtcLog("INITIAL AUDIO TRACK STATE", {
          id: audioTrack.id,
          enabled: audioTrack.enabled,
          muted: audioTrack.muted,
          readyState: audioTrack.readyState,
          settings: audioTrack.getSettings(),
        });
      }
      const videoTrack = cameraTrackRef.current;

      rtcLog("attachOutgoingTracksAsAnswerer", {
        sid,
        hasAudioTrack: !!audioTrack,
        audioTrackEnabled: audioTrack?.enabled,
        audioTrackReadyState: audioTrack?.readyState,
        hasVideoTrack: !!videoTrack,
        transceiverCount: pc.getTransceivers().length,
      });

      const audioTransceiver = pc
        .getTransceivers()
        .find(
          (t) =>
            t.receiver.track?.kind === "audio"
        );

      if (!audioTransceiver) {
        rtcLog("ERROR: no audio transceiver", {
          sid,
          transceivers: pc.getTransceivers().map((t) => ({
            mid: t.mid,
            direction: t.direction,
            receiverKind: t.receiver.track?.kind,
            senderKind: t.sender.track?.kind,
          })),
        });
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

              const stats = await pc.getStats(audioSender.track);

              stats.forEach((report) => {
                if (report.type === "outbound-rtp" && report.kind === "audio") {
                  rtcLog("OUTBOUND AUDIO STATS", {
                    sid,
                    senderTrackId: audioSender.track?.id ?? null,
                    trackEnabled: audioSender.track?.enabled ?? null,
                    trackReadyState: audioSender.track?.readyState ?? null,
                    bytesSent: report.bytesSent,
                    packetsSent: report.packetsSent,
                    audioLevel: report.audioLevel ?? null,
                  });
                }
              });
            }, 3000);
            rtcLog("answerer audio attached BEFORE answer", {
              sid,
              trackId: audioTrack.id,
              enabled: audioTrack.enabled,
              readyState: audioTrack.readyState,
              senderTrackId: audioTransceiver.sender.track?.id ?? null,
            });
          } catch (err) {
            rtcLog("answerer audio replaceTrack FAILED", {
              sid,
              error: String(err),
            });
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
              rtcLog("answerer video replaceTrack FAILED", {
                sid,
                error: String(err),
              });
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
      const socket = getSocket();

      if (stream) {
        localStreamRef.current = stream;
        cameraTrackRef.current = stream.getVideoTracks()[0] ?? null;
        const audioTrack = stream.getAudioTracks()[0];
        setLocalStream(stream);
        if (audioTrack) {
          const micDiagnosticContext = new AudioContext();
          const micDiagnosticStream = new MediaStream([audioTrack]);
          const micSource =
            micDiagnosticContext.createMediaStreamSource(micDiagnosticStream);

          const analyser = micDiagnosticContext.createAnalyser();
          analyser.fftSize = 2048;

          micSource.connect(analyser);

          const data = new Float32Array(analyser.fftSize);

          const diagnosticInterval = window.setInterval(() => {
            if (audioTrack.readyState !== "live") {
              window.clearInterval(diagnosticInterval);
              return;
            }

            analyser.getFloatTimeDomainData(data);

            let sum = 0;
            let peak = 0;

            for (const sample of data) {
              sum += sample * sample;
              peak = Math.max(peak, Math.abs(sample));
            }

            const rms = Math.sqrt(sum / data.length);

            rtcLog("MIC SIGNAL DIAGNOSTIC", {
              trackId: audioTrack.id,
              enabled: audioTrack.enabled,
              readyState: audioTrack.readyState,
              rms,
              peak,
            });
          }, 1000);
        }
        if (audioTrack) audioTrack.enabled = initialMicOn;
        if (cameraTrackRef.current) cameraTrackRef.current.enabled = initialCameraOn;

        setLocalStream(stream);

        // Start the separate audio capture pipeline for transcription/captions.
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

            await attachOutgoingTracksAsOfferer(peer.sid, pc);

            // If we are already screen sharing when this participant joins,
            // add the active screen track to this new peer BEFORE creating
            // the initial offer.
            if (
              screenSharingRef.current &&
              screenTrackRef.current &&
              !screenSendersRef.current[peer.sid]
            ) {
              const screenTrack = screenTrackRef.current;

              const screenTransceiver = pc.addTransceiver(screenTrack, {
                direction: "sendrecv",
              });

              screenSendersRef.current[peer.sid] = screenTransceiver.sender;

              rtcLog("late joiner: screen share attached", {
                sid: peer.sid,
                trackId: screenTrack.id,
                readyState: screenTrack.readyState,
                enabled: screenTrack.enabled,
              });
            }

            const offer = await pc.createOffer();

            await pc.setLocalDescription(offer);

            rtcLog("sending offer", {
              to: peer.sid,
              sdpHasAudio: offer.sdp?.includes("m=audio"),
              sdpHasVideo: offer.sdp?.includes("m=video"),
            });

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
          rtcLog("signal received", { from, type });

          if (type === "offer") {
            const pc = peerConnections.current[from] ?? createPeerConnection(from);
            const offerSdp = (payload as RTCSessionDescriptionInit).sdp;
            rtcLog("received offer", { from, sdpHasAudio: offerSdp?.includes("m=audio") });
            await pc.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit));
            logPeerState(from, pc);
            await attachOutgoingTracksAsAnswerer(from, pc);
            if (screenSharingRef.current && screenTrackRef.current && !screenSendersRef.current[from]) {
              screenSendersRef.current[from] = pc.addTrack(screenTrackRef.current);
            }
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            rtcLog("sending answer", { to: from, sdpHasAudio: answer.sdp?.includes("m=audio") });
            logPeerState(from, pc);
            socket.emit("signal", { to: from, type: "answer", payload: pc.localDescription });
          } else if (type === "answer") {
            const pc = peerConnections.current[from];
            if (!pc) {
              rtcLog("received answer but no pc exists for", { from });
              return;
            }
            await pc.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit));
            rtcLog("applied answer", { from });
            logPeerState(from, pc);
          } else if (type === "ice-candidate") {
            const pc = peerConnections.current[from];
            if (!pc) {
              rtcLog("received ice-candidate but no pc exists for", { from });
              return;
            }
            try {
              await pc.addIceCandidate(new RTCIceCandidate(payload as RTCIceCandidateInit));
              remoteIceCandidateCountsRef.current[from] = (remoteIceCandidateCountsRef.current[from] ?? 0) + 1;
              logPeerState(from, pc);
            } catch (err) {
              rtcLog("addIceCandidate failed", { from, err: String(err) });
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
      rtcLog("toggleMic", { enabled: track.enabled });
      if (roomCode) {
        getSocket().emit("media-state", { room_code: roomCode, mic_on: track.enabled, camera_on: cameraOnRef.current });
      }
    } else {
      rtcLog("toggleMic: no local audio track to toggle");
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
        sender.replaceTrack(null).catch(() => { });
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
        sender.replaceTrack(newTrack).catch((err) => {
          rtcLog("camera replaceTrack failed", {
            error: String(err),
          });
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

      // Sent as its own track/transceiver (not swapped into the camera's via
      // replaceTrack) so remote participants keep seeing the camera feed too
      // — this needs a renegotiation round trip per peer connection.
      await Promise.all(
        Object.entries(peerConnections.current).map(async ([sid, pc]) => {
          if (pc.signalingState !== "stable") {
            rtcLog("Skipping screen-share negotiation; peer not stable", {
              sid,
              signalingState: pc.signalingState,
            });
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



// 1. useMeetingRoom.ts
// 2. VideoTile.tsx
// 3. VideoGrid.tsx
// 4. MeetingRoomPage.tsx
// 5. PreJoinLobby.tsx
// 6. useDevicePreview.ts
// 7. Screen-share file (if separate)
// 8. socket.ts
// 9. Python Socket.IO server
// 10. types / WebRTC utilities