/**
 * session-shim.js
 *
 * Problema iOS PWA: quando si aggiunge l'app alla home screen, Safari apre
 * la PWA in un contesto isolato con un localStorage separato da quello del
 * browser. Quindi se l'utente fa login in Safari, la sessione NON è visibile
 * dalla PWA e l'utente appare sloggato.
 *
 * Soluzione: le chiavi di sessione gr_* vengono salvate nei COOKIE invece
 * che in localStorage. I cookie sono condivisi tra Safari e la PWA sullo
 * stesso dominio, quindi il login fatto nel browser persiste anche nell'app.
 *
 * Questo script fa monkey-patch su Storage.prototype in modo che qualsiasi
 * chiamata a localStorage.getItem/setItem/removeItem per chiavi gr_* venga
 * automaticamente reindirizzata ai cookie — senza dover toccare il resto
 * del codice.
 *
 * Caricarlo PRIMA di qualsiasi altro script.
 */
(function () {
  'use strict';

  // Chiavi di sessione che devono vivere nei cookie
  var SESSION_KEYS = ['gr_torneo_id', 'gr_user_id', 'gr_user_email', 'gr_role'];
  var COOKIE_DAYS  = 365; // sessione valida 1 anno

  function isSessionKey(key) {
    return SESSION_KEYS.indexOf(key) >= 0;
  }

  // ── Helpers cookie ────────────────────────────────────────────────

  function setCookie(name, value, days) {
    var expires = '';
    if (days) {
      var d = new Date();
      d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
      expires = '; expires=' + d.toUTCString();
    }
    document.cookie = name + '=' + encodeURIComponent(value || '') +
      expires + '; path=/; SameSite=Lax';
  }

  function getCookie(name) {
    var nameEQ = name + '=';
    var parts   = document.cookie.split(';');
    for (var i = 0; i < parts.length; i++) {
      var c = parts[i].trim();
      if (c.indexOf(nameEQ) === 0)
        return decodeURIComponent(c.substring(nameEQ.length));
    }
    return null;
  }

  function deleteCookie(name) {
    document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
  }

  // ── Migrazione one-time: localStorage → cookie ────────────────────
  // Se l'utente era già loggato prima di questo aggiornamento,
  // sposta i valori esistenti nei cookie così non perde la sessione.

  try {
    SESSION_KEYS.forEach(function (k) {
      var lsVal = window.localStorage.getItem(k);
      if (lsVal) {
        var ckVal = getCookie(k);
        if (!ckVal) setCookie(k, lsVal, COOKIE_DAYS);
        window.localStorage.removeItem(k);
      }
    });
  } catch (e) {
    // localStorage potrebbe non essere accessibile in alcuni contesti
  }

  // ── Monkey-patch Storage.prototype ────────────────────────────────
  // Intercetta getItem/setItem/removeItem solo per chiavi gr_* su localStorage.
  // sessionStorage e altre chiavi non vengono toccati.

  var _origGet    = Storage.prototype.getItem;
  var _origSet    = Storage.prototype.setItem;
  var _origRemove = Storage.prototype.removeItem;

  Storage.prototype.getItem = function (key) {
    if (this === window.localStorage && isSessionKey(key)) {
      var val = getCookie(key);
      return (val !== null && val !== '') ? val : null;
    }
    return _origGet.call(this, key);
  };

  Storage.prototype.setItem = function (key, value) {
    if (this === window.localStorage && isSessionKey(key)) {
      setCookie(key, value, COOKIE_DAYS);
      return;
    }
    return _origSet.call(this, key, value);
  };

  Storage.prototype.removeItem = function (key) {
    if (this === window.localStorage && isSessionKey(key)) {
      deleteCookie(key);
      return;
    }
    return _origRemove.call(this, key);
  };

})();
