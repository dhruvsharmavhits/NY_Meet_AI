import type { Socket } from "socket.io-client";

const TARGET_SAMPLE_RATE = 16000;
// Below this RMS, treat the chunk as silence/background noise rather than
// speech - feeding a continuous quiet/noisy stream with no pause into
// Transcribe otherwise makes it loop on the same guessed token.
const SILENCE_RMS_THRESHOLD = 0.006;

function rms(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}

function downsampleBuffer(buffer: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (outputRate === inputRate) return buffer;
  const ratio = inputRate / outputRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < newLength) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

export function startAudioCapture(stream: MediaStream, roomCode: string, socket: Socket): () => void {
  const audioTrack = stream.getAudioTracks()[0];
  console.log(
    `[rtc] startAudioCapture ${JSON.stringify({
      hasAudioTrack: !!audioTrack,
      trackEnabled: audioTrack?.enabled,
      trackReadyState: audioTrack?.readyState,
      settings: audioTrack?.getSettings?.(),
    })}`
  );
  if (!audioTrack) {
    // No microphone at all — nothing to capture.
    return () => {};
  }

  // A *cloned* track still shares the same underlying native capture session
  // as the original in Chrome, so a Web Audio graph on the clone still
  // contends with the RTCRtpSender reading the original — starving the call
  // audio to silence (proven by bytesReceived climbing on the peer connection
  // while inbound-rtp audioLevel stayed flat 0 — STT worked, the call audio
  // didn't). A genuinely independent getUserMedia() capture (its own native
  // session) is required to decouple STT capture from the WebRTC send path.
  let stopped = false;
  let cleanup: (() => void) | null = null;

  navigator.mediaDevices
    .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    .then(async (captureStream) => {
      if (stopped) {
        captureStream.getTracks().forEach((t) => t.stop());
        return;
      }
      const captureTrack = captureStream.getAudioTracks()[0];
      console.log(
        `[rtc] audioCapture stt track ${JSON.stringify({
          enabled: captureTrack?.enabled,
          muted: captureTrack?.muted,
          readyState: captureTrack?.readyState,
          settings: captureTrack?.getSettings?.(),
        })}`
      );

      const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioContext = new AudioContextCtor();
      await audioContext.audioWorklet.addModule("/audio-capture-worklet.js");
      if (stopped) {
        audioContext.close();
        captureStream.getTracks().forEach((t) => t.stop());
        return;
      }

      const source = audioContext.createMediaStreamSource(captureStream);
      const worklet = new AudioWorkletNode(audioContext, "capture-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
      });
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;

      worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
        // Skip entirely while the mic is toggled off — don't waste bandwidth or
        // feed silence into the transcription pipeline (which can otherwise
        // hallucinate captions from near-silence/background noise).
        if (!audioTrack.enabled) return;
        if (rms(event.data) < SILENCE_RMS_THRESHOLD) return;

        const downsampled = downsampleBuffer(event.data, audioContext.sampleRate, TARGET_SAMPLE_RATE);
        const pcm16 = floatTo16BitPCM(downsampled);
        socket.emit("audio-chunk", { room_code: roomCode, chunk: pcm16.buffer });
      };

      source.connect(worklet);
      worklet.connect(silentGain);
      silentGain.connect(audioContext.destination);
      console.log(`[rtc] audioCapture worklet running sampleRate=${audioContext.sampleRate} state=${audioContext.state}`);

      cleanup = () => {
        worklet.port.onmessage = null;
        worklet.disconnect();
        source.disconnect();
        silentGain.disconnect();
        audioContext.close();
        captureTrack.stop();
      };
    })
    .catch((err) => {
      console.error("[rtc] audioCapture failed", err);
    });

  return () => {
    stopped = true;
    cleanup?.();
  };
}
