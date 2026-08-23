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
    sys.stdout.write("  [Cloudflared] Verificando conectividade Edge Cloudflare...")
    sys.stdout.flush()
    domain = url.replace("https://", "").replace("http://", "").split("/")[0]
    health_url = f"{url}/health"

    for _ in range(max_tentativas):
        try:
            req = urllib.request.Request(health_url, headers={"User-Agent": "Mozilla/5.0"}, method="GET")
            with urllib.request.urlopen(req, timeout=2) as resp:
                if resp.status == 200:
                    print(" OK! (Conectividade DNS 100% OK)")
                    return True
        except Exception:
            pass

        try:
            doh_url = f"https://1.1.1.1/dns-query?name={domain}"
            req_doh = urllib.request.Request(doh_url, headers={"Accept": "application/dns-json"}, method="GET")
            with urllib.request.urlopen(req_doh, timeout=2) as resp_doh:
                data = json.loads(resp_doh.read().decode('utf-8'))
                if data.get("Status") == 0 and data.get("Answer"):
                    print(" OK! (Registrado na Edge Cloudflare via 1.1.1.1 DoH)")
                    return True
        except Exception:
            pass

        sys.stdout.write(".")
        sys.stdout.flush()
        time.sleep(0.5)

    print(" (Aviso: DNS local lento; utilizando fallback 1.1.1.1/Local)")
    return False

def iniciar_tunel_cloudflared(porta: int = 3001) -> tuple[subprocess.Popen | None, str | None]:
    bin_path = obter_caminho_cloudflared()
    cmd = [bin_path, "tunnel", "--no-autoupdate", "--protocol", "http2", "--url", f"http://127.0.0.1:{porta}"]

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
    registered = False
    for linha in iter(proc.stdout.readline, ''):
        match = TRYCLOUDFLARE_REGEX.search(linha)
        if match and not url_encontrada:
            url_encontrada = match.group(0)
            print(f"  [Cloudflared] Túnel detectado: {url_encontrada}.")

        if "Registered tunnel connection" in linha or "Registered tunnel" in linha:
            registered = True
            print("  [Cloudflared] Conexão com Edge Cloudflare registrada com sucesso!")

        if url_encontrada and registered:
            aguardar_dns_tunel_pronto(url_encontrada)
            break

    if url_encontrada:
        ws_url = url_encontrada.replace("https://", "wss://") + "/ws"
        return proc, ws_url

    return proc, None

iniciar_tunnel_cloudflared = iniciar_tunel_cloudflared
