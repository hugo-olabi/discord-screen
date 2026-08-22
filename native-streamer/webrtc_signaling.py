#!/usr/bin/env python3
import asyncio
import json
import logging
import urllib.request
import urllib.parse
import struct
from fractions import Fraction
import av
from aiortc import RTCPeerConnection, RTCSessionDescription, MediaStreamTrack

logger = logging.getLogger("webrtc_signaling")
pcs = set()
active_video_stream = None

def set_active_video_stream(stream):
    global active_video_stream
    active_video_stream = stream

class FFmpegVideoTrack(MediaStreamTrack):
    kind = "video"

    def __init__(self, out_stream=None):
        super().__init__()
        self.out_stream = out_stream or active_video_stream
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

async def processar_sdp_offer_nativo(sdp_offer_text: str) -> str:
    """Gera o SDP Answer usando aiortc a partir de um SDP Offer recebido."""
    offer = RTCSessionDescription(sdp=sdp_offer_text, type="offer")
    pc = RTCPeerConnection()
    pcs.add(pc)

    @pc.on("iceconnectionstatechange")
    async def on_ice_change():
        if pc.iceConnectionState in ["failed", "closed"]:
            await pc.close()
            pcs.discard(pc)

    video_track = FFmpegVideoTrack()
    pc.addTrack(video_track)


    await pc.setRemoteDescription(offer)
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    return pc.localDescription.sdp

async def iniciar_loop_signaling_supabase(supabase_url: str, anon_key: str, room_id: str):
    """Loop contínuo que monitora sdp_offer na tabela rooms e responde com sdp_answer via Supabase."""
    print(f"  [WebRTC Supabase] Ouvindo propostas SDP para sala: {room_id}")
    url = f"{supabase_url.rstrip('/')}/rest/v1/rooms?id=eq.{room_id}"
    headers = {
        "apikey": anon_key,
        "Authorization": f"Bearer {anon_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }

    ultimo_offer_processado = None

    while True:
        try:
            req = urllib.request.Request(url, headers={"apikey": anon_key, "Authorization": f"Bearer {anon_key}"})
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                if data and len(data) > 0:
                    room = data[0]
                    sdp_offer = room.get("sdp_offer")
                    sdp_answer = room.get("sdp_answer")

                    if sdp_offer and sdp_offer != ultimo_offer_processado and not sdp_answer:
                        print("  [WebRTC Supabase] Novo SDP Offer recebido! Processando WebRTC...")
                        ultimo_offer_processado = sdp_offer
                        answer_sdp = await processar_sdp_offer_nativo(sdp_offer)

                        # Publica resposta SDP Answer no Supabase
                        update_payload = json.dumps({"sdp_answer": answer_sdp, "status": "live"}).encode("utf-8")
                        patch_req = urllib.request.Request(
                            f"{supabase_url.rstrip('/')}/rest/v1/rooms?id=eq.{room_id}",
                            data=update_payload,
                            headers=headers,
                            method="PATCH"
                        )
                        with urllib.request.urlopen(patch_req, timeout=5) as patch_resp:
                            print("  [WebRTC Supabase] SDP Answer publicado com sucesso! Transmissão WebRTC ativa.")
        except Exception as e:
            logger.debug(f"Erro no loop de signaling Supabase: {e}")
        await asyncio.sleep(1)
