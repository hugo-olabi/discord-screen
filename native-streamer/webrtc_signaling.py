#!/usr/bin/env python3
import asyncio
import json
import logging
import urllib.request
import urllib.parse
from aiortc import RTCPeerConnection, RTCSessionDescription
from whep_server import SyntheticVideoTrack

logger = logging.getLogger("webrtc_signaling")
pcs = set()

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

    video_track = SyntheticVideoTrack()
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
