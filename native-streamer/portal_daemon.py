#!/usr/bin/env python3
"""
Serviço Persistente do XDG Desktop Portal (Portal Daemon).
Mantém a sessão do Portal e do PipeWire ativa com GLib MainLoop rodando em 1º plano,
e atende clientes de transmissão em segundo plano sem requerer popups repetidos.
"""
import array
import json
import os
import socket
import struct
import sys
import threading
import time

try:
    import gi
    gi.require_version('Gio', '2.0')
    gi.require_version('GLib', '2.0')
    from gi.repository import Gio, GLib
except ImportError:
    pass

STREAMER_DIR = os.path.dirname(os.path.abspath(__file__))
if STREAMER_DIR not in sys.path:
    sys.path.insert(0, STREAMER_DIR)

from portal import obter_pipewire_fd_e_node, fechar_sessao_portal_ativa

SOCKET_PATH = "/tmp/discord_screen_portal.sock"

def esta_daemon_rodando() -> bool:
    if not os.path.exists(SOCKET_PATH):
        return False
    try:
        c = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        c.settimeout(0.5)
        c.connect(SOCKET_PATH)
        c.close()
        return True
    except Exception:
        try: os.remove(SOCKET_PATH)
        except Exception: pass
        return False

def obter_sessao_do_daemon() -> tuple[str | None, int | None]:
    if not esta_daemon_rodando():
        return None, None

    try:
        c = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        c.settimeout(2.0)
        c.connect(SOCKET_PATH)

        rx_fds = array.array('i', [0])
        msg, anc, flags, addr = c.recvmsg(1024, socket.CMSG_LEN(rx_fds.itemsize))
        c.close()

        pw_fd = None
        for cmsg_level, cmsg_type, cmsg_data in anc:
            if cmsg_level == socket.SOL_SOCKET and cmsg_type == socket.SCM_RIGHTS:
                pw_fd = struct.unpack('i', cmsg_data[:4])[0]

        if msg:
            data = json.loads(msg.decode('utf-8'))
            node_id = data.get("node_id")
            return node_id, pw_fd
    except Exception as e:
        sys.stderr.write(f"Aviso ao conectar ao daemon do portal: {e}\n")

    return None, None

def socket_listener_thread(node_id, pw_fd, loop):
    if os.path.exists(SOCKET_PATH):
        try: os.remove(SOCKET_PATH)
        except Exception: pass

    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(SOCKET_PATH)
    server.listen(10)
    server.settimeout(1.0)

    try:
        while True:
            try:
                conn, _ = server.accept()
            except socket.timeout:
                continue

            try:
                payload = json.dumps({"node_id": node_id}).encode('utf-8')
                client_fd = os.dup(pw_fd) if pw_fd is not None else None
                
                if client_fd is not None:
                    fds = array.array('i', [client_fd])
                    conn.sendmsg([payload], [(socket.SOL_SOCKET, socket.SCM_RIGHTS, fds)])
                    os.close(client_fd)
                else:
                    conn.sendall(payload)
                conn.close()
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception as err:
                sys.stderr.write(f"Erro ao atender cliente do portal: {err}\n")
    except Exception:
        pass
    finally:
        server.close()
        if os.path.exists(SOCKET_PATH):
            try: os.remove(SOCKET_PATH)
            except Exception: pass

def iniciar_daemon():
    if sys.platform != "linux":
        print("O Portal Daemon é exclusivo para Linux (GNOME/Wayland/PipeWire).")
        sys.exit(1)

    if "--stop" in sys.argv:
        if os.path.exists(SOCKET_PATH):
            try: os.remove(SOCKET_PATH)
            except Exception: pass
            print("Sinal de encerramento enviado ao Portal Daemon.")
        else:
            print("Portal Daemon não está rodando.")
        return

    if esta_daemon_rodando():
        print(f"⚠️ Portal Daemon já está ativo em {SOCKET_PATH}")
        sys.exit(0)

    print("\n============================================================")
    print("      🚀 INICIANDO SERVIÇO PERSISTENTE DO PORTAL (DAEMON)    ")
    print("============================================================\n")
    print("  Por favor, selecione a Janela/Tela na caixa do sistema APENAS UMA VEZ.")
    print("  Depois disso, todos os testes e transmissões usarão este nó instantaneamente!\n")

    node_id, pw_fd = obter_pipewire_fd_e_node(timeout_seconds=120)

    if not node_id:
        print("❌ Falha ao obter nó PipeWire do Portal.")
        sys.exit(1)

    print(f"✅ Sessão PipeWire mantida ativa 24/7 pelo GLib Loop! Node #{node_id} (FD #{pw_fd})")
    print(f"📡 Ouvindo conexões de clientes em {SOCKET_PATH}...")
    print("   (Pressione Ctrl+C para encerrar o serviço do portal)\n")

    main_loop = GLib.MainLoop()

    t = threading.Thread(target=socket_listener_thread, args=(node_id, pw_fd, main_loop), daemon=True)
    t.start()

    try:
        main_loop.run()
    except KeyboardInterrupt:
        print("\nEncerando serviço do portal...")
    finally:
        main_loop.quit()
        fechar_sessao_portal_ativa()
        if os.path.exists(SOCKET_PATH):
            try: os.remove(SOCKET_PATH)
            except Exception: pass
        print("Serviço do portal encerrado de forma limpa.")

if __name__ == "__main__":
    iniciar_daemon()
