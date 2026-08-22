/**
 * Atualiza automaticamente as configurações da Aplicação no Discord Developer Portal
 * (Activities -> URL Mappings Target e OAuth2 -> Redirects) via Discord REST API.
 */
import { lerEnv, cor } from './env.mjs';

const API = 'https://discord.com/api/v9';

export async function atualizarAppDiscord(url, { verbose = true } = {}) {
  const log = (...args) => {
    if (verbose) console.log(`${cor.fraco}[Discord App Update Debug]${cor.fim}`, ...args);
  };

  if (!url || !url.startsWith('https://')) {
    log('❌ URL de túnel inválida fornecida:', url);
    return { ok: false, motivo: 'URL inválida' };
  }

  const env = lerEnv();
  const botToken = (env.DISCORD_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN || '').trim();
  const userToken = (env.DISCORD_USER_TOKEN || process.env.DISCORD_USER_TOKEN || '').trim();
  const clientId = (env.DISCORD_CLIENT_ID || process.env.DISCORD_CLIENT_ID || '').trim();

  const dominio = url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const redirectUri = `${url.replace(/\/+$/, '')}/auth/callback`;

  log(`Target Domain: "${dominio}"`);
  log(`Redirect URI: "${redirectUri}"`);
  log(`Client ID: ${clientId || 'Nenhum'}`);
  log(`BOT_TOKEN presente: ${Boolean(botToken)} (${botToken.length} chars)`);
  log(`USER_TOKEN presente: ${Boolean(userToken)} (${userToken.length} chars)`);

  if (!botToken && !userToken) {
    log('❌ Nenhum token (Bot ou User) configurado no .env.');
    return { ok: false, motivo: 'sem_token', dominio, redirectUri };
  }

  let atualizouTarget = false;
  let atualizouRedirect = false;
  let ultimoErro = null;

  // 1. Atualizar Activities -> URL Mappings Target via POST /applications/{clientId}/proxy-config
  if (userToken && clientId) {
    log('🔐 Atualizando Activities → URL Mappings Target via proxy-config API...');
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
          url_map: [{ prefix: '/', target: dominio }],
        }),
      });

      log(`  └─ POST ${proxyConfigUrl} -> Status ${proxyRes.status}`);

      if (proxyRes.ok) {
        atualizouTarget = true;
        log(`  └─ ✅ Activities URL Mappings Target atualizado para "${dominio}"!`);
      } else {
        const errText = await proxyRes.text();
        ultimoErro = errText;
        log(`  └─ ❌ Erro ao atualizar proxy-config (${proxyRes.status}):`, errText);
      }
    } catch (err) {
      ultimoErro = err.message;
      log('  └─ ❌ Exceção de rede no proxy-config:', err.message);
    }
  }

  // 2. Atualizar OAuth2 -> Redirects (via User Token ou Bot Token)
  const tokenParaRedirect = userToken || botToken;
  if (tokenParaRedirect) {
    const isBot = !userToken && botToken;
    const authHeader = isBot
      ? botToken.startsWith('Bot ')
        ? botToken
        : `Bot ${botToken}`
      : userToken.replace(/^(Bearer|Bot)\s+/, '');

    const appUrl = isBot ? `${API}/applications/@me` : `${API}/applications/${clientId}`;
    log(`🤖 Atualizando OAuth2 Redirects via ${isBot ? 'Bot' : 'User'} Token (${appUrl})...`);

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
          atualizouRedirect = true;
          log(`  └─ ✅ OAuth2 Redirects atualizado para "${redirectUri}"!`);
        } else {
          const patchErrText = await patchRes.text();
          ultimoErro = patchErrText;
          log(`  └─ ❌ Erro ao atualizar Redirects (${patchRes.status}):`, patchErrText);
        }
      } else {
        const getErrText = await getRes.text();
        log(`  └─ ❌ Falha ao ler aplicação (${getRes.status}):`, getErrText);
      }
    } catch (err) {
      ultimoErro = err.message;
      log('  └─ ❌ Exceção de rede ao atualizar Redirects:', err.message);
    }
  }

  return {
    ok: atualizouTarget || atualizouRedirect,
    atualizouTarget,
    atualizouRedirect,
    hasUserToken: Boolean(userToken),
    dominio,
    redirectUri,
    erro: ultimoErro,
  };
}

export async function autoAtualizarDiscordApp(url) {
  if (!url) return;
  const res = await atualizarAppDiscord(url, { verbose: true });

  if (res.ok) {
    console.log(
      `\n${cor.verde}${cor.forte}  ✅ Aplicação no Discord Atualizada com Sucesso!${cor.fim}`,
    );
    if (res.atualizouTarget) {
      console.log(`    └─ Activities → URL Mappings Target: ${cor.verde}${res.dominio}${cor.fim}`);
    }
    if (res.atualizouRedirect) {
      console.log(
        `    └─ OAuth2 → Redirect:               ${cor.verde}${res.redirectUri}${cor.fim}`,
      );
    }
    console.log('');
  }

  if (!res.hasUserToken) {
    console.log(
      `${cor.amarelo}  ⚠️ IMPORTANTE: DISCORD_BOT_TOKEN está configurado, mas DISCORD_USER_TOKEN não está no .env.${cor.fim}`,
    );
    console.log(
      `${cor.fraco}  - O OAuth2 Redirect foi ATUALIZADO AUTOMATICAMENTE para a nova URL: ${res.redirectUri}${cor.fim}`,
    );
    console.log(
      `${cor.fraco}  - Para o "Activities → URL Mappings Target" mudar automaticamente a cada inicialização, adicione no .env:${cor.fim}`,
    );
    console.log(`      ${cor.verde}DISCORD_USER_TOKEN=seu_user_token_aqui${cor.fim}\n`);
  }
}
