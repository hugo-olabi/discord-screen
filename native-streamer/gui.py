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
from ws_client import iniciar_transmissao_websocket
from supabase_client import atualizar_url_tunel_supabase
from cloudflared_tunnel import iniciar_tunel_cloudflared, iniciar_tunnel_cloudflared




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

        main_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=14)
        main_box.set_margin_top(20)
        main_box.set_margin_bottom(20)
        main_box.set_margin_start(24)
        main_box.set_margin_end(24)
        self.set_child(main_box)

        title = Gtk.Label(label="Recording Setup")
        title.add_css_class("title-2")
        main_box.append(title)

        # Big horizontal rectangle button for selecting window/screen
        self.select_btn = Gtk.Button(label="Select window/screen")
        self.select_btn.set_size_request(-1, 64)
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

        # Audio Stream Toggle section
        audio_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=12)
        audio_box.set_halign(Gtk.Align.CENTER)
        
        audio_label = Gtk.Label(label="Stream Audio")
        self.audio_switch = Gtk.Switch()
        self.audio_switch.set_active(True)

        audio_box.append(audio_label)
        audio_box.append(self.audio_switch)
        main_box.append(audio_box)

        # Bottom Stream Action button (disabled until source selected)
        self.stream_btn = Gtk.Button(label="Stream")
        self.stream_btn.add_css_class("suggested-action")
        self.stream_btn.set_sensitive(False)
        self.stream_btn.connect("clicked", self.on_stream_clicked)
        main_box.append(self.stream_btn)

    def on_select_source_clicked(self, btn):
        self.source_label.set_text("Requesting OS Desktop Portal...")
        
        def request_worker():
            res = obter_pipewire_fd_e_node(timeout_seconds=60)
            if isinstance(res, tuple) and len(res) == 3:
                node, fd, is_screen = res
            else:
                node, fd = res
                is_screen = True

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
        stream_audio = self.audio_switch.get_active()

        config = {
            "pipewire_node": self.pipewire_node,
            "pipewire_fd": self.pipewire_fd,
            "is_screen": getattr(self, "is_screen", True),
            "window_id": self.selected_window_id,
            "source_name": self.selected_source_name,
            "fps": fps,
            "stream_audio": stream_audio
        }

        self.close()
        self.on_confirm_callback(config)


class StreamerAppWindow(Gtk.ApplicationWindow):
    def __init__(self, app, initial_token=None):
        super().__init__(application=app, title="Discord Screen Streamer")
        self.set_default_size(520, 440)

        self.processo_captura = None
        self.is_streaming = False
        self.current_config = None
        self.target_url_or_token = initial_token or ""

        self.setup_custom_css()

        # Stack container for Page 1 (Entry) and Page 2 (Dashboard)
        self.stack = Gtk.Stack()
        self.stack.set_transition_type(Gtk.StackTransitionType.SLIDE_LEFT_RIGHT)
        self.set_child(self.stack)

        self.build_page1()
        self.build_page2()

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
        }
        .title-1 {
            font-size: 20px;
            font-weight: bold;
        }
        .title-2 {
            font-size: 17px;
            font-weight: bold;
        }
        .muted-text {
            color: #a6adc8;
            font-size: 13px;
        }
        .card-box {
            background-color: rgba(255, 255, 255, 0.05);
            border-radius: 10px;
            padding: 16px;
        }
        .big-select-btn {
            font-size: 15px;
            font-weight: bold;
            border-radius: 8px;
        }
        """
        provider.load_from_data(css.encode('utf-8'))
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(),
            provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        )

    # ------------------------------------------------------------------ PAGE 1
    def build_page1(self):
        box1 = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=16)
        box1.set_margin_top(40)
        box1.set_margin_bottom(40)
        box1.set_margin_start(40)
        box1.set_margin_end(40)
        box1.set_valign(Gtk.Align.CENTER)

        lbl_token = Gtk.Label(label="Link - Token")
        lbl_token.set_halign(Gtk.Align.START)
        lbl_token.add_css_class("title-2")
        box1.append(lbl_token)

        self.entry_input = Gtk.Entry()
        self.entry_input.set_placeholder_text("Enter room share URL or token...")
        self.entry_input.connect("changed", self.on_entry_changed)
        box1.append(self.entry_input)

        self.join_btn = Gtk.Button(label="Join")
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
        box2 = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=16)
        box2.set_margin_top(24)
        box2.set_margin_bottom(24)
        box2.set_margin_start(24)
        box2.set_margin_end(24)

        header_title = Gtk.Label(label="Stream Status")
        header_title.add_css_class("title-1")
        header_title.set_halign(Gtk.Align.START)
        box2.append(header_title)

        # Telemetry Card Container
        grid_card = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
        grid_card.add_css_class("card-box")

        self.val_status = self.add_grid_row(grid_card, "Status", "N/A")
        self.val_source = self.add_grid_row(grid_card, "Source", "N/A")
        self.val_fps = self.add_grid_row(grid_card, "Framerate", "N/A")
        self.val_res = self.add_grid_row(grid_card, "Resolution", "N/A")
        self.val_audio = self.add_grid_row(grid_card, "Audio", "N/A")
        self.val_lag = self.add_grid_row(grid_card, "Latency", "N/A")

        box2.append(grid_card)

        # Actions section
        actions_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=12)
        actions_box.set_margin_top(12)

        self.change_stream_btn = Gtk.Button(label="Change Stream")
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
        if self.is_streaming:
            self.parar_transmissao()
        self.open_recording_modal()

    def on_setup_confirmed(self, config):
        self.current_config = config
        self.iniciar_transmissao(config)

    def iniciar_transmissao(self, config):
        token_input = self.target_url_or_token
        if not token_input:
            self.val_status.set_text("No token provided")
            return

        server_url = "http://localhost:3001"
        token = token_input
        if "t=" in token_input:
            parsed = urllib.parse.urlparse(token_input)
            server_url = f"{parsed.scheme}://{parsed.netloc}"
            token = urllib.parse.parse_qs(parsed.query).get("t", [token_input])[0]

        self.val_status.set_text("Connecting...")
        self.val_source.set_text(config.get("source_name") or "Selected Window")
        self.val_fps.set_text(f"{config.get('fps', 30)} FPS")
        self.val_audio.set_text("Enabled" if config.get("stream_audio") else "Disabled")
        self.val_res.set_text("1080p")
        self.val_lag.set_text("Calculating...")

        self.stop_btn.set_sensitive(True)
        self.is_streaming = True

        def run_loop():
            async def run_async():
                cp, out_stream, _ = await iniciar_processo_captura(
                    pipewire_node=config.get("pipewire_node"),
                    pipewire_fd=config.get("pipewire_fd"),
                    fps=config.get("fps", 60),
                    bitrate="12000k",
                    window_id=config.get("window_id"),
                    profile="cinema"
                )
                self.processo_captura = cp

                audio_proc = None
                if config.get("stream_audio"):
                    try:
                        audio_proc = await iniciar_processo_captura_audio(
                            source_name=config.get("source_name"),
                            is_screen=config.get("is_screen", True)
                        )
                        self.processo_captura_audio = audio_proc
                    except Exception as ea:
                        sys.stderr.write(f"\n[Audio] Error starting audio capture: {ea}\n")

                from whep_server import iniciar_servidor_whep
                from webrtc_signaling import iniciar_loop_signaling_supabase
                from supabase_client import SUPABASE_URL, SUPABASE_ANON_KEY


                whep_srv, porta_real = await iniciar_servidor_whep(3001)
                cf_proc, cf_url = iniciar_tunel_cloudflared(porta_real)
                tunnel_public_url = (cf_url.rstrip("/") + "/whep") if cf_url else server_url

                GLib.idle_add(lambda: self.val_status.set_text("Live"))
                GLib.idle_add(lambda: self.val_lag.set_text("< 50ms"))
                atualizar_url_tunel_supabase(token, tunnel_public_url, status="live")

                signaling_task = asyncio.create_task(
                    iniciar_loop_signaling_supabase(SUPABASE_URL, SUPABASE_ANON_KEY, token)
                )

                try:
                    await iniciar_transmissao_websocket(
                        server_url, token, out_stream, proc_stderr=cp, audio_stream=audio_proc
                    )
                finally:
                    signaling_task.cancel()
                    if cf_proc:
                        try: cf_proc.terminate()
                        except Exception: pass

                        try: cf_proc.terminate()
                        except Exception: pass


            try:
                asyncio.run(run_async())
            except Exception as e:
                err_text = str(e)
                GLib.idle_add(lambda err=err_text: self.val_status.set_text(f"Error: {err}"))


        threading.Thread(target=run_loop, daemon=True).start()

    def on_stop_clicked(self, btn):
        self.parar_transmissao()

    def parar_transmissao(self):
        if self.processo_captura:
            try:
                self.processo_captura.terminate()
            except Exception:
                pass
            self.processo_captura = None

        if getattr(self, "processo_captura_audio", None):
            try:
                self.processo_captura_audio.terminate()
            except Exception:
                pass
            self.processo_captura_audio = None

        self.is_streaming = False
        self.val_status.set_text("Stopped")
        self.val_lag.set_text("N/A")
        self.stop_btn.set_sensitive(False)


def iniciar_gui_gtk4(token=None):
    app = Gtk.Application(application_id="com.discord.screen.streamer")
    def on_activate(app):
        win = StreamerAppWindow(app, initial_token=token)
        win.present()
    app.connect("activate", on_activate)
    app.run([])


if __name__ == "__main__":
    initial_token = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else None
    iniciar_gui_gtk4(token=initial_token)
