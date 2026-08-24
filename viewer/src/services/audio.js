/**
 * Audio decoding and playback engine via Web Audio API.
 */

let audioCtx = null;
let globalGainNode = null;

export function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    audioCtx = new AudioContextClass({ latencyHint: 'interactive' });
    globalGainNode = audioCtx.createGain();
    globalGainNode.connect(audioCtx.destination);
  }

  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }

  return { ctx: audioCtx, masterGain: globalGainNode };
}

export function setMasterVolume(level) {
  const { masterGain } = getAudioContext() || {};
  if (masterGain) {
    masterGain.gain.value = Math.max(0, Math.min(1, level));
  }
}

export function createAudioPlayer({ onStateChange } = {}) {
  const { ctx, masterGain } = getAudioContext() || {};
  if (!ctx) {
    onStateChange?.({ supported: false, error: 'Web Audio API not supported in this browser' });
    return null;
  }

  let audioDecoder = null;
  let nextStartTime = 0;

  function initDecoder() {
    if (!window.AudioDecoder) return false;

    audioDecoder = new AudioDecoder({
      output: (audioData) => {
        try {
          playAudioData(audioData);
        } finally {
          audioData.close();
        }
      },
      error: (err) => {
        console.warn('[AudioDecoder error]', err.message);
      },
    });

    try {
      audioDecoder.configure({
        codec: 'opus',
        sampleRate: 48000,
        numberOfChannels: 2,
      });
      return true;
    } catch {
      audioDecoder = null;
      return false;
    }
  }

  function playAudioData(audioData) {
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const numberOfChannels = audioData.numberOfChannels;
    const numberOfFrames = audioData.numberOfFrames;
    const sampleRate = audioData.sampleRate;

    const buffer = ctx.createBuffer(numberOfChannels, numberOfFrames, sampleRate);
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const options = { planeIndex: channel, format: 'f32-planar' };
      if (audioData.allocationSize(options) > 0) {
        audioData.copyTo(buffer.getChannelData(channel), options);
      }
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(masterGain);

    const currentTime = ctx.currentTime;
    if (nextStartTime < currentTime) {
      nextStartTime = currentTime + 0.01;
    }

    source.start(nextStartTime);
    nextStartTime += buffer.duration;
  }

  const decoderSupported = initDecoder();

  return {
    supported: decoderSupported,
    decodePacket(arrayBuffer) {
      if (!audioDecoder || audioDecoder.state !== 'configured') return;
      try {
        const chunk = new EncodedAudioChunk({
          type: 'key',
          timestamp: performance.now() * 1000,
          data: arrayBuffer,
        });
        audioDecoder.decode(chunk);
      } catch (err) {
        console.warn('[Audio decode error]', err);
      }
    },
    stop() {
      if (audioDecoder) {
        try {
          audioDecoder.close();
        } catch {}
        audioDecoder = null;
      }
    },
  };
}
