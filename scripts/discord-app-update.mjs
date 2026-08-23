/**
 * Automatically updates Discord Developer Portal Application settings
 * (Activities -> URL Mappings Target and OAuth2 -> Redirects) via Discord REST API.
 */
import { readEnv, color } from './env.mjs';

const API = 'https://discord.com/api/v9';

export async function updateDiscordApp(url, { verbose = true } = {}) {
  const log = (...args) => {
    if (verbose) console.log(`${color.dim}[Discord App Update Debug]${color.reset}`, ...args);
  };

  if (!url || !url.startsWith('https://')) {
    log('❌ Invalid tunnel URL provided:', url);
    return { ok: false, reason: 'Invalid URL' };
  }

  const env = readEnv();
  const botToken = (env.DISCORD_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN || '').trim();
  const userToken = (env.DISCORD_USER_TOKEN || process.env.DISCORD_USER_TOKEN || '').trim();
  const clientId = (env.DISCORD_CLIENT_ID || process.env.DISCORD_CLIENT_ID || '').trim();

  const domain = url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const redirectUri = `${url.replace(/\/+$/, '')}/auth/callback`;

  log(`Target Domain: "${domain}"`);
  log(`Redirect URI: "${redirectUri}"`);
  log(`Client ID: ${clientId || 'None'}`);
  log(`BOT_TOKEN present: ${Boolean(botToken)} (${botToken.length} chars)`);
  log(`USER_TOKEN present: ${Boolean(userToken)} (${userToken.length} chars)`);

  if (!botToken && !userToken) {
    log('❌ Neither DISCORD_BOT_TOKEN nor DISCORD_USER_TOKEN configured in .env.');
    return { ok: false, reason: 'no_token', domain, redirectUri };
  }

  let updatedTarget = false;
  let updatedRedirect = false;
  let lastError = null;

  if (userToken && clientId) {
    log('🔐 Updating Activities → URL Mappings Target via proxy-config API...');
    const authHeader = userToken.replace(/^(Bearer|Bot)\s+/, '');
    const proxyConfigUrl = `${API}/applications/${clientId}/proxy-config`;

    try {
      const proxyRes = await fetch(proxyConfigUrl, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url_map: [{ prefix: '/', target: domain }],
        }),
      });

      log(`  └─ POST ${proxyConfigUrl} -> Status ${proxyRes.status}`);

      if (proxyRes.ok) {
        updatedTarget = true;
        log(`  └─ ✅ Activities URL Mappings Target updated to "${domain}"!`);
      } else {
        const errText = await proxyRes.text();
        lastError = errText;
        log(`  └─ ❌ Error updating proxy-config (${proxyRes.status}):`, errText);
      }
    } catch (err) {
      lastError = err.message;
      log('  └─ ❌ Network exception on proxy-config:', err.message);
    }
  }

  const tokenForRedirect = userToken || botToken;
  if (tokenForRedirect) {
    const isBot = !userToken && botToken;
    const authHeader = isBot
      ? botToken.startsWith('Bot ')
        ? botToken
        : `Bot ${botToken}`
      : userToken.replace(/^(Bearer|Bot)\s+/, '');

    const appUrl = isBot ? `${API}/applications/@me` : `${API}/applications/${clientId}`;
    log(`🤖 Updating OAuth2 Redirects via ${isBot ? 'Bot' : 'User'} Token (${appUrl})...`);

    try {
      const getRes = await fetch(appUrl, {
        headers: { Authorization: authHeader },
      });

      if (getRes.ok) {
        const appData = await getRes.json();
        const existingRedirects = Array.isArray(appData.redirect_uris) ? appData.redirect_uris : [];
        const cleanRedirects = existingRedirects.filter((u) => !u.includes('.trycloudflare.com'));
        const updatedRedirects = Array.from(new Set([redirectUri, ...cleanRedirects]));

        const patchRes = await fetch(appUrl, {
          method: 'PATCH',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            redirect_uris: updatedRedirects,
          }),
        });

        log(`  └─ PATCH ${appUrl} -> Status ${patchRes.status}`);

        if (patchRes.ok) {
          updatedRedirect = true;
          log(`  └─ ✅ OAuth2 Redirects updated to "${redirectUri}"!`);
        } else {
          const patchErrText = await patchRes.text();
          lastError = patchErrText;
          log(`  └─ ❌ Error updating Redirects (${patchRes.status}):`, patchErrText);
        }
      } else {
        const getErrText = await getRes.text();
        log(`  └─ ❌ Failed to fetch application (${getRes.status}):`, getErrText);
      }
    } catch (err) {
      lastError = err.message;
      log('  └─ ❌ Network exception updating Redirects:', err.message);
    }
  }

  return {
    ok: updatedTarget || updatedRedirect,
    updatedTarget,
    updatedRedirect,
    hasUserToken: Boolean(userToken),
    domain,
    redirectUri,
    error: lastError,
  };
}

export async function autoUpdateDiscordApp(url) {
  if (!url) return;
  const res = await updateDiscordApp(url, { verbose: true });

  if (res.ok) {
    console.log(
      `\n${color.green}${color.bold}  ✅ Discord Application Updated Successfully!${color.reset}`,
    );
    if (res.updatedTarget) {
      console.log(`    └─ Activities → URL Mappings Target: ${color.green}${res.domain}${color.reset}`);
    }
    if (res.updatedRedirect) {
      console.log(
        `    └─ OAuth2 → Redirect:               ${color.green}${res.redirectUri}${color.reset}`,
      );
    }
    console.log('');
  }
}

// Backward compatibility aliases
export const atualizarAppDiscord = updateDiscordApp;
export const autoAtualizarDiscordApp = autoUpdateDiscordApp;
