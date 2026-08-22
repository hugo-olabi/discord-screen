#!/usr/bin/env node
import { atualizarAppDiscord } from './discord-app-update.mjs';

const url = process.argv[2];
if (!url) {
  console.log('\n  Uso: node scripts/update-discord-app.mjs <URL_VERCEL>');
  console.log('  Exemplo: node scripts/update-discord-app.mjs https://discord-screen.vercel.app\n');
  process.exit(1);
}

console.log(`\n  Atualizando Discord Activity para a URL: ${url}...\n`);
const res = await atualizarAppDiscord(url, { verbose: true });

if (res.ok) {
  console.log('\n  ✅ Discord Activity atualizado com sucesso no Discord Developer Portal!\n');
} else {
  console.error('\n  ❌ Erro ao atualizar Discord Activity:', res.erro || res.motivo, '\n');
}
