#!/usr/bin/env python3
import os
import re
import shutil
import subprocess
import sys

TRYCLOUDFLARE_REGEX = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")

def obter_caminho_cloudflared() -> str:
    """Retorna o caminho do binário cloudflared no cache ou no sistema."""
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    no_cache = os.path.join(raiz, ".cache", "cloudflared")
    if os.path.exists(no_cache) and os.access(no_cache, os.X_OK):
        return no_cache

    no_path = shutil.which("cloudflared")
    if no_path:
        return no_path

    return "cloudflared"

def iniciar_tunel_cloudflared(porta: int = 3001) -> tuple[subprocess.Popen | None, str | None]:
    """
    Sobe um quick tunnel com cloudflared exclusivamente para o native-streamer
    e retorna (processo, tunnel_url).
    """
    bin_path = obter_caminho_cloudflared()
    cmd = [bin_path, "tunnel", "--no-autoupdate", "--url", f"http://localhost:{porta}"]

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
    except Exception as e:
        print(f"  [Cloudflared] Não foi possível executar o cloudflared: {e}")
        return None, None

    url_encontrada = None
    print("  [Cloudflared] Gerando túnel rápido Cloudflare para transmissão...")

    for linha in iter(proc.stdout.readline, ''):
        match = TRYCLOUDFLARE_REGEX.search(linha)
        if match:
            url_encontrada = match.group(0)
            print(f"  [Cloudflared] Túnel ativado com sucesso: {url_encontrada}")
            break

    return proc, url_encontrada

iniciar_tunnel_cloudflared = iniciar_tunel_cloudflared

