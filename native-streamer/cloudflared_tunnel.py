#!/usr/bin/env python3
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request

TRYCLOUDFLARE_REGEX = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")

def obter_caminho_cloudflared() -> str:
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    no_cache = os.path.join(raiz, ".cache", "cloudflared")
    if os.path.exists(no_cache) and os.access(no_cache, os.X_OK):
        return no_cache

    no_path = shutil.which("cloudflared")
    if no_path:
        return no_path

    return "cloudflared"

def aguardar_dns_tunel_pronto(url: str, max_tentativas: int = 15) -> bool:
    sys.stdout.write("  [Cloudflared] Aguardando propagação DNS global...")
    sys.stdout.flush()
    for _ in range(max_tentativas):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}, method="GET")
            with urllib.request.urlopen(req, timeout=3) as resp:
                if resp.status < 500:
                    print(" OK!")
                    return True
        except Exception:
            sys.stdout.write(".")
            sys.stdout.flush()
            time.sleep(1)
    print(" (continuando em segundo plano)")
    return False

def iniciar_tunel_cloudflared(porta: int = 3001) -> tuple[subprocess.Popen | None, str | None]:
    bin_path = obter_caminho_cloudflared()
    cmd = [bin_path, "tunnel", "--no-autoupdate", "--url", f"http://127.0.0.1:{porta}"]

    try:
        print(f"  [Cloudflared] Inicializando túnel Cloudflare para porta {porta}...")
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
    for linha in iter(proc.stdout.readline, ''):
        match = TRYCLOUDFLARE_REGEX.search(linha)
        if match:
            url_encontrada = match.group(0)
            print(f"  [Cloudflared] Túnel detectado: {url_encontrada}.")
            aguardar_dns_tunel_pronto(url_encontrada)
            break

    if url_encontrada:
        ws_url = url_encontrada.replace("https://", "wss://") + "/ws"
        return proc, ws_url

    return proc, None

iniciar_tunnel_cloudflared = iniciar_tunel_cloudflared
