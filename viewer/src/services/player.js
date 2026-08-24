/**
 * WebCodecs Video Player Engine.
 * Decodes video chunks frame-by-frame and renders them onto a high-performance 2D Canvas.
 */

export function createPlayer(canvas, { onError, onSizeChange, onRequestKeyframe } = {}) {
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

  let decoder = null;
  let needKeyframe = true;
  let lastLagMs = 0;
  let framesDrawn = 0;
  let lastKeyframeRequestTime = 0;
  let virgin = true;

  function start(rawConfig) {
    stop();

    if (!window.VideoDecoder) {
      onError?.('WebCodecs is not supported in this browser.');
      return false;
    }

    const config = deserialize(rawConfig);

    decoder = new VideoDecoder({
      output: drawFrame,
      error: (err) => {
        console.warn('[VideoDecoder error]', err.message);
        needKeyframe = true;
        try {
          if (decoder && decoder.state === 'closed') {
            decoder = new VideoDecoder({ output: drawFrame, error: () => {} });
            decoder.configure(config);
          }
        } catch {
          /* ignore secondary failure */
        }
      },
    });

    try {
      decoder.configure(config);
    } catch {
      onError?.(`Unsupported codec in this browser: ${config.codec}`);
      decoder = null;
      return false;
    }

    needKeyframe = true;
    return true;
  }

  function feedPacket(arrayBuffer) {
    if (!decoder || decoder.state !== 'configured') return;

    if (arrayBuffer.byteLength < 18) return;

    const view = new DataView(arrayBuffer);
    const type = view.getUint8(1); // 1 = keyframe, 2 = delta
    const sendTimestamp = view.getFloat64(10); // Sent timestamp in ms

    const isKeyframe = type === 1;

    if (needKeyframe) {
      if (!isKeyframe) {
        requestKeyframeThrottle();
        return;
      }
      needKeyframe = false;
    }

    const payload = new Uint8Array(arrayBuffer, 18);

    try {
      const chunk = new EncodedVideoChunk({
        type: isKeyframe ? 'key' : 'delta',
        timestamp: performance.now() * 1000,
        data: payload,
      });

      lastLagMs = Math.max(0, Math.round(performance.now() - sendTimestamp));
      decoder.decode(chunk);
    } catch (err) {
      console.warn('[Decoder feed error]', err);
      needKeyframe = true;
    }
  }

  function drawFrame(frame) {
    if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
      canvas.width = frame.displayWidth;
      canvas.height = frame.displayHeight;
      onSizeChange?.({ width: frame.displayWidth, height: frame.displayHeight });
    }

    ctx.drawImage(frame, 0, 0);
    frame.close();
    framesDrawn++;

    if (virgin) {
      virgin = false;
    }
  }

  function requestKeyframeThrottle() {
    const now = performance.now();
    if (now - lastKeyframeRequestTime > 1500) {
      lastKeyframeRequestTime = now;
      onRequestKeyframe?.();
    }
  }

  function stop() {
    if (decoder) {
      try {
        if (decoder.state !== 'closed') decoder.close();
      } catch {}
      decoder = null;
    }
    needKeyframe = true;
    virgin = true;
  }

  return {
    start,
    feedPacket,
    stop,
    getStats: () => ({ framesDrawn, lastLagMs, isVirgin: virgin }),
  };
}

function deserialize(raw) {
  if (typeof raw === 'string') return JSON.parse(raw);
  return raw;
}
