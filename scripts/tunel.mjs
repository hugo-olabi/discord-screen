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
  const config = rapido ? '' : env.TUNEL_CONFIG || '';
  const subdomínioFixo = rapido ? '' : (env.FIXED_SUBDOMAIN || '').trim();

  const escrever = (gravar ?? !rapido) && !(rapido && (env.TUNEL_CONFIG || env.FIXED_SUBDOMAIN));

  // Modo A: Subdomínio Fixo Gratuito via localtunnel
  if (subdomínioFixo) {
    const tunelLt = spawn(
      'npx',
      ['-y', 'localtunnel', '--port', porta, '--subdomain', subdomínioFixo],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    tunelLt.porta = porta;
    tunelLt.fixo = true;

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

  // Modo B: Túnel Nomeado via Cloudflare
  const args = config
    ? ['--config', config, 'tunnel', '--no-autoupdate', 'run']
    : [
        '--config',
        configNeutro(),
        'tunnel',
        '--no-autoupdate',
        '--url',
        `http://localhost:${porta}`,
      ];

  const cloudflared = await garantirCloudflared();
  const tunel = spawn(cloudflared, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  tunel.porta = porta;
  tunel.fixo = Boolean(config);

  if (config) {
    const doArquivo = hostnameDoConfig(config);
    const origem = doArquivo || env.PUBLIC_ORIGIN || '';

    if (origem && origem !== env.PUBLIC_ORIGIN) {
      gravarEnv({ PUBLIC_ORIGIN: origem });
      console.log(
        `${cor.amarelo}  O .env apontava para outro endereço — corrigi para o do túnel.${cor.fim}`,
      );
    }

    console.log(`${cor.verde}  ${origem || '(endereço definido no config do túnel)'}${cor.fim}\n`);
    aoEndereco(origem || null);
    return tunel;
  }

  let achado = null;
  const procurar = (pedaco) => {
    const url = pedaco.toString().match(ENDERECO_CF)?.[0];
    if (!url || url === achado) return;

    achado = url;
    if (escrever) gravarEnv({ PUBLIC_ORIGIN: url });
    anunciar(url, escrever, env.DISCORD_CLIENT_ID);
    aoEndereco(url);
  };

  tunel.stdout.on('data', procurar);
  tunel.stderr.on('data', procurar);
  return tunel;
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
