#!/usr/bin/env python3
import json
import os
import urllib.request
import urllib.error

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://kujdoibdrqzfpnekasod.supabase.co")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", os.getenv("VITE_SUPABASE_ANON_KEY", ""))

def atualizar_url_tunel_supabase(token_id: str, tunnel_url: str, status: str = "live") -> bool:
    """
    Atualiza a tabela 'rooms' no Supabase com o URL do túnel UDP e status 'live'.
    """
    if not token_id:
        print("  [Supabase] Token da sala não fornecido.")
        return False

    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/rooms?id=eq.{token_id}"
    headers = {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Prefer": "return=minimal"
    }

    payload = {
        "tunnel_url": tunnel_url,
        "status": status,
        "updated_at": "now()"
    }

    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=headers, method="PATCH")
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status in (200, 204):
                print(f"  [Supabase] URL do túnel publicado com sucesso no Supabase! ({tunnel_url})")
                return True
    except urllib.error.HTTPError as e:
        print(f"  [Supabase] Erro HTTP ao atualizar sala ({e.code}): {e.reason}")
    except Exception as e:
        print(f"  [Supabase] Falha ao comunicar com Supabase: {e}")

    return False
