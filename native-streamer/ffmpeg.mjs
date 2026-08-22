import os from 'node:os';

/**
 * Detecta o sistema operacional e ambiente de exibição (X11 / Wayland no Linux).
 */
export function detectarSistema() {
  const plataforma = os.platform(); // 'linux', 'win32', 'darwin'
  let displayServer = 'unknown';

  if (plataforma === 'linux') {
    if (process.env.WAYLAND_DISPLAY) {
      displayServer = 'wayland';
    } else if (process.env.DISPLAY) {
      displayServer = 'x11';
    }
  }

  return { os: plataforma, displayServer };
}

/**
 * Monta os argumentos do GStreamer para capturar o stream PipeWire do XDG Desktop Portal.
 */
export function montarComandoPipeWireGStreamer(pipewireNode, opcoes = {}) {
  const fps = opcoes.fps ?? 30;
  const bitrateStr = opcoes.bitrate ?? '2500k';
  const bitrateBps = String(Math.round(Number(bitrateStr.replace(/k$/, '')) * 1000) || 2500000);
  const keyframeDist = String(Math.min(fps, 15));

  return [
    '-e',
    'pipewiresrc',
    `target-object=${pipewireNode}`,
    '!',
    'video/x-raw',
    '!',
    'videoconvert',
    '!',
    'vp9enc',
    'deadline=1',
    'cpu-used=8',
    `target-bitrate=${bitrateBps}`,
    `keyframe-max-dist=${keyframeDist}`,
    '!',
    'ivfenc',
    '!',
    'fdsink',
    'fd=1',
  ];
}

/**
 * Monta os argumentos de entrada de vídeo com base no sistema.
 */
export function montarEntradaVideo(opcoes = {}, sistema = detectarSistema()) {
  const fps = opcoes.fps ?? 30;
  const dispositivo = opcoes.videoDevice;
  const windowId = opcoes.windowId;

  if (sistema.os === 'linux') {
    if (dispositivo) {
      return ['-f', 'v4l2', '-framerate', String(fps), '-i', dispositivo];
    }
    const display = process.env.DISPLAY || ':0.0';
    const base = [
      '-f',
      'x11grab',
      '-draw_mouse',
      '1',
      '-framerate',
      String(fps),
      '-probesize',
      '32M',
    ];
    if (windowId) {
      base.push('-window_id', String(windowId));
    }
    base.push('-i', display);
    return base;
  }

  if (sistema.os === 'win32') {
    const target = windowId || dispositivo || 'desktop';
    return ['-f', 'gdigrab', '-framerate', String(fps), '-i', target];
  }

  if (sistema.os === 'darwin') {
    const target = windowId || dispositivo || '1:none';
    return ['-f', 'avfoundation', '-framerate', String(fps), '-i', target];
  }

  return ['-f', 'x11grab', '-framerate', String(fps), '-i', ':0.0'];
}

/**
 * Monta os argumentos de entrada de áudio com base no sistema.
 */
export function montarEntradaAudio(opcoes = {}, sistema = detectarSistema()) {
  const dispositivo = opcoes.audioDevice;

  if (sistema.os === 'linux') {
    const target = dispositivo ?? 'default';
    return ['-f', 'pulse', '-i', target];
  }

  if (sistema.os === 'win32') {
    if (!dispositivo) return [];
    return ['-f', 'dshow', '-i', `audio=${dispositivo}`];
  }

  if (sistema.os === 'darwin') {
    if (!dispositivo) return [];
    return ['-f', 'avfoundation', '-i', `:${dispositivo}`];
  }

  return [];
}

/**
 * Monta os encoders de vídeo para a saída IVF (compatível com WebCodecs).
 */
export function montarEncoders(opcoes = {}) {
  const hwaccel = opcoes.hwaccel ?? 'auto';
  const bitrate = opcoes.bitrate ?? '2500k';
  const fps = opcoes.fps ?? 30;

  const keyframeInterval = String(Math.min(fps, 15));

  let videoCodec = [
    '-c:v',
    'libvpx-vp9',
    '-b:v',
    bitrate,
    '-g',
    keyframeInterval,
    '-keyint_min',
    keyframeInterval,
    '-deadline',
    'realtime',
    '-cpu-used',
    '8',
  ];

  if (hwaccel === 'nvenc') {
    videoCodec = ['-c:v', 'h264_nvenc', '-b:v', bitrate, '-g', keyframeInterval, '-preset', 'llhq'];
  } else if (hwaccel === 'vaapi') {
    videoCodec = ['-c:v', 'h264_vaapi', '-b:v', bitrate, '-g', keyframeInterval];
  } else if (hwaccel === 'qsv') {
    videoCodec = ['-c:v', 'h264_qsv', '-b:v', bitrate, '-g', keyframeInterval];
  }

  return videoCodec;
}

/**
 * Monta o comando completo do FFmpeg.
 */
export function montarComandoFFmpeg(opcoes = {}, sistema = detectarSistema()) {
  const entradaVideo = montarEntradaVideo(opcoes, sistema);
  const encoders = montarEncoders(opcoes);

  return ['-loglevel', 'warning', ...entradaVideo, ...encoders, '-f', 'ivf', 'pipe:1'];
}
