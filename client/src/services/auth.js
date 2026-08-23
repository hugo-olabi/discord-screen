import { supabase } from './supabase.js';

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
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'discord',
    options: {
      redirectTo: window.location.origin,
    },
  });
  if (error) throw error;
  return data;
}

export async function logoutDiscord() {
  await supabase.auth.signOut();
}

export async function getCurrentUser() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const user = session.user;
      return {
        id: user.id,
        name: user.user_metadata?.full_name || user.user_metadata?.custom_claims?.global_name || user.email?.split('@')[0] || 'Discord User',
        avatar: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
        isDiscord: true,
      };
    }
  } catch {
    /* Fallback to local user */
  }

  const savedName = localStorage.getItem('streamroom_user_name');
  const savedId = localStorage.getItem('streamroom_user_id') || crypto.randomUUID();
  localStorage.setItem('streamroom_user_id', savedId);

  return {
    id: savedId,
    name: savedName || 'Guest User',
    avatar: null,
    isDiscord: false,
  };
}
