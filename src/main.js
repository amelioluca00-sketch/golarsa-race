/**
 * main.js
 * Entry point: rileva pagina corrente e chiama UIBinder.init*().
 * Richiede: storage-manager.js, ui-binder.js (caricati prima).
 */

(function () {
  var UI = window.UIBinder;
  if (!UI) { console.warn('[main] UIBinder mancante'); return; }
  var path = window.location.pathname;

  if      (path.indexOf('accesso_dashboard')       >= 0) UI.initAccesso();
  else if (path.indexOf('iscrizioni_dashboard')    >= 0) UI.initIscrizioni();
  else if (path.indexOf('giocatori_dashboard')     >= 0) UI.initGiocatoriDashboard();
  else if (path.indexOf('contestazioni_dashboard') >= 0) UI.initContestazioni();
  else if (path.indexOf('match_dashboard')         >= 0) UI.initMatchDashboard();
  else if (path.indexOf('home_dashbaord')          >= 0) UI.initHomeDashboard();   // typo intenzionale → match filename
  else if (path.indexOf('/home/home')           >= 0) UI.initHomeUser();
  else if (path.indexOf('player_profile')       >= 0) UI.initPlayerProfile();
  else if (path.indexOf('user_profile')         >= 0) UI.initUserProfile();
})();
