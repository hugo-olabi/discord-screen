/**
 * Ensures the Discord Activity has a valid PRIMARY_ENTRY_POINT registered.
 */
import { color } from './env.mjs';

const API = 'https://discord.com/api/v10';
const PRIMARY_ENTRY_POINT = 4;
const DISCORD_LAUNCH_ACTIVITY = 2;

async function getToken(clientId, clientSecret) {
  const r = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'applications.commands.update',
    }),
  });

  if (!r.ok) throw new Error(`Discord credentials rejected (${r.status})`);
  return (await r.json()).access_token;
}

export async function ensureEntryPoint(clientId, clientSecret) {
  if (!clientId || !clientSecret) return 'failed';

  try {
    const token = await getToken(clientId, clientSecret);
    const route = `${API}/applications/${clientId}/commands`;
    const auth = { Authorization: `Bearer ${token}` };

    const res = await fetch(route, { headers: auth });
    if (!res.ok) throw new Error(`Could not read application commands (${res.status})`);

    const commands = await res.json();
    if (commands.some((c) => c.type === PRIMARY_ENTRY_POINT)) return 'existed';

    const createRes = await fetch(route, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'open',
        description: 'Open StreamRoom in this voice call',
        type: PRIMARY_ENTRY_POINT,
        handler: DISCORD_LAUNCH_ACTIVITY,
      }),
    });

    if (!createRes.ok) throw new Error(`${createRes.status} ${await createRes.text()}`);
    return 'created';
  } catch (err) {
    console.log(
      `${color.yellow}  Could not verify Activity launcher shortcut: ${err.message}${color.reset}`,
    );
    return 'failed';
  }
}

export function logEntryPointStatus(result) {
  if (result === 'created') {
    console.log(`${color.green}  Activity launcher shortcut created in Discord Developer Portal.${color.reset}`);
  } else if (result === 'existed') {
    console.log(`${color.dim}  Activity launcher shortcut already registered.${color.reset}`);
  }
}

// Backward compatibility aliases
export const garantirEntryPoint = ensureEntryPoint;
export const contarEntryPoint = logEntryPointStatus;
