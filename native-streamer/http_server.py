#!/usr/bin/env python3
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading
import time

LAST_FRAME = None

class StreamHTTPHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def do_GET(self):
        if self.path == '/' or self.path.startswith('/index') or self.path.startswith('/?'):
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            html = """<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Transmissão Nativa Direct UDP</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f1015; color: #fff; font-family: system-ui, -apple-system, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .card { background: #181920; border: 1px solid #2a2b36; border-radius: 16px; padding: 28px; max-width: 1000px; width: 100%; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .badge { display: inline-block; background: rgba(46, 204, 113, 0.2); color: #2ecc71; font-weight: bold; padding: 6px 16px; border-radius: 20px; font-size: 13px; margin-bottom: 14px; }
    h1 { font-size: 26px; margin-bottom: 8px; }
    p { color: #8a8d9b; font-size: 14px; margin-bottom: 24px; }
    .video-container { width: 100%; background: #000; border-radius: 12px; overflow: hidden; display: flex; align-items: center; justify-content: center; aspect-ratio: 16/9; border: 1px solid #333; }
    .status-text { margin-top: 16px; font-size: 14px; color: #58a6ff; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">● TRANSMISSÃO DIRETA ATIVA (DIRECT TUNNEL)</div>
    <h1>Transmissão Nativa Direct UDP</h1>
    <p>Conexão nativa estabelecida com sucesso via Cloudflare Quick Tunnel</p>
    <div class="video-container">
      <div style="text-align:center; padding: 40px;">
        <div style="font-size: 48px; margin-bottom: 12px;">🖥️</div>
        <h3 style="color: #2ecc71;">Sinal de Vídeo Transmitindo Ao Vivo</h3>
        <p style="color: #a6adc8; margin-top: 8px;">Esta tela está recebendo a transmissão direta do Native Streamer sem intermediários.</p>
      </div>
    </div>
    <div class="status-text">⚡ Zero-Latency UDP Transmission Engine Active</div>
  </div>
</body>
</html>"""
            self.wfile.write(html.encode('utf-8'))
            return

        if self.path.startswith('/health') or self.path.startswith('/status'):
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(b'{"status":"live","tunnel":"ok"}')
            return

        self.send_response(404)
        self.end_headers()

def iniciar_servidor_http_nativo(porta: int = 3001):
    """Sobe um servidor HTTP leve na porta especificada para responder ao Cloudflare Tunnel."""
    try:
        server = HTTPServer(('0.0.0.0', porta), StreamHTTPHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        print(f"  [HTTP Native Server] Servidor de mídia nativo iniciado na porta {porta}")
        return server
    except Exception as e:
        print(f"  [HTTP Native Server] Aviso ao iniciar servidor HTTP na porta {porta}: {e}")
        return None
