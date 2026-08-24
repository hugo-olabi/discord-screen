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
keyframe_requested = False

def pop_keyframe_request() -> bool:
    global keyframe_requested
    if keyframe_requested:
        keyframe_requested = False
        return True
    return False

def pack_media_packet(slot: int, is_keyframe: bool, pts_us: float, payload: bytes, tipo: int = -1) -> bytes:
    """
    Packs media chunk into exact binary header expected by WebCodecs:
    [Byte 0: slot]
    [Byte 1: type (1=Keyframe, 0=Delta, 3=Audio)]
    [Bytes 2..9: timestamp in us (Float64 BigEndian)]
    [Bytes 10..17: sentAt in ms (Float64 BigEndian)]
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
    global keyframe_requested
    ws = web.WebSocketResponse(protocols=('chat', 'mqtt', ''))
    await ws.prepare(request)
    clients.add(ws)
    logger.info(f"⚡ WebSocket client connected: {request.remote}")

    try:
        if not ws.closed:
            await ws.send_json({"type": "welcome", "slot": 0})
        if not ws.closed:
            await ws.send_json({"type": "config", "config": video_config})
        if not ws.closed:
            await ws.send_json({"type": "audio-config", "config": audio_config})
    except Exception as e:
        logger.debug(f"Handshake failed (connection reset): {e}")
        clients.discard(ws)
        return ws

    try:
        async for msg in ws:
            if msg.type == WSMsgType.TEXT:
                data = json.loads(msg.data)
                if data.get("type") == "ping":
                    if not ws.closed:
                        try: await ws.send_json({"type": "pong"})
                        except Exception: pass
                elif data.get("type") == "request-keyframe":
                    keyframe_requested = True
                    logger.info("🔑 Keyframe requested by client")
            elif msg.type == WSMsgType.ERROR:
                logger.warning(f"WebSocket error: {ws.exception()}")
    except Exception as e:
        logger.debug(f"WebSocket connection closed: {e}")
    finally:
        clients.discard(ws)
        logger.info(f"WebSocket client disconnected: {request.remote}")

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

async def broadcast_json(data: dict):
    if not clients:
        return
    for ws in list(clients):
        try:
            if not ws.closed:
                await ws.send_json(data)
        except Exception:
            clients.discard(ws)

async def update_config_and_notify(new_video_cfg=None, new_audio_cfg=None):
    if new_video_cfg:
        video_config.update(new_video_cfg)
        await broadcast_json({"type": "config", "config": video_config})
    if new_audio_cfg:
        audio_config.update(new_audio_cfg)
        await broadcast_json({"type": "audio-config", "config": audio_config})

async def streamer_video_loop(out_stream):
    """Reads IVF frames from FFmpeg/GStreamer encoder and broadcasts to WebSockets."""
    try:
        hdr32 = await out_stream.readexactly(32)
        is_vp9 = False
        if len(hdr32) == 32 and hdr32[:4] == b'DKIF':
            fourcc = hdr32[8:12].decode('ascii', errors='ignore').strip().lower()
            is_vp9 = 'vp9' in fourcc
            video_config["codec"] = "vp09.00.31.08" if is_vp9 else "vp8"

            width, height = struct.unpack('<HH', hdr32[12:16])
            fps_num, fps_den = struct.unpack('<II', hdr32[16:24])
            video_config["codedWidth"] = width if width > 0 else 1280
            video_config["codedHeight"] = height if height > 0 else 720
            video_config["fps"] = round(fps_num / fps_den) if fps_den > 0 else 30

        start_time = time.time()
        last_pts = -1
        first_frame = True

        while True:
            hdr12 = await out_stream.readexactly(12)
            frame_size, timestamp = struct.unpack('<IQ', hdr12)
            frame_bytes = await out_stream.readexactly(frame_size)

            if first_frame:
                is_keyframe = True
                first_frame = False
            elif len(frame_bytes) > 0:
                if is_vp9:
                    is_keyframe = (frame_bytes[0] & 0x04) == 0
                else:
                    is_keyframe = (frame_bytes[0] & 0x01) == 0
            else:
                is_keyframe = False

            now_pts = int((time.time() - start_time) * 1_000_000)
            if now_pts <= last_pts:
                now_pts = last_pts + 1
            last_pts = now_pts

            packet = pack_media_packet(0, is_keyframe, now_pts, frame_bytes, tipo=1 if is_keyframe else 0)
            await broadcast_bytes(packet)
    except asyncio.IncompleteReadError:
        pass
    except Exception as e:
        logger.debug(f"Video loop closed: {e}")

async def streamer_audio_loop(audio_stream):
    """Reads Ogg Opus packets from FFmpeg and broadcasts type=3 chunks to WebSockets."""
    if not audio_stream:
        return
    audio_pts = 0
    buf = bytearray()

    try:
        while True:
            while len(buf) < 27:
                chunk = await audio_stream.read(4096)
                if not chunk:
                    return
                buf.extend(chunk)

            idx = buf.find(b'OggS')
            if idx == -1:
                buf = buf[-3:]
                continue
            elif idx > 0:
                buf = buf[idx:]

            if len(buf) < 27:
                continue

            num_segments = buf[26]
            header_and_seg_len = 27 + num_segments
            while len(buf) < header_and_seg_len:
                chunk = await audio_stream.read(4096)
                if not chunk:
                    return
                buf.extend(chunk)

            seg_table = buf[27:header_and_seg_len]
            payload_len = sum(seg_table)
            page_len = header_and_seg_len + payload_len

            while len(buf) < page_len:
                chunk = await audio_stream.read(4096)
                if not chunk:
                    return
                buf.extend(chunk)

            page_payload = bytes(buf[header_and_seg_len:page_len])
            del buf[:page_len]

            offset = 0
            pkt = bytearray()
            for seg_len in seg_table:
                pkt.extend(page_payload[offset:offset + seg_len])
                offset += seg_len
                if seg_len < 255:
                    if len(pkt) > 0 and not pkt.startswith(b'OpusHead') and not pkt.startswith(b'OpusTags'):
                        packet = pack_media_packet(0, False, audio_pts, bytes(pkt), tipo=3)
                        await broadcast_bytes(packet)
                        audio_pts += 20_000
                    pkt = bytearray()
    except asyncio.IncompleteReadError:
        pass
    except Exception as e:
        logger.debug(f"Audio loop closed: {e}")

async def start_ws_server(port: int = 3001) -> tuple[web.AppRunner, int]:
    app = web.Application()
    app.router.add_get('/', handle_health)
    app.router.add_get('/health', handle_health)
    app.router.add_get('/ws', handle_ws)

    runner = web.AppRunner(app)
    await runner.setup()

    for p in range(port, port + 20):
        try:
            site = web.TCPSite(runner, '0.0.0.0', p)
            await site.start()
            logger.info(f"🚀 Streamer WebSocket server active on port {p}")
            return runner, p
        except OSError:
            continue

    site = web.TCPSite(runner, '0.0.0.0', 0)
    await site.start()
    assigned_port = site._server.sockets[0].getsockname()[1]
    return runner, assigned_port

# Backward compatibility aliases
empacotar_pacote_midia = pack_media_packet
atualizar_config_e_notificar = update_config_and_notify
iniciar_servidor_ws = start_ws_server
