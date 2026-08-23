/**
 * Player WebCodecs.
 *
 * Dentro da Activity não existe WebRTC, mas WebCodecs não é bloqueado por
 * Permissions Policy — então dá para decodificar quadro a quadro e desenhar
 * num canvas, sem passar por container nem por MediaSource.
 *
 * O canvas mantém SEMPRE o tamanho nativo do vídeo no buffer interno
 * (canvas.width/height). Isso dá a ele uma proporção intrínseca, e o CSS
 * apenas o limita com max-width/max-height — o navegador então reduz
 * preservando a proporção, por construção.
 *
 * Dimensionar o buffer pelo tamanho de exibição, como cheguei a tentar, faz a
 * proporção do vídeo passar a depender do formato do container e distorce a
 * imagem durante o redimensionamento.
 */

export function createPlayer(canvas, { onError, onTamanho, onRequestKeyframe } = {}) {
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

  let decoder = null;
  let needKeyframe = true;
  let lastLagMs = 0;
  let framesDrawn = 0;
  let lastKeyframeRequestTime = 0;
  // Quem espera precisa saber quando a espera acabou: entre pedir para assistir
  // e o primeiro quadro cabe um keyframe inteiro de atraso, e o canvas preto
  // desse intervalo é idêntico a um travamento.
  let virgem = true;

  function start(rawConfig) {
    stop();

    if (!window.VideoDecoder) {
      onError?.('Este navegador não tem WebCodecs — não é possível assistir.');
      return false;
    }

    const config = deserialize(rawConfig);

    decoder = new VideoDecoder({
      output: draw,
      error: (err) => {
        console.warn('[decoder]', err.message);
        needKeyframe = true;
        // Se o decodificador fechou devido a um erro, re-inicializar
        try {
          if (decoder && decoder.state === 'closed') {
            decoder = new VideoDecoder({ output: draw, error: () => {} });
            decoder.configure(config);
          }
        } catch {
          /* ignorar falha secundária */
        }
      },
    });

    try {
      decoder.configure(config);
    } catch {
      onError?.(`Codec não suportado por este navegador: ${config.codec}`);
      decoder = null;
      return false;
    }

    needKeyframe = true;
    return true;
  }

  /** Quadro empacotado: [1B slot][1B tipo][8B timestamp][8B envio][payload] */
  function push(buffer) {
    if (!decoder || decoder.state !== 'configured') return;

    const view = new DataView(buffer);
    const isKeyframe = view.getUint8(1) === 1;

    // Decoder frio só aceita keyframe; deltas antes disso viram erro.
    if (needKeyframe && !isKeyframe) return;

    // Backpressure para mobile: se a fila de decodificação acumulou quadros (>8), descarta deltas e solicita Keyframe limpo
    if (!isKeyframe && decoder.decodeQueueSize > 8) {
      needKeyframe = true;
      const now = Date.now();
      if (now - lastKeyframeRequestTime > 1000) {
        lastKeyframeRequestTime = now;
        onRequestKeyframe?.();
      }
      return;
    }

    const timestamp = view.getFloat64(2);
    const sentAt = view.getFloat64(10);
    lastLagMs = Date.now() - sentAt;

    try {
      decoder.decode(
        new EncodedVideoChunk({
          type: isKeyframe ? 'key' : 'delta',
          timestamp: Math.max(0, Math.round(timestamp)),
          data: new Uint8Array(buffer, 18),
        }),
      );
      needKeyframe = false;
    } catch (err) {
      console.warn('[decode]', err.message);
      needKeyframe = true;
    }
  }

  let latestFrame = null;
  let animFrameId = null;

  function renderLoop() {
    animFrameId = requestAnimationFrame(renderLoop);
    if (!latestFrame) return;

    const frame = latestFrame;
    latestFrame = null;

    let mudou = false;
    if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
      canvas.width = frame.displayWidth;
      canvas.height = frame.displayHeight;
      mudou = true;
    }

    ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
    frame.close();
    framesDrawn++;

    if (virgem || mudou) {
      virgem = false;
      onTamanho?.();
    }
  }

  function draw(frame) {
    if (latestFrame) {
      latestFrame.close();
    }
    latestFrame = frame;

    if (!animFrameId) {
      animFrameId = requestAnimationFrame(renderLoop);
    }
  }

  function stop() {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    if (latestFrame) {
      try { latestFrame.close(); } catch {}
      latestFrame = null;
    }

    if (decoder && decoder.state !== 'closed') {
      try {
        decoder.close();
      } catch {
        // Fechar o que já se fechou sozinho lança; não há nada a desfazer.
      }
    }
    decoder = null;
    needKeyframe = true;
    lastLagMs = 0;
    if (canvas.width && canvas.height) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  /** Atraso aproximado em ms. Exato na mesma máquina; entre máquinas, sujeito a desvio de relógio. */
  const getLag = () => lastLagMs;

  /** Resolução nativa do vídeo e tamanho de exibição — para diagnóstico. */
  function getSizes() {
    const rect = canvas.getBoundingClientRect();
    return {
      video: `${canvas.width}×${canvas.height}`,
      box: `${Math.round(rect.width)}×${Math.round(rect.height)}`,
    };
  }

  function takeFrameCount() {
    const n = framesDrawn;
    framesDrawn = 0;
    return n;
  }

  return { start, push, stop, getLag, takeFrameCount, getSizes };
}

function deserialize(c) {
  const out = {
    codec: c.codec || 'vp09.00.10.08',
    optimizeForLatency: true,
  };

  if (Number.isInteger(c.codedWidth) && c.codedWidth > 0) {
    out.codedWidth = c.codedWidth;
  }
  if (Number.isInteger(c.codedHeight) && c.codedHeight > 0) {
    out.codedHeight = c.codedHeight;
  }

  if (c.description) {
    const bin = atob(c.description);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    out.description = bytes;
  }

  return out;
}
