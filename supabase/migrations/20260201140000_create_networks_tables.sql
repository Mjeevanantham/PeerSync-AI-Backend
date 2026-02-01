-- ═══════════════════════════════════════════════════════════════════════════════
-- PeerSync Networks & Network Members (Invite-Code Based Discovery)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Users join a network via invite code. Peer discovery is scoped ONLY to the
-- same network. Backend is the source of truth.
--
-- Run via: npx supabase db push (when linked)
-- Or copy to Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- Networks: one per "room"; invite_code is unique and case-insensitive (normalized)
CREATE TABLE IF NOT EXISTS public.networks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invite_code TEXT UNIQUE NOT NULL,
    created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_networks_invite_code_lower
    ON public.networks (LOWER(invite_code));

CREATE INDEX IF NOT EXISTS idx_networks_created_by ON public.networks(created_by);

-- Network members: which users are in which network (one active network per user for MVP)
CREATE TABLE IF NOT EXISTS public.network_members (
    network_id UUID NOT NULL REFERENCES public.networks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (network_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_network_members_user_id ON public.network_members(user_id);
CREATE INDEX IF NOT EXISTS idx_network_members_network_id ON public.network_members(network_id);

-- RLS
ALTER TABLE public.networks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_members ENABLE ROW LEVEL SECURITY;

-- Networks: creator can read; service role full access
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
    ON public.networks FOR ALL
    USING (auth.role() = 'service_role');

-- Network members: members can read; service role full access
DROP POLICY IF EXISTS "Users can read own network memberships" ON public.network_members;
CREATE POLICY "Users can read own network memberships"
    ON public.network_members FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role has full access to network_members" ON public.network_members;
CREATE POLICY "Service role has full access to network_members"
    ON public.network_members FOR ALL
    USING (auth.role() = 'service_role');
