-- PeerSync Migrations - Run this in Supabase SQL Editor
-- https://supabase.com/dashboard/project/ckgbxjystbrhjehayttg/sql

-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 1: Create users table
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    display_name TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'email',
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_provider ON public.users(provider);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own data" ON public.users;
CREATE POLICY "Users can read own data"
    ON public.users FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own data" ON public.users;
CREATE POLICY "Users can update own data"
    ON public.users FOR UPDATE
    USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Service role has full access" ON public.users;
CREATE POLICY "Service role has full access"
    ON public.users FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.users;
CREATE POLICY "Allow insert for authenticated users"
    ON public.users FOR INSERT WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_users_updated ON public.users;
CREATE TRIGGER on_users_updated
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 2: Add last_login_at
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
UPDATE public.users SET last_login_at = updated_at WHERE last_login_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 3: Networks & network_members (invite-code discovery)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.networks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invite_code TEXT UNIQUE NOT NULL,
    created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_networks_invite_code_lower ON public.networks (LOWER(invite_code));
CREATE INDEX IF NOT EXISTS idx_networks_created_by ON public.networks(created_by);

CREATE TABLE IF NOT EXISTS public.network_members (
    network_id UUID NOT NULL REFERENCES public.networks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (network_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_network_members_user_id ON public.network_members(user_id);
CREATE INDEX IF NOT EXISTS idx_network_members_network_id ON public.network_members(network_id);

ALTER TABLE public.networks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read networks they belong to" ON public.networks;
CREATE POLICY "Users can read networks they belong to"
    ON public.networks FOR SELECT
    USING (
        auth.uid() = created_by
        OR EXISTS (
            SELECT 1 FROM public.network_members nm
            WHERE nm.network_id = networks.id AND nm.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Service role has full access to networks" ON public.networks;
CREATE POLICY "Service role has full access to networks"
    ON public.networks FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can read own network memberships" ON public.network_members;
CREATE POLICY "Users can read own network memberships"
    ON public.network_members FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role has full access to network_members" ON public.network_members;
CREATE POLICY "Service role has full access to network_members"
    ON public.network_members FOR ALL USING (auth.role() = 'service_role');
