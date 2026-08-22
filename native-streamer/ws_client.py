import asyncio
import json
import struct
import sys
import time
import websockets

def demux_ivf_header(header_bytes: bytes) -> dict | None:
    """
    Decodifica o cabeçalho IVF de 32 bytes gerado pelo FFmpeg/GStreamer.
    """
    if len(header_bytes) < 32 or header_bytes[:4] != b'DKIF':
        return None

    codec = header_bytes[8:12].decode('ascii', errors='ignore').strip().lower()
    width, height = struct.unpack('<HH', header_bytes[12:16])
    fps_num, fps_den = struct.unpack('<II', header_bytes[16:24])

    codec_str = "vp09.00.10.08" if "vp9" in codec else ("av01.0.04M.08" if "av01" in codec else "vp8")

    return {
        "codec": codec_str,
        "codedWidth": width if width > 0 else 1280,
        "codedHeight": height if height > 0 else 720,
        "fps": round(fps_num / fps_den) if fps_den > 0 else 30
    }

def empacotar_pacote_midia(slot: int, is_keyframe: bool, pts_us: float, payload: bytes, tipo: int = -1) -> bytes:
    """
    Empacota o quadro no formato binário exato esperado pelo decodificador WebCodecs (player.js/audio.js):
    [Byte 0: slot (Uint8)]
    [Byte 1: tipo (Uint8, 1=Keyframe, 0=Delta, 3=Audio)]
    [Bytes 2..9: timestamp em microssegundos (Float64 / Double BigEndian)]
    [Bytes 10..17: sentAt em milissegundos (Float64 / Double BigEndian)]
    [Bytes 18+: payload VP8/VP9/Opus em bytes]
    """
    buf = bytearray(18 + len(payload))
    buf[0] = slot & 0xFF
    buf[1] = tipo if tipo >= 0 else (1 if is_keyframe else 0)
    struct.pack_into('>d', buf, 2, float(pts_us))
    struct.pack_into('>d', buf, 10, float(time.time() * 1000))
    buf[18:] = payload
    return bytes(buf)

async def iniciar_transmissao_websocket(server_url: str, token: str, stdout_stream: asyncio.StreamReader, proc_stderr=None, audio_stream=None, ao_conectar=None, ao_erro=None):
    """
    Cliente WebSocket assíncrono que transmite quadros demuxados em tempo real para o servidor.
    """
    ws_url = server_url.replace("http://", "ws://").replace("https://", "wss://") + f"/ws?t={token}"
    ultimo_keyframe_packet: bytes | None = None
    slot_idx = 0

    try:
        async with websockets.connect(ws_url) as ws:
            # 1. Iniciar imediatamente a recepção de mensagens do servidor (slots / need-keyframe)
            async def loop_mensagens_servidor():
                nonlocal ultimo_keyframe_packet, slot_idx
                try:
                    async for message in ws:
                        if isinstance(message, str):
                            data = json.loads(message)
                            msg_type = data.get("type")

                            if msg_type in ("slot", "welcome"):
                                slot_idx = data.get("slot", 0)

                            elif msg_type == "need-keyframe" and ultimo_keyframe_packet:
                                pkt = bytearray(ultimo_keyframe_packet)
                                pkt[0] = slot_idx & 0xFF
                                await ws.send(bytes(pkt))
                except Exception:
                    pass

            task_rx = asyncio.create_task(loop_mensagens_servidor())

            # 2. Ler cabeçalho IVF de 32 bytes do encoder (GStreamer / FFmpeg)
            try:
                header = await stdout_stream.readexactly(32)
            except asyncio.IncompleteReadError:
                if proc_stderr:
                    try:
                        if hasattr(proc_stderr, "get_combined_stderr"):
                            err_msg = await proc_stderr.get_combined_stderr()
                        else:
                            err_bytes = await proc_stderr.read()
                            err_msg = err_bytes.decode('utf-8', errors='ignore').strip()
                        if err_msg:
                            sys.stderr.write(f"\n[Detalhes do erro do sistema/encoder]:\n{err_msg}\n\n")
                    except Exception:
                        pass
                sys.stderr.write("Aviso: O processo de captura de vídeo encerrou antes de produzir dados.\n")
                task_rx.cancel()
                if ao_erro:
                    ao_erro(Exception("Capture process exited before producing video data."))
                return

            config = demux_ivf_header(header)
            if not config:
                sys.stderr.write("Erro: Stream IVF inválida gerada pelo encoder.\n")
                task_rx.cancel()
                if ao_erro:
                    ao_erro(Exception("Invalid IVF stream from encoder."))
                return

            # 3. Notificar o servidor que a transmissão foi iniciada e enviar as configurações de vídeo
            await ws.send(json.dumps({"type": "start"}))
            await ws.send(json.dumps({"type": "config", "config": config}))

            task_audio = None
            if audio_stream and hasattr(audio_stream, 'stdout') and audio_stream.stdout:
                await ws.send(json.dumps({
                    "type": "audio-config",
                    "config": {"codec": "opus", "sampleRate": 48000, "numberOfChannels": 2}
                }))

                async def loop_audio_envio():
                    nonlocal slot_idx
                    start_audio_time = time.time()
                    ultimo_audio_pts = -1
                    stream = audio_stream.stdout
                    try:
                        while True:
                            header = await stream.readexactly(27)
                            if header[:4] != b'OggS':
                                # Fallback se não for contêiner Ogg
                                chunk = header + await stream.read(485)
                                if not chunk:
                                    break
                                now_pts = int((time.time() - start_audio_time) * 1_000_000)
                                if now_pts <= ultimo_audio_pts:
                                    now_pts = ultimo_audio_pts + 1
                                ultimo_audio_pts = now_pts
                                packet = empacotar_pacote_midia(slot_idx, False, now_pts, chunk, tipo=3)
                                await ws.send(packet)
                                continue

                            num_segments = header[26]
                            seg_table = await stream.readexactly(num_segments)
                            payload_len = sum(seg_table)
                            payload = await stream.readexactly(payload_len)

                            offset = 0
                            pkt = bytearray()
                            for seg_len in seg_table:
                                pkt.extend(payload[offset:offset + seg_len])
                                offset += seg_len
                                if seg_len < 255:
                                    if len(pkt) > 0 and not pkt.startswith(b'OpusHead') and not pkt.startswith(b'OpusTags'):
                                        now_pts = int((time.time() - start_audio_time) * 1_000_000)
                                        if now_pts <= ultimo_audio_pts:
                                            now_pts = ultimo_audio_pts + 1
                                        ultimo_audio_pts = now_pts

                                        packet = empacotar_pacote_midia(slot_idx, False, now_pts, bytes(pkt), tipo=3)
                                        await ws.send(packet)
                                    pkt = bytearray()
                    except Exception:
                        pass

                task_audio = asyncio.create_task(loop_audio_envio())

            if ao_conectar:
                ao_conectar()

            # 4. Loop principal de envio dos quadros de vídeo IVF para o servidor
            primeiro_quadro = True
            start_time = time.time()
            frame_count = 0
            ultimo_pts_us = -1
            ultimo_delta_payload: bytes | None = None

            try:
                while True:
                    frame_header = await stdout_stream.readexactly(12)
                    frame_size, timestamp = struct.unpack('<IQ', frame_header)
                    frame_data = await stdout_stream.readexactly(frame_size)
                    frame_count += 1

                    # Verificar se é keyframe no payload VP8 (Bit 0 é 0) ou VP9 (Bit 2 é 0)
                    is_keyframe = False
                    if primeiro_quadro:
                        is_keyframe = True
                        primeiro_quadro = False
                    elif len(frame_data) > 0:
                        if config.get("codec") == "vp8":
                            is_keyframe = (frame_data[0] & 0x01) == 0
                        else:
                            is_keyframe = (frame_data[0] & 0x04) == 0

                    # Deduplicação de quadros estáticos (ignorar quadros delta idênticos ao anterior)
                    if not is_keyframe:
                        if ultimo_delta_payload and frame_data == ultimo_delta_payload:
                            continue
                        ultimo_delta_payload = frame_data
                    else:
                        ultimo_delta_payload = None

                    # Timestamp monotônico em microssegundos
                    now_pts = int((time.time() - start_time) * 1_000_000)
                    if now_pts <= ultimo_pts_us:
                        now_pts = ultimo_pts_us + 1
                    ultimo_pts_us = now_pts

                    packet_bytes = empacotar_pacote_midia(slot_idx, is_keyframe, now_pts, frame_data)

                    if is_keyframe:
                        pkt = bytearray(packet_bytes)
                        pkt[0] = slot_idx & 0xFF
                        ultimo_keyframe_packet = bytes(pkt)

                    await ws.send(packet_bytes)

            except asyncio.IncompleteReadError:
                pass
            finally:
                task_rx.cancel()

    except Exception as e:
        if ao_erro:
            ao_erro(e)
        else:
            sys.stderr.write(f"Erro na conexão WebSocket: {e}\n")

