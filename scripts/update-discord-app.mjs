#!/usr/bin/env node
import { updateDiscordApp } from './discord-app-update.mjs';

const url = process.argv[2];
if (!url) {
  console.log('\n  Usage: node scripts/update-discord-app.mjs <VERCEL_URL>');
  console.log('  Example: node scripts/update-discord-app.mjs https://streamroom.vercel.app\n');
  process.exit(1);
}

console.log(`\n  Updating Discord Activity for URL: ${url}...\n`);
const res = await updateDiscordApp(url, { verbose: true });

if (res.ok) {
  console.log('\n  ✅ Discord Activity updated successfully in Discord Developer Portal!\n');
} else {
  console.error('\n  ❌ Error updating Discord Activity:', res.error || res.reason, '\n');
}
