import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://elpfsixxbdnvwxhundxl.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_fPJXQn7F6qVRMiCGr51wxw_YTfZcZCg';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fetches a single room strictly by exact token or ID match.
 * Prevents bulk listing of active rooms and handles UUID vs short-token queries cleanly.
 */
export async function fetchRoomByToken(token: string) {
  if (!token) return null;
  const cleanToken = token.trim();
  const isUuid = UUID_REGEX.test(cleanToken);

  let query = supabase.from('rooms').select('*');
  if (isUuid) {
    query = query.or(`id.eq.${cleanToken},token.eq.${cleanToken}`);
  } else {
    query = query.eq('token', cleanToken);
  }

  const { data, error } = await query.maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    token: data.token || data.id,
    name: data.name || 'StreamRoom',
    owner: data.streamer_name || 'Host',
    password: data.password || null,
    locked: Boolean(data.password),
    status: data.status || 'live',
    tunnelUrl: data.tunnel_url || null,
  };
}

/**
 * Creates a room with a guaranteed non-null ID and short random token.
 */
export async function createRoomRecord({ token, name, password, streamerName, streamerId }: any) {
  const roomToken = token || crypto.randomUUID().slice(0, 6);
  const roomData = {
    id: roomToken,
    token: roomToken,
    name: name || `Stream ${roomToken}`,
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
