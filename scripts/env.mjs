/**
 * Environment configuration reader and writer helpers for StreamRoom.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ENV_FILE = path.join(ROOT, '.env');

/** @returns {Record<string,string>} Empty object if file does not exist. */
export function readEnv() {
  try {
    const pairs = fs
      .readFileSync(ENV_FILE, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const cut = line.indexOf('=');
        return [line.slice(0, cut).trim(), line.slice(cut + 1).trim()];
      });
    return Object.fromEntries(pairs);
  } catch {
    return {};
  }
}

const KNOWN_KEYS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'PUBLIC_ORIGIN',
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'DISCORD_BOT_TOKEN',
  'DISCORD_USER_TOKEN',
  'NODE_ENV',
];

export function writeEnv(newValues) {
  const v = { ...readEnv(), ...newValues };

  const lines = [
    '# StreamRoom Configuration.',
    '# Keep secret credentials secure and do not commit to public repositories.',
    '',
    '# Supabase Realtime & WebRTC Signaling Credentials',
    `VITE_SUPABASE_URL=${v.VITE_SUPABASE_URL ?? 'https://elpfsixxbdnvwxhundxl.supabase.co'}`,
    `VITE_SUPABASE_ANON_KEY=${v.VITE_SUPABASE_ANON_KEY ?? ''}`,
    '',
    '# Public Web URL for Client Interface',
    `PUBLIC_ORIGIN=${v.PUBLIC_ORIGIN ?? 'http://localhost:5173'}`,
    '',
    '# Discord App Credentials',
    `DISCORD_CLIENT_ID=${v.DISCORD_CLIENT_ID ?? ''}`,
    `DISCORD_CLIENT_SECRET=${v.DISCORD_CLIENT_SECRET ?? ''}`,
    `DISCORD_BOT_TOKEN=${v.DISCORD_BOT_TOKEN ?? ''}`,
    `DISCORD_USER_TOKEN=${v.DISCORD_USER_TOKEN ?? ''}`,
    '',
    '# Environment Profile',
    `NODE_ENV=${v.NODE_ENV ?? 'development'}`,
    '',
  ];

  const extras = Object.keys(v).filter((k) => !KNOWN_KEYS.includes(k));
  if (extras.length) {
    lines.push('# Custom Variables');
    for (const k of extras) lines.push(k + '=' + v[k]);
    lines.push('');
  }

  fs.writeFileSync(ENV_FILE, lines.join('\n'));
}

export const color = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  blue: '\x1b[38;5;69m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
};

// Backward compatibility aliases
export const RAIZ = ROOT;
export const ARQUIVO = ENV_FILE;
export const lerEnv = readEnv;
export const gravarEnv = writeEnv;
export const cor = color;
