import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';

import {
  detectarSistema,
  montarComandoFFmpeg,
  montarComandoPipeWireGStreamer,
  montarEncoders,
  montarEntradaAudio,
  montarEntradaVideo,
} from './ffmpeg.mjs';
import { extrairParametrosDeUrl } from './index.mjs';
import { listarJanelas, obterPipeWireNodeViaPortal } from './janelas.mjs';
import { iniciarTransmissaoNativa } from './ws-client.mjs';

describe('native-streamer: ffmpeg', () => {
  it('detecta sistema operacional corretamente', () => {
    const sys = detectarSistema();
    expect(sys).toHaveProperty('os');
    expect(sys).toHaveProperty('displayServer');
  });

  it('monta entradas de vídeo por plataforma', () => {
    const display = process.env.DISPLAY || ':0.0';
    const linuxX11 = montarEntradaVideo({}, { os: 'linux', displayServer: 'x11' });
    expect(linuxX11).toContain('-f');
    expect(linuxX11).toContain('x11grab');
    expect(linuxX11).toContain(display);

    const win = montarEntradaVideo({}, { os: 'win32', displayServer: 'unknown' });
    expect(win).toEqual(['-f', 'gdigrab', '-framerate', '30', '-i', 'desktop']);

    const mac = montarEntradaVideo({}, { os: 'darwin', displayServer: 'unknown' });
    expect(mac).toEqual(['-f', 'avfoundation', '-framerate', '30', '-i', '1:none']);
  });

  it('suporta selecao de janela especifica por windowId', () => {
    const winVideo = montarEntradaVideo(
      { windowId: '0x3800004' },
      { os: 'linux', displayServer: 'x11' },
    );
    expect(winVideo).toContain('-window_id');
    expect(winVideo).toContain('0x3800004');
  });

  it('monta comando PipeWire GStreamer para XDG Desktop Portal', () => {
    const gstCmd = montarComandoPipeWireGStreamer('42', { fps: 60, bitrate: '3000k' });
    expect(gstCmd).toContain('target-object=42');
    expect(gstCmd).toContain('pipewiresrc');
    expect(gstCmd).toContain('vp9enc');
    expect(gstCmd).toContain('ivfenc');
  });

  it('monta entradas de áudio por plataforma', () => {
    const linuxAudio = montarEntradaAudio({}, { os: 'linux', displayServer: 'x11' });
    expect(linuxAudio).toEqual(['-f', 'pulse', '-i', 'default']);

    const winAudio = montarEntradaAudio(
      { audioDevice: 'Mic' },
      { os: 'win32', displayServer: 'unknown' },
    );
    expect(winAudio).toEqual(['-f', 'dshow', '-i', 'audio=Mic']);
  });

  it('configura encoders de vídeo e hardware acceleration', () => {
    const sw = montarEncoders({ hwaccel: 'auto', bitrate: '3000k' });
    expect(sw).toContain('libvpx-vp9');
    expect(sw).toContain('3000k');

    const nvenc = montarEncoders({ hwaccel: 'nvenc' });
    expect(nvenc).toContain('h264_nvenc');

    const vaapi = montarEncoders({ hwaccel: 'vaapi' });
    expect(vaapi).toContain('h264_vaapi');
  });

  it('monta comando completo do FFmpeg', () => {
    const cmd = montarComandoFFmpeg({}, { os: 'linux', displayServer: 'x11' });
    expect(cmd).toContain('pipe:1');
    expect(cmd).toContain('ivf');
  });
});

describe('native-streamer: janelas', () => {
  it('executa listarJanelas sem lancar excecoes', () => {
    const lista = listarJanelas();
    expect(Array.isArray(lista)).toBe(true);
  });

  it('executa obterPipeWireNodeViaPortal sem travar se portal indisponivel', { timeout: 20000 }, () => {
    const node = obterPipeWireNodeViaPortal();
    expect(node === null || typeof node === 'string').toBe(true);
  });


});

describe('native-streamer: url parser', () => {
  it('extrai parametros de URL completa de compartilhamento', () => {
    const url =
      'https://ottawa-foto-tree-council.trycloudflare.com/share.html?t=token-123&q=2500000&fps=30&fonte=tela';
    const parsed = extrairParametrosDeUrl(url);

    expect(parsed).toEqual({
      serverUrl: 'https://ottawa-foto-tree-council.trycloudflare.com',
      token: 'token-123',
    });
  });

  it('devolve null para strings invalidas', () => {
    expect(extrairParametrosDeUrl('nao-eh-url')).toBeNull();
    expect(extrairParametrosDeUrl(null)).toBeNull();
  });
});

describe('native-streamer: ws-client', () => {
  it('instancia stream WebSocket sem lançar erros', () => {
    const mockStdout = new EventEmitter();
    const { parar } = iniciarTransmissaoNativa('ws://localhost:3001', 'token-teste', mockStdout);
    expect(typeof parar).toBe('function');
    parar();
  });
});
