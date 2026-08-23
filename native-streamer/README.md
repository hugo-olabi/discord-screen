# Native System Streamer (FFmpeg)

Este repositório inclui um transmissor nativo via **FFmpeg** que permite transmitir a tela e o áudio do sistema operacional **diretamente do terminal**, sem precisar abrir o navegador nem manter instâncias do Chromium rodando.

---

## 🚀 Como Usar

### 1. Pré-requisito
Certifique-se de ter o `ffmpeg` instalado no sistema operacional:
- **Linux (Ubuntu/Debian)**: `sudo apt install ffmpeg`
- **Arch Linux**: `sudo pacman -S ffmpeg`
- **Windows / macOS**: Instale via `winget install FFmpeg.FFmpeg` ou `brew install ffmpeg`.

### 2. Transmitir

#### Auto-conexão (no mesmo computador onde o servidor roda)
```bash
npm run stream
```

#### Transmitir usando Token de Sala Específico
```bash
npm run stream -- --token=<SEU_TOKEN_DE_TRANSMISSAO>
```

#### Opções Avançadas de Captura
```bash
npm run stream -- --token=<TOKEN> --fps=60 --bitrate=4000k --hwaccel=nvenc
```

---

## ⚙️ Parâmetros Suportados

| Parâmetro | Padrão | Descrição |
| --- | --- | --- |
| `--token` | Auto-gerado | Token de transmissão da sala. |
| `--server` | `http://localhost:3001` | Endereço do servidor `streamroom`. |
| `--fps` | `30` | Taxa de quadros (FPS) da captura. |
| `--bitrate` | `2500k` | Taxa de transmissão de vídeo. |
| `--hwaccel` | `auto` | Aceleração por GPU (`auto`, `nvenc`, `vaapi`, `qsv`). |
| `--video-device` | Auto-detectado | Dispositivo de entrada de vídeo personalizado. |
| `--audio-device` | Auto-detectado | Dispositivo de entrada de áudio personalizado. |
