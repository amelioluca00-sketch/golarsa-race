/**
 * ui-binder.js
 * Aggancia logica di rendering agli HTML esistenti via id e window globals.
 * Le funzioni init* sono async (caricano da Supabase).
 * Le funzioni render* sono sync (usano i dati già in cache).
 */

(function () {

  // ── Helpers comuni ────────────────────────────────────────────────

  var MESI = ['GENNAIO','FEBBRAIO','MARZO','APRILE','MAGGIO','GIUGNO',
              'LUGLIO','AGOSTO','SETTEMBRE','OTTOBRE','NOVEMBRE','DICEMBRE'];
  var MESI_BREVE = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

  function fmtData(s)      { if (!s) return '—'; var p = s.split('-'); return parseInt(p[2]) + ' ' + MESI[parseInt(p[1])-1] + ' ' + p[0]; }
  function fmtDataBreve(s) { if (!s) return '';  var p = s.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function fmtMese(s)      { if (!s) return '';  var p = s.split('-'); return p[2] + ' ' + MESI_BREVE[parseInt(p[1])-1]; }

  function wrLabel(wr) {
    return wr === 100 ? 'IMMORTALE' : wr >= 90 ? 'INVINCIBILE' : wr >= 80 ? 'INARRESTABILE'
      : wr >= 70 ? 'FUORICLASSE' : wr >= 60 ? 'SPIETATO' : wr >= 50 ? 'DOMINANTE'
      : wr >= 40 ? 'TENACE'    : wr >= 30 ? 'LOTTATORE'  : wr >= 20 ? 'DETERMINATO'
      : wr >= 10 ? 'IN CRESCITA': wr >= 1 ? 'DEBUTTANTE' : 'IN PARTENZA';
  }

  var FLAG_MAP = {
    'Italia': 'it', 'Brasile': 'br', 'Argentina': 'ar', 'Francia': 'fr',
    'Spagna': 'es', 'Germania': 'de', 'Portogallo': 'pt', 'Inghilterra': 'gb',
    'Olanda': 'nl', 'Belgio': 'be', 'Israele': 'il', 'Regno Unito': 'gb',
    'Giappone': 'jp', 'Australia': 'au', 'Canada': 'ca', 'Russia': 'ru',
    'USA': 'us', 'Messico': 'mx', 'Cile': 'cl', 'Colombia': 'co'
  };

  // Estrae il codice ISO a 2 lettere dall'emoji bandiera (es. 🇮🇱 → 'il').
  // Funziona per qualsiasi paese senza dover aggiornare FLAG_MAP.
  function flagEmojiToCode(emoji) {
    if (!emoji) return null;
    var letters = [];
    for (var i = 0; i < emoji.length; ) {
      var cp = emoji.codePointAt(i);
      if (cp >= 0x1F1E6 && cp <= 0x1F1FF) letters.push(String.fromCharCode(cp - 0x1F1E6 + 65));
      i += cp > 0xFFFF ? 2 : 1;
    }
    return letters.length === 2 ? letters.join('').toLowerCase() : null;
  }

  function getFlagCode(nazionalita, bandiera) {
    return FLAG_MAP[nazionalita] || flagEmojiToCode(bandiera) || 'it';
  }

  /** Neutralizza caratteri HTML pericolosi per prevenire XSS. */
  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function showError(msg) {
    var el = document.getElementById('page-error');
    if (!el) {
      el = document.createElement('div');
      el.id = 'page-error';
      el.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#1a0000;color:#ffb4ab;border:1px solid rgba(255,100,80,0.3);border-radius:12px;padding:12px 20px;font-size:12px;font-weight:700;z-index:9999;letter-spacing:.05em';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(function () { el.style.display = 'none'; }, 4000);
  }

  // ══════════════════════════════════════════════════════════════════
  // INIT 1 — accesso_dashboard.html (admin: crea/lista tornei)
  // ══════════════════════════════════════════════════════════════════

  function initAccesso() {
    var SM = window.StorageManager;

    // Wrapper su creaTorneo: persiste su Supabase
    var orig = window.creaTorneo;
    if (typeof orig === 'function') {
      window.creaTorneo = async function () {
        var nome        = (document.getElementById('inp-nome') || {}).value || '';
        var inizio      = (document.getElementById('inp-inizio') || {}).value || '';
        var fine        = (document.getElementById('inp-fine')   || {}).value || '';
        var maxIscritti = parseInt((document.getElementById('inp-max') || {}).value) || 0;

        // Snapshot chiavi pre-inline
        var prevKeys = new Set(Object.keys(localStorage).filter(function (k) { return k.indexOf('gr_torneo_meta_') === 0; }));

        orig();   // crea card DOM + salva gr_torneo_meta_ + reset form

        // Trova la nuova chiave creata dall'inline
        var newKey = Object.keys(localStorage).find(function (k) {
          return k.indexOf('gr_torneo_meta_') === 0 && !prevKeys.has(k);
        });
        if (!newKey) return;
        var id = newKey.replace('gr_torneo_meta_', '');

        var oggi = new Date().toISOString().split('T')[0];
        try {
          await SM.saveTournament({
            id:          id,
            nome:        nome.trim(),
            inizio:      inizio,
            fine:        fine,
            maxIscritti: maxIscritti,
            stato:       fine && fine < oggi ? 'concluso' : 'in corso',
            standings:   [],
          });
        } catch (e) {
          showError('Errore salvataggio torneo. Controlla la connessione.');
          console.error(e);
        }
      };
    }

    // Override cancellaTorneo per cancellare anche da Supabase
    var origCanc = window.cancellaTorneo;
    window.cancellaTorneo = async function (id) {
      if (!confirm('Eliminare questo torneo?')) return;
      var wrap = document.getElementById(id);
      if (wrap) wrap.remove();
      try { await SM.deleteTournament(id); } catch (e) { console.error(e); }
      localStorage.removeItem('gr_torneo_meta_' + id);
      if (localStorage.getItem('gr_torneo_id') === id) localStorage.removeItem('gr_torneo_id');
      var lista   = document.getElementById('lista-tornei');
      var cards   = lista && lista.querySelectorAll('.card-torneo-wrap');
      var emptyEl = document.getElementById('empty-tornei');
      if (emptyEl) emptyEl.style.display = (!cards || cards.length === 0) ? '' : 'none';
    };

    // Override resetTutti per cancellare da Supabase
    window.resetTutti = async function () {
      if (!confirm('Cancella tutti i tornei e i relativi dati?')) return;
      try { await SM.clearAll(); } catch (e) { console.error(e); }
      ['gr_torneo_id','gr_user_id','gr_user_email','gr_role'].forEach(function (k) { localStorage.removeItem(k); });
      Object.keys(localStorage).filter(function (k) { return k.indexOf('gr_torneo_meta_') === 0; })
        .forEach(function (k) { localStorage.removeItem(k); });
      window.location.reload();
    };

    // Carica lista tornei da Supabase al load
    ready(async function () {
      var lista = document.getElementById('lista-tornei');
      if (!lista) return;

      var torneos;
      try {
        torneos = await SM.loadTournaments();
      } catch (e) {
        showError('Impossibile caricare i tornei. Controlla la connessione.');
        return;
      }
      if (!torneos.length) return;

      var empty = document.getElementById('empty-tornei');
      if (empty) empty.remove();

      torneos.forEach(function (t) {
        var wrap = document.createElement('div');
        wrap.className = 'card-torneo-wrap';
        wrap.id = t.id;

        var btn = document.createElement('button');
        btn.className = 'card-torneo';
        btn.onclick = function () { window.apriTorneo(t.id); };
        btn.innerHTML =
          '<h3 class="text-sm font-headline font-black italic text-white uppercase tracking-tight pr-8">' + esc((t.nome || '')).toUpperCase() + '</h3>' +
          '<span class="text-[#D1FF4B] text-[9px] font-black italic mt-1 block">' + fmtData(t.inizio) + ' – ' + fmtData(t.fine) + '</span>';

        var deleteBtn = document.createElement('button');
        deleteBtn.className = 'card-delete-btn';
        deleteBtn.title = 'Elimina torneo';
        deleteBtn.onclick = function (e) { e.stopPropagation(); window.cancellaTorneo(t.id); };
        deleteBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:20px">delete</span>';

        wrap.appendChild(btn);
        wrap.appendChild(deleteBtn);
        lista.appendChild(wrap);
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // INIT 2 — home_dashbaord.html (admin dashboard)
  // ══════════════════════════════════════════════════════════════════

  function initHomeDashboard() {
    var SM = window.StorageManager;

    ready(async function () {
      // Blocca subito l'animazione inline (legge data-count="0" prima che Supabase risponda
      // e gira per 900ms via rAF, sovrascrivendo i valori corretti impostati dopo il load).
      // Viene sostituita con la versione reale dopo SM.load().
      window.animateCount = function () {};

      var torneoId = localStorage.getItem('gr_torneo_id');
      if (!torneoId) return;

      var data;
      try {
        data = await SM.load(torneoId);
      } catch (e) { showError('Errore caricamento dati.'); return; }
      if (!data) return;

      var torneo    = data.torneo;
      var players   = data.players;
      var matches   = data.matches;
      var standings = data.standings;

      // Heading + sottotitolo
      var h = document.getElementById('page-heading');
      if (h) h.textContent = (torneo.nome || 'TORNEO').toUpperCase();
      var sub = document.getElementById('page-subtitle');
      if (sub) sub.textContent = fmtData(torneo.inizio) + ' — ' + fmtData(torneo.fine);

      // Stat counts
      var pendenti      = players.filter(function (p) { return !p.stato || p.stato === 'pendente'; }).length;
      var approvati     = players.filter(function (p) { return p.stato === 'approvato'; }).length;
      var giocati       = matches.filter(function (m) { return m.stato === 'completata'; }).length;
      var contestazioni = matches.filter(function (m) { return m.stato === 'contestata'; }).length;
      var statEls   = document.querySelectorAll('[data-count]');
      var targets   = [pendenti, contestazioni, approvati, giocati];
      // Aggiorna data-count E testo visibile (l'animazione iniziale parte a 0 prima del caricamento Supabase)
      statEls.forEach(function (el, i) {
        if (i < targets.length) {
          el.dataset.count = targets[i];
          el.textContent   = String(targets[i]);
        }
      });

      window.animateCount = function (el, _t, duration, padLen) {
        var target = parseInt(el.dataset.count || '0', 10);
        var start  = performance.now();
        function frame(now) {
          var prog  = Math.min((now - start) / duration, 1);
          var eased = 1 - Math.pow(1 - prog, 3);
          el.textContent = String(Math.round(eased * target)).padStart(padLen, '0');
          if (prog < 1) requestAnimationFrame(frame);
          else el.textContent = String(target).padStart(padLen, '0');
        }
        requestAnimationFrame(frame);
      };

      // Lancia le animazioni sui contatori ora che i valori corretti sono caricati
      statEls.forEach(function (el, i) {
        if (i >= targets.length) return;
        (function (delay) {
          setTimeout(function () { window.animateCount(el, 0, 900, 1); }, delay);
        })(250 + i * 120);
      });

      // ── renderStandings ──
      function sortStandings() {
        standings.sort(function (a, b) {
          if (b.punti !== a.punti) return b.punti - a.punti;
          if (b.vittorie !== a.vittorie) return b.vittorie - a.vittorie;
          return a.sconfitte - b.sconfitte;
        });
      }

      window.renderStandings = function () {
        sortStandings();
        var list = document.getElementById('standings-list');
        if (!list) return;
        list.innerHTML = '';
        standings.forEach(function (p, i) {
          var pos = i + 1, isFirst = pos === 1;
          var row = document.createElement('div');
          row.className = 'p-4 flex items-center gap-4 transition-colors row-anim';
          row.style.animationDelay = (0.58 + i * 0.045) + 's';
          row.innerHTML =
            '<span class="font-headline italic font-black text-xl ' + (isFirst ? 'text-[#d1ff4b]' : 'text-gray-500') + ' w-8 flex-shrink-0">' + String(pos).padStart(2, '0') + '</span>' +
            '<div class="flex-1 min-w-0">' +
              '<div class="flex justify-between items-center gap-2">' +
                '<span class="font-headline italic font-bold text-base text-white uppercase tracking-tight truncate">' + esc(p.bandiera || '') + '&nbsp;&nbsp;' + esc(p.nome) + ' ' + esc(p.cognome) + '</span>' +
                '<span class="font-headline italic font-black text-lg text-[#d1ff4b] tabular-nums flex-shrink-0">' + p.punti + '</span>' +
              '</div>' +
              '<div class="flex gap-3 mt-0.5">' +
                '<span class="font-label text-[0.55rem] text-gray-600 uppercase tracking-widest">' + p.vittorie + 'V</span>' +
                '<span class="font-label text-[0.55rem] text-gray-600 uppercase tracking-widest">' + p.pareggi + 'P</span>' +
                '<span class="font-label text-[0.55rem] text-gray-600 uppercase tracking-widest">' + p.sconfitte + 'S</span>' +
                '<span class="font-label text-[0.55rem] text-gray-600 uppercase tracking-widest">' + p.match_giocati + ' match</span>' +
              '</div>' +
            '</div>' +
            '<button onclick="openHomeEdit(\'' + p.id + '\')" class="cinematic-icon w-10 h-10 rounded-full flex items-center justify-center border border-white/5 flex-shrink-0 hover:border-[#d1ff4b]/30 transition-colors">' +
              '<span class="material-symbols-outlined text-[#d1ff4b] text-lg">edit</span>' +
            '</button>';
          list.appendChild(row);
        });
      };

      // ── renderPlayers (ordine alfabetico + tasto Modifica) ──
      window.renderPlayers = function (list) {
        var c = document.getElementById('players-list');
        if (!c) return;
        var d = (Array.isArray(list) ? list.slice() : players.slice()).sort(function (a, b) {
          var ca = (a.cognome || '').toLowerCase(), cb = (b.cognome || '').toLowerCase();
          if (ca !== cb) return ca.localeCompare(cb, 'it');
          return (a.nome || '').toLowerCase().localeCompare((b.nome || '').toLowerCase(), 'it');
        });
        c.innerHTML = '';
        if (!d.length) { c.innerHTML = '<p class="font-label text-[0.7rem] text-gray-600 uppercase tracking-widest text-center py-8">Nessun giocatore trovato</p>'; return; }
        d.forEach(function (p) {
          var card = document.createElement('div');
          card.className = 'cinematic-card rounded-2xl px-4 py-3.5 border border-white/5 flex items-center justify-between hover:brightness-110 transition-all duration-300 player-card';
          card.innerHTML =
            '<div class="flex flex-col min-w-0 mr-3">' +
              '<span class="font-label text-[0.58rem] font-semibold text-gray-500 uppercase tracking-[0.15em]" style="line-height:1;margin-bottom:3px;display:block">' + esc(p.nome) + '</span>' +
              '<span class="font-headline italic font-black text-2xl text-white uppercase tracking-tighter" style="line-height:1.1;display:block">' + esc(p.cognome) + '</span>' +
            '</div>' +
            '<div class="flex items-center gap-3 flex-shrink-0">' +
              '<div class="text-right">' +
                '<span class="font-label text-[0.55rem] text-gray-600 uppercase tracking-widest block">' + esc(p.nazionalita || '') + ' ' + esc(p.bandiera || '') + '</span>' +
                '<span class="font-label text-[0.6rem] text-[#d1ff4b] font-bold block">' + p.vittorie + 'V ' + p.pareggi + 'P ' + p.sconfitte + 'S · <strong>' + p.punti + 'pt</strong></span>' +
              '</div>' +
              '<button onclick="openGiocatoriModal(\'' + p.id + '\')" class="cinematic-icon w-10 h-10 rounded-full flex items-center justify-center border border-white/5 hover:border-[#d1ff4b]/30 transition-colors">' +
                '<span class="material-symbols-outlined text-[#d1ff4b] text-lg">edit</span>' +
              '</button>' +
            '</div>';
          c.appendChild(card);
        });
      };

      window.filterPlayers = function (query) {
        var q = (query || '').toLowerCase().trim();
        window.renderPlayers(q ? players.filter(function (p) {
          return p.nome.toLowerCase().indexOf(q) >= 0 || p.cognome.toLowerCase().indexOf(q) >= 0;
        }) : players);
      };

      // ── Modal: Modifica Classifica ──
      window.openHomeEdit = function (id) {
        var p = standings.find(function (x) { return x.id === id; });
        if (!p) return;
        window._homeEditingId = id;
        var nameEl = document.getElementById('home-modal-name');
        if (nameEl) nameEl.textContent = (p.bandiera || '') + ' ' + esc(p.nome) + ' ' + p.cognome;
        var ptEl = document.getElementById('home-modal-points');
        if (ptEl) { ptEl.value = p.punti; setTimeout(function () { ptEl.focus(); ptEl.select(); }, 260); }
        var modal = document.getElementById('home-edit-modal');
        if (modal) { modal.classList.add('open'); document.body.style.overflow = 'hidden'; }
      };
      window.closeHomeModal = function () {
        var modal = document.getElementById('home-edit-modal');
        if (modal) modal.classList.remove('open');
        document.body.style.overflow = '';
        window._homeEditingId = null;
      };
      window.saveHomeEdit = async function () {
        var newPunti = parseInt(document.getElementById('home-modal-points').value, 10);
        if (isNaN(newPunti) || newPunti < 0) return;
        var id = window._homeEditingId;
        // Aggiorna subito la vista locale
        var sp = standings.find(function (x) { return x.id === id; });
        if (sp) sp.punti = newPunti;
        var pp = players.find(function (x) { return x.id === id; });
        if (pp) pp.punti = newPunti;
        window.closeHomeModal();
        window.renderStandings();
        // Salva su Supabase senza rieseguire _recompute (che azzererebbe la modifica)
        try { await SM.saveManualPoints(torneoId, id, newPunti); } catch (e) { showError('Errore salvataggio punti.'); }
      };

      // ── Modal: Modifica Giocatore ──
      window.openGiocatoriModal = function (id) {
        var p = players.find(function (x) { return x.id === id; });
        if (!p) return;
        window._giocatoriEditingId = id;
        var setT = function (k, v) { var el = document.getElementById(k); if (el) el.textContent = v || ''; };
        var setV = function (k, v) { var el = document.getElementById(k); if (el) el.value = v || ''; };
        setT('giocatori-modal-title', p.nome + ' ' + p.cognome);
        setV('f-nome',     p.nome);
        setV('f-cognome',  p.cognome);
        setV('f-email',    p.email);
        setV('f-telefono', p.telefono);
        setV('f-coach',    p.coach);
        var sel = document.getElementById('f-nazionalita');
        if (sel && p.nazionalita) {
          for (var i = 0; i < sel.options.length; i++) {
            if (sel.options[i].text === p.nazionalita || sel.options[i].text.replace(/^\S+\s/, '') === p.nazionalita) {
              sel.selectedIndex = i; break;
            }
          }
        }
        var dc = document.getElementById('delete-confirm');
        var fc = document.getElementById('giocatori-form-content');
        if (dc) dc.style.display = 'none';
        if (fc) fc.style.display = '';
        var modal = document.getElementById('giocatori-edit-modal');
        if (modal) { modal.classList.add('open'); document.body.style.overflow = 'hidden'; }
      };
      window.closeGiocatoriModal = function () {
        var modal = document.getElementById('giocatori-edit-modal');
        if (modal) modal.classList.remove('open');
        document.body.style.overflow = '';
        window._giocatoriEditingId = null;
        var dc = document.getElementById('delete-confirm');
        var fc = document.getElementById('giocatori-form-content');
        if (dc) dc.style.display = 'none';
        if (fc) fc.style.display = '';
      };
      window.savePlayer = async function () {
        var id = window._giocatoriEditingId;
        var p = players.find(function (x) { return x.id === id; });
        if (!p) return;
        var val = function (k) { var el = document.getElementById(k); return el ? el.value.trim() : ''; };
        p.nome       = val('f-nome')     || p.nome;
        p.cognome    = val('f-cognome')  || p.cognome;
        p.email      = val('f-email');
        p.telefono   = val('f-telefono');
        p.coach      = val('f-coach');
        var sel = document.getElementById('f-nazionalita');
        if (sel && sel.selectedIndex >= 0) {
          var raw = sel.options[sel.selectedIndex].text;
          var parts = raw.split(' ');
          p.bandiera   = parts[0];
          p.nazionalita = parts.slice(1).join(' ');
        }
        p.nomeCompleto = p.nome + ' ' + p.cognome;
        window.closeGiocatoriModal();
        try { await SM.savePlayers(torneoId, players); } catch (e) { showError('Errore salvataggio.'); return; }
        window.renderPlayers(players);
        window.renderStandings();
      };
      window.showDeleteConfirm = function () {
        var p = players.find(function (x) { return x.id === window._giocatoriEditingId; });
        if (!p) return;
        var dn = document.getElementById('delete-name');
        if (dn) dn.textContent = p.nome + ' ' + p.cognome;
        var fc = document.getElementById('giocatori-form-content');
        var dc = document.getElementById('delete-confirm');
        if (fc) fc.style.display = 'none';
        if (dc) dc.style.display = '';
        var mb = document.querySelector('#giocatori-edit-modal .modal-box');
        if (mb) mb.scrollTop = 0;
      };
      window.cancelDelete = function () {
        var dc = document.getElementById('delete-confirm');
        var fc = document.getElementById('giocatori-form-content');
        if (dc) dc.style.display = 'none';
        if (fc) fc.style.display = '';
      };
      window.confirmDelete = async function () {
        var id = window._giocatoriEditingId;
        players = players.filter(function (x) { return x.id !== id; });
        standings = standings.filter(function (x) { return x.id !== id; });
        window.closeGiocatoriModal();
        try { await SM.savePlayers(torneoId, players); } catch (e) { showError('Errore eliminazione.'); return; }
        window.renderPlayers(players);
        window.renderStandings();
      };

      // ── renderWeeklyChart ──
      window.renderWeeklyChart = function (matchList) {
        // Calcola il lunedì della settimana corrente
        var today   = new Date();
        var dow     = today.getDay(); // 0=Dom, 1=Lun, …6=Sab
        var toMon   = (dow === 0) ? -6 : 1 - dow;
        var monday  = new Date(today);
        monday.setDate(today.getDate() + toMon);
        monday.setHours(0, 0, 0, 0);

        // Genera le 7 date ISO (Lun→Dom)
        var weekDates = [];
        for (var d = 0; d < 7; d++) {
          var day = new Date(monday);
          day.setDate(monday.getDate() + d);
          weekDates.push(day.toISOString().split('T')[0]);
        }

        // Conta i match completati per ogni giorno
        var src = Array.isArray(matchList) ? matchList : matches;
        var counts = weekDates.map(function (dateStr) {
          return src.filter(function (m) {
            return m.stato === 'completata' && m.data === dateStr;
          }).length;
        });

        var maxCount = Math.max.apply(null, counts);

        // Aggiorna le barre: altezza proporzionale al massimo, minimo 6%
        var bars = document.querySelectorAll('.chart-bar');
        bars.forEach(function (bar, i) {
          if (i >= 7) return;
          var pct = maxCount > 0 ? Math.max(6, Math.round((counts[i] / maxCount) * 92)) : 6;
          bar.style.height = pct + '%';
          bar.title        = counts[i] + (counts[i] === 1 ? ' match' : ' match');
          // Evidenzia il giorno corrente
          var isToday = (weekDates[i] === today.toISOString().split('T')[0]);
          bar.style.opacity = isToday ? '1' : counts[i] > 0 ? '0.85' : '0.3';
        });
      };

      // ── renderMatches (home dashboard: PENDING + completati + programmati) ──
      // I match contestati NON vengono mostrati qui: appaiono solo in contestazioni_dashboard.
      window.renderMatches = function () {
        var c = document.getElementById('matches-list');
        if (!c) return;
        c.innerHTML = '';

        var pending = matches.filter(function (m) { return m.stato === 'in_attesa'; });
        var other   = matches.filter(function (m) { return m.stato === 'completata' || m.stato === 'programmata'; });

        if (!pending.length && !other.length) {
          c.innerHTML = '<p class="font-label text-[0.7rem] text-gray-600 uppercase tracking-widest text-center py-8">Nessun match trovato</p>';
          return;
        }

        // ── Sezione IN ATTESA (in attesa di conferma dall'avversario) ──
        pending.forEach(function (m) {
          var card = document.createElement('div');
          card.className = 'cinematic-card rounded-2xl border border-white/10 overflow-hidden';
          card.innerHTML =
            '<div class="px-4 pt-4 pb-4">' +
              '<p class="font-label text-[0.55rem] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-3 flex items-center gap-2">' +
                fmtDataBreve(m.data) +
                ' <span class="text-gray-400 border border-white/20 rounded-full px-1.5 py-0.5">IN ATTESA AVVERSARIO</span>' +
              '</p>' +
              '<div class="flex items-center justify-between gap-2">' +
                '<div class="flex-1 min-w-0"><span class="font-headline italic font-black text-white uppercase tracking-tight text-[1.05rem] leading-tight block truncate">' + esc(m.giocatore1_nome) + '</span></div>' +
                '<div class="flex items-center gap-2 flex-shrink-0 mx-1">' +
                  '<span class="score-badge">' + m.score1 + '</span>' +
                  '<span class="vs-dot">vs</span>' +
                  '<span class="score-badge">' + m.score2 + '</span>' +
                '</div>' +
                '<div class="flex-1 min-w-0 text-right"><span class="font-headline italic font-black text-white uppercase tracking-tight text-[1.05rem] leading-tight block truncate">' + esc(m.giocatore2_nome) + '</span></div>' +
              '</div>' +
            '</div>';
          c.appendChild(card);
        });

        // ── Sezione COMPLETATI / PROGRAMMATI ──
        other.slice().sort(function (a, b) {
          if (a.stato !== b.stato) return a.stato === 'completata' ? -1 : 1;
          return (b.data || '').localeCompare(a.data || '');
        }).forEach(function (m) {
          var done = m.stato === 'completata';
          var card = document.createElement('div');
          card.className = 'cinematic-card rounded-2xl border border-white/5 overflow-hidden match-card';
          card.innerHTML =
            '<div class="px-4 pt-4 pb-3">' +
              '<p class="font-label text-[0.55rem] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-3 flex items-center gap-2">' + fmtDataBreve(m.data) + (!done ? ' <span class="text-[#d1ff4b] border border-[#d1ff4b]/20 rounded-full px-1.5 py-0.5">PROGRAMMATA</span>' : '') + '</p>' +
              '<div class="flex items-center justify-between gap-2">' +
                '<div class="flex-1 min-w-0"><span class="font-headline italic font-black text-white uppercase tracking-tight text-[1.05rem] leading-tight block truncate">' + esc(m.giocatore1_nome) + '</span></div>' +
                '<div class="flex items-center gap-2 flex-shrink-0 mx-1">' + (done ? '<span class="score-badge">' + m.score1 + '</span><span class="vs-dot">vs</span><span class="score-badge">' + m.score2 + '</span>' : '<span class="vs-dot font-black text-sm">vs</span>') + '</div>' +
                '<div class="flex-1 min-w-0 text-right"><span class="font-headline italic font-black text-white uppercase tracking-tight text-[1.05rem] leading-tight block truncate">' + esc(m.giocatore2_nome) + '</span></div>' +
              '</div>' +
            '</div>' +
            '<div class="h-px bg-white/[0.05] mx-4"></div>' +
            '<button onclick="openMatchModal(\'' + m.id + '\')" class="w-full flex items-center justify-center gap-2 py-3 hover:bg-white/5 transition-colors">' +
              '<span class="material-symbols-outlined text-[#d1ff4b] text-base">edit</span>' +
              '<span class="font-label text-[0.6rem] font-bold text-[#d1ff4b] uppercase tracking-[0.15em]">Modifica</span>' +
            '</button>';
          c.appendChild(card);
        });
      };

      // ── Refresh completo (ricarica da Supabase + ri-rendera tutto) ──
      async function refreshAll() {
        try { await SM.load(torneoId); } catch (e) {}
        var fresh = SM.getTournamentData(torneoId);
        if (!fresh) return;
        // aggiorna variabili locali
        players   = fresh.players;
        matches   = fresh.matches;
        standings = fresh.standings;
        // aggiorna stat counts
        var pendenti      = players.filter(function (p) { return !p.stato || p.stato === 'pendente'; }).length;
        var approvati     = players.filter(function (p) { return p.stato === 'approvato'; }).length;
        var giocati       = matches.filter(function (m) { return m.stato === 'completata'; }).length;
        var contestazioni = matches.filter(function (m) { return m.stato === 'contestata'; }).length;
        var newTargets = [pendenti, contestazioni, approvati, giocati];
        var freshStatEls = document.querySelectorAll('[data-count]');
        freshStatEls.forEach(function (el, i) {
          if (i < newTargets.length) { el.dataset.count = newTargets[i]; el.textContent = String(newTargets[i]); }
        });
        // ri-rendera tutto
        window.renderStandings();
        window.renderPlayers(players);
        window.renderMatches();
        window.renderWeeklyChart(matches);
      }

      // ── Handler Approva / Rifiuta match (home dashboard admin) ──
      window.approvaMatch = async function (id) {
        try { await SM.updateMatchStatus(torneoId, id, 'completata'); }
        catch (e) { showError('Errore approvazione.'); return; }
        await refreshAll();
      };
      window.rifiutaMatch = async function (id) {
        try { await SM.updateMatchStatus(torneoId, id, 'rifiutata'); }
        catch (e) { showError('Errore rifiuto.'); return; }
        await refreshAll();
      };

      // ── Modal Modifica Match (usa #match-edit-modal del DOM) ──
      window.openMatchModal = function (id) {
        var m = matches.find(function (x) { return x.id === id; });
        if (!m) return;
        window._editingMatchId = id;
        var set  = function (k, v) { var el = document.getElementById(k); if (el) el.value  = v || ''; };
        var setT = function (k, v) { var el = document.getElementById(k); if (el) el.textContent = v; };
        setT('match-modal-title', m.giocatore1_nome + ' vs ' + m.giocatore2_nome);
        setT('f-label-p1', m.giocatore1_nome);
        setT('f-label-p2', m.giocatore2_nome);
        set('f-data',   m.data);
        set('f-score1', m.score1);
        set('f-score2', m.score2);
        var modal = document.getElementById('match-edit-modal');
        if (modal) { modal.classList.add('open'); document.body.style.overflow = 'hidden'; }
      };
      window.closeMatchModal = function () {
        var modal = document.getElementById('match-edit-modal');
        if (modal) modal.classList.remove('open');
        document.body.style.overflow = '';
        window._editingMatchId = null;
      };
      window.saveMatch = async function () {
        var id = window._editingMatchId;
        var m = matches.find(function (x) { return x.id === id; });
        if (!m) return;
        var val = function (k) { var el = document.getElementById(k); return el ? el.value : ''; };
        m.data   = val('f-data') || m.data;
        m.date   = m.data;
        m.score1 = parseInt(val('f-score1'), 10) || 0;
        m.score2 = parseInt(val('f-score2'), 10) || 0;
        m.punteggio   = m.score1 + '-' + m.score2;
        m.vincitore_id = m.score1 > m.score2 ? m.giocatore1_id : m.score2 > m.score1 ? m.giocatore2_id : null;
        m.stato = m.data <= new Date().toISOString().split('T')[0] ? 'completata' : 'programmata';
        try { await SM.saveMatches(torneoId, matches); } catch (e) { showError('Errore salvataggio.'); return; }
        window.closeMatchModal();
        await refreshAll();
      };
      window.deleteMatch = async function () {
        var id = window._editingMatchId;
        var idx = matches.findIndex(function (x) { return x.id === id; });
        if (idx >= 0) matches.splice(idx, 1);
        try { await SM.saveMatches(torneoId, matches); } catch (e) { showError('Errore eliminazione.'); return; }
        window.closeMatchModal();
        await refreshAll();
      };

      // ── Iscrizioni ──
      async function refreshIscrizioni() {
        try { await SM.load(torneoId); } catch (e) {}
        var freshPlayers = SM.getPlayers(torneoId);
        var pend = freshPlayers.filter(function (p) { return !p.stato || p.stato === 'pendente'; });
        var appr = freshPlayers.filter(function (p) { return p.stato === 'approvato'; });
        var rifi = freshPlayers.filter(function (p) { return p.stato === 'rifiutato'; });
        var setN = function (id, n) { var el = document.getElementById(id); if (el) el.textContent = n; };
        setN('count-attesa',    pend.length);
        setN('count-approvate', appr.length);
        setN('count-rifiutate', rifi.length);
        renderIscPanel('panel-attesa',    pend, 'pendente',  'Nessuna iscrizione in attesa');
        renderIscPanel('panel-approvate', appr, 'approvato', 'Nessuna iscrizione approvata');
        renderIscPanel('panel-rifiutate', rifi, 'rifiutato', 'Nessuna iscrizione rifiutata');
        // aggiorna stat counts
        var freshStatEls = document.querySelectorAll('[data-count]');
        var newTargets = [pend.length, matches.filter(function (m) { return m.stato === 'contestata'; }).length, appr.length, matches.filter(function (m) { return m.stato === 'completata'; }).length];
        freshStatEls.forEach(function (el, i) {
          if (i < newTargets.length) { el.dataset.count = newTargets[i]; el.textContent = String(newTargets[i]).padStart(el.textContent.length || 1, '0'); }
        });
      }

      function renderIscPanel(panelId, list, stato, emptyMsg) {
        var panel = document.getElementById(panelId);
        if (!panel) return;
        panel.innerHTML = '';
        if (!list.length) { panel.innerHTML = '<p class="font-label text-[0.7rem] text-gray-600 uppercase tracking-widest text-center py-8">' + emptyMsg + '</p>'; return; }
        list.forEach(function (p, i) {
          var card = document.createElement('div');
          card.className = 'reg-card cinematic-card rounded-2xl p-4 border border-white/5 hover:brightness-110 transition-all duration-200';
          card.setAttribute('data-player-id', p.id);
          card.style.animationDelay = (i * 0.05 + 0.04) + 's';
          if (stato === 'pendente') {
            card.innerHTML =
              '<div class="flex items-center justify-between">' +
                '<div class="flex flex-col">' +
                  '<span class="font-label text-[0.58rem] text-gray-500 uppercase tracking-widest">' + esc(p.nazionalita || '') + ' ' + esc(p.bandiera || '') + '</span>' +
                  '<span class="font-headline italic font-black text-2xl text-white uppercase tracking-tighter">' + esc(p.cognome) + '</span>' +
                  '<span class="font-label text-[0.55rem] text-gray-600 uppercase tracking-widest mt-0.5">' + esc(p.nome) + ' · ' + esc(p.eta || '—') + ' anni</span>' +
                '</div>' +
                '<div class="flex gap-2">' +
                  '<button onclick="rifiuta(this)" class="w-9 h-9 rounded-full border border-error/30 flex items-center justify-center bg-black/40 hover:bg-error transition-all"><span class="material-symbols-outlined text-error" style="font-size:1.1rem">close</span></button>' +
                  '<button onclick="approva(this)" class="w-9 h-9 rounded-full bg-[#d1ff4b] flex items-center justify-center rim-light hover:brightness-125 transition-all"><span class="material-symbols-outlined text-on-primary-fixed" style="font-size:1.1rem">check</span></button>' +
                '</div>' +
              '</div>';
          } else {
            var isApp = stato === 'approvato';
            card.innerHTML =
              '<div class="flex flex-col">' +
                '<span class="font-label text-[0.58rem] text-gray-500 uppercase tracking-widest">' + esc(p.nome) + ' · ' + esc(p.nazionalita || '') + ' ' + esc(p.bandiera || '') + '</span>' +
                '<span class="font-headline italic font-black text-2xl text-white uppercase tracking-tighter">' + esc(p.cognome) + '</span>' +
              '</div>' +
              '<div class="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">' +
                '<span class="material-symbols-outlined ' + (isApp ? 'text-green-400' : 'text-error') + '" style="font-size:1.1rem;font-variation-settings:\'FILL\' 1">' + (isApp ? 'check_circle' : 'cancel') + '</span>' +
                '<span class="font-label text-[0.6rem] ' + (isApp ? 'text-green-400' : 'text-error') + ' font-bold uppercase tracking-widest">' + (isApp ? 'Approvato' : 'Rifiutato') + '</span>' +
              '</div>';
          }
          panel.appendChild(card);
        });
      }

      window.approva = async function (btn) {
        var card = btn && btn.closest && btn.closest('.reg-card');
        if (!card) return;
        var pid = card.getAttribute('data-player-id');
        if (pid) { try { await SM.updatePlayerStatus(torneoId, pid, 'approvato'); } catch (e) { showError('Errore approvazione.'); return; } }
        await refreshIscrizioni();
      };
      window.rifiuta = async function (btn) {
        var card = btn && btn.closest && btn.closest('.reg-card');
        if (!card) return;
        var pid = card.getAttribute('data-player-id');
        if (pid) { try { await SM.updatePlayerStatus(torneoId, pid, 'rifiutato'); } catch (e) { showError('Errore rifiuto.'); return; } }
        await refreshIscrizioni();
      };

      // Render iniziale
      window.renderStandings();
      window.renderPlayers(players);
      window.renderMatches();
      window.renderWeeklyChart(matches);
      await refreshIscrizioni();
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // INIT 2b — giocatori_dashboard.html
  // ══════════════════════════════════════════════════════════════════

  var NAZ_SELECT = {
    'Italia':'🇮🇹 Italia','Brasile':'🇧🇷 Brasile','Argentina':'🇦🇷 Argentina',
    'Francia':'🇫🇷 Francia','Spagna':'🇪🇸 Spagna','Germania':'🇩🇪 Germania',
    'Portogallo':'🇵🇹 Portogallo','Inghilterra':'🇬🇧 Regno Unito',
    'Olanda':'🇳🇱 Paesi Bassi','Belgio':'🇧🇪 Belgio'
  };

  function initGiocatoriDashboard() {
    var SM = window.StorageManager;
    var torneoId = localStorage.getItem('gr_torneo_id');
    if (!torneoId) return;

    ready(async function () {
      var data;
      try { data = await SM.load(torneoId); } catch (e) { showError('Errore caricamento giocatori.'); return; }
      if (!data) return;
      var allPlayers = data.players.slice();

      window.renderPlayers = function (list) {
        var c = document.getElementById('players-list');
        if (!c) return;
        var d = Array.isArray(list) ? list : allPlayers;
        c.innerHTML = '';
        if (!d.length) { c.innerHTML = '<p class="font-label text-[0.7rem] text-gray-600 uppercase tracking-widest text-center py-8">Nessun giocatore trovato</p>'; return; }
        d.forEach(function (p) {
          var card = document.createElement('div');
          card.className = 'cinematic-card rounded-2xl px-4 py-3.5 border border-white/5 flex items-center justify-between hover:brightness-110 transition-all duration-300 player-card';
          card.innerHTML =
            '<div class="flex flex-col min-w-0 mr-3">' +
              '<span class="font-label text-[0.58rem] font-semibold text-gray-500 uppercase tracking-[0.15em]" style="line-height:1;margin-bottom:3px;display:block">' + esc(p.nome) + '</span>' +
              '<span class="font-headline italic font-black text-2xl text-white uppercase tracking-tighter" style="line-height:1.1;display:block">' + esc(p.cognome) + '</span>' +
            '</div>' +
            '<button onclick="openModal(\'' + p.id + '\')" class="cinematic-icon w-10 h-10 rounded-full flex items-center justify-center border border-white/5 flex-shrink-0 hover:border-[#d1ff4b]/30 transition-colors">' +
              '<span class="material-symbols-outlined text-[#d1ff4b] text-lg">edit</span>' +
            '</button>';
          c.appendChild(card);
        });
      };

      window.filterPlayers = function (query) {
        var q = (query || '').toLowerCase().trim();
        window.renderPlayers(q ? allPlayers.filter(function (p) {
          return p.nome.toLowerCase().indexOf(q) >= 0 || p.cognome.toLowerCase().indexOf(q) >= 0;
        }) : allPlayers);
      };

      window.openModal = function (id) {
        var p = allPlayers.find(function (x) { return x.id === id; });
        if (!p) return;
        window.editingId = id;
        var set = function (k, v) { var el = document.getElementById(k); if (el) el.value = v; };
        var tit = document.getElementById('modal-title');
        if (tit) tit.textContent = p.nome + ' ' + p.cognome;
        set('f-nome', p.nome || ''); set('f-cognome', p.cognome || '');
        set('f-email', p.email || ''); set('f-telefono', p.telefono || '');
        set('f-coach', p.coach || '');
        var sel = document.getElementById('f-nazionalita');
        var label = NAZ_SELECT[p.nazionalita] || ((p.bandiera || '') + ' ' + (p.nazionalita || ''));
        if (sel) { for (var i = 0; i < sel.options.length; i++) { if (sel.options[i].text === label) { sel.selectedIndex = i; break; } } }
        var modal = document.getElementById('edit-modal');
        if (modal) modal.classList.add('open');
        document.body.style.overflow = 'hidden';
      };

      window.savePlayer = async function () {
        var p = allPlayers.find(function (x) { return x.id === window.editingId; });
        if (!p) return;
        var val = function (id) { var el = document.getElementById(id); return el ? (el.value || '').trim() : ''; };
        p.nome = val('f-nome') || p.nome; p.cognome = val('f-cognome') || p.cognome;
        p.nomeCompleto = p.nome + ' ' + p.cognome;
        p.email = val('f-email'); p.telefono = val('f-telefono');
        var nazFull = val('f-nazionalita');
        if (nazFull) { var parts = nazFull.split(' '); p.bandiera = parts.shift(); p.nazionalita = parts.join(' '); }
        p.coach = val('f-coach');
        try { await SM.savePlayers(torneoId, allPlayers); } catch (e) { showError('Errore salvataggio.'); return; }
        window.closeModal && window.closeModal();
        window.renderPlayers(allPlayers);
      };

      window.confirmDelete = async function () {
        var idx = allPlayers.findIndex(function (x) { return x.id === window.editingId; });
        if (idx >= 0) allPlayers.splice(idx, 1);
        var freshMatches = SM.getMatches(torneoId).filter(function (m) {
          return m.giocatore1_id !== window.editingId && m.giocatore2_id !== window.editingId;
        });
        try { await SM.saveMatches(torneoId, freshMatches); await SM.savePlayers(torneoId, allPlayers); } catch (e) { showError('Errore eliminazione.'); return; }
        window.closeModal && window.closeModal();
        window.renderPlayers(allPlayers);
      };

      window.renderPlayers(allPlayers);
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // INIT 2c — match_dashboard.html
  // ══════════════════════════════════════════════════════════════════

  function initMatchDashboard() {
    var SM = window.StorageManager;
    var torneoId = localStorage.getItem('gr_torneo_id');
    if (!torneoId) return;

    ready(async function () {
      var data;
      try { data = await SM.load(torneoId); } catch (e) { showError('Errore caricamento partite.'); return; }
      if (!data) return;

      var allMatches = data.matches.slice();

      // Ricarica da Supabase e ridisegna tutto
      async function refreshMatches() {
        try { await SM.load(torneoId); } catch (e) {}
        allMatches = SM.getMatches(torneoId).slice();
        renderAll();
      }

      // Render sezione "In attesa"
      function renderPending() {
        var c = document.getElementById('pending-list');
        if (!c) return;
        var pending = allMatches.filter(function (m) { return m.stato === 'in_attesa'; });
        c.innerHTML = '';
        if (!pending.length) {
          c.innerHTML = '<p class="font-label text-[0.7rem] text-gray-600 uppercase tracking-widest text-center py-4">Nessun risultato in attesa</p>';
          return;
        }
        pending.forEach(function (m) {
          var card = document.createElement('div');
          card.className = 'cinematic-card rounded-2xl border border-[#d1ff4b]/20 overflow-hidden';
          card.innerHTML =
            '<div class="px-4 pt-4 pb-3">' +
              '<p class="font-label text-[0.55rem] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-3 flex items-center gap-2">' +
                fmtDataBreve(m.data) +
                ' <span class="text-[#d1ff4b] border border-[#d1ff4b]/30 rounded-full px-1.5 py-0.5">IN ATTESA</span>' +
              '</p>' +
              '<div class="flex items-center justify-between gap-2">' +
                '<div class="flex-1 min-w-0"><span class="font-headline italic font-black text-white uppercase tracking-tight text-[1.05rem] leading-tight block truncate">' + esc(m.giocatore1_nome) + '</span></div>' +
                '<div class="flex items-center gap-2 flex-shrink-0 mx-1">' +
                  '<span class="score-badge">' + m.score1 + '</span>' +
                  '<span class="vs-dot">vs</span>' +
                  '<span class="score-badge">' + m.score2 + '</span>' +
                '</div>' +
                '<div class="flex-1 min-w-0 text-right"><span class="font-headline italic font-black text-white uppercase tracking-tight text-[1.05rem] leading-tight block truncate">' + esc(m.giocatore2_nome) + '</span></div>' +
              '</div>' +
            '</div>' +
            '<div class="h-px bg-white/[0.05] mx-4"></div>' +
            '<button onclick="openModal(\'' + m.id + '\')" class="w-full flex items-center justify-center gap-2 py-3 hover:bg-white/5 transition-colors">' +
              '<span class="material-symbols-outlined text-[#d1ff4b] text-base">edit</span>' +
              '<span class="font-label text-[0.6rem] font-bold text-[#d1ff4b] uppercase tracking-[0.15em]">Modifica</span>' +
            '</button>';
          c.appendChild(card);
        });
      }

      // Render sezione "Completati / Programmati"
      function renderCompleted() {
        var c = document.getElementById('matches-list');
        if (!c) return;
        var visible = allMatches
          .filter(function (m) { return m.stato === 'completata' || m.stato === 'programmata'; })
          .sort(function (a, b) {
            if (a.stato !== b.stato) return a.stato === 'completata' ? -1 : 1;
            return (b.data || '').localeCompare(a.data || '');
          });
        c.innerHTML = '';
        if (!visible.length) {
          c.innerHTML = '<p class="font-label text-[0.7rem] text-gray-600 uppercase tracking-widest text-center py-8">Nessun match trovato</p>';
          return;
        }
        visible.forEach(function (m) {
          var done = m.stato === 'completata';
          var card = document.createElement('div');
          card.className = 'cinematic-card rounded-2xl border border-white/5 overflow-hidden match-card';
          card.innerHTML =
            '<div class="px-4 pt-4 pb-3">' +
              '<p class="font-label text-[0.55rem] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-3 flex items-center gap-2">' +
                fmtDataBreve(m.data) +
                (!done ? ' <span class="text-[#d1ff4b] border border-[#d1ff4b]/20 rounded-full px-1.5 py-0.5">PROGRAMMATA</span>' : '') +
              '</p>' +
              '<div class="flex items-center justify-between gap-2">' +
                '<div class="flex-1 min-w-0"><span class="font-headline italic font-black text-white uppercase tracking-tight text-[1.05rem] leading-tight block truncate">' + esc(m.giocatore1_nome) + '</span></div>' +
                '<div class="flex items-center gap-2 flex-shrink-0 mx-1">' +
                  (done
                    ? '<span class="score-badge">' + m.score1 + '</span><span class="vs-dot">vs</span><span class="score-badge">' + m.score2 + '</span>'
                    : '<span class="vs-dot font-black text-sm">vs</span>') +
                '</div>' +
                '<div class="flex-1 min-w-0 text-right"><span class="font-headline italic font-black text-white uppercase tracking-tight text-[1.05rem] leading-tight block truncate">' + esc(m.giocatore2_nome) + '</span></div>' +
              '</div>' +
            '</div>' +
            '<div class="h-px bg-white/[0.05] mx-4"></div>' +
            '<button onclick="openModal(\'' + m.id + '\')" class="w-full flex items-center justify-center gap-2 py-3 hover:bg-white/5 transition-colors">' +
              '<span class="material-symbols-outlined text-[#d1ff4b] text-base">edit</span>' +
              '<span class="font-label text-[0.6rem] font-bold text-[#d1ff4b] uppercase tracking-[0.15em]">Modifica</span>' +
            '</button>';
          c.appendChild(card);
        });
      }

      function renderAll() {
        renderPending();
        renderCompleted();
      }

      // Esponi renderMatches per compatibilità con home_dashboard
      window.renderMatches = renderAll;

      window.openModal = function (id) {
        var m = allMatches.find(function (x) { return x.id === id; });
        if (!m) return;
        window.editingId = id;
        var set  = function (k, v) { var el = document.getElementById(k); if (el) el.value = v; };
        var setT = function (k, v) { var el = document.getElementById(k); if (el) el.textContent = v; };
        setT('modal-title', m.giocatore1_nome + ' vs ' + m.giocatore2_nome);
        setT('f-label-p1',  m.giocatore1_nome); setT('f-label-p2', m.giocatore2_nome);
        set('f-data', m.data); set('f-score1', m.score1); set('f-score2', m.score2);
        var modal = document.getElementById('edit-modal');
        if (modal) modal.classList.add('open');
        document.body.style.overflow = 'hidden';
      };

      window.saveMatch = async function () {
        var m = allMatches.find(function (x) { return x.id === window.editingId; });
        if (!m) return;
        var val = function (k) { var el = document.getElementById(k); return el ? el.value : ''; };
        m.data = val('f-data') || m.data; m.date = m.data;
        m.score1 = parseInt(val('f-score1'), 10) || 0; m.score2 = parseInt(val('f-score2'), 10) || 0;
        m.punteggio = m.score1 + '-' + m.score2;
        m.vincitore_id = m.score1 > m.score2 ? m.giocatore1_id : m.score2 > m.score1 ? m.giocatore2_id : null;
        m.stato = m.data <= new Date().toISOString().split('T')[0] ? 'completata' : 'programmata';
        try { await SM.saveMatches(torneoId, allMatches); } catch (e) { showError('Errore salvataggio partita.'); return; }
        window.closeModal && window.closeModal();
        renderAll();
      };

      window.deleteMatch = async function () {
        var idx = allMatches.findIndex(function (x) { return x.id === window.editingId; });
        if (idx >= 0) allMatches.splice(idx, 1);
        try { await SM.saveMatches(torneoId, allMatches); } catch (e) { showError('Errore eliminazione partita.'); return; }
        window.closeModal && window.closeModal();
        renderAll();
      };

      // Approvazione: segna come completata e ricalcola rankings
      window.approvaMatch = async function (id) {
        try { await SM.updateMatchStatus(torneoId, id, 'completata'); } catch (e) { showError('Errore approvazione.'); return; }
        await refreshMatches();
      };

      // Rifiuto: rimuove il match dalla lista
      window.rifiutaMatch = async function (id) {
        try { await SM.updateMatchStatus(torneoId, id, 'rifiutata'); } catch (e) { showError('Errore rifiuto.'); return; }
        await refreshMatches();
      };

      renderAll();
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // INIT 3 — home.html (vista utente)
  // ══════════════════════════════════════════════════════════════════

  function initHomeUser() {
    var SM = window.StorageManager;

    ready(async function () {
      var torneoId = localStorage.getItem('gr_torneo_id');
      if (!torneoId) return;
      var data;
      try { data = await SM.load(torneoId); } catch (e) { return; }
      if (!data) return;

      var torneo    = data.torneo;
      var players   = data.players;
      var matches   = data.matches;
      var standings = data.standings;

      var approvedIds = new Set(players.filter(function (p) { return p.stato === 'approvato'; }).map(function (p) { return p.id; }));
      var visibleStandings = standings.filter(function (p) { return approvedIds.has(p.id); });

      window._demoPlayers   = visibleStandings;
      window._demoStandings = visibleStandings;
      window._demoMatches   = matches;
      window._demoPlayersMap = {};
      visibleStandings.forEach(function (p, i) { window._demoPlayersMap[p.id] = Object.assign({}, p, { rank: i + 1 }); });

      var dates = document.getElementById('cd-dates');
      if (dates) dates.textContent = fmtDataBreve(torneo.inizio) + ' — ' + fmtDataBreve(torneo.fine);

      function tickCountdown() {
        if (!torneo.fine) return;
        var diff = Math.max(0, new Date(torneo.fine + 'T23:59:59') - new Date());
        var setN = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = String(v).padStart(2,'0'); };
        setN('cd-days', Math.floor(diff / 86400000));
        setN('cd-hrs',  Math.floor((diff % 86400000) / 3600000));
        setN('cd-min',  Math.floor((diff % 3600000) / 60000));
      }
      function animateCountdownEntry() {
        if (!torneo.fine) { tickCountdown(); return; }
        var diff = Math.max(0, new Date(torneo.fine + 'T23:59:59') - new Date());
        var targets = { 'cd-days': Math.floor(diff / 86400000), 'cd-hrs': Math.floor((diff % 86400000) / 3600000), 'cd-min': Math.floor((diff % 3600000) / 60000) };
        var delays  = { 'cd-days': 0, 'cd-hrs': 80, 'cd-min': 160 };
        Object.keys(targets).forEach(function (id) {
          var el = document.getElementById(id); if (!el) return;
          el.textContent = '00';
          setTimeout(function () {
            var start = null;
            (function frame(ts) {
              if (!start) start = ts;
              var prog = Math.min((ts - start) / 900, 1);
              el.textContent = String(Math.round((1 - Math.pow(1 - prog, 3)) * targets[id])).padStart(2,'0');
              if (prog < 1) requestAnimationFrame(frame); else el.textContent = String(targets[id]).padStart(2,'0');
            })(performance.now());
          }, delays[id]);
        });
      }
      animateCountdownEntry();
      setInterval(tickCountdown, 60000);
      // Ricalcola subito quando l'utente torna sulla tab/finestra
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') tickCountdown();
      });

      var container = document.getElementById('leaderboard-container');
      var emptyMsg  = document.getElementById('empty-leaderboard');
      if (emptyMsg) emptyMsg.remove();
      if (!container) return;

      container.innerHTML = '';
      if (!visibleStandings.length) {
        container.innerHTML = '<p class="font-label text-[0.7rem] text-gray-600 uppercase tracking-widest text-center py-12">Nessun giocatore disponibile</p>';
      } else {
        // ── Trend ranking: confronta con posizioni precedenti ──
        var prevRanksKey = 'gr_prev_ranks_' + torneoId;
        var prevRanks = {};
        try { prevRanks = JSON.parse(localStorage.getItem(prevRanksKey) || '{}'); } catch (e) {}
        var newRanks = {};

        var total = visibleStandings.length;

        visibleStandings.forEach(function (p, i) {
          var rank = i + 1;
          // Gradiente lime→blu in base alla posizione: lime=#D1FF4B, blu=#699CFF
          var t = total > 1 ? (rank - 1) / (total - 1) : 0;
          var cr = Math.round(209 + (105 - 209) * t);
          var cg = Math.round(255 + (156 - 255) * t);
          var cb = Math.round(75  + (255 - 75)  * t);
          var posColor = 'rgb(' + cr + ',' + cg + ',' + cb + ')';
          var ptGlow = rank === 1 ? 'drop-shadow-[0_0_8px_rgba(209,255,75,0.4)]' : '';
          var flagCode = getFlagCode(p.nazionalita, p.bandiera);

          // ── Calcola freccia trend ──
          newRanks[p.id] = rank;
          var prevR = prevRanks[p.id];
          var trendHtml;
          if (!prevR || prevR === rank) {
            trendHtml = '<span style="color:#555;font-size:0.75rem;font-weight:700;line-height:1">—</span>';
          } else if (rank < prevR) {
            trendHtml = '<span style="color:#D1FF4B;font-size:0.75rem;line-height:1">▲</span>';
          } else {
            trendHtml = '<span style="color:#f87171;font-size:0.75rem;line-height:1">▼</span>';
          }

          var row = document.createElement('div');
          row.className = 'leaderboard-row flex items-center px-4 py-4 rounded-xl relative overflow-hidden premium-card';
          row.setAttribute('data-global-rank', rank);
          row.style.cursor = 'pointer';
          row.innerHTML =
            '<div class="absolute right-2 font-headline font-black italic pointer-events-none select-none leading-none" style="font-size:95px;bottom:-30px;color:rgba(255,255,255,0.07);">' + rank + '</div>' +
            '<div class="pos-display w-10 font-headline font-black italic text-xl" style="color:' + posColor + '">' + String(rank).padStart(2,'0') + '</div>' +
            '<div class="flex-1 ml-4 flex items-center gap-4 min-w-0"><img alt="' + esc(p.nazionalita || '') + '" class="w-7 h-[18px] object-cover rounded shadow shrink-0 border border-white/5" src="https://flagcdn.com/w40/' + flagCode + '.png"/><div class="flex flex-col min-w-0"><span class="text-[9px] font-medium tracking-widest text-[#888888] uppercase truncate">' + esc(p.nome) + '</span><span class="text-base font-headline font-black italic text-white uppercase leading-none truncate">' + esc(p.cognome) + '</span></div></div>' +
            '<div class="flex items-center gap-1"><div class="trend-col">' + trendHtml + '</div><div class="w-20 text-right"><span class="text-base font-headline font-black italic text-white tracking-tighter ' + ptGlow + '">' + p.punti + '</span></div></div>';
          (function (player, r) {
            row.addEventListener('click', function () {
              var currentUserId = localStorage.getItem('gr_user_id');
              if (player.id && player.id === currentUserId) {
                // È l'utente corrente: apri la scheda profilo personale
                var btnProfile = document.getElementById('btnOpenProfile');
                if (btnProfile) { btnProfile.click(); }
              } else {
                if (typeof window.fillPlayerSheetFromObj === 'function') window.fillPlayerSheetFromObj(player, r);
              }
            });
          })(p, rank);
          container.appendChild(row);
        });

        // Salva le posizioni attuali per il prossimo confronto
        localStorage.setItem(prevRanksKey, JSON.stringify(newRanks));
      }

      // ── Popola "Ultimi Match" ──
      (function () {
        var umContainer = document.getElementById('ultimi-match-container');
        if (!umContainer) return;
        var completati = matches
          .filter(function (m) { return m.stato === 'completata'; })
          .sort(function (a, b) { return (b.data || '').localeCompare(a.data || ''); });
        if (!completati.length) return; // lascia il messaggio di default

        // ── Raggruppa per data ──
        var mesi = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
        var byDate = {}, dateOrder = [];
        completati.forEach(function (m) {
          var d = m.data || '';
          if (!byDate[d]) { byDate[d] = []; dateOrder.push(d); }
          byDate[d].push(m);
        });

        var html = '';
        dateOrder.forEach(function (d, di) {
          var dp = d.split('-');
          var dataLabel = dp.length === 3
            ? dp[2] + ' ' + mesi[parseInt(dp[1], 10) - 1] + ' ' + dp[0]
            : d;
          html += '<p class="text-center text-white font-label font-bold text-[10px] uppercase tracking-[0.2em]' + (di === 0 ? ' mt-1' : ' mt-5') + ' mb-2">' + dataLabel + '</p>';

          byDate[d].forEach(function (m) {
            var n1 = (m.giocatore1_nome || '').toUpperCase();
            var n2 = (m.giocatore2_nome || '').toUpperCase();
            var s1 = m.score1 != null ? m.score1 : '—';
            var s2 = m.score2 != null ? m.score2 : '—';
            var col1 = s1 > s2 ? '#D1FF4B' : 'rgba(255,255,255,0.35)';
            var col2 = s2 > s1 ? '#D1FF4B' : 'rgba(255,255,255,0.35)';
            html +=
              '<div class="premium-card rounded-xl px-4 py-3.5 flex items-center gap-3 mb-2">' +
                '<div class="flex-1 min-w-0">' +
                  '<p class="font-headline font-black italic text-white uppercase text-sm leading-none truncate">' + esc(n1) + '</p>' +
                '</div>' +
                '<div class="flex items-center gap-1.5 flex-shrink-0">' +
                  '<span class="font-headline font-black italic text-2xl leading-none" style="color:' + col1 + '">' + s1 + '</span>' +
                  '<span class="text-[#444] font-black text-base leading-none">–</span>' +
                  '<span class="font-headline font-black italic text-2xl leading-none" style="color:' + col2 + '">' + s2 + '</span>' +
                '</div>' +
                '<div class="flex-1 min-w-0 text-right">' +
                  '<p class="font-headline font-black italic text-white uppercase text-sm leading-none truncate">' + esc(n2) + '</p>' +
                '</div>' +
              '</div>';
          });
        });
        umContainer.innerHTML = html;
      })();

      if (typeof window.switchTab === 'function') window.switchTab(0);

      // Espone i risultati (W/L) degli ultimi 5 match per data, usato dal trend nei profili
      window._getPlayerMatchResults = function (playerId) {
        return matches
          .filter(function (m) { return m.stato === 'completata' && (m.giocatore1_id === playerId || m.giocatore2_id === playerId); })
          .sort(function (a, b) { var da = a.data || '', db = b.data || ''; return db > da ? 1 : db < da ? -1 : 0; })
          .slice(0, 5)
          .map(function (m) {
            var iAmP1 = m.giocatore1_id === playerId;
            var myS = iAmP1 ? m.score1 : m.score2;
            var avvS = iAmP1 ? m.score2 : m.score1;
            return myS > avvS ? 'W' : 'L';
          });
      };

      window._buildMatches = function (p) {
        var mine = matches.filter(function (m) { return m.stato === 'completata' && (m.giocatore1_id === p.id || m.giocatore2_id === p.id); }).sort(function (a, b) { var da = a.data || '', db = b.data || ''; return db > da ? 1 : db < da ? -1 : 0; }).slice(0, 8);
        if (!mine.length) return '<div class="cinematic-card rounded-[14px] p-4 shrink-0 w-[220px] flex items-center justify-center"><p class="text-[10px] text-[#666] uppercase tracking-widest text-center">Nessun match giocato</p></div>';
        return mine.map(function (m) {
          var iAmP1 = m.giocatore1_id === p.id, myS = iAmP1 ? m.score1 : m.score2, avvS = iAmP1 ? m.score2 : m.score1, avvN = iAmP1 ? m.giocatore2_nome : m.giocatore1_nome;
          if (typeof window._matchCardHTML === 'function') return window._matchCardHTML(avvN, fmtMese(m.data), myS, avvS);
          var win = myS > avvS, col = win ? '#D1FF4B' : '#f87171';
          return '<div class="cinematic-card rounded-[14px] p-4 shrink-0 w-[155px]"><p class="text-[9px] text-[#888]">' + fmtMese(m.data) + '</p><p class="text-sm font-headline font-black italic text-white uppercase">' + esc(avvN) + '</p><p class="text-xl font-headline font-black italic" style="color:' + col + ';-webkit-text-fill-color:' + col + '">' + myS + '-' + avvS + '</p></div>';
        }).join('');
      };

      if (localStorage.getItem('gr_role') === 'spectator') document.body.setAttribute('data-role', 'spectator');

      // ── Notifiche: match in attesa di conferma per questo utente ──
      var userId = localStorage.getItem('gr_user_id');
      if (userId) {
        var myPending = matches.filter(function (m) { return m.stato === 'in_attesa' && m.giocatore2_id === userId; });

        // Auto-approvazione dopo 24h
        var toAutoApprove = myPending.filter(function (m) {
          return m.inviato_il && (Date.now() - new Date(m.inviato_il).getTime()) > 24 * 3600 * 1000;
        });
        if (toAutoApprove.length) {
          Promise.all(toAutoApprove.map(function (m) {
            return SM.updateMatchStatus(torneoId, m.id, 'completata').catch(function () {});
          })).then(function () {
            myPending = myPending.filter(function (m) {
              return !toAutoApprove.find(function (a) { return a.id === m.id; });
            });
            _showNotifiche(myPending);
          });
        }

        function _showNotifiche(list) {
          // Badge sull'icona profilo
          var badge = document.getElementById('notif-badge');
          if (badge) badge.classList.toggle('hidden', !list.length);
          // Sezione nel profile sheet
          var section = document.getElementById('notif-section');
          var listEl  = document.getElementById('notif-list');
          if (!section || !listEl) return;
          section.classList.toggle('hidden', !list.length);
          listEl.innerHTML = list.map(function (m) {
            // Spezza nome completo in nome (piccolo) + COGNOME (bold), come nelle card classifica
            var split1 = (m.giocatore1_nome || '').trim().split(' ');
            var cog1 = esc(split1.pop().toUpperCase()), nom1 = esc(split1.join(' '));
            var split2 = (m.giocatore2_nome || '').trim().split(' ');
            var cog2 = esc(split2.pop().toUpperCase()), nom2 = esc(split2.join(' '));
            var nameStyle = 'flex:1;min-width:0;overflow:hidden';
            var nomStyle  = 'font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.4);overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
            var cogStyle  = 'font-family:Epilogue;font-weight:900;font-style:italic;font-size:0.95rem;text-transform:uppercase;line-height:1.1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
            return '<div style="background:#1a0808;border-radius:16px;border:1px solid rgba(255,180,171,0.25);overflow:hidden">' +
              '<div style="padding:12px 16px 10px">' +
                '<p style="font-size:0.52rem;color:#6b7280;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;margin-bottom:8px">' + fmtDataBreve(m.data) + '</p>' +
                '<div style="display:flex;align-items:center;gap:8px">' +
                  // Giocatore 1 — allineato a sinistra
                  '<div style="' + nameStyle + '">' +
                    '<p style="' + nomStyle + '">' + nom1 + '</p>' +
                    '<p style="' + cogStyle + ';color:#fff">' + cog1 + '</p>' +
                  '</div>' +
                  // Punteggio — centro, mai compresso
                  '<div style="display:flex;align-items:center;gap:5px;flex-shrink:0">' +
                    '<span style="font-family:Epilogue;font-weight:900;font-style:italic;font-size:1.25rem;color:#ffb4ab;-webkit-text-fill-color:#ffb4ab">' + m.score1 + '</span>' +
                    '<span style="font-size:0.5rem;color:rgba(255,255,255,0.2);font-weight:700">–</span>' +
                    '<span style="font-family:Epilogue;font-weight:900;font-style:italic;font-size:1.25rem;color:#ffb4ab;-webkit-text-fill-color:#ffb4ab">' + m.score2 + '</span>' +
                  '</div>' +
                  // Giocatore 2 — allineato a destra
                  '<div style="' + nameStyle + ';text-align:right">' +
                    '<p style="' + nomStyle + '">' + nom2 + '</p>' +
                    '<p style="' + cogStyle + ';color:rgba(255,255,255,0.75)">' + cog2 + '</p>' +
                  '</div>' +
                '</div>' +
              '</div>' +
              '<div style="height:1px;background:rgba(255,255,255,0.05);margin:0 16px"></div>' +
              '<div style="display:flex">' +
                '<button onclick="window._contestaMatch(\'' + m.id + '\')" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:13px 0;background:none;border:none;cursor:pointer;-webkit-tap-highlight-color:transparent">' +
                  '<span class="material-symbols-outlined" style="color:#ffb4ab;font-size:1.1rem;-webkit-text-fill-color:#ffb4ab">close</span>' +
                  '<span style="color:#ffb4ab;-webkit-text-fill-color:#ffb4ab;font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em">Contesta</span>' +
                '</button>' +
                '<div style="width:1px;background:rgba(255,255,255,0.05)"></div>' +
                '<button onclick="window._approvaMatch(\'' + m.id + '\')" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:13px 0;background:none;border:none;cursor:pointer;-webkit-tap-highlight-color:transparent">' +
                  '<span class="material-symbols-outlined" style="color:#D1FF4B;font-size:1.1rem;-webkit-text-fill-color:#D1FF4B">check</span>' +
                  '<span style="color:#D1FF4B;-webkit-text-fill-color:#D1FF4B;font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em">Approva</span>' +
                '</button>' +
              '</div>' +
            '</div>';
          }).join('');
        }

        window._approvaMatch = async function (id) {
          try { await SM.updateMatchStatus(torneoId, id, 'completata'); } catch (e) {}
          location.reload();
        };
        window._contestaMatch = function (id) {
          // Crea un modal inline per raccogliere il motivo della contestazione
          var backdrop = document.createElement('div');
          backdrop.id = '_contesta-backdrop';
          backdrop.style.cssText = [
            'position:fixed;inset:0;background:rgba(0,0,0,0.82);',
            'backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);',
            'z-index:9999;display:flex;align-items:flex-end;justify-content:center;',
          ].join('');
          backdrop.innerHTML = [
            '<div style="background:linear-gradient(180deg,#222 0%,#141414 100%);',
              'border-radius:32px 32px 0 0;border:1px solid rgba(255,255,255,0.12);',
              'border-bottom:none;width:100%;max-width:480px;padding:28px 24px 48px;',
              'box-shadow:0 -8px 60px rgba(0,0,0,0.9),inset 0 1px 0 rgba(255,180,171,0.18);">',
              '<div style="width:40px;height:4px;background:rgba(255,255,255,0.18);',
                'border-radius:999px;margin:0 auto 24px;"></div>',
              '<p style="font-family:Inter,sans-serif;font-size:10px;font-weight:700;',
                'text-transform:uppercase;letter-spacing:0.18em;color:rgba(255,180,171,0.7);margin-bottom:6px;">',
                'Contestazione match</p>',
              '<h4 style="font-family:Epilogue,sans-serif;font-style:italic;font-weight:900;',
                'font-size:20px;color:white;text-transform:uppercase;margin-bottom:18px;line-height:1.1;">',
                'Aggiungi un commento</h4>',
              '<p style="font-family:Inter,sans-serif;font-size:12px;color:rgba(255,255,255,0.4);',
                'margin-bottom:14px;line-height:1.5;">',
                'Spiega brevemente il motivo della contestazione (opzionale).</p>',
              '<textarea id="_contesta-nota" placeholder="Es: Il risultato inserito non è corretto..."',
                ' style="width:100%;background:rgba(255,255,255,0.06);',
                'border:1px solid rgba(255,255,255,0.15);border-radius:16px;',
                'padding:14px 16px;font-size:14px;color:white;outline:none;',
                'font-family:Inter,sans-serif;resize:none;height:96px;',
                'box-sizing:border-box;display:block;"></textarea>',
              '<div style="display:flex;gap:12px;margin-top:20px;">',
                '<button id="_contesta-cancel"',
                  ' style="flex:1;background:rgba(255,255,255,0.05);',
                  'border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:16px;',
                  'font-family:Inter,sans-serif;font-size:11px;font-weight:700;',
                  'color:rgba(255,255,255,0.45);text-transform:uppercase;',
                  'letter-spacing:0.1em;cursor:pointer;">Annulla</button>',
                '<button id="_contesta-confirm"',
                  ' style="flex:1;background:rgba(147,0,10,0.75);',
                  'border:1px solid rgba(255,180,171,0.25);border-radius:16px;padding:16px;',
                  'font-family:Epilogue,sans-serif;font-style:italic;font-weight:900;',
                  'font-size:16px;color:#ffb4ab;text-transform:uppercase;cursor:pointer;">',
                  'Contesta</button>',
              '</div>',
            '</div>',
          ].join('');
          document.body.appendChild(backdrop);

          // Focus automatico sulla textarea
          setTimeout(function () {
            var ta = document.getElementById('_contesta-nota');
            if (ta) ta.focus();
          }, 80);

          document.getElementById('_contesta-cancel').addEventListener('click', function () {
            document.body.removeChild(backdrop);
          });
          document.getElementById('_contesta-confirm').addEventListener('click', async function () {
            var nota = (document.getElementById('_contesta-nota').value || '').trim();
            document.body.removeChild(backdrop);
            try {
              await SM.updateMatchStatus(torneoId, id, 'contestata',
                nota ? { nota_contestazione: nota } : {});
            } catch (e) {}
            location.reload();
          });
        };

        _showNotifiche(myPending);
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // INIT 4/5 — player_profile / user_profile
  // ══════════════════════════════════════════════════════════════════

  function fillProfile(p, rank, prefix, data) {
    var setN = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    setN(prefix + 'firstname',     (p.nome || '').trim());
    setN(prefix + 'lastname',      (p.cognome || '').toUpperCase());
    setN(prefix + 'punti',         p.punti + ' PUNTI');
    setN(prefix + 'rank',          '#' + rank);
    setN(prefix + 'gruppo',        (p.nazionalita || '').toUpperCase());
    // Aggiorna la bandiera dinamicamente (se c'è un elemento apposito)
    var flagEl = document.getElementById(prefix + 'flag');
    if (flagEl) {
      var flagCode = getFlagCode(p.nazionalita, p.bandiera);
      flagEl.src = 'https://flagcdn.com/w40/' + flagCode + '.png';
      flagEl.alt = p.nazionalita || '';
    }
    var wr = p.match_giocati > 0 ? Math.round(p.vittorie / p.match_giocati * 100) : 0;
    setN(prefix + 'wr-pct',        wr + '%');
    setN(prefix + 'wr-label',      wrLabel(wr));
    setN(prefix + 'stat-vittorie', p.vittorie);
    setN(prefix + 'stat-match',    p.match_giocati);
    setN(prefix + 'stat-sconfitte',p.sconfitte);
    setN(prefix + 'stat-punti',    p.punti);
    var gp = document.querySelector('.gauge-path');
    if (gp) { gp.style.transition = 'none'; gp.style.strokeDashoffset = '283'; setTimeout(function () { gp.style.transition = 'stroke-dashoffset 1.4s cubic-bezier(0.4,0,0.2,1)'; gp.style.strokeDashoffset = String(283 - (283 * wr / 100)); }, 500); }
    var trend = document.getElementById(prefix + 'trend');
    if (trend) {
      trend.innerHTML = '';
      var seq = [];
      // Usa i match reali ordinati per data (ultimi 5) per mostrare l'andamento cronologico
      if (data && data.matches) {
        var mine = data.matches
          .filter(function (m) { return m.stato === 'completata' && (m.giocatore1_id === p.id || m.giocatore2_id === p.id); })
          .sort(function (a, b) { var da = a.data || '', db = b.data || ''; return db > da ? 1 : db < da ? -1 : 0; })
          .slice(0, 5);
        mine.forEach(function (m) {
          var iAmP1 = m.giocatore1_id === p.id;
          var myS = iAmP1 ? m.score1 : m.score2;
          var avvS = iAmP1 ? m.score2 : m.score1;
          seq.push(myS > avvS ? 'W' : 'L');
        });
      } else {
        // Fallback se i match non sono disponibili
        for (var v = 0; v < Math.min(p.vittorie, 4); v++) seq.push('W');
        for (var s = 0; s < Math.min(p.sconfitte, 3); s++) seq.push('L');
        seq = seq.slice(0, 5);
      }
      seq.forEach(function (r) {
        var dot = document.createElement('div');
        var isW = r === 'W';
        dot.style.cssText = 'width:2rem;height:2rem;border-radius:9999px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:0.75rem;font-style:italic;flex-shrink:0;' +
          (isW
            ? 'background:#D1FF4B;color:#4a6000;-webkit-text-fill-color:#4a6000'
            : 'background:rgba(239,68,68,0.2);color:#f87171;-webkit-text-fill-color:#f87171;border:1px solid rgba(239,68,68,0.3)');
        dot.textContent = r;
        trend.appendChild(dot);
      });
    }
    var matchesEl = document.getElementById(prefix + 'matches');
    if (matchesEl && data) {
      var mine = data.matches.filter(function (m) { return m.stato === 'completata' && (m.giocatore1_id === p.id || m.giocatore2_id === p.id); }).sort(function (a, b) { var da = a.data || '', db = b.data || ''; return db > da ? 1 : db < da ? -1 : 0; }).slice(0, 5);
      if (!mine.length) { matchesEl.innerHTML = '<p class="font-label text-[0.7rem] text-gray-600 uppercase tracking-widest text-center py-4">Nessun match giocato</p>'; }
      else {
        matchesEl.innerHTML = mine.map(function (m) {
          var iAmP1 = m.giocatore1_id === p.id, myS = iAmP1 ? m.score1 : m.score2, avvS = iAmP1 ? m.score2 : m.score1, avvN = iAmP1 ? m.giocatore2_nome : m.giocatore1_nome, win = myS > avvS;
          var col = win ? '#D1FF4B' : '#f87171';
          var bdgBg = win ? 'rgba(209,255,75,0.12)' : 'rgba(239,68,68,0.2)';
          var bdgBorder = win ? '' : 'border:1px solid rgba(239,68,68,0.3);';
          var parts = (avvN || '').trim().split(' '), avvCog = esc((parts.pop() || '').toUpperCase()), avvNom = esc(parts.join(' '));
          return '<div class="cinematic-card flex items-center justify-between p-4 transition-transform active:scale-[0.98] rounded-2xl" style="gap:8px"><div class="flex items-center gap-3 min-w-0"><div style="width:2rem;height:2rem;border-radius:9999px;background:' + bdgBg + ';' + bdgBorder + 'display:flex;align-items:center;justify-content:center;flex-shrink:0"><span style="font-weight:900;font-style:italic;font-size:10px;color:' + col + ';-webkit-text-fill-color:' + col + '">' + (win ? 'W' : 'L') + '</span></div><div class="min-w-0"><p class="font-headline font-bold italic text-white uppercase text-sm truncate">' + (avvNom ? avvNom.charAt(0) + '. ' : '') + avvCog + '</p><p class="text-[9px] text-[#888888] uppercase">' + fmtDataBreve(m.data) + '</p></div></div><p class="font-headline font-black italic text-xl flex-shrink-0" style="color:' + col + ';-webkit-text-fill-color:' + col + '">' + myS + ' - ' + avvS + '</p></div>';
        }).join('');
      }
    }
  }

  function initPlayerProfile() {
    ready(async function () {
      var torneoId = localStorage.getItem('gr_torneo_id');
      if (!torneoId) return;
      var data;
      try { data = await window.StorageManager.load(torneoId); } catch (e) { return; }
      if (!data || !data.players.length) return;
      var urlId = new URLSearchParams(window.location.search).get('id');
      var p = urlId ? data.players.find(function (x) { return x.id === urlId; }) : data.players[0];
      if (!p) return;
      var rank = data.standings.findIndex(function (x) { return x.id === p.id; }) + 1 || 1;
      fillProfile(p, rank, 'pp-', data);

      // Imposta il link WhatsApp sul bottone sfida
      if (typeof window.setBtnSfida === 'function') window.setBtnSfida(p.telefono, p.nome);
    });
  }

  function initUserProfile() {
    ready(async function () {
      var torneoId = localStorage.getItem('gr_torneo_id');
      if (!torneoId) return;
      var data;
      try { data = await window.StorageManager.load(torneoId); } catch (e) { return; }
      if (!data || !data.players.length) return;
      var userId = localStorage.getItem('gr_user_id');
      var p = userId ? data.players.find(function (x) { return x.id === userId; }) : null;
      if (!p && data.standings.length) p = data.standings[0];
      if (!p) return;
      var rank = data.standings.findIndex(function (x) { return x.id === p.id; }) + 1 || 1;
      fillProfile(p, rank, 'up-', data);
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // INIT 6 — iscrizioni_dashboard.html (pagina iscrizioni separata)
  // ══════════════════════════════════════════════════════════════════

  function initIscrizioni() {
    var SM = window.StorageManager;

    ready(async function () {
      var torneoId = localStorage.getItem('gr_torneo_id');
      if (!torneoId) return;

      var data;
      try { data = await SM.load(torneoId); } catch (e) { showError('Errore caricamento iscrizioni.'); return; }
      if (!data) return;

      async function refreshIscrizioni() {
        try { await SM.load(torneoId); } catch (e) {}
        var freshPlayers = SM.getPlayers(torneoId);
        var pend = freshPlayers.filter(function (p) { return !p.stato || p.stato === 'pendente'; });
        var appr = freshPlayers.filter(function (p) { return p.stato === 'approvato'; });
        var rifi = freshPlayers.filter(function (p) { return p.stato === 'rifiutato'; });

        var setN = function (id, n) { var el = document.getElementById(id); if (el) el.textContent = n; };
        setN('count-attesa',    pend.length);
        setN('count-approvate', appr.length);
        setN('count-rifiutate', rifi.length);

        renderIscPanel('panel-attesa',    pend, 'pendente',  'Nessuna iscrizione in attesa');
        renderIscPanel('panel-approvate', appr, 'approvato', 'Nessuna iscrizione approvata');
        renderIscPanel('panel-rifiutate', rifi, 'rifiutato', 'Nessuna iscrizione rifiutata');
      }

      function renderIscPanel(panelId, list, stato, emptyMsg) {
        var panel = document.getElementById(panelId);
        if (!panel) return;
        panel.innerHTML = '';
        if (!list.length) { panel.innerHTML = '<p class="font-label text-[0.7rem] text-gray-600 uppercase tracking-widest text-center py-8">' + emptyMsg + '</p>'; return; }
        list.forEach(function (p, i) {
          var card = document.createElement('div');
          card.className = 'reg-card cinematic-card rounded-2xl p-4 border border-white/5 hover:brightness-110 transition-all duration-200';
          card.setAttribute('data-player-id', p.id);
          card.style.animationDelay = (i * 0.05 + 0.04) + 's';
          if (stato === 'pendente') {
            card.innerHTML =
              '<div class="flex items-center justify-between">' +
                '<div class="flex flex-col">' +
                  '<span class="font-label text-[0.58rem] text-gray-500 uppercase tracking-widest">' + esc(p.nazionalita || '') + ' ' + esc(p.bandiera || '') + '</span>' +
                  '<span class="font-headline italic font-black text-2xl text-white uppercase tracking-tighter">' + esc(p.cognome) + '</span>' +
                  '<span class="font-label text-[0.55rem] text-gray-600 uppercase tracking-widest mt-0.5">' + esc(p.nome) + ' · ' + esc(p.eta || '—') + ' anni</span>' +
                '</div>' +
                '<div class="flex gap-2">' +
                  '<button onclick="rifiuta(this)" class="w-9 h-9 rounded-full border border-error/30 flex items-center justify-center bg-black/40 hover:bg-error transition-all"><span class="material-symbols-outlined text-error" style="font-size:1.1rem">close</span></button>' +
                  '<button onclick="approva(this)" class="w-9 h-9 rounded-full bg-[#d1ff4b] flex items-center justify-center rim-light hover:brightness-125 transition-all"><span class="material-symbols-outlined text-on-primary-fixed" style="font-size:1.1rem">check</span></button>' +
                '</div>' +
              '</div>';
          } else {
            var isApp = stato === 'approvato';
            card.innerHTML =
              '<div class="flex flex-col">' +
                '<span class="font-label text-[0.58rem] text-gray-500 uppercase tracking-widest">' + esc(p.nome) + ' · ' + esc(p.nazionalita || '') + ' ' + esc(p.bandiera || '') + '</span>' +
                '<span class="font-headline italic font-black text-2xl text-white uppercase tracking-tighter">' + esc(p.cognome) + '</span>' +
              '</div>' +
              '<div class="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">' +
                '<span class="material-symbols-outlined ' + (isApp ? 'text-green-400' : 'text-error') + '" style="font-size:1.1rem;font-variation-settings:\'FILL\' 1">' + (isApp ? 'check_circle' : 'cancel') + '</span>' +
                '<span class="font-label text-[0.6rem] ' + (isApp ? 'text-green-400' : 'text-error') + ' font-bold uppercase tracking-widest">' + (isApp ? 'Approvato' : 'Rifiutato') + '</span>' +
              '</div>';
          }
          panel.appendChild(card);
        });
      }

      window.approva = async function (btn) {
        var card = btn && btn.closest && btn.closest('.reg-card');
        if (!card) return;
        var pid = card.getAttribute('data-player-id');
        if (pid) { try { await SM.updatePlayerStatus(torneoId, pid, 'approvato'); } catch (e) { showError('Errore approvazione.'); return; } }
        await refreshIscrizioni();
      };
      window.rifiuta = async function (btn) {
        var card = btn && btn.closest && btn.closest('.reg-card');
        if (!card) return;
        var pid = card.getAttribute('data-player-id');
        if (pid) { try { await SM.updatePlayerStatus(torneoId, pid, 'rifiutato'); } catch (e) { showError('Errore rifiuto.'); return; } }
        await refreshIscrizioni();
      };

      await refreshIscrizioni();
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // INIT 2d — contestazioni_dashboard.html
  // ══════════════════════════════════════════════════════════════════

  function initContestazioni() {
    var SM = window.StorageManager;
    var torneoId = localStorage.getItem('gr_torneo_id');
    if (!torneoId) return;

    ready(async function () {
      var data;
      try { data = await SM.load(torneoId); } catch (e) { showError('Errore caricamento.'); return; }
      if (!data) return;

      var allMatches = data.matches.slice();

      async function refreshContestazioni() {
        try { await SM.load(torneoId); } catch (e) {}
        allMatches = SM.getMatches(torneoId).slice();
        renderAll();
      }

      function renderAll() {
        var c = document.getElementById('contestazioni-list');
        if (!c) return;
        var contested = allMatches.filter(function (m) { return m.stato === 'contestata'; });
        var badge = document.getElementById('contestazioni-count');
        if (badge) badge.textContent = String(contested.length);
        c.innerHTML = '';
        if (!contested.length) {
          c.innerHTML = '<p class="font-label text-[0.7rem] text-gray-600 uppercase tracking-widest text-center py-12">Nessuna contestazione aperta</p>';
          return;
        }
        contested.forEach(function (m) {
          var card = document.createElement('div');
          card.className = 'cinematic-card rounded-2xl border border-[#ffb4ab]/30 overflow-hidden mb-3';
          card.innerHTML =
            '<div class="px-4 pt-4 pb-3">' +
              '<p class="font-label text-[0.55rem] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-1 flex items-center gap-2">' +
                fmtDataBreve(m.data) +
                ' <span class="text-[#ffb4ab] border border-[#ffb4ab]/30 rounded-full px-1.5 py-0.5">CONTESTATA</span>' +
              '</p>' +
              (m.nota_contestazione ? '<p class="font-label text-[0.6rem] text-gray-400 mb-3 mt-1 italic">"' + esc(m.nota_contestazione) + '"</p>' : '<div class="mb-3"></div>') +
              '<div class="flex items-center justify-between gap-2">' +
                '<div class="flex-1 min-w-0">' +
                  '<span class="font-label text-[0.55rem] text-gray-600 uppercase tracking-widest block mb-0.5">Risultato inviato</span>' +
                  '<span class="font-headline italic font-black text-white uppercase tracking-tight text-[1.05rem] leading-tight block truncate">' + esc(m.giocatore1_nome) + '</span>' +
                '</div>' +
                '<div class="flex items-center gap-2 flex-shrink-0 mx-1">' +
                  '<span class="score-badge" style="color:#ffb4ab">' + m.score1 + '</span>' +
                  '<span class="vs-dot">vs</span>' +
                  '<span class="score-badge" style="color:#ffb4ab">' + m.score2 + '</span>' +
                '</div>' +
                '<div class="flex-1 min-w-0 text-right">' +
                  '<span class="font-label text-[0.55rem] text-gray-600 uppercase tracking-widest block mb-0.5">Avversario</span>' +
                  '<span class="font-headline italic font-black text-white uppercase tracking-tight text-[1.05rem] leading-tight block truncate">' + esc(m.giocatore2_nome) + '</span>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="h-px bg-white/[0.05] mx-4"></div>' +
            '<div class="flex">' +
              '<button onclick="accettaRisultato(\'' + m.id + '\')" class="flex-1 flex items-center justify-center gap-2 py-3 hover:bg-[#d1ff4b]/10 transition-colors">' +
                '<span class="material-symbols-outlined text-[#d1ff4b] text-base">check_circle</span>' +
                '<span class="font-label text-[0.55rem] font-bold text-[#d1ff4b] uppercase tracking-[0.12em]">Conferma</span>' +
              '</button>' +
              '<div class="w-px bg-white/[0.05]"></div>' +
              '<button onclick="modificaMatch(\'' + m.id + '\')" class="flex-1 flex items-center justify-center gap-2 py-3 hover:bg-white/5 transition-colors">' +
                '<span class="material-symbols-outlined text-white/60 text-base">edit</span>' +
                '<span class="font-label text-[0.55rem] font-bold text-white/60 uppercase tracking-[0.12em]">Modifica</span>' +
              '</button>' +
              '<div class="w-px bg-white/[0.05]"></div>' +
              '<button onclick="annullaMatch(\'' + m.id + '\')" class="flex-1 flex items-center justify-center gap-2 py-3 hover:bg-red-500/10 transition-colors">' +
                '<span class="material-symbols-outlined text-[#ffb4ab] text-base">cancel</span>' +
                '<span class="font-label text-[0.55rem] font-bold text-[#ffb4ab] uppercase tracking-[0.12em]">Annulla</span>' +
              '</button>' +
            '</div>';
          c.appendChild(card);
        });
      }

      // Conferma il risultato inviato → classifica si aggiorna
      window.accettaRisultato = async function (id) {
        try { await SM.updateMatchStatus(torneoId, id, 'completata'); }
        catch (e) { showError('Errore conferma.'); return; }
        await refreshContestazioni();
      };

      // Annulla il match → torna a programmata (da rigiocare)
      window.annullaMatch = async function (id) {
        try { await SM.updateMatchStatus(torneoId, id, 'programmata'); }
        catch (e) { showError('Errore annullamento.'); return; }
        await refreshContestazioni();
      };

      // Modifica risultato e data di un match contestato
      window.modificaMatch = function (id) {
        var m = allMatches.find(function (x) { return x.id === id; });
        if (!m) return;

        // Rimuovi eventuale modal precedente
        var old = document.getElementById('_modifica-backdrop');
        if (old) document.body.removeChild(old);

        var backdrop = document.createElement('div');
        backdrop.id = '_modifica-backdrop';
        backdrop.style.cssText = [
          'position:fixed;inset:0;background:rgba(0,0,0,0.85);',
          'backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);',
          'z-index:9999;display:flex;align-items:flex-end;justify-content:center;',
        ].join('');

        var inputStyle = [
          'width:100%;background:rgba(255,255,255,0.06);',
          'border:1px solid rgba(255,255,255,0.15);border-radius:14px;',
          'padding:13px 15px;font-size:14px;color:white;outline:none;',
          'font-family:Inter,sans-serif;box-sizing:border-box;',
          '-webkit-appearance:none;appearance:none;',
          'color-scheme:dark;',
        ].join('');

        var labelStyle = [
          'display:block;font-family:Inter,sans-serif;font-size:10px;',
          'font-weight:700;text-transform:uppercase;letter-spacing:0.18em;',
          'color:rgba(255,255,255,0.5);margin-bottom:6px;margin-left:2px;',
        ].join('');

        backdrop.innerHTML = [
          '<div style="background:linear-gradient(180deg,#232323 0%,#141414 100%);',
            'border-radius:32px 32px 0 0;border:1px solid rgba(255,255,255,0.12);',
            'border-bottom:none;width:100%;max-width:480px;padding:28px 24px 48px;',
            'box-shadow:0 -8px 60px rgba(0,0,0,0.9),inset 0 1px 0 rgba(209,255,75,0.12);">',

            // Drag handle
            '<div style="width:40px;height:4px;background:rgba(255,255,255,0.18);',
              'border-radius:999px;margin:0 auto 22px;"></div>',

            // Header
            '<p style="font-family:Inter,sans-serif;font-size:10px;font-weight:700;',
              'text-transform:uppercase;letter-spacing:0.18em;color:rgba(255,255,255,0.4);margin-bottom:4px;">',
              'Modifica match contestato</p>',
            '<h4 style="font-family:Epilogue,sans-serif;font-style:italic;font-weight:900;',
              'font-size:18px;color:white;text-transform:uppercase;margin-bottom:22px;line-height:1.1;">',
              esc(m.giocatore1_nome || '—') + ' vs ' + esc(m.giocatore2_nome || '—') + '</h4>',

            // Data
            '<div style="margin-bottom:16px;">',
              '<label style="' + labelStyle + '">Data partita</label>',
              '<input id="_mod-data" type="date" value="' + (m.data || '') + '" style="' + inputStyle + '">',
            '</div>',

            // Punteggio
            '<label style="' + labelStyle + '">Punteggio</label>',
            '<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;margin-bottom:24px;">',
              '<div>',
                '<p style="font-family:Inter,sans-serif;font-size:9px;font-weight:700;',
                  'text-transform:uppercase;letter-spacing:0.12em;color:rgba(255,255,255,0.35);',
                  'margin-bottom:6px;text-align:center;">' + esc((m.giocatore1_nome || 'Giocatore 1').split(' ').pop()) + '</p>',
                '<input id="_mod-s1" type="number" min="0" max="99" value="' + (m.score1 || 0) + '"',
                  ' style="' + inputStyle + 'text-align:center;font-family:Epilogue,sans-serif;',
                  'font-style:italic;font-weight:900;font-size:1.6rem;letter-spacing:-0.02em;">',
              '</div>',
              '<span style="font-family:Inter,sans-serif;font-size:11px;font-weight:700;',
                'color:rgba(255,255,255,0.25);letter-spacing:0.1em;text-align:center;padding-top:18px;">vs</span>',
              '<div>',
                '<p style="font-family:Inter,sans-serif;font-size:9px;font-weight:700;',
                  'text-transform:uppercase;letter-spacing:0.12em;color:rgba(255,255,255,0.35);',
                  'margin-bottom:6px;text-align:center;">' + esc((m.giocatore2_nome || 'Giocatore 2').split(' ').pop()) + '</p>',
                '<input id="_mod-s2" type="number" min="0" max="99" value="' + (m.score2 || 0) + '"',
                  ' style="' + inputStyle + 'text-align:center;font-family:Epilogue,sans-serif;',
                  'font-style:italic;font-weight:900;font-size:1.6rem;letter-spacing:-0.02em;">',
              '</div>',
            '</div>',

            // Bottoni
            '<div style="display:flex;gap:10px;">',
              '<button id="_mod-cancel" style="flex:1;background:rgba(255,255,255,0.05);',
                'border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:16px;',
                'font-family:Inter,sans-serif;font-size:11px;font-weight:700;',
                'color:rgba(255,255,255,0.4);text-transform:uppercase;',
                'letter-spacing:0.1em;cursor:pointer;">Annulla</button>',
              '<button id="_mod-save" style="flex:1.5;',
                'background:linear-gradient(180deg,#e3ff8c 0%,#d1ff4b 100%);',
                'border:1px solid rgba(255,255,255,0.3);border-radius:16px;padding:16px;',
                'font-family:Epilogue,sans-serif;font-style:italic;font-weight:900;',
                'font-size:16px;color:#0a0a0a;text-transform:uppercase;cursor:pointer;',
                'box-shadow:inset 0 1px 0 rgba(255,255,255,0.4);">Salva e Conferma</button>',
            '</div>',
          '</div>',
        ].join('');

        document.body.appendChild(backdrop);

        // Focus sul campo data
        setTimeout(function () {
          var d = document.getElementById('_mod-data');
          if (d) d.focus();
        }, 80);

        // Chiudi cliccando lo sfondo
        backdrop.addEventListener('click', function (e) {
          if (e.target === backdrop) document.body.removeChild(backdrop);
        });

        document.getElementById('_mod-cancel').addEventListener('click', function () {
          document.body.removeChild(backdrop);
        });

        document.getElementById('_mod-save').addEventListener('click', async function () {
          var newData   = document.getElementById('_mod-data').value || m.data;
          var newScore1 = parseInt(document.getElementById('_mod-s1').value, 10);
          var newScore2 = parseInt(document.getElementById('_mod-s2').value, 10);
          if (isNaN(newScore1) || isNaN(newScore2)) { alert('Inserisci un punteggio valido.'); return; }

          document.body.removeChild(backdrop);

          // Aggiorna i campi del match e imposta come completata
          var updated = Object.assign({}, m, {
            data:        newData,
            date:        newData,
            score1:      newScore1,
            score2:      newScore2,
            punteggio:   newScore1 + '-' + newScore2,
            vincitore_id: newScore1 > newScore2 ? m.giocatore1_id : newScore2 > newScore1 ? m.giocatore2_id : null,
            stato:       'completata',
            nota_contestazione: null,
          });

          // Sostituisce il match nell'array locale e salva su Supabase
          var idx = allMatches.findIndex(function (x) { return x.id === id; });
          if (idx >= 0) allMatches[idx] = updated;

          try { await SM.saveMatches(torneoId, allMatches); }
          catch (e) { showError('Errore salvataggio.'); return; }

          await refreshContestazioni();
        });
      };

      renderAll();
    });
  }

  // ── Export ────────────────────────────────────────────────────────

  window.UIBinder = {
    initAccesso:              initAccesso,
    initHomeDashboard:        initHomeDashboard,
    initGiocatoriDashboard:   initGiocatoriDashboard,
    initMatchDashboard:       initMatchDashboard,
    initContestazioni:        initContestazioni,
    initHomeUser:             initHomeUser,
    initPlayerProfile:        initPlayerProfile,
    initUserProfile:          initUserProfile,
    initIscrizioni:           initIscrizioni
  };

})();
