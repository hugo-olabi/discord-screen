import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

/**
 * Solicita a seleção de tela/janela através do popup nativo do XDG Desktop Portal (Linux/Wayland/X11).
 * Retorna o ID do nó PipeWire selecionado pelo usuário no popup do SO.
 * @returns {string|null} Node ID do PipeWire
 */
export function obterPipeWireNodeViaPortal() {
  if (os.platform() !== 'linux' || process.env.VITEST || process.env.CI) return null;

  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const scriptPath = path.join(dir, 'portal.py');

    console.log('\n\x1b[33m  Solicitando ao sistema operacional (XDG Desktop Portal)...\x1b[0m');
    console.log('  \x1b[36mSelecione a Janela ou Tela na janela popup nativa do sistema.\x1b[0m\n');

    const stdout = execSync(`python3 "${scriptPath}"`, {
      encoding: 'utf-8',
      stdio: ['inherit', 'pipe', 'inherit'],
    });

    const match = stdout.match(/PIPEWIRE_NODE=(\d+)/);
    if (match) {
      return match[1];
    }
  } catch {
    // Portal cancelado pelo usuário ou DBus indisponível
  }
  return null;
}

/**
 * Exibe um popup gráfico nativo via Zenity (GTK) para escolha da fonte de captura.
 */
export function escolherJanelaViaZenity(janelas) {
  try {
    const listaArgs = [
      '--list',
      '--title=📺 Discord Screen - Seleção de Janela ou Tela',
      '--column=Opção',
      '--column=Nome da Fonte',
      '--width=550',
      '--height=380',
      '1',
      '🖥️ Tela Inteira (Monitor Principal)',
    ];

    janelas.forEach((j, idx) => {
      const aviso = j.isDiscord ? ' [Aviso: Pode gerar espelho]' : '';
      listaArgs.push(String(idx + 2), `🪟 ${j.title}${aviso}`);
    });

    const res = execSync(`zenity ${listaArgs.map((a) => `"${a}"`).join(' ')}`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    const choice = Number(res);
    if (choice === 1) return 'desktop';
    if (choice > 1 && choice <= janelas.length + 1) {
      return janelas[choice - 2].id;
    }
  } catch {
    // Zenity cancelado ou indisponível
  }
  return null;
}

/**
 * Exibe um popup gráfico nativo via Zenity (GTK) para escolha de FPS.
 */
export function escolherFpsViaZenity() {
  try {
    const res = execSync(
      `zenity --list --title="⚡ Taxa de Quadros (FPS)" --column="FPS" --column="Descrição" "30" "🎬 30 FPS (Padrão Recomendado)" "60" "⚡ 60 FPS (Alta Fluidez)" "15" "🔋 15 FPS (Economia)" --width=450 --height=280`,
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();

    const fps = Number(res);
    if ([15, 30, 60].includes(fps)) return fps;
  } catch {
    // Zenity cancelado ou indisponível
  }
  return null;
}

/**
 * Lista as janelas abertas no sistema operacional.
 * @returns {Array<{ id: string, title: string, isDiscord: boolean }>}
 */
export function listarJanelas(plataforma = os.platform()) {
  const janelas = [];

  if (plataforma === 'linux') {
    try {
      const raw = execSync('xprop -root _NET_CLIENT_LIST', {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const matches = raw.match(/0x[0-9a-fA-F]+/g) || [];

      for (const windowId of matches) {
        try {
          const info = execSync(`xprop -id ${windowId} _NET_WM_NAME WM_NAME`, {
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'],
          });
          const nameMatch = info.match(/["'](.*?)["']/);
          if (nameMatch && nameMatch[1].trim()) {
            const title = nameMatch[1].trim();
            const isDiscord = /discord/i.test(title);
            janelas.push({ id: windowId, title, isDiscord });
          }
        } catch {
          // Ignorar janelas fechadas durante o loop
        }
      }
    } catch {
      // xprop não disponível ou falhou
    }
  } else if (plataforma === 'win32') {
    try {
      const psScript = `Get-Process | Where-Object {$_.MainWindowTitle} | Select-Object Id, MainWindowTitle | ConvertTo-Json`;
      const raw = execSync(`powershell -NoProfile -Command "${psScript}"`, {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of list) {
        if (item?.MainWindowTitle) {
          const title = item.MainWindowTitle.trim();
          const isDiscord = /discord/i.test(title);
          janelas.push({ id: `title=${title}`, title, isDiscord });
        }
      }
    } catch {
      // PowerShell não disponível
    }
  }

  return janelas;
}

/**
 * Exibe uma pergunta no terminal e aguarda a entrada do usuário.
 */
export function fazerPergunta(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    }),
  );
}
