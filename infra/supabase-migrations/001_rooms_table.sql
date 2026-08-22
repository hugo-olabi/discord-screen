-- Migration: Create rooms table for direct tunnel screen sharing
CREATE TABLE IF NOT EXISTS public.rooms (
    id TEXT PRIMARY KEY,
    guild_id TEXT DEFAULT '',
    channel_id TEXT DEFAULT '',
    name TEXT NOT NULL,
    streamer_id TEXT DEFAULT '',
    tunnel_url TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'waiting', -- 'waiting', 'live', 'closed'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS (Row Level Security)
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- Allow anon/public access for rooms management
CREATE POLICY "Allow public read rooms" ON public.rooms FOR SELECT USING (true);
CREATE POLICY "Allow public insert rooms" ON public.rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update rooms" ON public.rooms FOR UPDATE USING (true);
CREATE POLICY "Allow public delete rooms" ON public.rooms FOR DELETE USING (true);

-- Enable Supabase Realtime for instant notification to viewers when tunnel_url is set
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
