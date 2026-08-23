# How StreamRoom Works (Architecture Overview)

This document provides a technical overview of StreamRoom's architecture, design decisions, and real-time streaming pipeline.

---

## 🚀 Architecture Overview

StreamRoom delivers zero-latency screen and audio sharing using **WebCodecs**, **Supabase Realtime**, and **WebSocket/WebRTC** transport.

```
STREAMER (Web/Native)                      SUPABASE / RELAY                      VIEWER (Client)
WebCodecs VideoEncoder                          Realtime                           WebCodecs VideoDecoder
  │                                                │                                        │
  ├─── WebSocket / WebRTC Packets ─────────────────┼───────────────────────────────────────►│
  │    (IVF/Opus 18B Header)                       │                                    Canvas 2D
```

---

## ⚡ Key Technical Features

1. **WebCodecs Acceleration**:
   - Encodes raw frames (VP8 / VP9 / H.264) directly via hardware-accelerated `VideoEncoder`.
   - Bypasses traditional MediaRecorder latency buffers (~3s down to <40ms).

2. **On-Demand Keyframe Requests**:
   - When a new viewer joins a room, the viewer sends an immediate `need-keyframe` event to the streamer.
   - The streamer emits an instant keyframe, reducing initial video rendering delay to ~1 frame.

3. **Supabase Realtime Signaling**:
   - Ephemeral room signaling for SDP offers, answers, and candidate exchanges.
   - Zero persistent storage of video/audio payloads.

4. **Dedicated Legal Pages**:
   - Direct path routes `/privacy-policy` and `/terms-of-service` integrated into SolidJS client router.
