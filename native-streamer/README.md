# StreamRoom Native Streamer (Python & FFmpeg)

StreamRoom includes a standalone native streamer written in Python (GTK4 / CLI) utilizing **FFmpeg** and **GStreamer** to capture and stream desktop screens and system audio directly with zero browser overhead.

---

## 🚀 How to Use

### 1. Prerequisites
Ensure `ffmpeg` and Python 3 are installed on your OS:
- **Linux (Ubuntu/Debian)**: `sudo apt install ffmpeg python3-gi python3-gi-cairo`
- **Arch Linux**: `sudo pacman -S ffmpeg python-gobject`
- **Windows / macOS**: Install via `winget install FFmpeg.FFmpeg` or `brew install ffmpeg`.

### 2. Start Broadcast

#### Launch GTK4 Interface (or CLI fallback):
```bash
npm run stream
```

#### Stream with Specific Room Token:
```bash
npm run stream -- --token=<STREAM_TOKEN>
```

#### Advanced Capture Parameters:
```bash
npm run stream -- --token=<TOKEN> --fps=60 --bitrate=12000k --profile=cinema
```

---

## ⚙️ Supported Command-Line Flags

| Flag | Default | Description |
| --- | --- | --- |
| `--token` | Prompted | Stream Token / Room ID. |
| `--server` | `http://localhost:3001` | StreamRoom server origin URL. |
| `--fps` | `60` | Capture framerate (FPS). |
| `--bitrate` | `12000k` | Video bitrate (e.g. `12000k`, `8000k`, `4000k`). |
| `--profile` | `cinema` | Quality profile (`cinema`, `mobile`, `balanced`, `fast`). |
| `--audio-source` | `system` | Audio capture source (`system`, `app`, `mic`, `none`). |
