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
active_track = None

class SyntheticVideoTrack(MediaStreamTrack):
    kind = "video"

    def __init__(self):
        super().__init__()
        self._timestamp = 0

    async def recv(self):
        pts = self._timestamp
        time_base = Fraction(1, 30)
        self._timestamp += 1
        await asyncio.sleep(1 / 30)

        # Create 640x480 test frame
        frame = av.VideoFrame(640, 480, "yuv420p")
        for plane in frame.planes:
            plane.update(b"\x80" * len(plane))
        frame.pts = pts
        frame.time_base = time_base
        return frame


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
    origin = request.headers.get("Origin", "*")
    allowed_origin = origin if is_allowed_origin(origin) else "*"

    if request.method == "OPTIONS":
        return web.Response(
            status=204,
            headers={
                "Access-Control-Allow-Origin": allowed_origin,
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, DELETE",
                "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, X-Requested-With",
                "Access-Control-Expose-Headers": "Location, Content-Type",
                "Access-Control-Allow-Private-Network": "true",
            }
        )

    try:
        response = await handler(request)
    except web.HTTPException as ex:
        response = ex
    except Exception as ex:
        response = web.Response(status=500, text=str(ex))

    response.headers["Access-Control-Allow-Origin"] = allowed_origin
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS, PUT, DELETE"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, Accept, X-Requested-With"
    response.headers["Access-Control-Expose-Headers"] = "Location, Content-Type"
    response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response

async def iniciar_servidor_whep(porta: int = 3001):
    """Inicia o servidor WebRTC WHEP HTTP na porta especificada."""
    app = web.Application(middlewares=[cors_middleware])
    app.router.add_options("/{path:.*}", handle_options)
    app.router.add_post("/whep", handle_whep_offer)
    app.router.add_post("/", handle_whep_offer)
    app.router.add_get("/", lambda req: web.Response(text="WebRTC WHEP Server Active", content_type="text/plain"))

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", porta)
    await site.start()
    print(f"  [WebRTC WHEP Server] Servidor WHEP ativo na porta {porta}")
    return runner


