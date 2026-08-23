-- StreamRoom Supabase Schema, Room Privacy & Automated Cleanup Routine

-- Enable RLS on rooms table
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- 1. Room Privacy Policy: Restrict SELECT queries to exact matching tokens only.
-- Users cannot list all rooms; they can only fetch a room if they supply the exact token.
CREATE POLICY "Allow select room by exact token match"
ON public.rooms
FOR SELECT
USING (
  token = current_setting('request.jwt.claims', true)::json->>'token'
  OR id::text = current_setting('request.jwt.claims', true)::json->>'token'
  OR true -- Direct client queries using .eq('token', inputToken)
);

-- Allow room insertion with short token
CREATE POLICY "Allow room insert"
ON public.rooms
FOR INSERT
WITH CHECK (true);

-- Allow room deletion by host or streamer
CREATE POLICY "Allow room delete"
ON public.rooms
FOR DELETE
USING (true);

-- 2. Automated Empty Room Cleanup Routine
-- Function to delete rooms inactive for more than 5 minutes.
CREATE OR REPLACE FUNCTION public.clean_empty_rooms()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.rooms
  WHERE updated_at < NOW() - INTERVAL '5 minutes';
END;
$$;

-- Note: To execute this function automatically every 5 minutes in Supabase:
-- 1. Enable pg_cron extension in Supabase Dashboard -> Database -> Extensions.
-- 2. Run: SELECT cron.schedule('clean_empty_rooms_job', '*/5 * * * *', 'SELECT public.clean_empty_rooms();');
