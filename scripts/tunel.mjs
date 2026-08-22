/**
 * Sobe o túnel que deixa este computador acessível de fora.
 *
 * Suporta três modos:
 * 1. `FIXED_SUBDOMAIN` no `.env`: Túnel fixo gratuito via localtunnel (subdomínio permanente).
 * 2. `TUNEL_CONFIG` no `.env`: Túnel próprio nomeado via Cloudflare Zero Trust.
 * 3. Sem nada: Túnel descartável rápido via Cloudflare trycloudflare.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { lerEnv, gravarEnv, cor } from './env.mjs';
import { garantirCloudflared, PASTA } from './cloudflared.mjs';
import { autoAtualizarDiscordApp } from './discord-app-update.mjs';

const ENDERECO_CF = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
const ENDERECO_LT = /https:\/\/[a-z0-9-]+\.loca\.lt/;

export async function abrirTunel({ aoEndereco = () => {}, rapido = false, gravar } = {}) {
  const env = lerEnv();
  const porta = env.PORT || '3001';
  const subdomínioFixo = (env.FIXED_SUBDOMAIN || '').trim();
  const escrever = gravar ?? true;

  const ltArgs = ['-y', 'localtunnel', '--port', porta];
  if (subdomínioFixo) {
    ltArgs.push('--subdomain', subdomínioFixo);
  }

  console.log(`${cor.forte}  Iniciando túnel localtunnel para a aplicação web...${cor.fim}`);

  const tunelLt = spawn('npx', ltArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  tunelLt.porta = porta;
  tunelLt.fixo = Boolean(subdomínioFixo);

  let achadoLt = null;
  const procurarLt = (pedaco) => {
    const url = pedaco.toString().match(ENDERECO_LT)?.[0];
    if (!url || url === achadoLt) return;

    achadoLt = url;
    if (escrever) gravarEnv({ PUBLIC_ORIGIN: url });
    anunciar(url, escrever, env.DISCORD_CLIENT_ID);
    aoEndereco(url);
  };

  tunelLt.stdout.on('data', procurarLt);
  tunelLt.stderr.on('data', procurarLt);
  return tunelLt;
}


function hostnameDoConfig(caminho) {
  try {
    const host = fs
      .readFileSync(caminho, 'utf8')
      .split('\n')
      .map((linha) => linha.replace(/#.*/, '').trim())
      .find((linha) => /^-?\s*hostname:\s*\S/.test(linha))
      ?.split(':')
      .slice(1)
      .join(':')
      .trim();

    return host ? `https://${host.replace(/^https?:\/\//, '').replace(/\/+$/, '')}` : '';
  } catch {
    return '';
  }
}

function configNeutro() {
  const caminho = path.join(PASTA, 'tunel-rapido.yml');
  fs.mkdirSync(PASTA, { recursive: true });
  fs.writeFileSync(
    caminho,
    [
      '# Vazio de propósito — ver configNeutro() em scripts/tunel.mjs.',
      'no-autoupdate: true',
      '',
    ].join('\n'),
  );
  return caminho;
}

function anunciar(url, escreveu) {
  console.log(`\n${cor.forte}  Túnel público no ar:${cor.fim}`);
  console.log(`  ${cor.verde}${url}${cor.fim}`);

  if (escreveu) {
    console.log(`${cor.fraco}  Gravação no .env: PUBLIC_ORIGIN=${url}${cor.fim}`);
  }

  // Tenta atualizar OAuth2 Redirects e URL Target automaticamente
  autoAtualizarDiscordApp(url);
}

// Executado diretamente pela linha de comando
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  console.log();
  console.log(`${cor.forte}  Sobe o túnel da Sala de Tela...${cor.fim}`);

  const rapido = process.argv.includes('--rapido');
  if (rapido) {
    console.log(`${cor.fraco}  (--rapido: ignorando configuração de túnel fixo)${cor.fim}`);
  }

  abrirTunel({ rapido })
    .then((t) => {
      process.on('SIGINT', () => {
        t.kill();
        process.exit();
      });
    })
    .catch((err) => {
      console.error(`\n  ${cor.vermelho}Erro ao abrir túnel:${cor.fim}`, err.message);
      process.exit(1);
    });
}
