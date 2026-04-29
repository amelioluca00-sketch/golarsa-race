-- ================================================================
-- GOLARSA RACE — Schema Supabase
-- Esegui questo nel SQL Editor del tuo progetto Supabase
-- ================================================================

-- 1. TABELLA TORNEI
CREATE TABLE IF NOT EXISTS tournaments (
  id           TEXT PRIMARY KEY,
  nome         TEXT NOT NULL,
  inizio       TEXT,
  fine         TEXT,
  max_iscritti INTEGER DEFAULT 0,
  stato        TEXT DEFAULT 'in corso',
  standings    JSONB DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABELLA GIOCATORI
-- `payload` contiene l'oggetto giocatore completo (stats, nazionalità, ecc.)
-- `email` e `stato` sono colonne reali per query veloci
CREATE TABLE IF NOT EXISTS players (
  id            TEXT PRIMARY KEY,
  tournament_id TEXT REFERENCES tournaments(id) ON DELETE CASCADE,
  email         TEXT DEFAULT '',
  stato         TEXT DEFAULT 'pendente',
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABELLA PARTITE
-- `payload` contiene l'oggetto partita completo
CREATE TABLE IF NOT EXISTS matches (
  id            TEXT PRIMARY KEY,
  tournament_id TEXT REFERENCES tournaments(id) ON DELETE CASCADE,
  stato         TEXT DEFAULT 'programmata',
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- ROW LEVEL SECURITY
-- Lettura pubblica, scrittura tramite anon key (admin via app)
-- ================================================================

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE players     ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches     ENABLE ROW LEVEL SECURITY;

-- Tutti possono leggere
CREATE POLICY "read_public" ON tournaments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "read_public" ON players     FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "read_public" ON matches     FOR SELECT TO anon, authenticated USING (true);

-- Solo anon (app) può scrivere
CREATE POLICY "write_anon"  ON tournaments FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "write_anon"  ON players     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "write_anon"  ON matches     FOR ALL TO anon USING (true) WITH CHECK (true);

-- ================================================================
-- INDICI per performance
-- ================================================================
CREATE INDEX IF NOT EXISTS idx_players_tournament ON players(tournament_id);
CREATE INDEX IF NOT EXISTS idx_players_email      ON players(email);
CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournament_id);
