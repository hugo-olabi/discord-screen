#!/usr/bin/env python3
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request

TRYCLOUDFLARE_REGEX = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")

def get_cloudflared_path() -> str:
    """Finds binary path for cloudflared in local cache or system PATH."""
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cache_path = os.path.join(root_dir, ".cache", "cloudflared")
    if os.path.exists(cache_path) and os.access(cache_path, os.X_OK):
        return cache_path

    system_path = shutil.which("cloudflared")
    if system_path:
        return system_path

    return "cloudflared"

def wait_for_tunnel_dns(url: str, max_retries: int = 15) -> bool:
    """Verifies that the trycloudflare.com URL is active and resolving."""
    sys.stdout.write("  [Cloudflared] Verifying Cloudflare Edge connectivity...")
    sys.stdout.flush()
    domain = url.replace("https://", "").replace("http://", "").split("/")[0]
    health_url = f"{url}/health"

    for _ in range(max_retries):
        try:
            req = urllib.request.Request(health_url, headers={"User-Agent": "Mozilla/5.0"}, method="GET")
            with urllib.request.urlopen(req, timeout=2) as resp:
                if resp.status == 200:
                    print(" OK! (DNS Connectivity 100% OK)")
                    return True
        except Exception:
            pass

        try:
            doh_url = f"https://1.1.1.1/dns-query?name={domain}"
            req_doh = urllib.request.Request(doh_url, headers={"Accept": "application/dns-json"}, method="GET")
            with urllib.request.urlopen(req_doh, timeout=2) as resp_doh:
                data = json.loads(resp_doh.read().decode('utf-8'))
                if data.get("Status") == 0 and data.get("Answer"):
                    print(" OK! (Registered on Cloudflare Edge via 1.1.1.1 DoH)")
                    return True
        except Exception:
            pass

        sys.stdout.write(".")
        sys.stdout.flush()
        time.sleep(0.5)

    print(" (Warning: Local DNS resolution slow; proceeding with fallback)")
    return False

def start_cloudflared_tunnel(port: int = 3001) -> tuple[subprocess.Popen | None, str | None]:
    """Launches an ephemeral trycloudflare.com tunnel forwarding to local WebSocket port."""
    bin_path = get_cloudflared_path()
    cmd = [bin_path, "tunnel", "--no-autoupdate", "--protocol", "http2", "--url", f"http://127.0.0.1:{port}"]

    try:
        print(f"  [Cloudflared] Starting Cloudflare tunnel for port {port}...")
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
    except Exception as e:
        print(f"  [Cloudflared] Unable to launch cloudflared: {e}")
        return None, None

    url_found = None
    registered = False
    for line in iter(proc.stdout.readline, ''):
        match = TRYCLOUDFLARE_REGEX.search(line)
        if match and not url_found:
            url_found = match.group(0)
            print(f"  [Cloudflared] Detected tunnel URL: {url_found}.")

        if "Registered tunnel connection" in line or "Registered tunnel" in line:
            registered = True
            print("  [Cloudflared] Registered Cloudflare Edge connection successfully!")

        if url_found and registered:
            wait_for_tunnel_dns(url_found)
            break

    if url_found:
        ws_url = url_found.replace("https://", "wss://") + "/ws"
        return proc, ws_url

    return proc, None

# Backward compatibility aliases
obter_caminho_cloudflared = get_cloudflared_path
aguardar_dns_tunel_pronto = wait_for_tunnel_dns
iniciar_tunel_cloudflared = start_cloudflared_tunnel
