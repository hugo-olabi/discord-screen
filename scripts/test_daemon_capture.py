#!/usr/bin/env python3
import asyncio
import os
import sys
import struct
import traceback

STREAMER_DIR = os.path.abspath("native-streamer")
if STREAMER_DIR not in sys.path:
    sys.path.insert(0, STREAMER_DIR)

from portal_daemon import obter_sessao_do_daemon
from ffmpeg import iniciar_processo_captura
from ws_client import demux_ivf_header

async def test_live_pipewire():
    print("\n============================================================")
    print("      📺 TESTANDO CAPTURA AO VIVO VIA PORTAL DAEMON       ")
    print("============================================================\n")

    node, fd = obter_sessao_do_daemon()
    if not node:
        print("❌ Portal Daemon não encontrado. Ligue o daemon primeiro com: npm run portal-daemon")
        return False

    print(f"⚡ Conectado ao Portal Daemon: Node #{node} (FD #{fd})")
    print("  Iniciando GStreamer + FFmpeg em background por 5 segundos...\n")

    cp, out_stream, err_stream = await iniciar_processo_captura(pipewire_node=node, pipewire_fd=fd, fps=30)

    try:
        hdr = await asyncio.wait_for(out_stream.readexactly(32), timeout=8.0)
        config = demux_ivf_header(hdr)
        print(f"  ✅ Cabeçalho IVF Recebido! Codec: {config.get('codec')} ({config.get('codedWidth')}x{config.get('codedHeight')} @ {config.get('fps')} FPS)")

        frames_lidos = 0
        for i in range(15):
            f_hdr = await asyncio.wait_for(out_stream.readexactly(12), timeout=3.0)
            sz, ts = struct.unpack('<IQ', f_hdr)
            f_data = await asyncio.wait_for(out_stream.readexactly(sz), timeout=3.0)
            is_kf = (f_data[0] & 0x04) == 0 if len(f_data) > 0 else False
            kf_str = "🔑 KEYFRAME" if is_kf else "DELTA"
            print(f"  ✅ Quadro #{i+1:02d}: tamanho={sz:6d} bytes | tipo={kf_str} | timestamp={ts}")
            frames_lidos += 1

        print(f"\n✅ SUCESSO TOTAL! {frames_lidos} quadros reais de vídeo capturados do PipeWire sem popups!\n")
        return True

    except Exception as e:
        print(f"\n❌ Erro durante o teste: {e} ({type(e).__name__})")
        traceback.print_exc()
        if cp:
            err_msg = await cp.get_combined_stderr()
            if err_msg:
                print(f"\n[Logs dos Encoders]:\n{err_msg}\n")
        return False

    finally:
        if cp: cp.terminate()

if __name__ == "__main__":
    asyncio.run(test_live_pipewire())
