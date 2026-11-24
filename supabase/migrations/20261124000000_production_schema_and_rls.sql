-- Migration: Align Supabase schema with production `organizers` + `sessions` JSONB model
-- and lock down client-side write access via strict RLS policies.

CREATE TABLE IF NOT EXISTS public.organizers (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.organizers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only organizers" ON public.organizers;
CREATE POLICY "Service role only organizers" ON public.organizers
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.sessions (
    id TEXT PRIMARY KEY,
    join_code TEXT NOT NULL,
    owner_uid TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    state_json JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Drop permissive legacy policies if present
DROP POLICY IF EXISTS "Enable read access for all users" ON public.sessions;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.sessions;
DROP POLICY IF EXISTS "Enable update for all users" ON public.sessions;
DROP POLICY IF EXISTS "Enable delete for all users" ON public.sessions;
DROP POLICY IF EXISTS "Anyone can read active sessions" ON public.sessions;
DROP POLICY IF EXISTS "Owner can manage sessions" ON public.sessions;

DROP POLICY IF EXISTS "Public can read non-deleted sessions" ON public.sessions;
CREATE POLICY "Public can read non-deleted sessions" ON public.sessions
    FOR SELECT
    USING (
        owner_uid <> '__deleted__'
        AND COALESCE((state_json->'session'->>'deleted')::BOOLEAN, FALSE) = FALSE
    );

DROP POLICY IF EXISTS "Service role manages sessions" ON public.sessions;
CREATE POLICY "Service role manages sessions" ON public.sessions
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_sessions_join_code_upper
    ON public.sessions (UPPER(join_code));

CREATE INDEX IF NOT EXISTS idx_sessions_owner_updated
    ON public.sessions (owner_uid, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_active_updated
    ON public.sessions (is_active, updated_at DESC)
    WHERE is_active = TRUE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'sessions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
    END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS organizers_updated_at ON public.organizers;
CREATE TRIGGER organizers_updated_at
    BEFORE UPDATE ON public.organizers
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS sessions_updated_at ON public.sessions;
CREATE TRIGGER sessions_updated_at
    BEFORE UPDATE ON public.sessions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
