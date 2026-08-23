import json
import re
import subprocess
import sys

def list_windows() -> list[dict]:
    """
    Lists active window titles and IDs on the OS (Linux xprop, Windows PowerShell).
    """
    windows = []
    platform = sys.platform

    if platform.startswith('linux'):
        try:
            raw = subprocess.check_output('xprop -root _NET_CLIENT_LIST', shell=True, text=True, stderr=subprocess.DEVNULL)
            matches = re.findall(r'0x[0-9a-fA-F]+', raw)

            for window_id in matches:
                try:
                    info = subprocess.check_output(f'xprop -id {window_id} _NET_WM_NAME WM_NAME', shell=True, text=True, stderr=subprocess.DEVNULL)
                    name_match = re.search(r'["\'](.*?)["\']', info)
                    if name_match and name_match.group(1).strip():
                        title = name_match.group(1).strip()
                        is_discord = bool(re.search(r'discord', title, re.IGNORECASE))
                        windows.append({"id": window_id, "title": title, "isDiscord": is_discord})
                except Exception:
                    pass
        except Exception:
            pass

    elif platform.startswith('win32'):
        try:
            ps_script = "Get-Process | Where-Object {$_.MainWindowTitle} | Select-Object Id, MainWindowTitle | ConvertTo-Json"
            raw = subprocess.check_output(f'powershell -NoProfile -Command "{ps_script}"', shell=True, text=True, stderr=subprocess.DEVNULL)
            parsed = json.loads(raw)
            items = parsed if isinstance(parsed, list) else [parsed]
            for item in items:
                if item and item.get("MainWindowTitle"):
                    title = item["MainWindowTitle"].strip()
                    is_discord = bool(re.search(r'discord', title, re.IGNORECASE))
                    windows.append({"id": f"title={title}", "title": title, "isDiscord": is_discord})
        except Exception:
            pass

    return windows

# Backward compatibility alias
listar_janelas = list_windows
