import WebSocket from 'ws';

const TIPO_KEYFRAME = 1;
const TIPO_DELTA = 2;

/**
 * Conecta ao WebSocket da sala e transmite os pacotes do FFmpeg (demuxed IVF para WebCodecs).
 *
 * @param {string} serverUrl Ex: ws://localhost:3001
 * @param {string} token Token de transmissão da sala
 * @param {import('node:stream').Readable} ffmpegStdout Stream de saída do FFmpeg
 * @param {{fonte?: string, aoConectar?: () => void, aoErro?: (err: Error) => void}} opcoes
 */
export function iniciarTransmissaoNativa(serverUrl, token, ffmpegStdout, opcoes = {}) {
  const fonte = opcoes.fonte ?? 'tela';
  const urlBase = serverUrl.replace(/^http/, 'ws');
  const targetUrl = `${urlBase}/ws?t=${encodeURIComponent(token)}&fonte=${fonte}`;

  const ws = new WebSocket(targetUrl);
  let conectado = false;
  let mySlot = null;
  let headerEnviado = false;
  let ultimoKeyframePacket = null;

  let buffer = Buffer.alloc(0);
  let codecStr = 'vp09.00.10.08';

  ws.on('open', () => {
    // Conectado, aguardando mensagem de confirmação do slot
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'slot' || msg.type === 'welcome') {
        mySlot = msg.slot;
        conectado = true;
        // Avisar o servidor que a transmissão foi iniciada (ativa entry.streaming no servidor)
        ws.send(JSON.stringify({ type: 'start' }));
        processarBuffer();
        if (opcoes.aoConectar) opcoes.aoConectar();
      } else if (msg.type === 'need-keyframe') {
        // Enviar o último keyframe memorizado imediatamente para o novo espectador não ficar preso em "Conectando..."
        if (ultimoKeyframePacket && ws.readyState === WebSocket.OPEN) {
          ws.send(ultimoKeyframePacket);
        }
      }
    } catch {
      // Ignorar mensagens binárias
    }
  });

  ws.on('error', (err) => {
    if (opcoes.aoErro) opcoes.aoErro(err);
  });

  ffmpegStdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    processarBuffer();
  });

  function processarBuffer() {
    if (!conectado || mySlot === null) return;

    // Parse do cabeçalho IVF (32 bytes)
    if (!headerEnviado && buffer.length >= 32) {
      const magic = buffer.toString('ascii', 0, 4);
      if (magic === 'DKIF') {
        const fourcc = buffer.toString('ascii', 8, 12);
        const width = buffer.readUInt16LE(12);
        const height = buffer.readUInt16LE(14);

        if (fourcc === 'VP80') codecStr = 'vp8';
        else if (fourcc === 'AV01') codecStr = 'av01.0.04M.08';
        else codecStr = 'vp09.00.10.08';

        ws.send(
          JSON.stringify({
            type: 'config',
            config: { codec: codecStr, codedWidth: width, codedHeight: height },
          }),
        );
        headerEnviado = true;
      }
      buffer = buffer.subarray(32);
    }

    // Parse das frames IVF (12 bytes de cabeçalho + payload)
    while (headerEnviado && buffer.length >= 12) {
      const size = buffer.readUInt32LE(0);
      const pts = Number(buffer.readBigUInt64LE(4));

      if (buffer.length < 12 + size) break;

      const framePayload = buffer.subarray(12, 12 + size);
      buffer = buffer.subarray(12 + size);

      // Verificação de keyframe (para VP9/VP8)
      const isKeyframe = (framePayload[0] & 0x04) === 0;
      const tipo = isKeyframe ? TIPO_KEYFRAME : TIPO_DELTA;

      const packet = empacotarPacote(mySlot, tipo, pts * 33333, Date.now(), framePayload);
      if (isKeyframe) {
        ultimoKeyframePacket = packet;
      }

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(packet);
      }
    }
  }

  function empacotarPacote(slot, tipo, timestamp, sentAt, payload) {
    const buf = new ArrayBuffer(18 + payload.length);
    const view = new DataView(buf);
    view.setUint8(0, slot);
    view.setUint8(1, tipo);
    view.setFloat64(2, timestamp);
    view.setFloat64(10, sentAt);
    new Uint8Array(buf, 18).set(payload);
    return buf;
  }

  function parar() {
    conectado = false;
    try {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.send(JSON.stringify({ type: 'stop' }));
        ws.close();
      }
    } catch {
      // Ignorar exceções no encerramento
    }
  }

  return { ws, parar };
}
