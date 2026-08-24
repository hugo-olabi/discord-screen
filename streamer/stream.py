#!/usr/bin/env python3
import asyncio
import os
import sys

STREAMER_DIR = os.path.dirname(os.path.abspath(__file__))
if STREAMER_DIR not in sys.path:
    sys.path.insert(0, STREAMER_DIR)

from janelas import listar_janelas
from portal import obter_pipewire_fd_e_node
from ffmpeg import iniciar_processo_captura, iniciar_processo_captura_audio
from supabase_client import atualizar_url_tunel_supabase


def main():
    args = sys.argv[1:]
    token_input = None
    server_url = os.getenv("PUBLIC_ORIGIN", "http://localhost:3001")
    fps = None
    bitrate = None
    profile = "cinema"
    use_noise = "--noise" in args
    stream_audio = "--audio" in args or not "--no-audio" in args
    use_cli = "--cli" in args or not os.getenv("DISPLAY")

    for arg in args:
        if arg.startswith("--server="):
            server_url = arg.replace("--server=", "")
        elif arg.startswith("--fps="):
            try: fps = int(arg.replace("--fps=", ""))
            except ValueError: pass
        elif arg.startswith("--bitrate="):
            bitrate = arg.replace("--bitrate=", "")
        elif arg.startswith("--profile="):
            profile = arg.replace("--profile=", "")
        elif arg.startswith("--token="):
            token_input = arg.replace("--token=", "")
        elif not arg.startswith("-") and not token_input:
            token_input = arg

    if not use_cli:
        try:
            from gui import iniciar_gui_gtk4
            iniciar_gui_gtk4(token=token_input)
            return
        except Exception as e:
            print(f"GTK4 interface could not be loaded: {e}. Switching to CLI mode...")

    print("\n============================================================")
    print("           STREAMROOM NATIVE STREAMER (PYTHON)             ")
    print("============================================================\n")

    if not token_input:
        token_input = input("  Paste the share tab link or Stream Token: ").strip()

    if not token_input:
        print("  ERROR: Stream Token was not specified.")
        sys.exit(1)

    from gui import extrair_token_da_url
    token = extrair_token_da_url(token_input)

    pipewire_node, pipewire_fd = None, None
    selected_window = None
    selected_name = None
    is_screen = True
    if not use_noise:
        res = obter_pipewire_fd_e_node()

        if isinstance(res, tuple):
            if len(res) >= 3:
                pipewire_node, pipewire_fd, is_screen = res[0], res[1], res[2]
            elif len(res) == 2:
                pipewire_node, pipewire_fd, is_screen = res[0], res[1], True
            else:
                pipewire_node, pipewire_fd, is_screen = None, None, True
        else:
            pipewire_node, pipewire_fd, is_screen = None, None, True

        if pipewire_node:
            print(f"  PipeWire Node #{pipewire_node} (FD {pipewire_fd}) obtained via XDG Desktop Portal! (Type: {'Screen' if is_screen else 'Window'})")
        else:
            janelas = listar_janelas()
            if janelas:
                print("\n  Select capture source:")
                print("    1) Entire Screen (Main Monitor)")
                for idx, j in enumerate(janelas):
                    aviso = " [Warning: May create mirror effect]" if j["isDiscord"] else ""
                    print(f"    {idx + 2}) {j['title']}{aviso}")
                choice = input(f"  Select [1-{len(janelas)+1}] (Default 1): ").strip()
                if choice.isdigit() and 1 < int(choice) <= len(janelas) + 1:
                    selected_window = janelas[int(choice) - 2]["id"]
                    selected_name = janelas[int(choice) - 2]["title"]
                    is_screen = False
                else:
                    is_screen = True
    else:
        print("  Accelerated Test Mode: Generating synthetic White Noise stream...")

    audio_source = "system"
    for arg in args:
        if arg.startswith("--audio-source="):
            audio_source = arg.replace("--audio-source=", "").lower()
        elif arg == "--no-audio":
            audio_source = "none"

    if not any(arg.startswith("--profile=") for arg in args):
        print("\n  Select quality profile:")
        print("    1) Cinema 1080p (60fps, 12 Mbps - Desktop Default)")
        print("    2) Mobile 720p (30fps, 4 Mbps - Android Optimized)")
        print("    3) Balanced 720p (30fps, 8 Mbps)")
        print("    4) Fast 480p (30fps, 4 Mbps)")
        p_choice = input("  Select profile [1-4] (Default 1): ").strip()
        if p_choice == "2": profile = "mobile"
        elif p_choice == "3": profile = "balanced"
        elif p_choice == "4": profile = "fast"

    print(f"\n  Server: {server_url}")
    print(f"  Quality Profile: {profile.upper()} (Zero-Latency / Static Deduplication)")
    print(f"  Audio Capture: {audio_source.upper()}\n")

    async def run():
        cap_res = await iniciar_processo_captura(
            pipewire_node=pipewire_node, pipewire_fd=pipewire_fd, fps=fps or 60, bitrate=bitrate or "12000k", window_id=selected_window, use_noise=use_noise, profile=profile
        )
        if isinstance(cap_res, tuple) and len(cap_res) >= 2:
            cp, out_stream = cap_res[0], cap_res[1]
        else:
            print("  ❌ Error starting video capture process.")
            return

        audio_proc = None
        if audio_source != "none" and not use_noise:
            try:
                audio_proc = await iniciar_processo_captura_audio(
                    audio_source=audio_source, source_name=selected_name, is_screen=is_screen
                )
            except Exception as ea:
                print(f"  ⚠️ Could not start audio capture ({audio_source}): {ea}")

        from ws_server import iniciar_servidor_ws, streamer_video_loop, streamer_audio_loop
        from cloudflared_tunnel import iniciar_tunel_cloudflared
        from supabase_client import atualizar_url_tunel_supabase

        ws_runner, porta_real = await iniciar_servidor_ws(3001)
        video_task = asyncio.create_task(streamer_video_loop(out_stream))
        audio_task = asyncio.create_task(streamer_audio_loop(audio_proc.stdout)) if (audio_proc and audio_proc.stdout) else None

        cf_proc, cf_url = iniciar_tunel_cloudflared(porta_real)
        tunnel_public_url = cf_url if cf_url else None

        if tunnel_public_url:
            print(f"  [Broadcast] WebSocket Tunnel activated: {tunnel_public_url}")
            print("  [Supabase] Registering room as live on Supabase...")
            atualizar_url_tunel_supabase(token, tunnel_public_url, status="live")
        else:
            print("  ⚠️ [Broadcast] Cloudflare tunnel unavailable. Automatic local fallback is disabled.")

        print("  ✅ Native broadcast connected via WebCodecs + WebSocket! Press Ctrl+C to terminate.\n")
        try:
            while True:
                await asyncio.sleep(2)
                if cf_proc and cf_proc.poll() is not None:
                    print("\n  ⚠️ [Cloudflared] Tunnel terminated unexpectedly. Restarting tunnel...")
                    cf_proc, cf_url = iniciar_tunel_cloudflared(porta_real)
                    if cf_url:
                        tunnel_public_url = cf_url
                        print(f"  [Broadcast] New WebSocket Tunnel activated: {tunnel_public_url}")
                        atualizar_url_tunel_supabase(token, tunnel_public_url, status="live")
        finally:
            video_task.cancel()
            if audio_task:
                audio_task.cancel()
            await ws_runner.cleanup()
            if audio_proc:
                try: audio_proc.terminate()
                except Exception: pass
            if cf_proc:
                try: cf_proc.terminate()
                except Exception: pass

    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        print("\n  Broadcast terminated.")

if __name__ == "__main__":
    main()
