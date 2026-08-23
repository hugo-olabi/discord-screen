import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'native-streamer')))
from janelas import listar_janelas
from ffmpeg import montar_comando_ffmpeg, montar_comando_pipewire_gstreamer
from ws_client import demux_ivf_header

def test_demux_ivf_header_valido():
    # Simulando um cabeçalho IVF de 32 bytes (VP9 640x480 30fps)
    header = bytearray(32)
    header[0:4] = b'DKIF'
    header[8:12] = b'VP90'
    header[12:14] = (640).to_bytes(2, 'little')
    header[14:16] = (480).to_bytes(2, 'little')
    header[16:20] = (30).to_bytes(4, 'little')
    header[20:24] = (1).to_bytes(4, 'little')

    parsed = demux_ivf_header(bytes(header))
    assert parsed is not None
    assert parsed["codec"] == "vp09.00.10.08"
    assert parsed.get("codedWidth") == 640 or parsed.get("width") == 640
    assert parsed.get("codedHeight") == 480 or parsed.get("height") == 480
    assert parsed["fps"] == 30

def test_montar_comando_pipewire_gstreamer():
    cmd, _ = montar_comando_pipewire_gstreamer("42", fps=60, bitrate="3000k")
    cmd_str = " ".join(cmd) if isinstance(cmd, list) else cmd
    assert "path=42" in cmd_str
    assert "pipewiresrc" in cmd_str
    assert "vp9enc" in cmd_str or "vp8enc" in cmd_str

def test_montar_comando_ffmpeg():
    cmd, _ = montar_comando_ffmpeg(fps=30, bitrate="2500k", window_id="0x123")
    cmd_str = " ".join(cmd) if isinstance(cmd, list) else cmd
    assert "ffmpeg" in cmd_str
    assert "libvpx-vp9" in cmd_str or "libvpx" in cmd_str

def test_listar_janelas_sem_erros():
    janelas = listar_janelas()
    assert isinstance(janelas, list)
