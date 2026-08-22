#!/usr/bin/env python3
import asyncio
import json
import logging
import os
import sys
from aiohttp import web
from aiortc import RTCPeerConnection, RTCSessionDescription, MediaStreamTrack
from aiortc.contrib.media import MediaPlayer
from fractions import Fraction
import av

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger("whep_server")

pcs = set()
active_stream = None

import struct

class FFmpegVideoTrack(MediaStreamTrack):
    kind = "video"

    def __init__(self, out_stream=None):
        super().__init__()
        self.out_stream = out_stream or active_stream
        self.codec = av.CodecContext.create("vp8", "r")
        self.ivf_header_read = False
        self._timestamp = 0

    async def _read_bytes(self, n: int) -> bytes:
        if self.out_stream is None:
            return b""
        try:
            if hasattr(self.out_stream, "readexactly"):
                return await self.out_stream.readexactly(n)
            elif hasattr(self.out_stream, "read"):
                loop = asyncio.get_running_loop()
                return await loop.run_in_executor(None, self.out_stream.read, n)
        except Exception as e:
            logger.debug(f"Read bytes notice: {e}")
        return b""

    async def recv(self):
        if self.out_stream is not None:
            try:
                if not self.ivf_header_read:
                    hdr32 = await self._read_bytes(32)
                    if len(hdr32) == 32:
                        self.ivf_header_read = True

                if self.ivf_header_read:
                    hdr12 = await self._read_bytes(12)
                    if len(hdr12) == 12:
                        frame_size, pts = struct.unpack("<IQ", hdr12)
                        frame_bytes = await self._read_bytes(frame_size)
                        if len(frame_bytes) == frame_size:
                            packet = av.Packet(frame_bytes)
                            packet.pts = pts
                            packet.time_base = Fraction(1, 1000)
                            decoded_frames = self.codec.decode(packet)
                            if decoded_frames:
                                return decoded_frames[0]
            except Exception as e:
                logger.debug(f"Frame decode notice: {e}")

        # Fallback frame
        pts = self._timestamp
        time_base = Fraction(1, 30)
        self._timestamp += 1
        await asyncio.sleep(1 / 30)

        frame = av.VideoFrame(640, 480, "yuv420p")
        for plane in frame.planes:
            plane.update(b"\x80" * len(memoryview(plane)))
        frame.pts = pts
        frame.time_base = time_base
        return frame


class SyntheticVideoTrack(FFmpegVideoTrack):
    pass

def set_active_media_stream(stream):
    global active_stream, active_track
    active_stream = stream
    active_track = FFmpegVideoTrack(stream)

def set_active_media_track(track):
    global active_track
    active_track = track




async def handle_options(request):
    return web.Response(
        status=204,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        }
    )

async def handle_whep_offer(request):
    if request.method == "OPTIONS":
        return await handle_options(request)

    sdp_offer = await request.text()
    if not sdp_offer:
        return web.Response(status=400, text="Empty SDP offer")

    offer = RTCSessionDescription(sdp=sdp_offer, type="offer")

    pc = RTCPeerConnection()
    pcs.add(pc)

    @pc.on("iceconnectionstatechange")
    async def on_ice_change():
        if pc.iceConnectionState in ["failed", "closed"]:
            await pc.close()
            pcs.discard(pc)

    # Add video track
    video_track = active_track or SyntheticVideoTrack()
    pc.addTrack(video_track)

    await pc.setRemoteDescription(offer)
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    return web.Response(
        status=201,
        content_type="application/sdp",
        text=pc.localDescription.sdp,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Location": "/whep/session",
        }
    )

def set_active_media_track(track):
    global active_track
    active_track = track

def is_allowed_origin(origin: str) -> bool:
    if not origin or origin == "*":
        return True
    o = origin.lower()
    if o.startswith("http://localhost:") or o.startswith("http://127.0.0.1:"):
        return True
    if o.endswith(".vercel.app") or o == "https://vercel.app":
        return True
    if o.endswith(".discordsays.com"):
        return True
    return False

@web.middleware
async def cors_middleware(request, handler):
    if request.method == "OPTIONS":
        return web.Response(
            status=204,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, DELETE",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Expose-Headers": "*",
                "Access-Control-Allow-Private-Network": "true",
            }
        )

    try:
        response = await handler(request)
    except web.HTTPException as ex:
        response = ex
    except Exception as ex:
        response = web.Response(status=500, text=str(ex))

    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS, PUT, DELETE"
    response.headers["Access-Control-Allow-Headers"] = "*"
    response.headers["Access-Control-Expose-Headers"] = "*"
    response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


import socket

def encontrar_porta_livre(porta_desejada: int = 3001) -> int:
    """Procura uma porta TCP livre a partir de porta_desejada."""
    for p in range(porta_desejada, porta_desejada + 30):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('127.0.0.1', p))
                return p
            except OSError:
                continue
    return porta_desejada

async def iniciar_servidor_whep(porta_desejada: int = 3001) -> tuple[web.AppRunner, int]:
    """Inicia o servidor WebRTC WHEP HTTP na primeira porta livre disponível."""
    app = web.Application(middlewares=[cors_middleware])
    app.router.add_options("/{path:.*}", handle_options)
    app.router.add_post("/whep", handle_whep_offer)
    app.router.add_post("/", handle_whep_offer)
    app.router.add_get("/", lambda req: web.Response(text="WebRTC WHEP Server Active", content_type="text/plain"))

    runner = web.AppRunner(app)
    await runner.setup()

    porta_livre = encontrar_porta_livre(porta_desejada)
    for p in range(porta_livre, porta_livre + 10):
        try:
            site = web.TCPSite(runner, "0.0.0.0", p)
            await site.start()
            print(f"  [WebRTC WHEP Server] Servidor WHEP ativo na porta {p}")
            return runner, p
        except OSError:
            continue

    site = web.TCPSite(runner, "0.0.0.0", 0)
    await site.start()
    bound_port = site._server.sockets[0].getsockname()[1]
    print(f"  [WebRTC WHEP Server] Servidor WHEP ativo na porta dinâmica {bound_port}")
    return runner, bound_port



