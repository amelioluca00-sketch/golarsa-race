-- ================================================================
-- GOLARSA RACE — Funzione RPC per aggiornare il profilo giocatore
--
-- ESEGUI QUESTO NEL SQL EDITOR DI SUPABASE (una sola volta).
-- Risolve il problema del salvataggio info giocatore:
-- usa SECURITY DEFINER per aggirare qualsiasi problema RLS
-- e l'operatore || per un merge atomico del payload JSONB.
-- ================================================================

CREATE OR REPLACE FUNCTION update_player_profile(
  p_player_id TEXT,
  p_profile   JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE players
  SET payload = payload || p_profile
  WHERE id = p_player_id;
END;
$$;

-- Permette la chiamata sia ad utenti anonimi che autenticati
GRANT EXECUTE ON FUNCTION update_player_profile(TEXT, JSONB) TO anon, authenticated;
