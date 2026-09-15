function describeTrack(t: MediaStreamTrack) {
  return {
    id: t.id,
    kind: t.kind,
    label: t.label,
    enabled: t.enabled,
    muted: t.muted,
    readyState: t.readyState,
    settings: t.getSettings?.(),
  };
}

export function logStream(tag: string, stream: MediaStream | null) {
  if (!stream) {
    console.log(`[diag] ${tag}: stream=null`);
    return;
  }
  console.log(
    `[diag] ${tag}: ${JSON.stringify({
      streamId: stream.id,
      active: stream.active,
      audioTracks: stream.getAudioTracks().map(describeTrack),
      videoTracks: stream.getVideoTracks().map(describeTrack),
    })}`
  );
}

export function logTrackEvent(tag: string, track: MediaStreamTrack) {
  console.log(`[diag] ${tag}: ${JSON.stringify(describeTrack(track))}`);
  track.onmute = () => console.log(`[diag] track MUTED ${track.kind} ${track.id}`);
  track.onunmute = () => console.log(`[diag] track UNMUTED ${track.kind} ${track.id}`);
  track.onended = () => console.log(`[diag] track ENDED ${track.kind} ${track.id}`);
}

export async function logDevices(tag: string) {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    console.log(
      `[diag] ${tag} devices: ${JSON.stringify(
        devices.map((d) => ({ kind: d.kind, label: d.label, deviceId: d.deviceId.slice(0, 8) }))
      )}`
    );
  } catch (err) {
    console.log(`[diag] ${tag} enumerateDevices failed`, err);
  }
}

export function attachPeerDiagnostics(sid: string, pc: RTCPeerConnection): () => void {
  const log = (msg: string) => console.log(`[diag] pc ${sid.slice(0, 6)} ${msg}`);

  pc.addEventListener("iceconnectionstatechange", () => log(`ice=${pc.iceConnectionState}`));
  pc.addEventListener("connectionstatechange", () => log(`connection=${pc.connectionState}`));
  pc.addEventListener("signalingstatechange", () => log(`signaling=${pc.signalingState}`));
  pc.addEventListener("icegatheringstatechange", () => log(`gathering=${pc.iceGatheringState}`));
  pc.addEventListener("icecandidateerror", (e) => {
    const err = e as RTCPeerConnectionIceErrorEvent;
    log(`ICE CANDIDATE ERROR code=${err.errorCode} url=${err.url} text=${err.errorText}`);
  });

  const timer = window.setInterval(async () => {
    if (pc.connectionState === "closed") return;
    try {
      const stats = await pc.getStats();
      const out: Record<string, unknown> = {};
      let pair: Record<string, unknown> | null = null;
      stats.forEach((report) => {
        if (report.type === "outbound-rtp") {
          out[`out-${report.kind}`] = {
            bytesSent: report.bytesSent,
            packetsSent: report.packetsSent,
            framesSent: report.framesSent,
            frameWidth: report.frameWidth,
            frameHeight: report.frameHeight,
          };
        }
        if (report.type === "inbound-rtp") {
          out[`in-${report.kind}`] = {
            bytesReceived: report.bytesReceived,
            packetsReceived: report.packetsReceived,
            packetsLost: report.packetsLost,
            audioLevel: report.audioLevel,
            framesDecoded: report.framesDecoded,
            frameWidth: report.frameWidth,
            frameHeight: report.frameHeight,
          };
        }
        if (report.type === "media-source" && report.kind === "audio") {
          out["local-mic-level"] = report.audioLevel;
        }
        if (report.type === "candidate-pair" && report.state === "succeeded" && report.nominated) {
          pair = { local: report.localCandidateId, remote: report.remoteCandidateId };
        }
      });
      if (pair) {
        const p = pair as { local: string; remote: string };
        const local = stats.get(p.local);
        const remote = stats.get(p.remote);
        out["candidate-pair"] = {
          localType: local?.candidateType,
          localProtocol: local?.protocol,
          remoteType: remote?.candidateType,
          remoteProtocol: remote?.protocol,
        };
      }
      pc.getSenders().forEach((s) => {
        if (s.track) out[`sender-${s.track.kind}`] = describeTrack(s.track);
      });
      pc.getReceivers().forEach((r) => {
        if (r.track) out[`receiver-${r.track.kind}`] = describeTrack(r.track);
      });
      log(`stats ${JSON.stringify(out)}`);
    } catch (err) {
      log(`getStats failed ${String(err)}`);
    }
  }, 5000);

  return () => window.clearInterval(timer);
}
