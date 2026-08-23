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




# ...



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
            print(f"Interface GTK4 nao pode ser carregada: {e}. Alternando para CLI...")

    print("\n============================================================")
    print("           TRANSMISSOR NATIVO DISCORD-SCREEN (PYTHON)      ")
    print("============================================================\n")

    if not token_input:
        token_input = input("  Cole o Link da aba de compartilhamento ou Token: ").strip()

    if not token_input:
        print("  ERRO: Token de transmissão não informado.")
        sys.exit(1)

    token = token_input
    if "t=" in token_input:
        from urllib.parse import urlparse, parse_qs
        parsed = urlparse(token_input)
        server_url = f"{parsed.scheme}://{parsed.netloc}"
        token = parse_qs(parsed.query).get("t", [token_input])[0]

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
            print(f"  PipeWire Node #{pipewire_node} (FD {pipewire_fd}) obtido via XDG Desktop Portal! (Tipo: {'Screen' if is_screen else 'Window'})")
        else:
            janelas = listar_janelas()
            if janelas:
                print("\n  Escolha a fonte de captura:")
                print("    1) Tela Inteira (Monitor Principal)")
                for idx, j in enumerate(janelas):
                    aviso = " [Aviso: Pode gerar espelho]" if j["isDiscord"] else ""
                    print(f"    {idx + 2}) {j['title']}{aviso}")
                choice = input(f"  Selecione [1-{len(janelas)+1}] (Padrao 1): ").strip()
                if choice.isdigit() and 1 < int(choice) <= len(janelas) + 1:
                    selected_window = janelas[int(choice) - 2]["id"]
                    selected_name = janelas[int(choice) - 2]["title"]
                    is_screen = False
                else:
                    is_screen = True
    else:
        print("  Modo de Teste Acelerado: Gerando transmissao sintetica de Ruido Branco (White Noise)...")

    audio_source = "system"
    for arg in args:
        if arg.startswith("--audio-source="):
            audio_source = arg.replace("--audio-source=", "").lower()
        elif arg == "--no-audio":
            audio_source = "none"

    if not any(arg.startswith("--profile=") for arg in args):
        print("\n  Escolha o perfil de qualidade:")
        print("    1) Cinema 1080p (60fps, 12 Mbps - Padrão Desktop)")
        print("    2) Mobile 720p (30fps, 4 Mbps - Otimizado para Android)")
        print("    3) Balanced 720p (30fps, 8 Mbps)")
        print("    4) Fast 480p (30fps, 4 Mbps)")
        p_choice = input("  Selecione o perfil [1-4] (Padrão 1): ").strip()
        if p_choice == "2": profile = "mobile"
        elif p_choice == "3": profile = "balanced"
        elif p_choice == "4": profile = "fast"

    print(f"\n  Servidor: {server_url}")
    print(f"  Perfil de Qualidade: {profile.upper()} (Zero-Latency / Static Deduplication)")
    print(f"  Captura de Áudio: {audio_source.upper()}\n")

    async def run():
        cap_res = await iniciar_processo_captura(
            pipewire_node=pipewire_node, pipewire_fd=pipewire_fd, fps=fps or 60, bitrate=bitrate or "12000k", window_id=selected_window, use_noise=use_noise, profile=profile
        )
        if isinstance(cap_res, tuple) and len(cap_res) >= 2:
            cp, out_stream = cap_res[0], cap_res[1]
        else:
            print("  ❌ Erro ao iniciar processo de captura de vídeo.")
            return

        audio_proc = None
        if audio_source != "none" and not use_noise:
            try:
                audio_proc = await iniciar_processo_captura_audio(
                    audio_source=audio_source, source_name=selected_name, is_screen=is_screen
                )
            except Exception as ea:
                print(f"  ⚠️ Não foi possível iniciar áudio ({audio_source}): {ea}")

        from ws_server import iniciar_servidor_ws, streamer_video_loop, streamer_audio_loop
        from cloudflared_tunnel import iniciar_tunel_cloudflared
        from supabase_client import atualizar_url_tunel_supabase, SUPABASE_URL, SUPABASE_ANON_KEY

        ws_runner, porta_real = await iniciar_servidor_ws(3001)
        video_task = asyncio.create_task(streamer_video_loop(out_stream))
        audio_task = asyncio.create_task(streamer_audio_loop(audio_proc.stdout)) if (audio_proc and audio_proc.stdout) else None

        cf_proc, cf_url = iniciar_tunel_cloudflared(porta_real)
        tunnel_public_url = cf_url if cf_url else f"ws://127.0.0.1:{porta_real}/ws"

        print(f"  [Transmissão] Túnel WebSocket ativado: {tunnel_public_url}")
        print("  [Supabase] Registrando sala como live no Supabase...")
        atualizar_url_tunel_supabase(token, tunnel_public_url, status="live")

        print("  ✅ Transmissão nativa conectada via WebCodecs + WebSocket! Pressione Ctrl+C para encerrar.\n")
        try:
            while True:
                await asyncio.sleep(2)
                if cf_proc and cf_proc.poll() is not None:
                    print("\n  ⚠️ [Cloudflared] O túnel foi encerrado inesperadamente. Reinicializando túnel...")
                    cf_proc, cf_url = iniciar_tunel_cloudflared(porta_real)
                    if cf_url:
                        tunnel_public_url = cf_url
                        print(f"  [Transmissão] Novo túnel WebSocket ativado: {tunnel_public_url}")
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
        print("\n  Transmissão encerrada.")

if __name__ == "__main__":
    main()

