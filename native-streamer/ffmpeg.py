import asyncio
import os
import subprocess
import sys

def tem_gstreamer_element(element_name: str) -> bool:
    try:
        res = subprocess.run(["gst-inspect-1.0", element_name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return res.returncode == 0
    except Exception:
        return False

class ChainedProcess:
    def __init__(self, main_proc, gst_proc=None):
        self.main_proc = main_proc
        self.gst_proc = gst_proc
        self.stdout = main_proc.stdout
        self.stderr = main_proc.stderr

    def terminate(self):
        if self.gst_proc:
            try: self.gst_proc.terminate()
            except Exception: pass
        if self.main_proc:
            try: self.main_proc.terminate()
            except Exception: pass

    async def get_combined_stderr(self) -> str:
        logs = []
        if self.gst_proc and self.gst_proc.stderr:
            try:
                b = await self.gst_proc.stderr.read()
                msg = b.decode('utf-8', errors='ignore').strip()
                if msg: logs.append(f"[GStreamer]: {msg}")
            except Exception: pass

        if self.main_proc and self.main_proc.stderr:
            try:
                b = await self.main_proc.stderr.read()
                msg = b.decode('utf-8', errors='ignore').strip()
                if msg: logs.append(f"[FFmpeg]: {msg}")
            except Exception: pass

        return "\n".join(logs)

def obter_perfil_qualidade(profile: str = "cinema", custom_fps: int | None = None, custom_bitrate: str | None = None) -> tuple[int, str, str, str]:
    profiles = {
        "cinema": (60, "12000k", "16000k", "24000k"),
        "balanced": (30, "8000k", "10000k", "16000k"),
        "fast": (30, "4000k", "6000k", "8000k"),
    }
    fps, bitrate, maxrate, bufsize = profiles.get(profile.lower(), profiles["cinema"])
    if custom_fps:
        fps = custom_fps
    if custom_bitrate:
        bitrate = custom_bitrate
        val_k = int(custom_bitrate.replace("k", "")) if "k" in custom_bitrate else 4000
        maxrate = f"{int(val_k * 1.3)}k"
        bufsize = f"{int(val_k * 2.0)}k"

    if isinstance(bitrate, tuple):
        bitrate = bitrate[0]
    return fps, bitrate, maxrate, bufsize

def tem_ffmpeg_encoder(encoder_name: str) -> bool:
    try:
        res = subprocess.run(["ffmpeg", "-encoders"], capture_output=True, text=True, timeout=2)
        return encoder_name in res.stdout
    except Exception:
        return False

def montar_comando_white_noise(fps: int = 30, bitrate: str = "2500k") -> tuple[list[str], bool]:
    keyframe_interval = str(min(fps, 30))
    cmd = [
        "ffmpeg", "-loglevel", "warning",
        "-f", "lavfi", "-i", f"nullsrc=s=640x480:r={fps}",
        "-vf", "noise=alls=20:allf=t+u",
        "-c:v", "libvpx",
        "-b:v", bitrate,
        "-g", keyframe_interval,
        "-keyint_min", keyframe_interval,
        "-deadline", "realtime",
        "-cpu-used", "8",
        "-f", "ivf",
        "pipe:1"
    ]
    return cmd, False

async def iniciar_processo_captura(pipewire_node: str | None = None, pipewire_fd: int | None = None, fps: int = 30, bitrate: str = "2500k", window_id: str | None = None, use_noise: bool = False, profile: str = "cinema"):
    if use_noise:
        cmd, _ = montar_comando_white_noise(fps=fps, bitrate=bitrate)
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        cp = ChainedProcess(proc)
        return cp, proc.stdout, proc.stderr

    bitrate_bps = str(int(bitrate.replace("k", "")) * 1000) if "k" in bitrate else "12000000"
    keyframe_dist = str(min(fps, 30))

    ivf_muxer = "avmux_ivf" if tem_gstreamer_element("avmux_ivf") else ("ivfenc" if tem_gstreamer_element("ivfenc") else None)

    if pipewire_node and ivf_muxer:
        pass_fds = (pipewire_fd,) if pipewire_fd is not None else ()
        pw_src_args = []
        if pipewire_fd is not None:
            pw_src_args.append(f"fd={pipewire_fd}")
        pw_src_args.append(f"path={pipewire_node}")
        pw_src_args.extend(["always-copy=true", "do-timestamp=true"])

        encoder_elem = "vp9enc" if tem_gstreamer_element("vp9enc") else "vp8enc"
        encoder_args = [
            encoder_elem,
            "deadline=1",
            "cpu-used=8" if encoder_elem == "vp9enc" else "cpu-used=6",
            f"target-bitrate={bitrate_bps}",
            f"keyframe-max-dist={keyframe_dist}",
            "end-usage=cq",
            "cq-level=26",
            "threads=8"
        ]

        gst_cmd = ["gst-launch-1.0", "-q", "-e", "pipewiresrc"] + pw_src_args + [
            "!", "videoconvert", "!"
        ] + encoder_args + [
            "!", ivf_muxer, "!", "fdsink", "sync=false", "fd=1"
        ]
        proc = await asyncio.create_subprocess_exec(
            *gst_cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, pass_fds=pass_fds
        )
        await asyncio.sleep(0.3)
        if proc.returncode is None or proc.returncode == 0:
            cp = ChainedProcess(proc)
            return cp, proc.stdout, proc.stderr

    cmd, _ = montar_comando_ffmpeg(fps=fps, bitrate=bitrate, window_id=window_id, profile=profile)
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    cp = ChainedProcess(proc)
    return cp, proc.stdout, proc.stderr

def obter_dispositivo_audio(source_name: str | None = None, is_screen: bool = True) -> str:
    """
    Se is_screen=True: devolve o monitor do sink padrao de saida de audio do sistema (<default_sink>.monitor ou @DEFAULT_MONITOR@).
    Se is_screen=False: procura o sink-input da janela do aplicativo ou faz fallback para o audio do sistema.
    """
    if is_screen or not source_name:
        try:
            res = subprocess.run(['pactl', 'get-default-sink'], capture_output=True, text=True, timeout=2)
            ds = res.stdout.strip()
            if ds: return f"{ds}.monitor"
        except Exception: pass

        try:
            res = subprocess.run(['pactl', 'list', 'sinks', 'short'], capture_output=True, text=True, timeout=2)
            for line in res.stdout.splitlines():
                parts = line.split('\t')
                if len(parts) >= 5 and parts[4] == 'RUNNING':
                    return f"{parts[1]}.monitor"
        except Exception: pass

        return "@DEFAULT_MONITOR@"

    name_lower = source_name.lower()
    try:
        res = subprocess.run(['pactl', 'list', 'sink-inputs'], capture_output=True, text=True, timeout=2)
        current = {}
        for line in res.stdout.splitlines():
            line = line.strip()
            if line.startswith('Sink Input #'):
                if current:
                    app = current.get('application.name', '').lower()
                    bin_name = current.get('application.process.binary', '').lower()
                    if (app and app in name_lower) or (bin_name and bin_name in name_lower) or (app and name_lower in app):
                        return f"sink-input-{current['id']}.monitor"
                current = {'id': line.split('#')[1]}
            elif '=' in line:
                k, v = line.split('=', 1)
                current[k.strip()] = v.strip().strip('"')
        if current:
            app = current.get('application.name', '').lower()
            bin_name = current.get('application.process.binary', '').lower()
            if (app and app in name_lower) or (bin_name and bin_name in name_lower) or (app and name_lower in app):
                return f"sink-input-{current['id']}.monitor"
    except Exception: pass

    return obter_dispositivo_audio(is_screen=True)

async def iniciar_processo_captura_audio(source_name: str | None = None, is_screen: bool = True):
    dev = obter_dispositivo_audio(source_name=source_name, is_screen=is_screen)
    sys.stderr.write(f"\n[Audio] Capturando áudio de ({'Screen/Sistema' if is_screen else 'Window/App'}): {dev}\n")
    ff_cmd = [
        "ffmpeg", "-loglevel", "warning",
        "-f", "pulse", "-i", dev,
        "-c:a", "libopus", "-b:a", "128k", "-ar", "48000", "-ac", "2",
        "-f", "opus", "pipe:1"
    ]
    proc = await asyncio.create_subprocess_exec(
        *ff_cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    return proc

def montar_comando_pipewire_gstreamer(pipewire_node: str, pipewire_fd: int | None = None, fps: int = 30, bitrate: str = "2500k") -> tuple[list[str] | str, bool]:
    bitrate_bps = str(int(bitrate.replace("k", "")) * 1000) if "k" in bitrate else "12000000"
    keyframe_dist = str(min(fps, 30))
    pw_src_args = []
    if pipewire_fd is not None:
        pw_src_args.append(f"fd={pipewire_fd}")
    pw_src_args.append(f"path={pipewire_node}")
    pw_src_args.extend(["always-copy=true", "do-timestamp=true"])

    encoder_elem = "vp9enc" if tem_gstreamer_element("vp9enc") else "vp8enc"
    encoder_args = [
        encoder_elem,
        "deadline=1",
        "cpu-used=8" if encoder_elem == "vp9enc" else "cpu-used=6",
        f"target-bitrate={bitrate_bps}",
        f"keyframe-max-dist={keyframe_dist}",
        "end-usage=cq",
        "cq-level=26",
        "threads=8"
    ]

    cmd = ["gst-launch-1.0", "-q", "-e", "pipewiresrc"] + pw_src_args + [
        "!", "videoconvert", "!"
    ] + encoder_args + [
        "!", "webmmux", "streamable=true", "!", "fdsink", "sync=false"
    ]
    return cmd, False

def montar_comando_ffmpeg(fps: int = 30, bitrate: str = "2500k", window_id: str | None = None, profile: str = "cinema") -> tuple[list[str] | str, bool]:
    fps, bitrate, maxrate, bufsize = obter_perfil_qualidade(profile=profile, custom_fps=fps, custom_bitrate=bitrate)
    platform = sys.platform
    keyframe_interval = str(min(fps, 30))
    
    cmd = [
        "ffmpeg",
        "-loglevel", "warning",
        "-fflags", "nobuffer",
        "-flags", "low_delay",
        "-probesize", "32",
        "-analyzeduration", "0"
    ]

    if platform.startswith("linux"):
        display = os.getenv("DISPLAY", ":0.0")
        cmd.extend(["-f", "x11grab", "-draw_mouse", "1", "-framerate", str(fps)])
        if window_id and window_id != "desktop":
            cmd.extend(["-window_id", str(window_id)])
        cmd.extend(["-i", display])

    elif platform.startswith("win32"):
        target = window_id if window_id and window_id != "desktop" else "desktop"
        cmd.extend(["-f", "gdigrab", "-framerate", str(fps), "-i", target])

    elif platform.startswith("darwin"):
        target = window_id if window_id and window_id != "desktop" else "1:none"
        cmd.extend(["-f", "avfoundation", "-framerate", str(fps), "-i", target])

    else:
        cmd.extend(["-f", "x11grab", "-framerate", str(fps), "-i", ":0.0"])

    # Filtro de downscaling para max 1080p + deduplicacao de quadros estaticos (mpdecimate)
    cmd.extend(["-vf", "scale='min(1920,iw)':-2:flags=lanczos,mpdecimate"])

    # Selecionar o melhor codec suportado para o container IVF (VP9 > VP8)
    if tem_ffmpeg_encoder("libvpx-vp9"):
        encoder = "libvpx-vp9"
        codec_flags = [
            "-c:v", encoder,
            "-crf", "26",
            "-b:v", bitrate,
            "-maxrate", maxrate,
            "-bufsize", bufsize,
            "-g", keyframe_interval,
            "-keyint_min", keyframe_interval,
            "-deadline", "realtime",
            "-cpu-used", "6",
            "-tile-columns", "2",
            "-frame-parallel", "1",
            "-row-mt", "1",
        ]
    else:
        encoder = "libvpx"
        codec_flags = [
            "-c:v", encoder,
            "-crf", "22",
            "-b:v", bitrate,
            "-maxrate", maxrate,
            "-bufsize", bufsize,
            "-g", keyframe_interval,
            "-keyint_min", keyframe_interval,
            "-deadline", "realtime",
            "-cpu-used", "6",
        ]

    cmd.extend(codec_flags)
    cmd.extend(["-f", "ivf", "pipe:1"])

    return cmd, False

