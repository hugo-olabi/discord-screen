import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://elpfsixxbdnvwxhundxl.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_fPJXQn7F6qVRMiCGr51wxw_YTfZcZCg';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Fetches a single room strictly by exact token match.
 * Prevents bulk listing of active rooms.
 */
export async function fetchRoomByToken(token) {
  if (!token) return null;
  const cleanToken = token.trim();

  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .or(`id.eq.${cleanToken},token.eq.${cleanToken}`)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    token: data.token || data.id,
    name: data.name || 'StreamRoom',
    owner: data.streamer_name || 'Host',
    password: data.password || null,
    locked: Boolean(data.password),
    status: data.status || 'live',
  };
}

/**
 * Creates a room with a short 6-character random token.
 */
export async function createRoomRecord({ token, name, password, streamerName, streamerId }) {
  const roomData = {
    id: token,
    token: token,
    name: name || `Stream ${token}`,
    password: password || null,
    streamer_id: streamerId || null,
    streamer_name: streamerName || 'Host',
    status: 'live',
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('rooms').insert(roomData).select().single();
  if (error) throw error;
  return data;
}

/**
 * Deletes empty or inactive rooms updated more than 5 minutes ago.
 */
export async function cleanupInactiveRooms() {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  try {
    await supabase.from('rooms').delete().lt('updated_at', fiveMinutesAgo);
  } catch {
    /* ignore background cleanup failures */
  }
}
