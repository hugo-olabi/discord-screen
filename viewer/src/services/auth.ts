import { DiscordSDK } from '@discord/embedded-app-sdk';
import { supabase } from './supabase.js';

const DISCORD_CLIENT_ID = '1540065649181724722';
let discordSdkInstance: DiscordSDK | null = null;

/**
 * Detects if StreamRoom is running as a Discord Activity (Embedded App inside Discord iframe).
 */
export function isDiscordActivity(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  const isIframe = window.self !== window.top;
  const hasDiscordParams =
    params.has('frame_id') ||
    params.has('instance_id') ||
    params.has('channel_id') ||
    params.has('guild_id');
  const isDiscordNative = Boolean((window as any).DiscordNative);

  return isIframe || hasDiscordParams || isDiscordNative;
}

/**
 * Initializes Discord Embedded App SDK and automatically logs in the Discord user
 * when running inside a Discord Activity.
 */
export async function initDiscordActivity() {
  if (!isDiscordActivity()) return null;

  // 1. Fast path: return cached Discord Activity user if already authenticated
  const cached =
    localStorage.getItem('streamroom_discord_user') ||
    localStorage.getItem('streamroom_logged_user');
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.isDiscord) {
        return parsed;
      }
    } catch {}
  }

  // 2. Authenticate via Discord Embedded App SDK
  try {
    if (!discordSdkInstance) {
      discordSdkInstance = new DiscordSDK(DISCORD_CLIENT_ID);
    }

    await discordSdkInstance.ready();

    // Authorize with Discord Embedded App SDK
    const { code } = await discordSdkInstance.commands.authorize({
      client_id: DISCORD_CLIENT_ID,
      response_type: 'code',
      state: '',
      prompt: 'none',
      scope: ['identify', 'guilds'],
    });

    // Authenticate to get user details
    const auth = await discordSdkInstance.commands.authenticate({ access_token: code });
    if (auth?.user) {
      const user = {
        id: auth.user.id,
        name: auth.user.global_name || auth.user.username || 'Discord User',
        avatar: auth.user.avatar
          ? `https://cdn.discordapp.com/avatars/${auth.user.id}/${auth.user.avatar}.png`
          : null,
        isDiscord: true,
        isActivity: true,
      };
      localStorage.setItem('streamroom_discord_user', JSON.stringify(user));
      localStorage.setItem('streamroom_logged_user', JSON.stringify(user));
      return user;
    }
  } catch (err) {
    console.warn('[Discord Activity Auth Warning]', err);
  }

  // 3. Fallback Activity user (never log out in activity)
  const fallbackUser = {
    id: 'discord-activity-user',
    name: 'Discord Member',
    avatar: null,
    isDiscord: true,
    isActivity: true,
  };
  localStorage.setItem('streamroom_discord_user', JSON.stringify(fallbackUser));
  localStorage.setItem('streamroom_logged_user', JSON.stringify(fallbackUser));
  return fallbackUser;
}

export function generateShortToken(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let token = '';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    token += chars[randomValues[i] % chars.length];
  }
  return token;
}

export async function loginWithDiscord() {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) {
      if (error.message?.includes('provider is not enabled') || error.status === 400) {
        throw new Error(
          'Discord OAuth provider is not enabled in your Supabase Dashboard. Go to Supabase -> Authentication -> Providers -> Discord to enable it, or edit your display name in Profile.'
        );
      }
      throw error;
    }
    return data;
  } catch (err) {
    if (err.message?.includes('validation_failed') || err.message?.includes('provider is not enabled')) {
      throw new Error(
        'Discord OAuth provider is not enabled in Supabase. Enable Discord in Supabase Dashboard -> Authentication -> Providers, or set your display name in Profile.',
        { cause: err }
      );
    }
    throw err;
  }
}

export async function logoutDiscord() {
  try {
    await supabase.auth.signOut();
  } catch {}
  localStorage.removeItem('streamroom_logged_user');
  localStorage.removeItem('streamroom_discord_user');
  localStorage.removeItem('streamroom_user_name');
  localStorage.removeItem('streamroom_user_id');
}

export async function getCurrentUser() {
  // If running inside Discord Activity, auto-login with Discord Activity user
  if (isDiscordActivity()) {
    const activityUser = await initDiscordActivity();
    if (activityUser) {
      return activityUser;
    }
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const user = session.user;
      const loggedUser = {
        id: user.id,
        name: user.user_metadata?.full_name || user.user_metadata?.custom_claims?.global_name || user.email?.split('@')[0] || 'Discord User',
        avatar: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
        isDiscord: true,
        isActivity: false,
      };
      localStorage.setItem('streamroom_logged_user', JSON.stringify(loggedUser));
      return loggedUser;
    }
  } catch {
    /* Fallback to stored user */
  }

  const cached = localStorage.getItem('streamroom_logged_user');
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {}
  }

  const savedName = localStorage.getItem('streamroom_user_name');
  const savedId = localStorage.getItem('streamroom_user_id') || crypto.randomUUID();
  localStorage.setItem('streamroom_user_id', savedId);

  return {
    id: savedId,
    name: savedName || 'Guest User',
    avatar: null,
    isDiscord: false,
    isActivity: false,
  };
}
