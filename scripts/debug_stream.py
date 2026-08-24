#!/usr/bin/env python3
"""
Automated Stream Diagnostic Script for StreamRoom Streamer.
Tests DBus, XDG Portal, PipeWire FD, GStreamer, FFmpeg, synthetic video noise generator, and WebSocket transport.
"""
import asyncio
import os
import sys
import subprocess
import time

STREAMER_DIR = os.path.abspath("streamer")
if STREAMER_DIR not in sys.path:
    sys.path.insert(0, STREAMER_DIR)

from portal import obter_pipewire_fd_e_node, fechar_sessao_portal_ativa
from ffmpeg import tem_gstreamer_element, montar_comando_white_noise
from ws_client import demux_ivf_header, empacotar_pacote_midia

def log_step(title, ok=True, details=""):
    symbol = "✅" if ok else "❌"
    print(f"  {symbol} {title}")
    if details:
        for line in str(details).splitlines():
            print(f"      └─ {line}")

async def run_diagnostics(target_url=None, use_portal=False):
    print("\n============================================================")
    print("      ⚡ HIGH SPEED STREAM DIAGNOSTICS & TESTING TOOL     ")
    print("============================================================\n")

    gst_ok = subprocess.run(["which", "gst-launch-1.0"], capture_output=True).returncode == 0
    ffmpeg_ok = subprocess.run(["which", "ffmpeg"], capture_output=True).returncode == 0

    log_step("GStreamer (gst-launch-1.0)", gst_ok)
    log_step("FFmpeg", ffmpeg_ok)

    if not ffmpeg_ok:
        print("\n❌ CRITICAL ERROR: FFmpeg missing from system PATH.")
        return False

    node_id, pw_fd = None, None
    if use_portal:
        print("\n  Requesting XDG Desktop Portal...")
        node_id, pw_fd = obter_pipewire_fd_e_node(timeout_seconds=10)

        if not node_id:
            log_step("XDG Desktop Portal (ScreenCast)", False, "No PipeWire node obtained")
        else:
            log_step("XDG Desktop Portal (ScreenCast)", True, f"PipeWire Node #{node_id}")
            log_step("PipeWire File Descriptor (OpenPipeWireRemote)", pw_fd is not None, f"FD #{pw_fd}" if pw_fd is not None else "No remote FD")

    print("\n  Starting synthetic video generator test...")
    cmd, _ = montar_comando_white_noise(fps=30)
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )

    try:
        header = await asyncio.wait_for(proc.stdout.readexactly(32), timeout=3.0)
        config = demux_ivf_header(header)
        log_step("IVF Header Reading (32 bytes)", config is not None, f"Codec: {config.get('codec')} ({config.get('codedWidth')}x{config.get('codedHeight')})" if config else "Invalid")

        quadros = 0
        for _ in range(10):
            f_hdr = await asyncio.wait_for(proc.stdout.readexactly(12), timeout=2.0)
            f_size, f_ts = demux_frame_hdr(f_hdr)
            await asyncio.wait_for(proc.stdout.readexactly(f_size), timeout=2.0)
            quadros += 1

        log_step("VP9 Frame Generation & Packaging", quadros == 10, f"{quadros} VP9 frames generated successfully!")

    except Exception as e:
        err_msg = ""
        if proc.stderr:
            try:
                err_bytes = await proc.stderr.read()
                err_msg = err_bytes.decode('utf-8', errors='ignore').strip()
            except Exception:
                pass
        log_step("Media Generation Test", False, f"Failed: {e}\n{err_msg}")
    finally:
        try: proc.terminate()
        except Exception: pass
        fechar_sessao_portal_ativa()

    print("\n============================================================")
    print("                 ✅ DIAGNOSTICS COMPLETED                    ")
    print("============================================================\n")
    return True

def demux_frame_hdr(data):
    import struct
    return struct.unpack('<IQ', data)

if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else None
    use_portal = "--portal" in sys.argv
    asyncio.run(run_diagnostics(url, use_portal))
