-- ═══════════════════════════════════════════════════════════════════════════════
-- PeerSync Users Table
-- ═══════════════════════════════════════════════════════════════════════════════
-- This table syncs user data from Supabase Auth to enable
-- custom queries and relations with other tables.
--
-- Run via: npx supabase db push (when linked)
-- Or copy to Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- Create users table in public schema
CREATE TABLE IF NOT EXISTS public.users (
    -- User ID from Supabase Auth (UUID)
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- User email
    email TEXT NOT NULL,
    
    -- Display name (from OAuth profile or email prefix)
    display_name TEXT NOT NULL,
    
    -- Auth provider (github, google, email, etc.)
    provider TEXT NOT NULL DEFAULT 'email',
    
    -- Avatar URL (from OAuth profile)
    avatar_url TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on email for lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- Create index on provider for filtering
CREATE INDEX IF NOT EXISTS idx_users_provider ON public.users(provider);

-- Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own data
DROP POLICY IF EXISTS "Users can read own data" ON public.users;
CREATE POLICY "Users can read own data"
    ON public.users
    FOR SELECT
    USING (auth.uid() = id);

-- Policy: Users can update their own data
DROP POLICY IF EXISTS "Users can update own data" ON public.users;
CREATE POLICY "Users can update own data"
    ON public.users
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Policy: Service role can do everything (for backend sync)
DROP POLICY IF EXISTS "Service role has full access" ON public.users;
CREATE POLICY "Service role has full access"
    ON public.users
    FOR ALL
    USING (auth.role() = 'service_role');

-- Policy: Allow insert for authenticated users (for first login sync)
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.users;
CREATE POLICY "Allow insert for authenticated users"
    ON public.users
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function on update
DROP TRIGGER IF EXISTS on_users_updated ON public.users;
CREATE TRIGGER on_users_updated
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
