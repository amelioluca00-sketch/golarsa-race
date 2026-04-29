-- ================================================================
-- GOLARSA RACE — Auto-approvazione match dopo 24h
-- Incolla questo codice nel SQL Editor di Supabase ed eseguilo.
-- ================================================================

-- ── 1. Funzione che ricalcola la classifica di un torneo ─────────
CREATE OR REPLACE FUNCTION recompute_tournament_standings(p_torneo_id TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_torneo       RECORD;
  v_match        RECORD;
  v_is_fase1     BOOLEAN;
  v_pre_p1       INTEGER;
  v_pre_p2       INTEGER;
  v_diff         INTEGER;
  v_s1           INTEGER;
  v_s2           INTEGER;
  v_match_date   TEXT;
  v_inviato_il   TEXT;
  v_reset1       TEXT;
  v_reset2       TEXT;
BEGIN
  SELECT * INTO v_torneo FROM tournaments WHERE id = p_torneo_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Tabella temporanea per le statistiche (scoped a questa chiamata)
  DROP TABLE IF EXISTS _ps;
  CREATE TEMP TABLE _ps (
    id            TEXT PRIMARY KEY,
    stato         TEXT,
    full_payload  JSONB,
    punti         INTEGER,
    punti_base    INTEGER,
    vittorie      INTEGER,
    pareggi       INTEGER,
    sconfitte     INTEGER,
    gol_fatti     INTEGER,
    gol_subiti    INTEGER,
    match_giocati INTEGER,
    stats_reset_at TEXT
  );

  INSERT INTO _ps
  SELECT
    id,
    stato,
    payload,
    COALESCE((payload->>'punti_base')::INTEGER, 0),
    COALESCE((payload->>'punti_base')::INTEGER, 0),
    0, 0, 0, 0, 0, 0,
    payload->>'stats_reset_at'
  FROM players WHERE tournament_id = p_torneo_id;

  -- Elabora i match completati in ordine di data
  FOR v_match IN
    SELECT
      payload->>'giocatore1_id'                        AS g1_id,
      payload->>'giocatore2_id'                        AS g2_id,
      COALESCE((payload->>'score1')::INTEGER, 0)       AS score1,
      COALESCE((payload->>'score2')::INTEGER, 0)       AS score2,
      COALESCE(payload->>'data', payload->>'date', '') AS match_date,
      payload->>'inviato_il'                           AS inviato_il
    FROM matches
    WHERE tournament_id = p_torneo_id AND stato = 'completata'
    ORDER BY COALESCE(payload->>'data', payload->>'date', '') ASC
  LOOP
    IF NOT EXISTS (SELECT 1 FROM _ps WHERE id = v_match.g1_id) THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM _ps WHERE id = v_match.g2_id) THEN CONTINUE; END IF;

    v_s1          := v_match.score1;
    v_s2          := v_match.score2;
    v_match_date  := v_match.match_date;
    v_inviato_il  := v_match.inviato_il;

    SELECT stats_reset_at INTO v_reset1 FROM _ps WHERE id = v_match.g1_id;
    SELECT stats_reset_at INTO v_reset2 FROM _ps WHERE id = v_match.g2_id;

    -- Filtro reset manuale: ignora match precedenti al reset
    IF v_inviato_il IS NOT NULL THEN
      IF v_reset1 IS NOT NULL AND v_inviato_il < v_reset1 THEN CONTINUE; END IF;
      IF v_reset2 IS NOT NULL AND v_inviato_il < v_reset2 THEN CONTINUE; END IF;
    ELSIF v_match_date != '' THEN
      IF v_reset1 IS NOT NULL AND LEFT(v_match_date,10) < LEFT(v_reset1,10) THEN CONTINUE; END IF;
      IF v_reset2 IS NOT NULL AND LEFT(v_match_date,10) < LEFT(v_reset2,10) THEN CONTINUE; END IF;
    END IF;

    -- Fase 1 = prime 7 giorni dall'inizio torneo
    v_is_fase1 := FALSE;
    IF v_torneo.inizio IS NOT NULL AND v_match_date != '' THEN
      BEGIN
        v_is_fase1 := (v_match_date::DATE - v_torneo.inizio::DATE) < 7;
      EXCEPTION WHEN OTHERS THEN
        v_is_fase1 := FALSE;
      END;
    END IF;

    SELECT punti INTO v_pre_p1 FROM _ps WHERE id = v_match.g1_id;
    SELECT punti INTO v_pre_p2 FROM _ps WHERE id = v_match.g2_id;

    -- Aggiorna stats base
    UPDATE _ps SET
      match_giocati = match_giocati + 1,
      gol_fatti     = gol_fatti + v_s1,
      gol_subiti    = gol_subiti + v_s2,
      punti         = punti + v_s1 * 10
    WHERE id = v_match.g1_id;

    UPDATE _ps SET
      match_giocati = match_giocati + 1,
      gol_fatti     = gol_fatti + v_s2,
      gol_subiti    = gol_subiti + v_s1,
      punti         = punti + v_s2 * 10
    WHERE id = v_match.g2_id;

    IF v_s1 > v_s2 THEN
      UPDATE _ps SET vittorie  = vittorie  + 1 WHERE id = v_match.g1_id;
      UPDATE _ps SET sconfitte = sconfitte + 1 WHERE id = v_match.g2_id;
      IF NOT v_is_fase1 THEN
        v_diff := ABS(v_pre_p1 - v_pre_p2);
        UPDATE _ps SET punti = punti
          + CASE WHEN v_diff <= 50 THEN 10 WHEN v_diff <= 150 THEN 20 ELSE 30 END
          + CASE WHEN v_s1 - v_s2 >= 4 THEN 10 ELSE 0 END
        WHERE id = v_match.g1_id;
      END IF;

    ELSIF v_s2 > v_s1 THEN
      UPDATE _ps SET vittorie  = vittorie  + 1 WHERE id = v_match.g2_id;
      UPDATE _ps SET sconfitte = sconfitte + 1 WHERE id = v_match.g1_id;
      IF NOT v_is_fase1 THEN
        v_diff := ABS(v_pre_p1 - v_pre_p2);
        UPDATE _ps SET punti = punti
          + CASE WHEN v_diff <= 50 THEN 10 WHEN v_diff <= 150 THEN 20 ELSE 30 END
          + CASE WHEN v_s2 - v_s1 >= 4 THEN 10 ELSE 0 END
        WHERE id = v_match.g2_id;
      END IF;

    ELSE
      UPDATE _ps SET pareggi = pareggi + 1 WHERE id = v_match.g1_id;
      UPDATE _ps SET pareggi = pareggi + 1 WHERE id = v_match.g2_id;
    END IF;
  END LOOP;

  -- Salva stats aggiornate su ogni giocatore
  UPDATE players p
  SET payload = p.payload || jsonb_build_object(
    'punti',         s.punti,
    'vittorie',      s.vittorie,
    'pareggi',       s.pareggi,
    'sconfitte',     s.sconfitte,
    'gol_fatti',     s.gol_fatti,
    'gol_subiti',    s.gol_subiti,
    'match_giocati', s.match_giocati
  )
  FROM _ps s
  WHERE p.id = s.id AND p.tournament_id = p_torneo_id;

  -- Calcola e salva standings
  UPDATE tournaments
  SET standings = (
    WITH ranked AS (
      SELECT
        p.payload || jsonb_build_object(
          'punti',         s.punti,
          'vittorie',      s.vittorie,
          'pareggi',       s.pareggi,
          'sconfitte',     s.sconfitte,
          'gol_fatti',     s.gol_fatti,
          'gol_subiti',    s.gol_subiti,
          'match_giocati', s.match_giocati,
          'rank', ROW_NUMBER() OVER (
            ORDER BY s.punti DESC,
                     s.vittorie DESC,
                     (s.gol_fatti - s.gol_subiti) DESC
          )
        ) AS pj
      FROM _ps s
      JOIN players p ON p.id = s.id AND p.tournament_id = p_torneo_id
    )
    SELECT jsonb_agg(pj ORDER BY (pj->>'rank')::INTEGER)
    FROM ranked
  )
  WHERE id = p_torneo_id;

  DROP TABLE IF EXISTS _ps;
END;
$$;


-- ── 2. Funzione principale: approva i match scaduti ──────────────
CREATE OR REPLACE FUNCTION auto_approve_expired_matches()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_match        RECORD;
  v_cutoff       TIMESTAMPTZ;
  v_today        TEXT;
  v_new_payload  JSONB;
  v_affected     TEXT[];
  v_torneo_id    TEXT;
  v_count        INTEGER := 0;
  v_inviato_il   TEXT;
BEGIN
  v_cutoff  := NOW() - INTERVAL '24 hours';
  v_today   := to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD');
  v_affected := ARRAY[]::TEXT[];

  FOR v_match IN
    SELECT id, tournament_id, payload, created_at
    FROM matches
    WHERE stato = 'in_attesa'
      AND created_at < v_cutoff
  LOOP
    -- Controlla inviato_il nel payload (più preciso di created_at)
    v_inviato_il := v_match.payload->>'inviato_il';
    IF v_inviato_il IS NOT NULL
       AND v_inviato_il::TIMESTAMPTZ >= v_cutoff THEN
      CONTINUE;
    END IF;

    v_new_payload := v_match.payload || jsonb_build_object(
      'stato', 'completata',
      'data',  v_today,
      'date',  v_today
    );

    UPDATE matches
    SET stato = 'completata', payload = v_new_payload
    WHERE id = v_match.id;

    v_count := v_count + 1;

    IF NOT (v_match.tournament_id = ANY(v_affected)) THEN
      v_affected := array_append(v_affected, v_match.tournament_id);
    END IF;
  END LOOP;

  -- Ricalcola classifica per ogni torneo coinvolto
  FOREACH v_torneo_id IN ARRAY v_affected LOOP
    PERFORM recompute_tournament_standings(v_torneo_id);
  END LOOP;

  RETURN v_count;
END;
$$;

-- ── 3. Permessi per chiamare la funzione via HTTP ────────────────
GRANT EXECUTE ON FUNCTION auto_approve_expired_matches() TO anon;
GRANT EXECUTE ON FUNCTION recompute_tournament_standings(TEXT) TO anon;
