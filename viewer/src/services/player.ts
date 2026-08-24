/**
 * WebCodecs Video Player Engine.
 * Decodes video chunks frame-by-frame and renders them onto a high-performance 2D Canvas.
 */

export interface PlayerOptions {
  onError?: (msg: string) => void;
  onSizeChange?: (size: { width: number; height: number }) => void;
  onRequestKeyframe?: () => void;
}

export function createPlayer(canvas: HTMLCanvasElement, { onError, onSizeChange, onRequestKeyframe }: PlayerOptions = {}) {
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true }) as CanvasRenderingContext2D;

  let decoder: any = null;
  let needKeyframe = true;
  let lastLagMs = 0;
  let framesDrawn = 0;
  let lastKeyframeRequestTime = 0;
  let virgin = true;

  let latestFrame: any = null;
  let animFrameId: number | null = null;

  function start(rawConfig: any) {
    stop();

    if (!window.VideoDecoder) {
      onError?.('WebCodecs is not supported in this browser.');
      return false;
    }

    const config = deserialize(rawConfig);

    decoder = new (window as any).VideoDecoder({
      output: drawFrame,
      error: (err: any) => {
        console.warn('[VideoDecoder error]', err.message);
        needKeyframe = true;
        try {
          if (decoder && decoder.state === 'closed') {
            decoder = new (window as any).VideoDecoder({ output: drawFrame, error: () => {} });
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

  function feedPacket(arrayBuffer: ArrayBuffer) {
    if (!decoder || decoder.state !== 'configured') return;

    if (arrayBuffer.byteLength < 18) return;

    const view = new DataView(arrayBuffer);
    const type = view.getUint8(1); // 1 = keyframe, 0/2 = delta
    const timestamp = view.getFloat64(2); // Sent timestamp in us
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
        timestamp: Math.max(0, Math.round(timestamp)),
        data: payload,
      });

      lastLagMs = Math.max(0, Math.round(performance.now() - sendTimestamp));
      decoder.decode(chunk);
    } catch (err) {
      console.warn('[Decoder feed error]', err);
      needKeyframe = true;
    }
  }

  function renderLoop() {
    animFrameId = requestAnimationFrame(renderLoop);
    if (!latestFrame) return;

    const frame = latestFrame;
    latestFrame = null;

    if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
      canvas.width = frame.displayWidth;
      canvas.height = frame.displayHeight;
      onSizeChange?.({ width: frame.displayWidth, height: frame.displayHeight });
    }

    ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
    frame.close();
    framesDrawn++;

    if (virgin) {
      virgin = false;
    }
  }

  function drawFrame(frame: any) {
    if (latestFrame) {
      latestFrame.close();
    }
    latestFrame = frame;

    if (!animFrameId) {
      animFrameId = requestAnimationFrame(renderLoop);
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
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    if (latestFrame) {
      try { latestFrame.close(); } catch {}
      latestFrame = null;
    }

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
    push: feedPacket,
    stop,
    getStats: () => ({ framesDrawn, lastLagMs, isVirgin: virgin }),
  };
}

function deserialize(raw: any) {
  if (typeof raw === 'string') return JSON.parse(raw);
  return raw;
}
