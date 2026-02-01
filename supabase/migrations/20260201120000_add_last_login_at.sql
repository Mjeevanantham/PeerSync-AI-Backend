-- Add last_login_at column to public.users
-- Used to track when user last authenticated (for sync/analytics)

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Backfill existing rows (optional)
UPDATE public.users SET last_login_at = updated_at WHERE last_login_at IS NULL;
