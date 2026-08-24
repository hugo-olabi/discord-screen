import asyncio
import os
import sys
import threading
import urllib.parse

STREAMER_DIR = os.path.dirname(os.path.abspath(__file__))
if STREAMER_DIR not in sys.path:
    sys.path.insert(0, STREAMER_DIR)

import gi
gi.require_version('Gtk', '4.0')
from gi.repository import Gtk, Gdk, GLib

from janelas import listar_janelas
from portal import obter_pipewire_fd_e_node
from ffmpeg import iniciar_processo_captura, iniciar_processo_captura_audio
from supabase_client import atualizar_url_tunel_supabase
import ws_server
from cloudflared_tunnel import iniciar_tunel_cloudflared


def extrair_token_da_url(token_input: str) -> str:
    """Extrai o ID da sala limpo de qualquer URL (sala=, t=, room=, id=) ou retorna o token bruto."""
    if not token_input:
        return ""
    token_input = token_input.strip()
    if "://" in token_input or "?" in token_input:
        try:
            parsed = urllib.parse.urlparse(token_input)
            qs = urllib.parse.parse_qs(parsed.query)
            for param in ["sala", "t", "room", "id"]:
                if param in qs and qs[param]:
                    return qs[param][0]
        except Exception:
            pass
    return token_input


class RecordingSetupModal(Gtk.Window):
    def __init__(self, parent, on_confirm_callback):
        super().__init__(title="Recording Setup")
        self.set_transient_for(parent)
        self.set_modal(True)
        self.set_default_size(440, 360)
        self.set_resizable(False)

        self.on_confirm_callback = on_confirm_callback
        self.pipewire_node = None
        self.pipewire_fd = None
        self.selected_window_id = None
        self.selected_source_name = None

        main_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12)
        main_box.set_margin_top(16)
        main_box.set_margin_bottom(16)
        main_box.set_margin_start(20)
        main_box.set_margin_end(20)
        main_box.set_halign(Gtk.Align.CENTER)
        main_box.set_valign(Gtk.Align.CENTER)
        self.set_child(main_box)

        title = Gtk.Label(label="Recording Setup")
        title.add_css_class("title-2")
        main_box.append(title)

        # Big horizontal rectangle button for selecting window/screen
        self.select_btn = Gtk.Button(label="Select Window or Screen")
        self.select_btn.set_size_request(360, 56)
        self.select_btn.add_css_class("big-select-btn")
        self.select_btn.connect("clicked", self.on_select_source_clicked)
        main_box.append(self.select_btn)

        self.source_label = Gtk.Label(label="No source selected")
        self.source_label.add_css_class("muted-text")
        main_box.append(self.source_label)

        # Framerate selector section
        fps_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        fps_box.set_halign(Gtk.Align.CENTER)
        
        fps_title = Gtk.Label(label="Framerate:")
        fps_box.append(fps_title)

        self.fps_60 = Gtk.ToggleButton(label="60 FPS")
        self.fps_30 = Gtk.ToggleButton(label="30 FPS", active=True)
        self.fps_15 = Gtk.ToggleButton(label="15 FPS")

        self.fps_60.set_group(self.fps_30)
        self.fps_15.set_group(self.fps_30)

        fps_box.append(self.fps_60)
        fps_box.append(self.fps_30)
        fps_box.append(self.fps_15)
        main_box.append(fps_box)

        # Audio Source Dropdown section
        audio_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=12)
        audio_box.set_halign(Gtk.Align.CENTER)
        
        audio_label = Gtk.Label(label="Audio Source:")
        self.audio_dropdown = Gtk.DropDown.new_from_strings([
            "System Audio (Desktop)",
            "App Audio (Selected Window)",
            "Microphone",
            "Disabled (No Audio)"
        ])
        self.audio_dropdown.set_selected(0)

        audio_box.append(audio_label)
        audio_box.append(self.audio_dropdown)
        main_box.append(audio_box)

        # Profile selection
        profile_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=12)
        profile_box.set_halign(Gtk.Align.CENTER)
        profile_label = Gtk.Label(label="Stream Profile:")
        self.profile_dropdown = Gtk.DropDown.new_from_strings([
            "Cinema (1080p / 12 Mbps)",
            "Mobile (720p / 4 Mbps - Android Optimization)",
            "Balanced (720p / 8 Mbps)",
            "Fast (480p / 4 Mbps)"
        ])
        self.profile_dropdown.set_selected(0)
        profile_box.append(profile_label)
        profile_box.append(self.profile_dropdown)
        main_box.append(profile_box)

        # Bottom Stream Action button
        self.stream_btn = Gtk.Button(label="Start Streaming")
        self.stream_btn.add_css_class("suggested-action")
        self.stream_btn.set_sensitive(False)
        self.stream_btn.connect("clicked", self.on_stream_clicked)
        main_box.append(self.stream_btn)

    def on_select_source_clicked(self, btn):
        self.source_label.set_text("Requesting OS Desktop Portal...")
        
        def request_worker():
            res = obter_pipewire_fd_e_node(timeout_seconds=60)
            if isinstance(res, tuple):
                if len(res) >= 3:
                    node, fd, is_screen = res[0], res[1], res[2]
                elif len(res) == 2:
                    node, fd, is_screen = res[0], res[1], True
                else:
                    node, fd, is_screen = None, None, True
            else:
                node, fd, is_screen = None, None, True

            def update_ui():
                if node:
                    self.pipewire_node = node
                    self.pipewire_fd = fd
                    self.is_screen = is_screen
                    self.selected_window_id = None
                    self.selected_source_name = f"PipeWire Node #{node}"
                    self.source_label.set_text(f"{'Screen' if is_screen else 'Window'}: Node #{node}")
                    self.stream_btn.set_sensitive(True)
                else:
                    # Fallback to listing windows
                    janelas = listar_janelas()
                    if janelas:
                        self.pipewire_node = None
                        self.pipewire_fd = None
                        self.is_screen = False
                        self.selected_window_id = janelas[0]["id"]
                        self.selected_source_name = janelas[0]["title"]
                        self.source_label.set_text(f"Selected Window: {self.selected_source_name}")
                        self.stream_btn.set_sensitive(True)
                    else:
                        self.source_label.set_text("No source selected (Portal cancelled)")
                        self.stream_btn.set_sensitive(False)
            GLib.idle_add(update_ui)

        threading.Thread(target=request_worker, daemon=True).start()

    def on_stream_clicked(self, btn):
        fps = 60 if self.fps_60.get_active() else (15 if self.fps_15.get_active() else 30)
        audio_map = {0: "system", 1: "app", 2: "mic", 3: "none"}
        audio_source = audio_map.get(self.audio_dropdown.get_selected(), "system")
        profile_map = {0: "cinema", 1: "mobile", 2: "balanced", 3: "fast"}
        profile = profile_map.get(self.profile_dropdown.get_selected(), "cinema")

        config = {
            "pipewire_node": self.pipewire_node,
            "pipewire_fd": self.pipewire_fd,
            "is_screen": getattr(self, "is_screen", True),
            "window_id": self.selected_window_id,
            "source_name": self.selected_source_name,
            "fps": fps,
            "profile": profile,
            "audio_source": audio_source,
            "stream_audio": audio_source != "none"
        }

        self.close()
        self.on_confirm_callback(config)


class StreamerAppWindow(Gtk.ApplicationWindow):
    def __init__(self, app, initial_token=None):
        super().__init__(application=app, title="StreamRoom Streamer")
        self.set_default_size(480, 420)
        self.set_resizable(False)

        self.processo_captura = None
        self.processo_captura_audio = None
        self.video_task = None
        self.audio_task = None
        self.is_streaming = False
        self.current_config = None
        self.target_url_or_token = initial_token or ""
        self.active_room_token = None

        self.persistent_tunnel_url = None
        self.persistent_cf_proc = None
        self.persistent_ws_runner = None
        self.persistent_loop = None

        self.setup_custom_css()

        # Stack container for Page 1 (Entry) and Page 2 (Dashboard)
        self.stack = Gtk.Stack()
        self.stack.set_transition_type(Gtk.StackTransitionType.SLIDE_LEFT_RIGHT)
        self.set_child(self.stack)

        self.build_page1()
        self.build_page2()

        # Pre-warm Cloudflare Tunnel immediately on app launch
        self.prewarm_persistent_tunnel()

        # Auto-skip to Page 2 if initial token provided
        if self.target_url_or_token:
            self.entry_input.set_text(self.target_url_or_token)
            self.show_page2_and_open_setup()
        else:
            self.stack.set_visible_child_name("page1")

    def setup_custom_css(self):
        provider = Gtk.CssProvider()
        css = """
        window {
            background-color: #1e1e2e;
            color: #cdd6f4;
            font-family: system-ui, -apple-system, sans-serif;
        }
        .title-1 {
            font-size: 20px;
            font-weight: bold;
            color: #cba6f7;
        }
        .title-2 {
            font-size: 15px;
            font-weight: bold;
            color: #cdd6f4;
        }
        .muted-text {
            color: #a6adc8;
            font-size: 12px;
        }
        .card-box {
            background-color: #181825;
            border: 1px solid #313244;
            border-radius: 12px;
            padding: 16px;
        }
        .tunnel-badge {
            background-color: #313244;
            color: #a6e3a1;
            border-radius: 20px;
            padding: 6px 14px;
            font-size: 12px;
            font-weight: 600;
        }
        .big-select-btn {
            font-size: 14px;
            font-weight: bold;
            border-radius: 10px;
            background-color: #313244;
            color: #cdd6f4;
        }
        """
        provider.load_from_data(css.encode('utf-8'))
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(),
            provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        )

    def prewarm_persistent_tunnel(self):
        def prewarm_worker():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            self.persistent_loop = loop

            async def start_server_and_tunnel():
                ws_runner, porta_real = await ws_server.iniciar_servidor_ws(3001)
                self.persistent_ws_runner = ws_runner

                cf_proc, cf_url = iniciar_tunel_cloudflared(porta_real)
                self.persistent_cf_proc = cf_proc
                self.persistent_tunnel_url = cf_url if cf_url else None

                if self.persistent_tunnel_url:
                    GLib.idle_add(lambda: self.tunnel_badge.set_text(f"⚡ Tunnel Ready: {self.persistent_tunnel_url.replace('wss://', '').replace('ws://', '').split('/')[0]}"))
                else:
                    GLib.idle_add(lambda: self.tunnel_badge.set_text("⚠️ Tunnel Unavailable (Public Cloudflare required)"))

                # Se a transmissão já foi iniciada enquanto o túnel estava aquecendo, atualiza o Supabase agora com o URL público definitivo
                if self.active_room_token and self.persistent_tunnel_url:
                    atualizar_url_tunel_supabase(self.active_room_token, self.persistent_tunnel_url, status="live")

                try:
                    while True:
                        await asyncio.sleep(1)
                except asyncio.CancelledError:
                    pass
                finally:
                    await ws_runner.cleanup()
                    if cf_proc:
                        try: cf_proc.terminate()
                        except Exception: pass

            try:
                loop.run_until_complete(start_server_and_tunnel())
            except Exception as e:
                sys.stderr.write(f"\n[Tunnel Prewarm Error]: {e}\n")

        threading.Thread(target=prewarm_worker, daemon=True).start()

    # ------------------------------------------------------------------ PAGE 1
    def build_page1(self):
        box1 = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=14)
        box1.set_margin_top(24)
        box1.set_margin_bottom(24)
        box1.set_margin_start(32)
        box1.set_margin_end(32)
        box1.set_halign(Gtk.Align.CENTER)
        box1.set_valign(Gtk.Align.CENTER)

        lbl_title = Gtk.Label(label="StreamRoom Streamer")
        lbl_title.add_css_class("title-1")
        box1.append(lbl_title)

        lbl_sub = Gtk.Label(label="Zero-Latency Native WebCodecs Streaming")
        lbl_sub.add_css_class("muted-text")
        box1.append(lbl_sub)

        self.tunnel_badge = Gtk.Label(label="Warming Tunnel... ⚡")
        self.tunnel_badge.add_css_class("tunnel-badge")
        box1.append(self.tunnel_badge)

        self.entry_input = Gtk.Entry()
        self.entry_input.set_placeholder_text("Enter room share URL or token...")
        self.entry_input.set_size_request(340, -1)
        self.entry_input.connect("changed", self.on_entry_changed)
        box1.append(self.entry_input)

        self.join_btn = Gtk.Button(label="Join & Setup Stream")
        self.join_btn.add_css_class("suggested-action")
        self.join_btn.set_sensitive(False)
        self.join_btn.connect("clicked", self.on_join_clicked)
        box1.append(self.join_btn)

        self.stack.add_named(box1, "page1")

    def on_entry_changed(self, entry):
        text = entry.get_text().strip()
        self.join_btn.set_sensitive(len(text) > 0)

    def on_join_clicked(self, btn):
        self.target_url_or_token = self.entry_input.get_text().strip()
        if not self.target_url_or_token:
            return
        self.show_page2_and_open_setup()

    # ------------------------------------------------------------------ PAGE 2
    def build_page2(self):
        box2 = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=14)
        box2.set_margin_top(20)
        box2.set_margin_bottom(20)
        box2.set_margin_start(24)
        box2.set_margin_end(24)
        box2.set_halign(Gtk.Align.CENTER)

        header_title = Gtk.Label(label="Stream Control Dashboard")
        header_title.add_css_class("title-1")
        header_title.set_halign(Gtk.Align.CENTER)
        box2.append(header_title)

        # Telemetry Card Container
        grid_card = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8)
        grid_card.add_css_class("card-box")
        grid_card.set_size_request(380, -1)

        self.val_status = self.add_grid_row(grid_card, "Status", "Idle")
        self.val_source = self.add_grid_row(grid_card, "Source", "N/A")
        self.val_fps = self.add_grid_row(grid_card, "Framerate", "N/A")
        self.val_res = self.add_grid_row(grid_card, "Resolution", "N/A")
        self.val_audio = self.add_grid_row(grid_card, "Audio", "N/A")
        self.val_lag = self.add_grid_row(grid_card, "Latency", "N/A")

        box2.append(grid_card)

        # Actions section
        actions_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=12)
        actions_box.set_halign(Gtk.Align.CENTER)
        actions_box.set_margin_top(8)

        self.change_stream_btn = Gtk.Button(label="Change Settings")
        self.change_stream_btn.connect("clicked", self.on_change_stream_clicked)
        actions_box.append(self.change_stream_btn)

        self.stop_btn = Gtk.Button(label="Stop Stream")
        self.stop_btn.add_css_class("destructive-action")
        self.stop_btn.set_sensitive(False)
        self.stop_btn.connect("clicked", self.on_stop_clicked)
        actions_box.append(self.stop_btn)

        box2.append(actions_box)
        self.stack.add_named(box2, "page2")

    def add_grid_row(self, container, label_text, default_value):
        row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        lbl = Gtk.Label(label=label_text)
        lbl.set_halign(Gtk.Align.START)
        lbl.add_css_class("muted-text")
        
        val = Gtk.Label(label=default_value)
        val.set_halign(Gtk.Align.END)
        val.set_hexpand(True)
        
        row.append(lbl)
        row.append(val)
        container.append(row)
        return val

    def show_page2_and_open_setup(self):
        self.stack.set_visible_child_name("page2")
        self.open_recording_modal()

    def open_recording_modal(self):
        modal = RecordingSetupModal(self, self.on_setup_confirmed)
        modal.present()

    def on_change_stream_clicked(self, btn):
        self.open_recording_modal()

    def on_setup_confirmed(self, config):
        self.current_config = config
        self.iniciar_transmissao(config)

    def iniciar_transmissao(self, config):
        token_raw = self.target_url_or_token
        if not token_raw:
            self.val_status.set_text("No token provided")
            return

        token = extrair_token_da_url(token_raw)
        self.active_room_token = token

        # Interrompe capturas anteriores se já estavam ativas (Hot-Swap de Configuração)
        if self.processo_captura:
            try: self.processo_captura.terminate()
            except Exception: pass
            self.processo_captura = None

        if self.processo_captura_audio:
            try: self.processo_captura_audio.terminate()
            except Exception: pass
            self.processo_captura_audio = None

        audio_src = config.get("audio_source", "system").upper()
        profile_name = config.get("profile", "cinema").lower()
        res_text = "720p" if profile_name == "mobile" else ("480p" if profile_name == "fast" else "1080p")

        self.val_status.set_text("Connecting...")
        self.val_source.set_text(config.get("source_name") or "Selected Window")
        self.val_fps.set_text(f"{config.get('fps', 30)} FPS")
        self.val_audio.set_text(audio_src if audio_src != "NONE" else "Disabled")
        self.val_res.set_text(res_text)
        self.val_lag.set_text("Calculating...")
        self.stop_btn.set_sensitive(True)
        self.is_streaming = True

        def run_capture_worker():
            async def run_async():
                cap_res = await iniciar_processo_captura(
                    pipewire_node=config.get("pipewire_node"),
                    pipewire_fd=config.get("pipewire_fd"),
                    fps=config.get("fps", 60),
                    bitrate="12000k" if profile_name == "cinema" else "4000k",
                    window_id=config.get("window_id"),
                    profile=profile_name
                )
                if isinstance(cap_res, tuple) and len(cap_res) >= 2:
                    cp, out_stream = cap_res[0], cap_res[1]
                else:
                    GLib.idle_add(lambda: self.val_status.set_text("Video Capture Error"))
                    return

                self.processo_captura = cp

                audio_proc = None
                audio_source = config.get("audio_source", "system")
                if audio_source != "none":
                    try:
                        audio_proc = await iniciar_processo_captura_audio(
                            audio_source=audio_source,
                            source_name=config.get("source_name"),
                            is_screen=config.get("is_screen", True)
                        )
                        self.processo_captura_audio = audio_proc
                    except Exception as ea:
                        sys.stderr.write(f"\n[Audio] Error starting audio capture: {ea}\n")

                self.video_task = asyncio.create_task(ws_server.streamer_video_loop(out_stream))
                self.audio_task = asyncio.create_task(ws_server.streamer_audio_loop(audio_proc.stdout)) if (audio_proc and audio_proc.stdout) else None

                tunnel_public_url = self.persistent_tunnel_url

                GLib.idle_add(lambda: self.val_status.set_text("Live 🟢"))
                GLib.idle_add(lambda: self.val_lag.set_text("< 40ms"))

                # Notifica novos parâmetros para clientes WebSocket já conectados
                await ws_server.atualizar_config_e_notificar(
                    new_video_cfg={"codedWidth": 1280 if profile_name == "mobile" else 1920, "codedHeight": 720 if profile_name == "mobile" else 1080, "fps": config.get("fps", 30)}
                )

                if tunnel_public_url:
                    atualizar_url_tunel_supabase(token, tunnel_public_url, status="live")

            if self.persistent_loop and self.persistent_loop.is_running():
                asyncio.run_coroutine_threadsafe(run_async(), self.persistent_loop)

        threading.Thread(target=run_capture_worker, daemon=True).start()

    def on_stop_clicked(self, btn):
        self.parar_transmissao()

    def parar_transmissao(self):
        if self.processo_captura:
            try: self.processo_captura.terminate()
            except Exception: pass
            self.processo_captura = None

        if self.processo_captura_audio:
            try: self.processo_captura_audio.terminate()
            except Exception: pass
            self.processo_captura_audio = None

        token_raw = self.target_url_or_token
        if token_raw:
            token = extrair_token_da_url(token_raw)
            tunnel_url = self.persistent_tunnel_url or "ws://127.0.0.1:3001/ws"
            try:
                atualizar_url_tunel_supabase(token, tunnel_url, status="offline")
            except Exception:
                pass

        self.is_streaming = False
        self.val_status.set_text("Stopped")
        self.val_lag.set_text("N/A")
        self.stop_btn.set_sensitive(False)

        # Volta para a Página 1 (Página Inicial) ao parar a transmissão
        self.stack.set_visible_child_name("page1")


def iniciar_gui_gtk4(token=None):
    app = Gtk.Application(application_id="com.streamroom.streamer")
    def on_activate(app):
        win = StreamerAppWindow(app, initial_token=token)
        win.present()
    app.connect("activate", on_activate)
    app.run([])


if __name__ == "__main__":
    initial_token = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else None
    iniciar_gui_gtk4(token=initial_token)
