#!/usr/bin/env python3
import asyncio
import json
import logging
import struct
import time
from aiohttp import web, WSMsgType

logger = logging.getLogger("ws_server")

clients = set()
active_out_stream = None
active_audio_stream = None
video_config = {"codec": "vp8", "codedWidth": 1280, "codedHeight": 720, "fps": 30}
audio_config = {"codec": "opus", "sampleRate": 48000, "numberOfChannels": 2}

def empacotar_pacote_midia(slot: int, is_keyframe: bool, pts_us: float, payload: bytes, tipo: int = -1) -> bytes:
    """
    Empacota o quadro no formato binário exato esperado pelo WebCodecs:
    [Byte 0: slot]
    [Byte 1: tipo (1=Keyframe, 0=Delta, 3=Audio)]
    [Bytes 2..9: timestamp em us (Float64 BigEndian)]
    [Bytes 10..17: sentAt em ms (Float64 BigEndian)]
    [Bytes 18+: payload VP8/Opus]
    """
    buf = bytearray(18 + len(payload))
    buf[0] = slot & 0xFF
    buf[1] = tipo if tipo >= 0 else (1 if is_keyframe else 0)
    struct.pack_into('>d', buf, 2, float(pts_us))
    struct.pack_into('>d', buf, 10, float(time.time() * 1000))
    buf[18:] = payload
    return bytes(buf)

async def handle_ws(request):
    ws = web.WebSocketResponse(protocols=('chat', 'mqtt', ''))
    await ws.prepare(request)
    clients.add(ws)
    logger.info(f"⚡ Cliente WebSocket conectado: {request.remote}")

    try:
        # Envia mensagem inicial de boas-vindas com a configuração do WebCodecs de vídeo e áudio
        await ws.send_json({"type": "welcome", "slot": 0})
        await ws.send_json({"type": "config", "config": video_config})
        await ws.send_json({"type": "audio-config", "config": audio_config})

        async for msg in ws:
            if msg.type == WSMsgType.TEXT:
                data = json.loads(msg.data)
                if data.get("type") == "ping":
                    await ws.send_json({"type": "pong"})
            elif msg.type == WSMsgType.ERROR:
                logger.warning(f"WebSocket error: {ws.exception()}")
    finally:
        clients.discard(ws)
        logger.info(f"Cliente WebSocket desconectado: {request.remote}")

    return ws

async def handle_health(request):
    return web.Response(text="OK", status=200, headers={"Access-Control-Allow-Origin": "*"})

async def broadcast_bytes(data: bytes):
    if not clients:
        return
    for ws in list(clients):
        try:
            if not ws.closed:
                await ws.send_bytes(data)
        except Exception:
            clients.discard(ws)

async def streamer_video_loop(out_stream):
    """Lê quadros IVF do encoder FFmpeg/GStreamer e transmite para todos os WebSockets."""
    try:
        # 1. Ler cabeçalho IVF (32 bytes)
        hdr32 = await out_stream.readexactly(32)
        is_vp9 = False
        if len(hdr32) == 32 and hdr32[:4] == b'DKIF':
            fourcc = hdr32[8:12].decode('ascii', errors='ignore').strip().lower()
            is_vp9 = 'vp9' in fourcc
            video_config["codec"] = "vp09.00.10.08" if is_vp9 else "vp8"

            width, height = struct.unpack('<HH', hdr32[12:16])
            fps_num, fps_den = struct.unpack('<II', hdr32[16:24])
            video_config["codedWidth"] = width if width > 0 else 1280
            video_config["codedHeight"] = height if height > 0 else 720
            video_config["fps"] = round(fps_num / fps_den) if fps_den > 0 else 30

        start_time = time.time()
        ultimo_pts = -1
        primeiro_quadro = True

        while True:
            hdr12 = await out_stream.readexactly(12)
            frame_size, timestamp = struct.unpack('<IQ', hdr12)
            frame_bytes = await out_stream.readexactly(frame_size)

            if primeiro_quadro:
                is_keyframe = True
                primeiro_quadro = False
            elif len(frame_bytes) > 0:
                if is_vp9:
                    is_keyframe = (frame_bytes[0] & 0x04) == 0
                else:
                    is_keyframe = (frame_bytes[0] & 0x01) == 0
            else:
                is_keyframe = False

            now_pts = int((time.time() - start_time) * 1_000_000)
            if now_pts <= ultimo_pts:
                now_pts = ultimo_pts + 1
            ultimo_pts = now_pts

            packet = empacotar_pacote_midia(0, is_keyframe, now_pts, frame_bytes, tipo=1 if is_keyframe else 0)
            await broadcast_bytes(packet)
    except asyncio.IncompleteReadError:
        pass
    except Exception as e:
        logger.debug(f"Loop de vídeo encerrado: {e}")

async def streamer_audio_loop(audio_stream):
    """Lê pacotes Ogg Opus do FFmpeg e transmite quadros tipo=3 para os clientes WebSocket."""
    if not audio_stream:
        return
    start_audio_time = time.time()
    ultimo_audio_pts = -1
    try:
        while True:
            header = await audio_stream.readexactly(27)
            if header[:4] != b'OggS':
                chunk = header + await audio_stream.read(485)
                if not chunk:
                    break
                now_pts = int((time.time() - start_audio_time) * 1_000_000)
                if now_pts <= ultimo_audio_pts:
                    now_pts = ultimo_audio_pts + 1
                ultimo_audio_pts = now_pts
                packet = empacotar_pacote_midia(0, False, now_pts, chunk, tipo=3)
                await broadcast_bytes(packet)
                continue

            num_segments = header[26]
            seg_table = await audio_stream.readexactly(num_segments)
            payload_len = sum(seg_table)
            payload = await audio_stream.readexactly(payload_len)

            offset = 0
            pkt = bytearray()
            for seg_len in seg_table:
                pkt.extend(payload[offset:offset + seg_len])
                offset += seg_len
                if seg_len < 255:
                    if len(pkt) > 0 and not pkt.startswith(b'OpusHead') and not pkt.startswith(b'OpusTags'):
                        now_pts = int((time.time() - start_audio_time) * 1_000_000)
                        if now_pts <= ultimo_audio_pts:
                            now_pts = ultimo_audio_pts + 1
                        ultimo_audio_pts = now_pts

                        packet = empacotar_pacote_midia(0, False, now_pts, bytes(pkt), tipo=3)
                        await broadcast_bytes(packet)
                    pkt = bytearray()
    except asyncio.IncompleteReadError:
        pass
    except Exception as e:
        logger.debug(f"Loop de áudio encerrado: {e}")


async def iniciar_servidor_ws(porta: int = 3001) -> tuple[web.AppRunner, int]:
    app = web.Application()
    app.router.add_get('/', handle_health)
    app.router.add_get('/health', handle_health)
    app.router.add_get('/ws', handle_ws)

    runner = web.AppRunner(app)
    await runner.setup()

    for p in range(porta, porta + 20):
        try:
            site = web.TCPSite(runner, '0.0.0.0', p)
            await site.start()
            logger.info(f"🚀 Servidor WebSocket do Streamer ativo na porta {p}")
            return runner, p
        except OSError:
            continue

    site = web.TCPSite(runner, '0.0.0.0', 0)
    await site.start()
    assigned_port = site._server.sockets[0].getsockname()[1]
    return runner, assigned_port
