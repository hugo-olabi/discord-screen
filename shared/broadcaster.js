/**
 * Broadcast pipeline: capture → encode → transmit.
 *
 * Shared module across client web app and broadcaster engines.
 * Encodes frame-by-frame via WebCodecs and streams over WebSocket/WebRTC.
 */

const CANDIDATES = [
  { codec: 'avc1.42E01E', avc: { format: 'annexb' } },
  { codec: 'avc1.42E01E' },
  { codec: 'vp8' },
  { codec: 'vp09.00.10.08' },
];

const KEYFRAME_EVERY_MS = 3000;

const TIPO_KEYFRAME = 1;
const TIPO_DELTA = 2;
const TIPO_AUDIO = 3;

const AUDIO_BITRATE = 96_000;

const MAX_W = 1920;
const MAX_H = 1080;

const even = (n) => Math.max(2, n - (n % 2));

function fitWithin(w, h) {
  const scale = Math.min(1, MAX_W / w, MAX_H / h);
  return { width: even(Math.round(w * scale)), height: even(Math.round(h * scale)) };
}

/**
 * Audio constraints for screen share capture.
 */
export function audioConstraints() {
  const c = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };
  if (navigator.mediaDevices.getSupportedConstraints?.().restrictOwnAudio) {
    c.restrictOwnAudio = true;
  }
  return c;
}

export function screenOptions({ fps = 30, comSom = false, video } = {}) {
  const opts = {
    video: video ?? { frameRate: { ideal: fps, max: fps } },
    audio: comSom ? audioConstraints() : false,
  };
  if (comSom) {
    opts.windowAudio = 'window';
    opts.systemAudio = 'exclude';
  }
  return opts;
}

export function supportError({ requireChromium = false } = {}) {
  if (!window.VideoEncoder || !window.VideoFrame || !window.EncodedVideoChunk) {
    return 'This browser does not support WebCodecs, required for streaming. Use Chrome, Edge, or another Chromium browser on desktop.';
  }
  if (requireChromium && !window.MediaStreamTrackProcessor) {
    return 'Streaming requires a Chromium browser — Chrome, Edge, Brave, or Opera. You can still watch broadcasts.';
  }
  return null;
}

export function sourceUnavailable(source) {
  if (source === 'camera') {
    return navigator.mediaDevices?.getUserMedia
      ? null
      : 'This browser does not support camera access.';
  }
  return navigator.mediaDevices?.getDisplayMedia
    ? null
    : 'This browser does not support screen capture. Mobile browsers are unsupported for broadcasting — use a desktop.';
}

export async function listMicrophones() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devs = await navigator.mediaDevices.enumerateDevices();
  return devs.filter((d) => d.kind === 'audioinput');
}

export function createBroadcaster({
  wsUrl,
  bitrate,
  fps,
  audio = false,
  fonte = 'tela',
  streamPronto = null,
  deviceId = null,
  onStatus,
  onStats,
  onEnd,
  onAviso,
}) {
  let ws = null;
  let stream = null;
  let encoder = null;
  let reader = null;
  let audioEncoder = null;
  let audioReader = null;
  let somBloqueado = false;
  let screenAudioTrack = null;
  let micStream = null;
  let micTrack = null;
  let micDeviceId = null;
  let mixCtx = null;
  let video = null;
  let config = null;

  let running = false;
  let mySlot = 0;
  let wantKeyframe = true;
  let lastKeyframeAt = 0;
  let srcW = 0;
  let srcH = 0;
  let startedAt = 0;
  let bytes = 0;
  let frames = 0;
  let viewers = 0;
  let statsTimer = null;
  let stage = null;
  let stageCtx = null;

  async function start() {
    stream = streamPronto ?? (fonte === 'camera' ? await capturarCamera() : await capturarTela());

    const track = stream.getVideoTracks()[0];
    track.contentHint = fonte === 'camera' ? 'motion' : 'text';
    track.addEventListener('ended', () =>
      stop(
        fonte === 'camera'
          ? 'Camera turned off.'
          : 'Screen sharing stopped by user.',
      ),
    );

    const s = track.getSettings();
    const target = fitWithin(s.width ?? 1280, s.height ?? 720);

    config = await pickConfig(target.width, target.height);
    if (!config) {
      cleanup();
      throw new Error('No video codec supported by this browser.');
    }

    await connect();

    encoder = new VideoEncoder({
      output: onEncoded,
      error: (err) => stop(`Encoder error: ${err.message}`),
    });
    encoder.configure(config);

    ws.send(JSON.stringify({ type: 'start' }));

    running = true;
    wantKeyframe = true;
    lastKeyframeAt = 0;
    srcW = 0;
    srcH = 0;
    startedAt = Date.now();

    onStatus?.({
      codec: config.codec,
      width: config.width,
      height: config.height,
      direct: Boolean(window.MediaStreamTrackProcessor),
    });

    statsTimer = setInterval(() => {
      onStats?.({
        viewers,
        fps: frames,
        mbps: (bytes * 8) / 1e6,
        seconds: Math.floor((Date.now() - startedAt) / 1000),
      });
      bytes = 0;
      frames = 0;
    }, 1000);

    pump(track);
    screenAudioTrack = prepararSom(track, stream);
    await reiniciarAudio();

    return stream;
  }

  function capturarTela() {
    return navigator.mediaDevices.getDisplayMedia(opcoesCaptura());
  }

  function capturarCamera() {
    return navigator.mediaDevices.getUserMedia({
      video: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: fps, max: fps },
      },
      audio: false,
    });
  }

  const opcoesCaptura = (over) => screenOptions({ fps, comSom: audio, ...over });

  function somDeJanelaConfiavel() {
    return Boolean(navigator.mediaDevices.getSupportedConstraints?.().restrictOwnAudio);
  }

  function prepararSom(videoTrack, capturado) {
    if (!audio) return null;

    const faixa = capturado.getAudioTracks()[0];
    if (!faixa) return null;

    const superficie = videoTrack.getSettings?.().displaySurface;
    if (somIsolado(superficie)) {
      somBloqueado = false;
      return faixa;
    }

    faixa.stop();
    capturado.removeTrack(faixa);

    somBloqueado = true;
    onAviso?.(avisoSemSom(superficie));
    return null;
  }

  function somIsolado(superficie) {
    if (superficie === 'browser') return true;
    return superficie === 'window' && somDeJanelaConfiavel();
  }

  function avisoSemSom(superficie) {
    if (superficie === 'window') {
      return 'This browser cannot isolate window audio. Streaming without audio.';
    }
    if (superficie === 'monitor') {
      return 'Entire screen audio captures system sounds. Streaming without audio to prevent feedback loop.';
    }
    return 'Audio source could not be verified. Audio removed.';
  }

  async function trocarSom() {
    const escolha = await navigator.mediaDevices.getDisplayMedia(
      opcoesCaptura({ video: true, comSom: true }),
    );

    const faixa = escolha.getAudioTracks()[0];
    const superficie = escolha.getVideoTracks()[0]?.getSettings?.().displaySurface;

    escolha.getVideoTracks().forEach((t) => t.stop());

    if (!faixa) {
      escolha.getTracks().forEach((t) => t.stop());
      throw new Error('Selection has no audio track. Choose a tab or window and check "Share audio".');
    }

    if (!somIsolado(superficie)) {
      faixa.stop();
      throw new Error('Selected source audio cannot be isolated.');
    }

    somBloqueado = false;
    screenAudioTrack = faixa;
    faixa.addEventListener('ended', () => onAviso?.('Audio source closed.'));
    await reiniciarAudio();
    return faixa;
  }

  async function ligarMicrofone(id = micDeviceId) {
    desligarMicrofone(false);

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone access is not supported by this browser.');
    }

    const constraints = {
      audio: id ? { deviceId: { exact: id } } : true,
    };

    const s = await navigator.mediaDevices.getUserMedia(constraints);
    micStream = s;
    micTrack = s.getAudioTracks()[0];
    micDeviceId = id ?? micTrack?.getSettings?.().deviceId ?? null;

    micTrack?.addEventListener('ended', () => {
      desligarMicrofone();
      onAviso?.('Microphone turned off.');
    });

    await reiniciarAudio();
    return micTrack;
  }

  function desligarMicrofone(reiniciar = true) {
    micTrack?.stop();
    micStream?.getTracks().forEach((t) => t.stop());
    micTrack = null;
    micStream = null;
    micDeviceId = null;

    if (reiniciar) {
      reiniciarAudio().catch(() => {});
    }
  }

  function faixaViva(faixa) {
    if (!faixa) return false;
    if (faixa.parada) return false;
    if ('readyState' in faixa && faixa.readyState !== 'live') return false;
    return true;
  }

  async function reiniciarAudio() {
    await audioReader?.cancel().catch(() => {});
    audioReader = null;
    if (audioEncoder?.state === 'configured') {
      try {
        audioEncoder.close();
      } catch {}
    }
    audioEncoder = null;
    mixCtx?.close().catch(() => {});
    mixCtx = null;

    if (!running) return;

    const telaViva = faixaViva(screenAudioTrack);
    const micVivo = faixaViva(micTrack);

    let faixaFinal = null;

    if (telaViva && micVivo) {
      if (window.AudioContext) {
        try {
          mixCtx = new AudioContext({ sampleRate: 48_000 });
          const dest = mixCtx.createMediaStreamDestination();
          const src1 = mixCtx.createMediaStreamSource(new MediaStream([screenAudioTrack]));
          const src2 = mixCtx.createMediaStreamSource(new MediaStream([micTrack]));
          src1.connect(dest);
          src2.connect(dest);
          faixaFinal = dest.stream.getAudioTracks()[0];
        } catch {
          faixaFinal = micTrack || screenAudioTrack;
        }
      } else {
        faixaFinal = micTrack || screenAudioTrack;
      }
    } else if (micVivo) {
      faixaFinal = micTrack;
    } else if (telaViva) {
      faixaFinal = screenAudioTrack;
    }

    if (faixaFinal) {
      pumpAudio(faixaFinal);
    }
  }

  async function pumpAudio(track) {
    if (!window.AudioEncoder || !window.MediaStreamTrackProcessor) return;

    const s = track.getSettings();
    const sampleRate = s.sampleRate || 48_000;
    const numberOfChannels = Math.min(2, s.channelCount || 2);

    try {
      audioEncoder = new AudioEncoder({
        output: onAudioEncoded,
        error: (err) => console.warn('[audio encoder]', err.message),
      });
      audioEncoder.configure({
        codec: 'opus',
        sampleRate,
        numberOfChannels,
        bitrate: AUDIO_BITRATE,
      });
    } catch (err) {
      console.warn('[audio encoder]', err.message);
      audioEncoder = null;
      return;
    }

    ws?.send(
      JSON.stringify({
        type: 'audio-config',
        config: { codec: 'opus', sampleRate, numberOfChannels },
      }),
    );

    audioReader = new MediaStreamTrackProcessor({ track }).readable.getReader();
    while (running) {
      let dados;
      try {
        const { done, value } = await audioReader.read();
        if (done) break;
        dados = value;
      } catch {
        break;
      }

      if (audioEncoder?.state === 'configured') {
        try {
          audioEncoder.encode(dados);
        } catch (err) {
          console.warn('[audio encode]', err.message);
        }
      }
      dados.close();
    }
  }

  function onAudioEncoded(chunk) {
    if (ws?.readyState !== WebSocket.OPEN) return;

    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    ws.send(empacotar(TIPO_AUDIO, chunk.timestamp ?? 0, data));
    bytes += 18 + data.byteLength;
  }

  async function pickConfig(width, height) {
    for (const realtime of [true, false]) {
      for (const candidate of CANDIDATES) {
        const cfg = { ...candidate, width, height, bitrate, framerate: fps };
        if (realtime) cfg.latencyMode = 'realtime';
        try {
          const { supported } = await VideoEncoder.isConfigSupported(cfg);
          if (supported) return cfg;
        } catch {}
      }
    }
    return null;
  }

  function pump(track) {
    if (window.MediaStreamTrackProcessor) pumpDirect(track);
    else pumpViaVideo();
  }

  async function pumpDirect(track) {
    reader = new MediaStreamTrackProcessor({ track }).readable.getReader();
    while (running) {
      let frame;
      try {
        const { done, value } = await reader.read();
        if (done) break;
        frame = value;
      } catch {
        break;
      }
      if (!encodeFrame(frame)) break;
    }
  }

  function pumpViaVideo() {
    video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    Object.assign(video.style, {
      position: 'fixed',
      left: '-9999px',
      width: '2px',
      height: '2px',
      opacity: '0',
    });
    document.body.append(video);
    video.play().catch(() => {});

    const t0 = performance.now();
    const hasRvfc = typeof video.requestVideoFrameCallback === 'function';
    const minGap = 1000 / (fps + 2);
    let lastAt = 0;

    const schedule = () => {
      if (!running) return;
      if (hasRvfc) video.requestVideoFrameCallback(tick);
      else requestAnimationFrame(tick);
    };

    const tick = () => {
      if (!running) return;
      if (video.paused) video.play().catch(() => {});
      if (video.readyState < 2 || !video.videoWidth) return schedule();

      const now = performance.now();
      if (!hasRvfc && now - lastAt < minGap) return schedule();
      lastAt = now;

      let frame;
      try {
        frame = new VideoFrame(video, { timestamp: (now - t0) * 1000 });
      } catch {
        return schedule();
      }
      encodeFrame(frame);
      schedule();
    };

    schedule();
  }

  function encodeFrame(frame) {
    if (!running || encoder?.state !== 'configured') {
      frame.close();
      return false;
    }
    if (encoder.encodeQueueSize > 2) {
      frame.close();
      return true;
    }

    const timestamp = frame.timestamp ?? performance.now() * 1000;
    syncSize(frame);

    const now = Date.now();
    if (now - lastKeyframeAt > KEYFRAME_EVERY_MS) wantKeyframe = true;

    let out = frame;
    if (stage) {
      stageCtx.drawImage(frame, 0, 0, stage.width, stage.height);
      frame.close();
      out = new VideoFrame(stage, { timestamp });
    }

    try {
      encoder.encode(out, { keyFrame: wantKeyframe });
      if (wantKeyframe) {
        lastKeyframeAt = now;
        wantKeyframe = false;
      }
    } catch (err) {
      console.error('[encode]', err);
    }

    out.close();
    frames++;
    return true;
  }

  function syncSize(frame) {
    const sw = frame.displayWidth;
    const sh = frame.displayHeight;
    if (!sw || !sh || (sw === srcW && sh === srcH)) return;

    srcW = sw;
    srcH = sh;
    const target = fitWithin(sw, sh);

    if (target.width !== config.width || target.height !== config.height) {
      config = { ...config, ...target };
      encoder.configure(config);
      wantKeyframe = true;
      onStatus?.({
        codec: config.codec,
        width: config.width,
        height: config.height,
        direct: Boolean(window.MediaStreamTrackProcessor),
      });
    }

    if (target.width === sw && target.height === sh) {
      stage = null;
      stageCtx = null;
    } else {
      stage = document.createElement('canvas');
      stage.width = target.width;
      stage.height = target.height;
      stageCtx = stage.getContext('2d', { alpha: false, desynchronized: true });
    }
  }

  function onEncoded(chunk, metadata) {
    if (ws?.readyState !== WebSocket.OPEN) return;

    if (metadata?.decoderConfig) {
      ws.send(JSON.stringify({ type: 'config', config: serializeConfig(metadata.decoderConfig) }));
    }

    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);

    const buf = empacotar(
      chunk.type === 'key' ? TIPO_KEYFRAME : TIPO_DELTA,
      chunk.timestamp ?? 0,
      data,
    );
    ws.send(buf);
    bytes += buf.byteLength;
  }

  function empacotar(tipo, timestamp, data) {
    const buf = new ArrayBuffer(18 + data.byteLength);
    const view = new DataView(buf);
    view.setUint8(0, mySlot);
    view.setUint8(1, tipo);
    view.setFloat64(2, timestamp);
    view.setFloat64(10, Date.now());
    new Uint8Array(buf, 18).set(data);
    return buf;
  }

  function serializeConfig(dc) {
    const out = { codec: dc.codec, codedWidth: dc.codedWidth, codedHeight: dc.codedHeight };
    if (dc.description) {
      const b = new Uint8Array(
        dc.description instanceof ArrayBuffer ? dc.description : dc.description.buffer,
      );
      let bin = '';
      for (const x of b) bin += String.fromCharCode(x);
      out.description = btoa(bin);
    }
    return out;
  }

  function connect() {
    return new Promise((resolve, reject) => {
      ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Unable to connect to server (timeout).'));
      }, 10_000);

      ws.addEventListener('open', () => {
        clearTimeout(timeout);
        resolve();
      });

      ws.addEventListener('message', (e) => {
        if (typeof e.data !== 'string') return;
        const msg = JSON.parse(e.data);

        if (msg.type === 'slot') mySlot = msg.slot;
        else if (msg.type === 'state') viewers = msg.viewers;
        else if (msg.type === 'need-keyframe') wantKeyframe = true;
        else if (msg.type === 'stop-request')
          stop(msg.motivo ?? 'Broadcast terminated.');
        else if (msg.type === 'error') {
          if (running) stop(msg.message);
          else {
            clearTimeout(timeout);
            reject(new Error(msg.message));
          }
        }
      });

      ws.addEventListener('error', () => {
        clearTimeout(timeout);
        reject(new Error('Failed to connect to server.'));
      });

      ws.addEventListener('close', () => {
        clearTimeout(timeout);
        if (running) stop('Server connection dropped.');
      });
    });
  }

  async function changeScreen() {
    const fresh = await navigator.mediaDevices.getDisplayMedia(opcoesCaptura());

    const previous = stream;
    const previousReader = reader;

    stream = fresh;
    const track = fresh.getVideoTracks()[0];
    track.contentHint = 'text';
    track.addEventListener('ended', () => stop('Screen sharing stopped by user.'));

    reader = null;
    await previousReader?.cancel().catch(() => {});
    previous?.getTracks().forEach((t) => t.stop());

    srcW = 0;
    srcH = 0;
    wantKeyframe = true;

    if (video) {
      video.srcObject = fresh;
      video.play().catch(() => {});
    } else {
      pumpDirect(track);
    }

    screenAudioTrack = prepararSom(track, fresh);
    await reiniciarAudio();

    return fresh;
  }

  function setQuality({ bitrate: nextBitrate, fps: nextFps } = {}) {
    if (nextBitrate) bitrate = nextBitrate;
    if (nextFps) fps = nextFps;
    if (encoder?.state !== 'configured') return;

    config = { ...config, bitrate, framerate: fps };
    encoder.configure(config);
    wantKeyframe = true;

    stream
      ?.getVideoTracks()[0]
      ?.applyConstraints({ frameRate: { ideal: fps, max: fps } })
      .catch(() => {});
  }

  const getSettings = () => ({ bitrate, fps });

  function cleanup() {
    desligarMicrofone(false);
    screenAudioTrack?.stop();
    screenAudioTrack = null;
    mixCtx?.close().catch(() => {});
    mixCtx = null;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video?.remove();
    video = null;
    stage = null;
    stageCtx = null;
  }

  function stop(reason) {
    const wasRunning = running;
    running = false;

    clearInterval(statsTimer);
    statsTimer = null;

    reader?.cancel().catch(() => {});
    reader = null;
    audioReader?.cancel().catch(() => {});
    audioReader = null;

    for (const e of [encoder, audioEncoder]) {
      if (e?.state === 'configured') {
        try {
          e.close();
        } catch {}
      }
    }
    encoder = null;
    audioEncoder = null;

    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stop' }));
      ws.close();
    }
    ws = null;

    cleanup();
    if (wasRunning) onEnd?.(reason ?? '');
  }

  return {
    start,
    stop,
    changeScreen,
    trocarSom,
    ligarMicrofone,
    desligarMicrofone,
    setQuality,
    getSettings,
    temSom: () => Boolean(audioEncoder),
    somBloqueado: () => somBloqueado,
    microfoneAtivo: () => faixaViva(micTrack),
    microfoneDeviceId: () => micDeviceId,
    isRunning: () => running,
  };
}

// Backward compatibility aliases
export const restricoesDeSom = audioConstraints;
export const opcoesTela = screenOptions;
export const fonteIndisponivel = sourceUnavailable;
export const listarMicrofones = listMicrophones;
