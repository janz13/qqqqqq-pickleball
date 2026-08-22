-- ============================================
-- QQQQQQ Pickleball — Supabase Database Schema
-- ============================================
-- This schema mirrors the Room/SQLite entities from the Android app
-- but is designed for PostgreSQL with Supabase Realtime support.

-- Enable Row Level Security on all tables
-- and enable realtime for player-facing subscriptions.

-- ─── Sessions ────────────────────────────────

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    join_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    owner_uid TEXT NOT NULL DEFAULT '',
    created_at_epoch_ms BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    courts_per_batch INT NOT NULL DEFAULT 1,
    queue_batches_shown INT NOT NULL DEFAULT 2,

    -- Branding (Phase 7f)
    logo_url TEXT,
    primary_color TEXT DEFAULT '#2E7D32',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Anyone can read active sessions by join code (for QR scan access)
CREATE POLICY "Anyone can read active sessions" ON sessions
    FOR SELECT USING (is_active = TRUE);

-- Only the owner can update/delete
CREATE POLICY "Owner can manage sessions" ON sessions
    FOR ALL USING (auth.uid()::TEXT = owner_uid);

-- ─── Players (Session-Scoped) ────────────────

CREATE TABLE IF NOT EXISTS session_players (
    id UUID NOT NULL,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    skill_level INT NOT NULL DEFAULT 3 CHECK (skill_level BETWEEN 1 AND 5),
    suggested_skill_level INT CHECK (suggested_skill_level BETWEEN 1 AND 5),
    photo_url TEXT,

    -- All-time stats (mirrored from roster for quick access)
    all_time_wins INT NOT NULL DEFAULT 0,
    all_time_losses INT NOT NULL DEFAULT 0,
    all_time_games_played INT NOT NULL DEFAULT 0,
    all_time_sessions_played INT NOT NULL DEFAULT 0,

    -- Session state
    session_games_played INT NOT NULL DEFAULT 0,
    session_wins INT NOT NULL DEFAULT 0,
    session_losses INT NOT NULL DEFAULT 0,
    consecutive_sit_outs INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'AVAILABLE'
        CHECK (status IN ('AVAILABLE', 'QUEUED', 'PLAYING', 'RESTING', 'CHECKED_OUT')),
    current_court_id UUID,
    queued_at_epoch_ms BIGINT NOT NULL DEFAULT 0,

    -- Mid-session join
    joined_session_at_epoch_ms BIGINT NOT NULL DEFAULT 0,
    is_latecomer BOOLEAN NOT NULL DEFAULT FALSE,
    catch_up_target_games INT NOT NULL DEFAULT 0,
    has_caught_up BOOLEAN NOT NULL DEFAULT TRUE,

    -- Recent history (stored as JSON arrays for flexibility)
    recent_partner_ids JSONB NOT NULL DEFAULT '[]'::JSONB,
    recent_opponent_ids JSONB NOT NULL DEFAULT '[]'::JSONB,

    -- Duo Queue
    locked_partner_id UUID,

    -- DUPR
    dupr_profile_url TEXT,

    PRIMARY KEY (id, session_id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE session_players ENABLE ROW LEVEL SECURITY;

-- Anyone can read players in active sessions
CREATE POLICY "Anyone can read session players" ON session_players
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM sessions s WHERE s.id = session_id AND s.is_active = TRUE)
    );

-- Only the session owner can modify
CREATE POLICY "Owner can manage session players" ON session_players
    FOR ALL USING (
        EXISTS (SELECT 1 FROM sessions s WHERE s.id = session_id AND auth.uid()::TEXT = s.owner_uid)
    );

-- ─── Roster (Persistent All-Time) ────────────

CREATE TABLE IF NOT EXISTS roster (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_uid TEXT NOT NULL,
    name TEXT NOT NULL,
    skill_level INT NOT NULL DEFAULT 3 CHECK (skill_level BETWEEN 1 AND 5),
    photo_url TEXT,
    all_time_wins INT NOT NULL DEFAULT 0,
    all_time_losses INT NOT NULL DEFAULT 0,
    all_time_games_played INT NOT NULL DEFAULT 0,
    all_time_sessions_played INT NOT NULL DEFAULT 0,
    dupr_profile_url TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE roster ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can manage roster" ON roster
    FOR ALL USING (auth.uid()::TEXT = owner_uid);

-- ─── Courts ──────────────────────────────────

CREATE TABLE IF NOT EXISTS courts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN', 'IN_PROGRESS', 'NEEDS_RESET')),
    current_match_id UUID,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE courts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read courts" ON courts
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM sessions s WHERE s.id = session_id AND s.is_active = TRUE)
    );

CREATE POLICY "Owner can manage courts" ON courts
    FOR ALL USING (
        EXISTS (SELECT 1 FROM sessions s WHERE s.id = session_id AND auth.uid()::TEXT = s.owner_uid)
    );

-- ─── Matches ─────────────────────────────────

CREATE TABLE IF NOT EXISTS matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    court_id UUID NOT NULL,
    team_a JSONB NOT NULL DEFAULT '[]'::JSONB,  -- array of player UUIDs
    team_b JSONB NOT NULL DEFAULT '[]'::JSONB,  -- array of player UUIDs
    started_at_epoch_ms BIGINT NOT NULL DEFAULT 0,
    ended_at_epoch_ms BIGINT,
    winner TEXT CHECK (winner IN ('A', 'B')),
    score_a INT,
    score_b INT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read matches" ON matches
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM sessions s WHERE s.id = session_id AND s.is_active = TRUE)
    );

CREATE POLICY "Owner can manage matches" ON matches
    FOR ALL USING (
        EXISTS (SELECT 1 FROM sessions s WHERE s.id = session_id AND auth.uid()::TEXT = s.owner_uid)
    );

-- ─── Announcements (TTS Queue) ───────────────

CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'general'
        CHECK (type IN ('court_assignment', 'court_open', 'player_call', 'milestone', 'general')),
    is_spoken BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read announcements" ON announcements
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM sessions s WHERE s.id = session_id AND s.is_active = TRUE)
    );

CREATE POLICY "Owner can manage announcements" ON announcements
    FOR ALL USING (
        EXISTS (SELECT 1 FROM sessions s WHERE s.id = session_id AND auth.uid()::TEXT = s.owner_uid)
    );

-- ─── Enable Supabase Realtime ────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE session_players;
ALTER PUBLICATION supabase_realtime ADD TABLE courts;
ALTER PUBLICATION supabase_realtime ADD TABLE matches;
ALTER PUBLICATION supabase_realtime ADD TABLE announcements;

-- ─── Indexes ─────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_session_players_session ON session_players(session_id);
CREATE INDEX IF NOT EXISTS idx_session_players_status ON session_players(session_id, status);
CREATE INDEX IF NOT EXISTS idx_courts_session ON courts(session_id);
CREATE INDEX IF NOT EXISTS idx_matches_session ON matches(session_id);
CREATE INDEX IF NOT EXISTS idx_matches_active ON matches(session_id) WHERE ended_at_epoch_ms IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_join_code ON sessions(join_code) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_roster_owner ON roster(owner_uid);

-- ─── Auto-update timestamps ──────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sessions_updated_at BEFORE UPDATE ON sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER session_players_updated_at BEFORE UPDATE ON session_players
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER roster_updated_at BEFORE UPDATE ON roster
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER courts_updated_at BEFORE UPDATE ON courts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER matches_updated_at BEFORE UPDATE ON matches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
