import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://elpfsixxbdnvwxhundxl.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_fPJXQn7F6qVRMiCGr51wxw_YTfZcZCg';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
