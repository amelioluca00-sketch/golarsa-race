/**
 * storage-manager.js
 * Data layer Supabase per Golarsa Race.
 * Tutte le funzioni di scrittura sono async.
 * Le funzioni di lettura leggono da una cache in memoria,
 * caricata con SM.load(torneoId) prima del render.
 */

(function () {
  var SUPABASE_URL = 'https://efkavbdfzhyuixuvgtqd.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_pBMN8gWe5KDrAAPvAAIMkQ_g8GI-KzP';
  var db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // ── Cache in memoria ──────────────────────────────────────────────
  // Struttura: { [torneoId]: { torneo, players, matches, standings } }
  var _cache = {};

  // ── Helpers ───────────────────────────────────────────────────────
  function playerFromRow(row) {
    return Object.assign({}, row.payload, { id: row.id, email: row.email, stato: row.stato });
  }
  function matchFromRow(row) {
    return Object.assign({}, row.payload, { id: row.id, stato: row.stato });
  }
  function torneoFromRow(t) {
    return {
      id:          t.id,
      nome:        t.nome,
      inizio:      t.inizio,
      fine:        t.fine,
      maxIscritti: t.max_iscritti,
      stato:       t.stato,
      standings:   t.standings || [],
    };
  }

  // Campi profilo impostati dall'utente — non devono mai essere sovrascritti da _recompute o savePlayers
  var PROFILE_FIELDS = ['eta', 'peso', 'altezza', 'mano', 'superficie', 'rovescio', 'disponibilita'];

  var SM = {

    // ── CARICAMENTO (async, popola cache) ─────────────────────────

    /** Carica dati completi di un torneo in cache. Restituisce i dati. */
    load: async function (torneoId) {
      if (!torneoId) return null;
      var tRes = await db.from('tournaments').select('*').eq('id', torneoId).single();
      if (!tRes.data) return null;
      var pRes = await db.from('players').select('*').eq('tournament_id', torneoId);
      var mRes = await db.from('matches').select('*').eq('tournament_id', torneoId);
      var torneo    = torneoFromRow(tRes.data);
      var players   = (pRes.data || []).map(playerFromRow);
      var matches   = (mRes.data || []).map(matchFromRow);
      var standings = tRes.data.standings || [];
      var data = { torneo, players, matches, standings: standings };
      _cache[torneoId] = data;

      // Auto-heal: standings vuoti ma giocatori approvati → ricalcola una volta
      var hasApproved = players.some(function (p) { return p.stato === 'approvato'; });
      if (!standings.length && hasApproved) {
        await SM._recompute(torneoId, players, matches);
        // Rileggi standings aggiornati dal server
        var healed = await db.from('tournaments').select('standings').eq('id', torneoId).single();
        if (healed.data) {
          data.standings = healed.data.standings || [];
          _cache[torneoId].standings = data.standings;
          if (_cache[torneoId].torneo) _cache[torneoId].torneo.standings = data.standings;
        }
      }

      return data;
    },

    /** Carica lista tornei e la restituisce (non va in cache per-torneo). */
    loadTournaments: async function () {
      var res = await db.from('tournaments').select('*').order('created_at', { ascending: false });
      return (res.data || []).map(torneoFromRow);
    },

    // ── LETTURE SINCRONE (dalla cache) ─────────────────────────────

    getTournamentData: function (id) {
      return _cache[id] || null;
    },

    getPlayers: function (id) {
      return (_cache[id] || {}).players || [];
    },

    getMatches: function (id) {
      return (_cache[id] || {}).matches || [];
    },

    // ── SCRITTURE ASYNC ───────────────────────────────────────────

    /** Crea o aggiorna un torneo. */
    saveTournament: async function (torneo) {
      var res = await db.from('tournaments').upsert({
        id:          torneo.id,
        nome:        torneo.nome,
        inizio:      torneo.inizio  || null,
        fine:        torneo.fine    || null,
        max_iscritti: torneo.maxIscritti || 0,
        stato:       torneo.stato   || 'in corso',
        standings:   torneo.standings || [],
      });
      if (res.error) console.error('[SM] saveTournament:', res.error);
    },

    /** Elimina un torneo (cascade su players e matches). */
    deleteTournament: async function (torneoId) {
      await db.from('tournaments').delete().eq('id', torneoId);
      delete _cache[torneoId];
    },

    /** Elimina tutti i tornei (cascade su players e matches). */
    clearAll: async function () {
      await db.from('tournaments').delete().neq('id', '');
      _cache = {};
    },

    /** Sovrascrive la lista giocatori di un torneo + ricalcola standings.
     *  Usa upsert + delete selettivo per evitare finestre di perdita dati.
     *  Preserva sempre i campi profilo utente (eta, peso, altezza, ecc.) dal DB. */
    savePlayers: async function (torneoId, players) {
      // 1. Leggi payload e ID attualmente presenti nel DB
      //    (serve sia per gli ID da cancellare sia per preservare i campi profilo)
      var existingRes = await db.from('players').select('id, payload').eq('tournament_id', torneoId);
      var existingIds = [];
      var existingPayloadMap = {};
      (existingRes.data || []).forEach(function (r) {
        existingIds.push(r.id);
        existingPayloadMap[r.id] = r.payload || {};
      });
      var newIds = players.map(function (p) { return p.id; });

      // 2. Upsert tutti i giocatori preservando i campi profilo dal DB
      if (players.length) {
        var rows = players.map(function (p) {
          var existingPayload = existingPayloadMap[p.id] || {};
          var mergedPayload = Object.assign({}, p);
          // I campi profilo dal DB hanno sempre precedenza (l'utente li gestisce autonomamente)
          PROFILE_FIELDS.forEach(function (field) {
            if (existingPayload[field] !== undefined) mergedPayload[field] = existingPayload[field];
          });
          return { id: p.id, tournament_id: torneoId, email: p.email || '', stato: p.stato || 'pendente', payload: mergedPayload };
        });
        var res = await db.from('players').upsert(rows);
        if (res.error) console.error('[SM] savePlayers upsert:', res.error);
      }

      // 3. Cancella solo i giocatori rimossi dall'array
      var toDelete = existingIds.filter(function (id) { return newIds.indexOf(id) === -1; });
      if (toDelete.length) {
        var delRes = await db.from('players').delete().in('id', toDelete);
        if (delRes.error) console.error('[SM] savePlayers delete:', delRes.error);
      }

      await SM._recompute(torneoId, players, null);
    },

    /** Sovrascrive la lista partite di un torneo + ricalcola stats.
     *  Usa upsert + delete selettivo per evitare finestre di perdita dati. */
    saveMatches: async function (torneoId, matches) {
      // 1. Leggi gli ID attualmente presenti nel DB
      var existingRes = await db.from('matches').select('id').eq('tournament_id', torneoId);
      var existingIds = (existingRes.data || []).map(function (r) { return r.id; });
      var newIds = matches.map(function (m) { return m.id; });

      // 2. Upsert tutti i match dell'array (insert o update, mai delete totale)
      if (matches.length) {
        var rows = matches.map(function (m) {
          return { id: m.id, tournament_id: torneoId, stato: m.stato || 'programmata', payload: m };
        });
        var res = await db.from('matches').upsert(rows);
        if (res.error) console.error('[SM] saveMatches upsert:', res.error);
      }

      // 3. Cancella solo i match rimossi dall'array
      var toDelete = existingIds.filter(function (id) { return newIds.indexOf(id) === -1; });
      if (toDelete.length) {
        var delRes = await db.from('matches').delete().in('id', toDelete);
        if (delRes.error) console.error('[SM] saveMatches delete:', delRes.error);
      }

      await SM._recompute(torneoId, null, matches);
    },

    /** Cambia stato iscrizione (pendente → approvato/rifiutato). */
    updatePlayerStatus: async function (torneoId, playerId, stato) {
      // Aggiorna riga player
      var pRes = await db.from('players').select('payload').eq('id', playerId).single();
      if (pRes.data) {
        var payload = Object.assign({}, pRes.data.payload, { stato: stato });
        await db.from('players').update({ stato: stato, payload: payload }).eq('id', playerId);
      }
      // Ricarica tutti i giocatori del torneo e ricalcola standings da zero
      // (il semplice map non aggiunge nuovi giocatori se non erano già in standings)
      var allRes = await db.from('players').select('*').eq('tournament_id', torneoId);
      var freshPlayers = (allRes.data || []).map(playerFromRow);
      var mRes = await db.from('matches').select('*').eq('tournament_id', torneoId);
      var freshMatches = (mRes.data || []).map(matchFromRow);
      await SM._recompute(torneoId, freshPlayers, freshMatches);
    },

    /** Aggiunge un singolo match in attesa di approvazione (non sovrascrive gli esistenti). */
    addPendingMatch: async function (torneoId, matchData) {
      var id = matchData.id || ('match_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));
      var match = Object.assign({}, matchData, { id: id, stato: 'in_attesa', inviato_il: new Date().toISOString() });
      var res = await db.from('matches').insert({
        id:            id,
        tournament_id: torneoId,
        stato:         'in_attesa',
        payload:       match,
      });
      if (res.error) { console.error('[SM] addPendingMatch:', res.error); return null; }
      return match;
    },

    /**
     * Ricarica SOLO i match dal DB e aggiorna in-place l'array in cache,
     * così i riferimenti già acquisiti dai render restano validi.
     * Usato per mostrare sfide aperte create da altri giocatori senza reload.
     */
    reloadMatches: async function (torneoId) {
      if (!torneoId) return [];
      var mRes = await db.from('matches').select('*').eq('tournament_id', torneoId);
      if (mRes.error) { console.error('[SM] reloadMatches:', mRes.error); }
      var fresh = (mRes.data || []).map(matchFromRow);
      if (_cache[torneoId] && _cache[torneoId].matches) {
        var arr = _cache[torneoId].matches;
        arr.length = 0;
        fresh.forEach(function (m) { arr.push(m); });
        return arr;
      }
      return fresh;
    },

    /**
     * Crea una SFIDA APERTA: un match con stato 'aperta' e un solo giocatore (il creatore).
     * Gli altri giocatori potranno iscriversi finché resta aperta.
     */
    createOpenChallenge: async function (torneoId, sfidaData) {
      var id = 'sfida_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      var match = Object.assign({}, sfidaData, {
        id:        id,
        stato:     'aperta',
        creato_il: new Date().toISOString(),
      });
      var res = await db.from('matches').insert({
        id:            id,
        tournament_id: torneoId,
        stato:         'aperta',
        payload:       match,
      });
      if (res.error) { console.error('[SM] createOpenChallenge:', res.error); return null; }
      // Aggiorna la cache in memoria così il render successivo è coerente
      if (_cache[torneoId] && _cache[torneoId].matches) _cache[torneoId].matches.push(match);
      return match;
    },

    /**
     * Iscrive un giocatore a una sfida aperta: imposta il secondo giocatore
     * e porta lo stato a 'programmata' (il match entra tra i programmati).
     * Restituisce il match aggiornato, oppure null se non più disponibile.
     */
    joinOpenChallenge: async function (torneoId, matchId, joiner) {
      var mRes = await db.from('matches').select('payload, stato').eq('id', matchId).single();
      if (!mRes.data) { console.error('[SM] joinOpenChallenge: match non trovato', matchId); return null; }
      // Già preso da qualcun altro
      if (mRes.data.stato !== 'aperta') return null;
      var payload = Object.assign({}, mRes.data.payload, {
        giocatore2_id:   joiner.giocatore2_id,
        giocatore2_nome: joiner.giocatore2_nome,
        giocatore2_tel:  joiner.giocatore2_tel,
        stato:           'programmata',
        iscritto_il:     new Date().toISOString(),
      });
      var updRes = await db.from('matches').update({ stato: 'programmata', payload: payload }).eq('id', matchId);
      if (updRes.error) { console.error('[SM] joinOpenChallenge update:', updRes.error); return null; }
      // Aggiorna la cache in memoria
      if (_cache[torneoId] && _cache[torneoId].matches) {
        var cm = _cache[torneoId].matches.find(function (m) { return m.id === matchId; });
        if (cm) Object.assign(cm, payload, { stato: 'programmata' });
      }
      return Object.assign({}, payload, { id: matchId });
    },

    /**
     * Salva i punti di un singolo giocatore senza rieseguire _recompute.
     * Usato per le modifiche manuali alla classifica dalla dashboard.
     */
    saveManualPoints: async function (torneoId, playerId, newPunti) {
      // 1. Aggiorna il payload del giocatore in DB
      var pRes = await db.from('players').select('payload').eq('id', playerId).single();
      if (!pRes.data) { console.error('[SM] saveManualPoints: giocatore non trovato', playerId); return; }

      // Registra il timestamp del reset manuale e il valore base impostato dall'admin.
      // _recompute() userà stats_reset_at per ignorare i match precedenti a questa data,
      // e partirà da punti_base invece che da 0. In questo modo le modifiche manuali
      // sopravvivono ai ricalcoli successivi (es. approvazione match contestati).
      var resetAt = new Date().toISOString();
      var payload = Object.assign({}, pRes.data.payload, {
        punti:          newPunti,
        punti_base:     newPunti,
        stats_reset_at: resetAt,
      });
      var updRes = await db.from('players').update({ payload: payload }).eq('id', playerId);
      if (updRes.error) { console.error('[SM] saveManualPoints player update:', updRes.error); }

      // 2. Usa la cache per costruire i nuovi standings (evita read-after-write stale)
      //    Poi aggiorna il giocatore direttamente nell'array in memoria.
      var allPlayers;
      if (_cache[torneoId] && _cache[torneoId].players && _cache[torneoId].players.length) {
        allPlayers = _cache[torneoId].players.map(function (p) { return Object.assign({}, p); });
        var target = allPlayers.find(function (p) { return p.id === playerId; });
        if (target) { target.punti = newPunti; target.punti_base = newPunti; target.stats_reset_at = resetAt; }
      } else {
        // Fallback: rilegge dal DB (improbabile ma sicuro)
        var allRes = await db.from('players').select('*').eq('tournament_id', torneoId);
        allPlayers = (allRes.data || []).map(playerFromRow);
        var t2 = allPlayers.find(function (p) { return p.id === playerId; });
        if (t2) { t2.punti = newPunti; t2.punti_base = newPunti; t2.stats_reset_at = resetAt; }
      }

      // 3. Ricalcola classifica (solo ordinamento, nessun reset delle stats)
      var standings = allPlayers.slice()
        .sort(function (a, b) {
          if (b.punti !== a.punti) return b.punti - a.punti;
          return b.vittorie - a.vittorie;
        })
        .map(function (p, i) { return Object.assign({}, p, { rank: i + 1 }); });

      // 4. Salva standings su Supabase (home page li legge da qui)
      var stRes = await db.from('tournaments').update({ standings: standings }).eq('id', torneoId);
      if (stRes.error) { console.error('[SM] saveManualPoints standings update:', stRes.error); }

      // 5. Aggiorna cache locale
      if (_cache[torneoId]) {
        _cache[torneoId].players   = allPlayers;
        _cache[torneoId].standings = standings;
        if (_cache[torneoId].torneo) _cache[torneoId].torneo.standings = standings;
      }
    },

    /** Aggiorna lo stato di un singolo match e ricalcola le standings. */
    updateMatchStatus: async function (torneoId, matchId, newStato, extraPayload) {
      var mRes = await db.from('matches').select('payload').eq('id', matchId).single();
      if (mRes.data) {
        // Quando il match diventa "completata" (approvato o 24h scadute),
        // aggiorna il campo "data" con la data locale odierna così "ultimi match"
        // mostra la data in cui il risultato è diventato ufficiale.
        var dataExtra = {};
        if (newStato === 'completata') {
          var now = new Date();
          var dataOggi = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
          dataExtra = { data: dataOggi, date: dataOggi };
        }
        var payload = Object.assign({}, mRes.data.payload, { stato: newStato }, dataExtra, extraPayload || {});
        await db.from('matches').update({ stato: newStato, payload: payload }).eq('id', matchId);
      }
      var allRes  = await db.from('players').select('*').eq('tournament_id', torneoId);
      var freshPlayers = (allRes.data || []).map(playerFromRow);
      var allMRes = await db.from('matches').select('*').eq('tournament_id', torneoId);
      var freshMatches = (allMRes.data || []).map(matchFromRow);
      await SM._recompute(torneoId, freshPlayers, freshMatches);
      if (_cache[torneoId]) _cache[torneoId].matches = freshMatches;
    },

    /** Salva una nuova iscrizione utente (stato = pendente).
     *  Se l'email è già associata a un torneo precedente, eredita
     *  automaticamente i campi profilo (età, peso, altezza, mano,
     *  superficie, disponibilità) dall'iscrizione più recente. */
    registerPlayer: async function (torneoId, playerData) {
      var id = 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

      // ── Eredita campi profilo da iscrizioni precedenti ───────────────
      // Cerca (per email) i record più recenti di altri tornei.
      // Usa il primo che ha almeno un campo profilo valorizzato.
      var inheritedProfile = {};
      if (playerData.email) {
        var prevRes = await db.from('players')
          .select('payload')
          .eq('email', playerData.email.toLowerCase())
          .order('created_at', { ascending: false })
          .limit(5);
        if (prevRes.data && prevRes.data.length > 0) {
          for (var pi = 0; pi < prevRes.data.length; pi++) {
            var prevPayload = prevRes.data[pi].payload || {};
            var hasProfile = PROFILE_FIELDS.some(function (f) {
              return prevPayload[f] !== undefined && prevPayload[f] !== null && prevPayload[f] !== '';
            });
            if (hasProfile) {
              PROFILE_FIELDS.forEach(function (field) {
                if (prevPayload[field] !== undefined && prevPayload[field] !== null && prevPayload[field] !== '') {
                  inheritedProfile[field] = prevPayload[field];
                }
              });
              break;
            }
          }
        }
      }
      // ────────────────────────────────────────────────────────────────

      var player = Object.assign({}, playerData, {
        id: id,
        vittorie: 0, pareggi: 0, sconfitte: 0,
        gol_fatti: 0, gol_subiti: 0, punti: 0, match_giocati: 0,
        rank: 0, stato: 'pendente',
      }, inheritedProfile);   // ← i campi profilo precedenti sovrascrivono solo i propri slot

      var res = await db.from('players').insert({
        id:            id,
        tournament_id: torneoId,
        email:         playerData.email || '',
        stato:         'pendente',
        payload:       player,
      });
      if (res.error) { console.error('[SM] registerPlayer:', res.error); return null; }
      return player;
    },

    // ── RICALCOLO STANDINGS ───────────────────────────────────────

    _recompute: async function (torneoId, playersOverride, matchesOverride) {
      var players = playersOverride !== null ? playersOverride : SM.getPlayers(torneoId);
      var matches = matchesOverride  !== null ? matchesOverride  : SM.getMatches(torneoId);
      if (!players.length) return;

      // reset stats — i punti partono dal valore base impostato manualmente (punti_base),
      // così i reset admin sopravvivono ai ricalcoli successivi.
      players.forEach(function (p) {
        p.vittorie = 0; p.pareggi = 0; p.sconfitte = 0;
        p.gol_fatti = 0; p.gol_subiti = 0;
        p.punti = p.punti_base || 0;   // ← base manuale admin (0 se mai resettato)
        p.match_giocati = 0;
      });

      var byId = {};
      players.forEach(function (p) { byId[p.id] = p; });

      // Ordina per data
      var completedMatches = matches
        .filter(function (m) { return m.stato === 'completata'; })
        .sort(function (a, b) { return (a.data || a.date || '').localeCompare(b.data || b.date || ''); });

      completedMatches.forEach(function (m) {
        var p1 = byId[m.giocatore1_id], p2 = byId[m.giocatore2_id];
        if (!p1 || !p2) return;
        var s1 = +m.score1 || 0, s2 = +m.score2 || 0;
        var matchDate = m.data || m.date;

        // ── Filtro reset manuale ─────────────────────────────────────────
        // Confronta il timestamp di invio del match (inviato_il) con la data
        // di reset del giocatore (stats_reset_at). Se il match è stato inviato
        // PRIMA del reset → ignoralo.
        var inviatoIl = m.inviato_il || null;
        if (inviatoIl) {
          if (p1.stats_reset_at && inviatoIl < p1.stats_reset_at) return;
          if (p2.stats_reset_at && inviatoIl < p2.stats_reset_at) return;
        } else if (matchDate) {
          var matchDay = String(matchDate).substring(0, 10);
          var r1 = p1.stats_reset_at ? String(p1.stats_reset_at).substring(0, 10) : null;
          var r2 = p2.stats_reset_at ? String(p2.stats_reset_at).substring(0, 10) : null;
          if (r1 && matchDay < r1) return;
          if (r2 && matchDay < r2) return;
        }
        // ────────────────────────────────────────────────────────────────

        p1.match_giocati++; p2.match_giocati++;
        p1.gol_fatti += s1; p1.gol_subiti += s2;
        p2.gol_fatti += s2; p2.gol_subiti += s1;

        // ── Fattore di equilibrio ────────────────────────────────────────
        // Calcola il bonus vittoria in base al gap di punti in classifica
        // tra i due sfidanti PRIMA del match (p.punti accumulati finora).
        // Se il gap supera i 300 punti: il vincitore più forte ottiene solo
        // 70 punti (-30%), mentre il vincitore più debole ottiene 130 (+30%).
        // Scopo: disincentivare i più forti dallo sfidare i più deboli.
        var GAP_SOGLIA = 300, BONUS_BASE = 100, BONUS_FORTE = 70, BONUS_DEBOLE = 130;
        function bonusVittoria(vincitore, perdente) {
          if (Math.abs(vincitore.punti - perdente.punti) > GAP_SOGLIA) {
            return vincitore.punti > perdente.punti ? BONUS_FORTE : BONUS_DEBOLE;
          }
          return BONUS_BASE;
        }

        if (s1 > s2) {
          // p1 vince: bonus vittoria (100, o 70/130 col fattore di equilibrio)
          // Bonus dominanza: se p2 non ha vinto nessun game (s2 === 0) → +2pt per game conquistato da p1
          // Bonus resistenza: +10pt per ogni game vinto dal perdente (s2)
          p1.vittorie++; p2.sconfitte++;
          p1.punti += bonusVittoria(p1, p2);
          if (s2 === 0) p1.punti += s1 * 2;
          p2.punti += s2 * 10;
        } else if (s2 > s1) {
          // p2 vince: bonus vittoria (100, o 70/130 col fattore di equilibrio)
          // Bonus dominanza: se p1 non ha vinto nessun game (s1 === 0) → +2pt per game conquistato da p2
          // Bonus resistenza: +10pt per ogni game vinto dal perdente (s1)
          p2.vittorie++; p1.sconfitte++;
          p2.punti += bonusVittoria(p2, p1);
          if (s1 === 0) p2.punti += s2 * 2;
          p1.punti += s1 * 10;
        }
        // Pareggio non previsto dal regolamento, nessun punto
      });

      // Leggi i payload attuali dal DB per preservare i campi profilo utente.
      // Questo garantisce che operazioni admin (savePlayers, saveMatches, ecc.)
      // non sovrascrivano mai età/peso/altezza/mano/superficie/disponibilità
      // anche quando la cache locale dell'admin è obsoleta.
      var dbProfileMap = {};
      if (players.length) {
        var dbProfRes = await db.from('players')
          .select('id, payload')
          .in('id', players.map(function (p) { return p.id; }));
        (dbProfRes.data || []).forEach(function (r) { dbProfileMap[r.id] = r.payload || {}; });
      }

      // Aggiorna stats di ogni giocatore su Supabase
      for (var i = 0; i < players.length; i++) {
        var p = players[i];
        // Merge: stats ricalcolate da p + campi profilo freschi dal DB
        var freshProfile = dbProfileMap[p.id] || {};
        var mergedPayload = Object.assign({}, p);
        PROFILE_FIELDS.forEach(function (field) {
          if (freshProfile[field] !== undefined) mergedPayload[field] = freshProfile[field];
        });
        await db.from('players').update({
          stato:   p.stato || 'pendente',
          payload: mergedPayload,
        }).eq('id', p.id);
      }

      // Calcola standings e salva (usa i payload merged con campi profilo)
      var standings = players.slice()
        .sort(function (a, b) {
          if (b.punti    !== a.punti)    return b.punti    - a.punti;
          if (b.vittorie !== a.vittorie) return b.vittorie - a.vittorie;
          return (b.gol_fatti - b.gol_subiti) - (a.gol_fatti - a.gol_subiti);
        })
        .map(function (p, i) {
          var freshProfile = dbProfileMap[p.id] || {};
          var mergedP = Object.assign({}, p);
          PROFILE_FIELDS.forEach(function (field) {
            if (freshProfile[field] !== undefined) mergedP[field] = freshProfile[field];
          });
          return Object.assign({}, mergedP, { rank: i + 1 });
        });

      await db.from('tournaments').update({ standings: standings }).eq('id', torneoId);

      // Aggiorna cache (con i campi profilo freschi)
      if (_cache[torneoId]) {
        _cache[torneoId].players   = players.map(function (p) {
          var freshProfile = dbProfileMap[p.id] || {};
          var merged = Object.assign({}, p);
          PROFILE_FIELDS.forEach(function (field) {
            if (freshProfile[field] !== undefined) merged[field] = freshProfile[field];
          });
          return merged;
        });
        _cache[torneoId].standings = standings;
        if (_cache[torneoId].torneo) _cache[torneoId].torneo.standings = standings;
      }
    },

    // ── SESSIONE (cookie, condivisi tra Safari e PWA su iOS) ──────
    //
    // localStorage non è condiviso tra Safari browser e la PWA (home screen)
    // su iOS: ogni contesto ha il proprio storage isolato. I cookie invece
    // vengono condivisi sullo stesso dominio, quindi il login fatto in Safari
    // persiste anche quando si apre l'app dalla home screen.

    _setCookie: function (name, value, days) {
      var expires = '';
      if (days) {
        var d = new Date();
        d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
        expires = '; expires=' + d.toUTCString();
      }
      document.cookie = name + '=' + encodeURIComponent(value || '') + expires + '; path=/; SameSite=Lax';
    },

    _getCookie: function (name) {
      var nameEQ = name + '=';
      var parts = document.cookie.split(';');
      for (var i = 0; i < parts.length; i++) {
        var c = parts[i].trim();
        if (c.indexOf(nameEQ) === 0) return decodeURIComponent(c.substring(nameEQ.length));
      }
      return null;
    },

    _deleteCookie: function (name) {
      document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    },

    getSession: function () {
      return {
        torneoId: SM._getCookie('gr_torneo_id'),
        userId:   SM._getCookie('gr_user_id'),
        email:    SM._getCookie('gr_user_email'),
        role:     SM._getCookie('gr_role'),
      };
    },

    setSession: function (torneoId, userId, email, role) {
      // 365 giorni: l'utente rimane loggato per un anno senza dover rifare l'accesso
      SM._setCookie('gr_torneo_id',  torneoId || '', 365);
      SM._setCookie('gr_user_id',    userId   || '', 365);
      SM._setCookie('gr_user_email', email    || '', 365);
      SM._setCookie('gr_role',       role     || '', 365);
    },

    clearSession: function () {
      ['gr_torneo_id','gr_user_id','gr_user_email','gr_role'].forEach(function (k) {
        SM._deleteCookie(k);
      });
    },

    /**
     * Aggiorna i campi del profilo personale di un giocatore
     * (anni, peso, altezza, mano, superficie, disponibilita).
     * Merge JSONB lato client: legge il payload attuale, fonde i campi
     * profilo e fa UPDATE. Non tocca punti/stats/stato.
     */
    updatePlayerProfile: async function (playerId, profileFields) {
      // Costruisce l'oggetto con solo i campi profilo definiti
      var profileData = {};
      PROFILE_FIELDS.forEach(function (field) {
        if (profileFields[field] !== undefined) profileData[field] = profileFields[field];
      });

      // 1. Leggi payload attuale dal DB + tournament_id per propagare alle standings
      var current = await db.from('players')
        .select('payload, tournament_id')
        .eq('id', playerId)
        .single();
      if (current.error || !current.data) {
        console.error('[SM] updatePlayerProfile read:', current.error);
        return false;
      }

      // 2. Merge dei campi profilo nel payload esistente
      var mergedPayload = Object.assign({}, current.data.payload || {}, profileData);

      // 3. UPDATE sulla tabella players (le policy RLS permettono write_anon)
      var res = await db.from('players').update({ payload: mergedPayload }).eq('id', playerId);
      if (res.error) {
        console.error('[SM] updatePlayerProfile update players:', res.error);
        return false;
      }

      // 4. Propaga i campi profilo alla JSONB tournaments.standings
      //    (la home / la scheda di un altro player leggono da lì, non da players)
      var torneoId = current.data.tournament_id;
      if (torneoId) {
        var tRes = await db.from('tournaments').select('standings').eq('id', torneoId).single();
        if (!tRes.error && tRes.data && Array.isArray(tRes.data.standings)) {
          var newStandings = tRes.data.standings.map(function (s) {
            return s && s.id === playerId ? Object.assign({}, s, profileData) : s;
          });
          var stRes = await db.from('tournaments').update({ standings: newStandings }).eq('id', torneoId);
          if (stRes.error) console.error('[SM] updatePlayerProfile update standings:', stRes.error);
        }
      }

      // 5. Aggiorna cache locale (players + standings)
      if (_cache) {
        Object.keys(_cache).forEach(function (tid) {
          if (_cache[tid] && _cache[tid].players) {
            _cache[tid].players = _cache[tid].players.map(function (p) {
              return p.id === playerId ? Object.assign({}, p, profileFields) : p;
            });
          }
          if (_cache[tid] && _cache[tid].standings) {
            _cache[tid].standings = _cache[tid].standings.map(function (p) {
              return p && p.id === playerId ? Object.assign({}, p, profileFields) : p;
            });
            if (_cache[tid].torneo) _cache[tid].torneo.standings = _cache[tid].standings;
          }
        });
      }
      return true;
    },

    /** Cerca un giocatore approvato per email tra tutti i tornei. */
    findPlayerByEmail: async function (email) {
      var res = await db.from('players')
        .select('*, tournaments(id,nome,inizio,fine,max_iscritti,stato,standings)')
        .eq('email', email.toLowerCase())
        .eq('stato', 'approvato')
        .limit(1)
        .single();
      if (!res.data) return null;
      var player = playerFromRow(res.data);
      var torneo = torneoFromRow(res.data.tournaments);
      return { player, torneo };
    },
  };

  window.StorageManager = SM;
})();
