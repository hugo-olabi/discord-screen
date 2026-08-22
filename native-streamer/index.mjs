import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { detectarSistema, montarComandoFFmpeg, montarComandoPipeWireGStreamer } from './ffmpeg.mjs';
import {
  escolherFpsViaZenity,
  escolherJanelaViaZenity,
  fazerPergunta,
  listarJanelas,
  obterPipeWireNodeViaPortal,
} from './janelas.mjs';
import { iniciarTransmissaoNativa } from './ws-client.mjs';

export function extrairParametrosDeUrl(input) {
  if (!input || typeof input !== 'string') return null;
  try {
    const parsed = new URL(input);
    const params = Object.fromEntries(parsed.searchParams.entries());

    return {
      serverUrl: parsed.origin,
      token: params.t || null,
    };
  } catch {
    return null;
  }
}

function parseArgs(args) {
  const params = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const parts = arg.slice(2).split('=');
      const key = parts[0];
      const val =
        parts.length > 1
          ? parts[1]
          : args[i + 1] && !args[i + 1].startsWith('--')
            ? args[++i]
            : 'true';
      params[key] = val;
    } else if (!params._positional && (arg.startsWith('http://') || arg.startsWith('https://'))) {
      params._positional = arg;
    }
  }
  return params;
}

export async function executarStreamerNativo(rawArgs = process.argv.slice(2)) {
  const flags = parseArgs(rawArgs);
  const isInteractive = Boolean(process.stdin.isTTY);
  const sistema = detectarSistema();

  console.log(
    '\n\x1b[36m\x1b[1m============================================================\x1b[0m',
  );
  console.log('\x1b[36m\x1b[1m           📺 TRANSMISSOR NATIVO DISCORD-SCREEN             \x1b[0m');
  console.log(
    '\x1b[36m\x1b[1m============================================================\x1b[0m\n',
  );

  let urlCandidate =
    flags._positional ||
    flags.url ||
    flags.link ||
    (flags.token && flags.token.startsWith('http') ? flags.token : null);

  if (!urlCandidate && !flags.token && isInteractive) {
    console.log('\x1b[33m  [1/3] Escolha como conectar:\x1b[0m');
    console.log('    1) Cole o Link da aba de compartilhamento ou Token');
    console.log('    2) Criar nova sala automaticamente no servidor local (http://localhost:3001)');
    const opcao = await fazerPergunta('  Selecione [1-2] (Padrão: 1): ');

    if (opcao === '2') {
      flags.server = flags.server || 'http://localhost:3001';
    } else {
      urlCandidate = await fazerPergunta('  Cole a URL ou Token: ');
    }
  }

  const urlData = extrairParametrosDeUrl(urlCandidate);

  let serverUrl =
    flags.server || urlData?.serverUrl || process.env.PUBLIC_ORIGIN || 'http://localhost:3001';
  let token =
    urlData?.token ||
    (flags.token && !flags.token.startsWith('http') ? flags.token : null) ||
    process.env.STREAM_TOKEN;

  // Auto-criação de sala se token não foi informado
  if (!token) {
    try {
      const res = await fetch(`${serverUrl}/api/rooms/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Transmissão Nativa FFmpeg' }),
      });
      if (res.ok) {
        const dados = await res.json();
        token = dados.broadcasterToken;
        console.log(`\n\x1b[32m  Nova sala criada com sucesso!\x1b[0m`);
        console.log(`  Token de transmissão: \x1b[33m${token}\x1b[0m\n`);
      }
    } catch {
      // Ignorar falha de auto-criação
    }
  }

  if (!token) {
    console.error('\x1b[31m  ERRO: Token de transmissão não informado.\x1b[0m');
    console.error(
      '  Uso: npm run stream -- "https://seu-tunel.trycloudflare.com/share.html?t=..."\n',
    );
    process.exit(1);
  }

  // --- SELEÇÃO DE TAXA DE QUADROS (FPS) ---
  let fps = flags.fps ? Number(flags.fps) : null;

  if (!fps && isInteractive) {
    // Tentar popup gráfico Zenity
    fps = escolherFpsViaZenity();
    if (!fps) {
      console.log('\n\x1b[33m  [2/3] Escolha a taxa de quadros (FPS):\x1b[0m');
      console.log('    1) ⚡ 60 FPS (Alta Fluidez)');
      console.log('    2) 🎬 30 FPS (Padrão Recomendado)');
      console.log('    3) 🔋 15 FPS (Economia de Desempenho)');

      const fpsStr = await fazerPergunta('  Selecione [1-3] (Padrão: 2): ');
      if (fpsStr === '1') fps = 60;
      else if (fpsStr === '3') fps = 15;
      else fps = 30;
    }
  } else if (!fps) {
    fps = 30;
  }

  const bitrate = flags.bitrate || '2500k';
  const fonte = flags.fonte || 'tela';
  const opcoesCaptura = { fps, bitrate, hwaccel: flags.hwaccel || 'auto' };

  let proc = null;
  let pipewireNode = null;

  // No Linux (Wayland / X11), tentar primeiro via XDG Desktop Portal (Popup nativo do SO)
  if (sistema.os === 'linux' && flags.portal !== 'false') {
    pipewireNode = obterPipeWireNodeViaPortal();
  }

  if (pipewireNode) {
    console.log(`\x1b[32m  PipeWire Node #${pipewireNode} obtido via XDG Desktop Portal!\x1b[0m`);
    console.log(`\x1b[36m  Servidor: ${serverUrl}\x1b[0m`);
    console.log(
      `\x1b[36m  Iniciando GStreamer (PipeWire) - FPS: ${fps}, Bitrate: ${bitrate}...\x1b[0m\n`,
    );

    const gstArgs = montarComandoPipeWireGStreamer(pipewireNode, opcoesCaptura);
    proc = spawn('gst-launch-1.0', gstArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
  } else {
    // --- FALLBACK: SELEÇÃO DE JANELA / TELA VIA POPUP NATIVO (ZENITY) OU TERMINAL ---
    let selectedWindowId = flags['window-id'] || flags.window || null;
    const janelas = listarJanelas();

    if (!selectedWindowId && isInteractive && janelas.length > 0) {
      selectedWindowId = escolherJanelaViaZenity(janelas);

      if (!selectedWindowId) {
        console.log('\n\x1b[33m  [3/3] Escolha a fonte de captura:\x1b[0m');
        console.log('    1) 🖥️  Tela Inteira (Monitor Principal)');
        janelas.forEach((j, idx) => {
          const aviso = j.isDiscord ? ' \x1b[31m[Aviso: Pode gerar espelho de vídeo]\x1b[0m' : '';
          console.log(`    ${idx + 2}) 🪟  ${j.title}${aviso}`);
        });

        const escolhaStr = await fazerPergunta(
          `  Selecione [1-${janelas.length + 1}] (Padrão: 1): `,
        );
        const escolhaNum = Number(escolhaStr);
        if (escolhaNum > 1 && escolhaNum <= janelas.length + 1) {
          selectedWindowId = janelas[escolhaNum - 2].id;
          console.log(`  \x1b[32mCapturando janela: ${janelas[escolhaNum - 2].title}\x1b[0m`);
        }
      }
    }

    if (selectedWindowId === 'desktop') selectedWindowId = null;

    opcoesCaptura.windowId = selectedWindowId;
    opcoesCaptura.videoDevice = flags['video-device'];
    opcoesCaptura.audioDevice = flags['audio-device'];

    const ffmpegArgs = montarComandoFFmpeg(opcoesCaptura, sistema);
    console.log(`\x1b[36m  Servidor: ${serverUrl}\x1b[0m`);
    console.log(
      `\x1b[36m  Iniciando FFmpeg (${sistema.os}) - FPS: ${fps}, Bitrate: ${bitrate}${selectedWindowId ? ` (Janela: ${selectedWindowId})` : ''}...\x1b[0m\n`,
    );

    proc = spawn('ffmpeg', ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
  }

  proc.stderr.on('data', (buf) => {
    const msg = buf.toString().trim();
    if (msg) console.log(`\x1b[2m[Capture] ${msg}\x1b[0m`);
  });

  proc.on('error', (err) => {
    console.error(`\x1b[31m  Erro no processo de captura: ${err.message}\x1b[0m`);
    process.exit(1);
  });

  const { parar } = iniciarTransmissaoNativa(serverUrl, token, proc.stdout, {
    fonte,
    aoConectar: () => {
      console.log('\x1b[32m\x1b[1m  Transmissão nativa conectada e ao vivo!\x1b[0m');
      console.log('  Pressione Ctrl+C para encerrar.\n');
    },
    aoErro: (err) => {
      console.error(`\x1b[31m  Erro na conexão WebSocket: ${err.message}\x1b[0m`);
    },
  });

  const encerrar = () => {
    console.log('\n\x1b[33m  Encerrando transmissão nativa...\x1b[0m');
    parar();
    proc.kill('SIGINT');
    process.exit(0);
  };

  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);
}

// Executar se for chamado diretamente pelo CLI
const esmePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(esmePath)) {
  executarStreamerNativo();
}
