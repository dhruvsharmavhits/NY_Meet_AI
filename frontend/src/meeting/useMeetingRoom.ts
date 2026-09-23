import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConsoleLogger,
  DefaultDeviceController,
  DefaultMeetingSession,
  LogLevel,
  MeetingSessionConfiguration,
  type AudioVideoFacade,
  type AudioVideoObserver,
  type VideoTileState,
} from "amazon-chime-sdk-js";
import { getSocket, disconnectSocket } from "@/services/socket";
import { startAudioCapture } from "@/meeting/audioCapture";
import { logDevices, logStream } from "@/meeting/mediaDiagnostics";
import type { Caption, ChatMessage, Participant } from "@/meeting/types";

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

interface ChimeJoinInfo {
  [key: string]: unknown;
}

interface UseMeetingRoomOptions {
  roomCode: string | undefined;
  enabled: boolean;
  initialStream: MediaStream | null;
  initialMicOn: boolean;
  initialCameraOn: boolean;
  accessToken?: string;
  chimeMeeting: ChimeJoinInfo | null | undefined;
  chimeAttendee: ChimeJoinInfo | null | undefined;
}

function externalUserIdOf(attendee: ChimeJoinInfo | null | undefined): string | null {
  if (!attendee) return null;
  const flat = attendee["ExternalUserId"];
  if (typeof flat === "string") return flat;
  const nested = attendee["Attendee"] as ChimeJoinInfo | undefined;
  const nestedId = nested?.["ExternalUserId"];
  return typeof nestedId === "string" ? nestedId : null;
}

// Chime represents a participant's screen-share as a second pseudo-attendee
// whose id is "<attendeeId>#content" (see amazon-chime-sdk-js's
// DefaultModality/ContentShareConstants) — it never carries a mic, so it's
// excluded from volume-indicator subscriptions.
function isContentAttendeeId(attendeeId: string): boolean {
  return attendeeId.split("#")[1] === "content";
}

interface TileMeta {
  sid: string | null;
  isContent: boolean;
  isLocal: boolean;
}

export function useMeetingRoom({
  roomCode,
  enabled,
  initialStream,
  initialMicOn,
  initialCameraOn,
  accessToken,
  chimeMeeting,
  chimeAttendee,
}: UseMeetingRoomOptions) {
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
  const [localTileId, setLocalTileId] = useState<number | null>(null);
  const [localScreenTileId, setLocalScreenTileId] = useState<number | null>(null);

  const meetingSessionRef = useRef<DefaultMeetingSession | null>(null);
  const audioVideoRef = useRef<AudioVideoFacade | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const myExternalUserIdRef = useRef<string | null>(null);
  const sidByUserIdRef = useRef<Record<string, string>>({});
  const attendeeIdToUserIdRef = useRef<Record<string, string>>({});
  const tileMetaRef = useRef<Record<number, TileMeta>>({});
  const volumeCallbacksRef = useRef<Record<string, (attendeeId: string, volume: number | null, muted: boolean | null, signalStrength: number | null, externalUserId?: string) => void>>({});
  const micOnRef = useRef(initialMicOn);
  const cameraOnRef = useRef(initialCameraOn);
  const screenSharingRef = useRef(false);
  const audioInputStartedRef = useRef(false);
  const videoInputStartedRef = useRef(false);
  const stopAudioCaptureRef = useRef<(() => void) | null>(null);
  const sttAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const stopScreenShareRef = useRef<(() => void) | null>(null);
  const everConnectedRef = useRef(false);
  const consultationEndedRef = useRef(false);

  const bindAudioElement = useCallback((el: HTMLAudioElement | null) => {
    audioElementRef.current = el;
    if (el) audioVideoRef.current?.bindAudioElement(el).catch(() => {});
  }, []);

  const bindVideoTile = useCallback((tileId: number, el: HTMLVideoElement) => {
    audioVideoRef.current?.bindVideoElement(tileId, el);
  }, []);

  const unbindVideoTile = useCallback((tileId: number) => {
    audioVideoRef.current?.unbindVideoElement(tileId);
  }, []);

  const updateParticipantBySid = useCallback((sid: string, patch: Partial<Participant>) => {
    setParticipants((prev) => {
      const p = prev[sid];
      if (!p) return prev;
      return { ...prev, [sid]: { ...p, ...patch } };
    });
  }, []);

  useEffect(() => {
    if (!enabled || !roomCode || !chimeMeeting || !chimeAttendee) return;
    let cancelled = false;
    const activeRoomCode = roomCode;

    async function start() {
      if (cancelled) return;
      micOnRef.current = initialMicOn;
      cameraOnRef.current = initialCameraOn;
      setMicOn(initialMicOn);
      setCameraOn(initialCameraOn);
      myExternalUserIdRef.current = externalUserIdOf(chimeAttendee);

      if (initialStream) {
        logStream("local stream at call start", initialStream);
        await logDevices("at call start");
      }

      const logger = new ConsoleLogger("chime", LogLevel.WARN);
      const deviceController = new DefaultDeviceController(logger);
      const configuration = new MeetingSessionConfiguration(chimeMeeting, chimeAttendee);
      const meetingSession = new DefaultMeetingSession(configuration, logger, deviceController);
      meetingSessionRef.current = meetingSession;
      const audioVideo = meetingSession.audioVideo;
      audioVideoRef.current = audioVideo;

      const audioDeviceId = initialStream?.getAudioTracks()[0]?.getSettings().deviceId;
      if (initialStream?.getAudioTracks().length) {
        try {
          await audioVideo.startAudioInput(audioDeviceId ?? AUDIO_CONSTRAINTS);
          audioInputStartedRef.current = true;
        } catch (err) {
          console.error("Unable to start audio input", err);
        }
      }

      const videoDeviceId = initialStream?.getVideoTracks()[0]?.getSettings().deviceId;
      if (initialStream?.getVideoTracks().length) {
        try {
          await audioVideo.startVideoInput(videoDeviceId ?? {});
          videoInputStartedRef.current = true;
        } catch (err) {
          console.error("Unable to start video input", err);
        }
      }

      if (cancelled) return;

      if (audioElementRef.current) {
        audioVideo.bindAudioElement(audioElementRef.current).catch(() => {});
      }

      const observer: AudioVideoObserver = {
        audioVideoDidStartConnecting: (reconnectingNow) => {
          if (reconnectingNow) setReconnecting(true);
        },
        audioVideoDidStart: () => {
          setConnected(true);
          setReconnecting(false);
          everConnectedRef.current = true;
        },
        audioVideoDidStop: () => {
          setConnected(false);
          if (everConnectedRef.current && !consultationEndedRef.current) setReconnecting(true);
        },
        videoTileDidUpdate: (tileState: VideoTileState) => {
          if (tileState.tileId === null) return;
          const tileId = tileState.tileId;

          if (tileState.localTile) {
            tileMetaRef.current[tileId] = { sid: null, isContent: false, isLocal: true };
            setLocalTileId(tileId);
            return;
          }

          const isOwnContent = tileState.isContent && tileState.boundExternalUserId === myExternalUserIdRef.current;
          if (isOwnContent) {
            tileMetaRef.current[tileId] = { sid: null, isContent: true, isLocal: true };
            setLocalScreenTileId(tileId);
            return;
          }

          const sid = tileState.boundExternalUserId ? sidByUserIdRef.current[tileState.boundExternalUserId] : undefined;
          tileMetaRef.current[tileId] = { sid: sid ?? null, isContent: tileState.isContent, isLocal: false };
          if (!sid) return;

          if (tileState.isContent) {
            updateParticipantBySid(sid, { screenTileId: tileId });
          } else {
            updateParticipantBySid(sid, { tileId, cameraOn: true });
          }
        },
        videoTileWasRemoved: (tileId: number) => {
          const meta = tileMetaRef.current[tileId];
          delete tileMetaRef.current[tileId];
          if (!meta) return;

          if (meta.isLocal) {
            if (meta.isContent) setLocalScreenTileId((prev) => (prev === tileId ? null : prev));
            else setLocalTileId((prev) => (prev === tileId ? null : prev));
            return;
          }
          if (!meta.sid) return;
          if (meta.isContent) updateParticipantBySid(meta.sid, { screenTileId: null });
          else updateParticipantBySid(meta.sid, { tileId: null, cameraOn: false });
        },
      };
      audioVideo.addObserver(observer);

      // Fires when the share stops from outside our own stopScreenShare()
      // call — e.g. the browser's native "Stop sharing" bar/button — so we
      // still need to sync our React state and tell the server the slot is free.
      audioVideo.addContentShareObserver({
        contentShareDidStop: () => {
          screenSharingRef.current = false;
          setScreenSharing(false);
          setLocalScreenTileId(null);
          if (activeRoomCode) {
            getSocket().emit("screen-share-stop", { room_code: activeRoomCode });
          }
        },
      });

      const presenceCallback = (attendeeId: string, present: boolean, externalUserId?: string) => {
        if (isContentAttendeeId(attendeeId)) return;
        if (!present) {
          const callback = volumeCallbacksRef.current[attendeeId];
          if (callback) {
            audioVideo.realtimeUnsubscribeFromVolumeIndicator(attendeeId, callback);
            delete volumeCallbacksRef.current[attendeeId];
          }
          delete attendeeIdToUserIdRef.current[attendeeId];
          return;
        }

        if (externalUserId) attendeeIdToUserIdRef.current[attendeeId] = externalUserId;

        const volumeCallback = (
          _id: string,
          _volume: number | null,
          muted: boolean | null,
          _signalStrength: number | null,
          extUserId?: string
        ) => {
          if (muted === null) return;
          const userId = extUserId ?? attendeeIdToUserIdRef.current[attendeeId];
          const sid = userId ? sidByUserIdRef.current[userId] : undefined;
          if (sid) updateParticipantBySid(sid, { micOn: !muted });
        };
        volumeCallbacksRef.current[attendeeId] = volumeCallback;
        audioVideo.realtimeSubscribeToVolumeIndicator(attendeeId, volumeCallback);
      };
      audioVideo.realtimeSubscribeToAttendeeIdPresence(presenceCallback);

      if (initialCameraOn && videoInputStartedRef.current) {
        audioVideo.startLocalVideoTile();
      }

      audioVideo.start();

      const socket = getSocket();

      const audioTrack = initialStream?.getAudioTracks()[0];
      if (audioTrack) {
        // audioCapture.ts gates STT capture on this track's .enabled, since it
        // runs its own independent getUserMedia stream decoupled from Chime's
        // device controller — keep it in sync with the actual mic state.
        audioTrack.enabled = micOnRef.current;
        sttAudioTrackRef.current = audioTrack;
      }
      stopAudioCaptureRef.current?.();
      stopAudioCaptureRef.current = initialStream && audioTrack
        ? startAudioCapture(initialStream, activeRoomCode, socket)
        : null;

      socket.connect();

      socket.on("connect", () => {
        socket.emit("join-room", {
          room_code: activeRoomCode,
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
        setParticipants({});
        sidByUserIdRef.current = {};
      });

      socket.on(
        "existing-peers",
        (data: { peers: { sid: string; user_id: string; full_name: string }[] }) => {
          for (const peer of data.peers) {
            sidByUserIdRef.current[peer.user_id] = peer.sid;
            setParticipants((prev) => ({
              ...prev,
              [peer.sid]: { sid: peer.sid, user_id: peer.user_id, full_name: peer.full_name, micOn: true, cameraOn: false, screenSharing: false },
            }));
          }
        }
      );

      socket.on("peer-joined", (peer: { sid: string; user_id: string; full_name: string }) => {
        sidByUserIdRef.current[peer.user_id] = peer.sid;
        setParticipants((prev) => ({
          ...prev,
          [peer.sid]: { sid: peer.sid, user_id: peer.user_id, full_name: peer.full_name, micOn: true, cameraOn: false, screenSharing: false },
        }));
      });

      socket.on("peer-left", (data: { sid: string }) => {
        setParticipants((prev) => {
          const next = { ...prev };
          const p = next[data.sid];
          if (p) delete sidByUserIdRef.current[p.user_id];
          delete next[data.sid];
          return next;
        });
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

      socket.on("screen-share-state", (data: { sid: string; sharing: boolean }) => {
        updateParticipantBySid(data.sid, { screenSharing: data.sharing });
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
      socket.off("peer-left");
      socket.off("consultation-ended");
      socket.off("join-rejected");
      socket.off("chat-message");
      socket.off("caption");
      socket.off("partial-transcript");
      socket.off("screen-share-state");
      socket.off("force-stop-screen-share");
      disconnectSocket();

      stopAudioCaptureRef.current?.();
      stopAudioCaptureRef.current = null;

      meetingSessionRef.current?.destroy().catch(() => {});
      meetingSessionRef.current = null;
      audioVideoRef.current = null;
      tileMetaRef.current = {};
      volumeCallbacksRef.current = {};
      attendeeIdToUserIdRef.current = {};
      sidByUserIdRef.current = {};
      audioInputStartedRef.current = false;
      videoInputStartedRef.current = false;
      screenSharingRef.current = false;

      setLocalTileId(null);
      setLocalScreenTileId(null);
      setParticipants({});
      setConnected(false);
      setReconnecting(false);
      setError(null);
      setScreenSharing(false);
      everConnectedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, enabled, initialStream, chimeMeeting, chimeAttendee]);

  const sendChat = useCallback(
    (text: string) => {
      if (!roomCode || !text.trim()) return;
      getSocket().emit("chat-message", { room_code: roomCode, text, ts: Date.now() });
    },
    [roomCode]
  );

  const toggleMic = useCallback(async () => {
    const audioVideo = audioVideoRef.current;
    if (!audioVideo) return;

    if (micOnRef.current) {
      audioVideo.realtimeMuteLocalAudio();
      if (sttAudioTrackRef.current) sttAudioTrackRef.current.enabled = false;
      micOnRef.current = false;
      setMicOn(false);
      return;
    }

    if (!audioInputStartedRef.current) {
      setMicConnecting(true);
      try {
        await audioVideo.startAudioInput(AUDIO_CONSTRAINTS);
        audioInputStartedRef.current = true;
      } catch (err) {
        console.error("Unable to start microphone", err);
        setMicConnecting(false);
        return;
      }
      setMicConnecting(false);
    }

    audioVideo.realtimeUnmuteLocalAudio();
    if (sttAudioTrackRef.current) sttAudioTrackRef.current.enabled = true;
    micOnRef.current = true;
    setMicOn(true);
  }, []);

  const toggleCamera = useCallback(async () => {
    const audioVideo = audioVideoRef.current;
    if (!audioVideo) return;

    if (cameraOnRef.current) {
      audioVideo.stopLocalVideoTile();
      cameraOnRef.current = false;
      setCameraOn(false);
      return;
    }

    try {
      if (!videoInputStartedRef.current) {
        await audioVideo.startVideoInput({});
        videoInputStartedRef.current = true;
      }
      audioVideo.startLocalVideoTile();
      cameraOnRef.current = true;
      setCameraOn(true);
    } catch (err) {
      console.error("Unable to start camera", err);
    }
  }, []);

  const stopScreenShare = useCallback(() => {
    audioVideoRef.current?.stopContentShare();
    screenSharingRef.current = false;
    setScreenSharing(false);
    setLocalScreenTileId(null);
    if (roomCode) {
      getSocket().emit("screen-share-stop", { room_code: roomCode });
    }
  }, [roomCode]);
  stopScreenShareRef.current = stopScreenShare;

  const toggleScreenShare = useCallback(async () => {
    if (screenSharingRef.current) {
      stopScreenShare();
      return;
    }

    const audioVideo = audioVideoRef.current;
    if (!audioVideo) return;

    // must reach the server (and force-stop any other current sharer) before
    // the Chime content-share connection is established — otherwise a
    // stale sharer could still be mid-share when we start ours.
    if (roomCode) {
      getSocket().emit("screen-share-claim", { room_code: roomCode });
    }

    try {
      await audioVideo.startContentShareFromScreenCapture();
      screenSharingRef.current = true;
      setScreenSharing(true);
    } catch (err) {
      console.error("Unable to start screen share", err);
    }
  }, [roomCode, stopScreenShare]);

  return {
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
    localTileId,
    localScreenTileId,
    bindVideoTile,
    unbindVideoTile,
    bindAudioElement,
    sendChat,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
  };
}
