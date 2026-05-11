/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   GOLARSA RACE — Animation Engine  v1.0
   Scroll-triggered entrance + micro-interactions.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
(function () {
  'use strict';

  /* ── Elementi da animare all'entrata (scroll) ── */
  var RISE_SELECTORS = [
    '.premium-card:not(.leaderboard-row)',
    '.cinematic-card',
    '.broadcast-card',
    '.premium-card-lime',
    '.rim-light.ambient-glow',   /* card principale signup */
  ].join(',');

  /* ── Elementi con scivolamento laterale (ranking + match cards) ── */
  var FLIP_SELECTORS = '.leaderboard-row, #ultimi-match-container .premium-card, #pp-matches .cinematic-card, #up-matches .cinematic-card';

  /* ── Elementi riga interattivi ── */
  var ROW_SELECTORS = [
    '.leaderboard-row',
    'tr[onclick]',
    'div[onclick]',
    'li[onclick]',
  ].join(',');

  /* Set per evitare doppi tag */
  var taggedRise = new WeakSet();
  var taggedRow  = new WeakSet();

  /* ── IntersectionObserver ── */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('gr-visible');
        io.unobserve(entry.target);
      }
    });
  }, {
    threshold:  0.06,
    rootMargin: '0px 0px -12px 0px',
  });

  /* ── Altezza viewport iniziale ── */
  var VH = window.innerHeight;

  /* ── Tag card per scroll-entrance ── */
  function tagCards() {
    var els = document.querySelectorAll(RISE_SELECTORS);
    var delayIdx = 0;

    els.forEach(function (el) {
      if (taggedRise.has(el)) return;
      taggedRise.add(el);

      var rect     = el.getBoundingClientRect();
      var aboveFold = rect.top < VH && rect.bottom > 0;

      if (aboveFold) {
        /* Già visibile: nessuna animazione aggiuntiva
           (ci pensa il body fade-in del CSS)            */
        return;
      }

      /* Sotto il fold: animate on scroll */
      el.classList.add('gr-rise');

      if (delayIdx > 0 && delayIdx <= 8) {
        el.classList.add('gr-d' + delayIdx);
      }
      delayIdx = Math.min(delayIdx + 1, 8);

      io.observe(el);
    });
  }

  /* ── Tag ranking + match cards con scivolamento laterale ── */
  function tagFlipCards() {
    var els = document.querySelectorAll(FLIP_SELECTORS);
    var delayIdx = 1;

    els.forEach(function (el) {
      if (taggedRise.has(el)) return;
      taggedRise.add(el);

      var rect      = el.getBoundingClientRect();
      var aboveFold = rect.top < VH && rect.bottom > 0;

      if (aboveFold) return;

      el.classList.add('gr-slide');

      if (delayIdx <= 8) {
        el.classList.add('gr-d' + delayIdx);
      }
      delayIdx = Math.min(delayIdx + 1, 8);

      io.observe(el);

      // Rimuove gr-slide a fine animazione → ripristina le transition normali
      el.addEventListener('animationend', function handler() {
        el.classList.remove('gr-slide');
        el.removeEventListener('animationend', handler);
      });
    });
  }

  /* ── Tag righe interattive ── */
  function tagRows() {
    var els = document.querySelectorAll(ROW_SELECTORS);
    els.forEach(function (el) {
      if (taggedRow.has(el)) return;
      taggedRow.add(el);
      el.classList.add('gr-row-tap');
    });
  }

  /* ── Funzione principale ── */
  function init() {
    tagFlipCards(); // slide prima, così i match-card non vengono presi da tagCards()
    tagCards();
    tagRows();
  }

  /* ── Avvio ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    /* DOMContentLoaded già passato */
    init();
  }

  /* ── Re-run dopo caricamenti dinamici (Supabase, ecc.) ── */
  var mut = new MutationObserver(function (records) {
    var anyAdded = records.some(function (r) {
      return r.addedNodes.length > 0;
    });
    if (anyAdded) {
      /* Ricalcola VH per contenuto aggiunto dopo il resize */
      VH = window.innerHeight;
      tagCards();
      tagFlipCards();
      tagRows();
    }
  });

  mut.observe(document.body, { childList: true, subtree: true });

  /* ── Aggiorna VH su resize ── */
  window.addEventListener('resize', function () {
    VH = window.innerHeight;
  });

}());
