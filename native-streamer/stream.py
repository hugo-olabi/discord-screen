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
from ws_client import iniciar_transmissao_websocket
from supabase_client import atualizar_url_tunel_supabase
from cloudflared_tunnel import iniciar_tunel_cloudflared
from whep_server import iniciar_servidor_whep



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
        if isinstance(res, tuple) and len(res) == 3:
            pipewire_node, pipewire_fd, is_screen = res
        else:
            pipewire_node, pipewire_fd = res
            is_screen = True

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

    print(f"\n  Servidor: {server_url}")
    print(f"  Perfil de Qualidade: {profile.upper()} (Zero-Latency / Static Deduplication)...\n")

    async def run():
        cp, out_stream, _ = await iniciar_processo_captura(
            pipewire_node=pipewire_node, pipewire_fd=pipewire_fd, fps=fps or 60, bitrate=bitrate or "12000k", window_id=selected_window, use_noise=use_noise, profile=profile
        )
        audio_proc = None
        if stream_audio and not use_noise:
            try:
                audio_proc = await iniciar_processo_captura_audio(source_name=selected_name, is_screen=is_screen)
            except Exception as ea:
                print(f"  [Audio] Erro ao iniciar captura de áudio: {ea}")

        whep_srv = iniciar_servidor_whep(3001)
        cf_proc, cf_url = iniciar_tunel_cloudflared(3001)
        tunnel_public_url = (cf_url.rstrip("/") + "/whep") if cf_url else server_url



        print(f"  [Transmissão] Túnel configurado: {tunnel_public_url}")
        print("  [Supabase] Registrando sala como live no Supabase...")
        atualizar_url_tunel_supabase(token, tunnel_public_url, status="live")
        print("  ✅ Transmissão nativa conectada e ao vivo no Supabase! Pressione Ctrl+C para encerrar.\n")

        try:
            await iniciar_transmissao_websocket(
                server_url, token, out_stream, proc_stderr=cp, audio_stream=audio_proc
            )
        finally:
            if cf_proc:
                try: cf_proc.terminate()
                except Exception: pass




    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        print("\n  Transmissão encerrada.")

if __name__ == "__main__":
    main()

