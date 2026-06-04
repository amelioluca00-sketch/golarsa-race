// ══════════════════════════════════════════════════════════
//  INSERISCI 20 GIOCATORI FITTIZI — Torneo "prova"
//  Incolla questo script nella console del browser
//  mentre sei su una qualsiasi pagina dell'app
// ══════════════════════════════════════════════════════════

(async () => {
  const db = window.StorageManager
    ? (() => {
        // Recupera il client Supabase già inizializzato
        const SUPABASE_URL = 'https://efkavbdfzhyuixuvgtqd.supabase.co';
        const SUPABASE_KEY = 'sb_publishable_pBMN8gWe5KDrAAPvAAIMkQ_g8GI-KzP';
        return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      })()
    : null;

  if (!db) { console.error('❌ Supabase non trovato. Assicurati di essere su una pagina dell\'app.'); return; }

  const GIOCATORI = [
    { nome: 'Marco',      cognome: 'Rossi',         naz: 'Italia',      flag: '🇮🇹', tel: '+39 340 1234001' },
    { nome: 'Luca',       cognome: 'Ferrari',       naz: 'Italia',      flag: '🇮🇹', tel: '+39 340 1234002' },
    { nome: 'Davide',     cognome: 'Conti',         naz: 'Italia',      flag: '🇮🇹', tel: '+39 340 1234003' },
    { nome: 'Andrea',     cognome: 'Russo',         naz: 'Italia',      flag: '🇮🇹', tel: '+39 340 1234004' },
    { nome: 'Stefano',    cognome: 'Esposito',      naz: 'Italia',      flag: '🇮🇹', tel: '+39 340 1234005' },
    { nome: 'Matteo',     cognome: 'Romano',        naz: 'Italia',      flag: '🇮🇹', tel: '+39 340 1234006' },
    { nome: 'Francesco',  cognome: 'Colombo',       naz: 'Italia',      flag: '🇮🇹', tel: '+39 340 1234007' },
    { nome: 'Giovanni',   cognome: 'Mancini',       naz: 'Italia',      flag: '🇮🇹', tel: '+39 340 1234008' },
    { nome: 'Roberto',    cognome: 'Ricci',         naz: 'Italia',      flag: '🇮🇹', tel: '+39 340 1234009' },
    { nome: 'Alessandro', cognome: 'Marino',        naz: 'Italia',      flag: '🇮🇹', tel: '+39 340 1234010' },
    { nome: 'Simone',     cognome: 'De Luca',       naz: 'Italia',      flag: '🇮🇹', tel: '+39 340 1234011' },
    { nome: 'Paolo',      cognome: 'Gallo',         naz: 'Italia',      flag: '🇮🇹', tel: '+39 340 1234012' },
    { nome: 'Nicolò',     cognome: 'Barbieri',      naz: 'Italia',      flag: '🇮🇹', tel: '+39 340 1234013' },
    { nome: 'Michele',    cognome: 'Fontana',       naz: 'Italia',      flag: '🇮🇹', tel: '+39 340 1234014' },
    { nome: 'Carlos',     cognome: 'García',        naz: 'Spagna',      flag: '🇪🇸', tel: '+34 612 345015' },
    { nome: 'Thomas',     cognome: 'Müller',        naz: 'Germania',    flag: '🇩🇪', tel: '+49 151 234016' },
    { nome: 'Antoine',    cognome: 'Dubois',        naz: 'Francia',     flag: '🇫🇷', tel: '+33 612 345017' },
    { nome: 'James',      cognome: 'Wilson',        naz: 'Regno Unito', flag: '🇬🇧', tel: '+44 712 345018' },
    { nome: 'Pedro',      cognome: 'Santos',        naz: 'Brasile',     flag: '🇧🇷', tel: '+55 11 91234019' },
    { nome: 'Alexandros', cognome: 'Papadopoulos',  naz: 'Grecia',      flag: '🇬🇷', tel: '+30 693 456020' },
  ];

  // 1. Trova il torneo "prova"
  console.log('🔍 Cerco torneo "prova"...');
  const { data: tornei, error: tErr } = await db
    .from('tournaments')
    .select('id, nome, stato')
    .ilike('nome', 'prova');

  if (tErr || !tornei?.length) {
    console.error('❌ Torneo "prova" non trovato:', tErr?.message);
    console.log('Tornei disponibili:');
    const { data: all } = await db.from('tournaments').select('id, nome, stato');
    console.table(all);
    return;
  }

  const torneo = tornei[0];
  console.log(`✅ Trovato: "${torneo.nome}" — id: ${torneo.id}`);

  // 2. Inserisci i giocatori
  let ok = 0, fail = 0;
  for (const g of GIOCATORI) {
    const id = 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const email = (g.nome + '.' + g.cognome)
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s/g, '') + '@fittizio.it';

    const payload = {
      id, email,
      nome: g.nome, cognome: g.cognome,
      nomeCompleto: `${g.nome} ${g.cognome}`,
      telefono: g.tel,
      nazionalita: g.naz,
      bandiera: g.flag,
      vittorie: 0, pareggi: 0, sconfitte: 0,
      gol_fatti: 0, gol_subiti: 0,
      punti: 0, match_giocati: 0,
      rank: 0, stato: 'approvato',
    };

    const { error } = await db.from('players').insert({
      id,
      tournament_id: torneo.id,
      email,
      stato: 'approvato',
      payload,
    });

    if (error) {
      console.error(`❌ ${g.flag} ${g.nome} ${g.cognome}: ${error.message}`);
      fail++;
    } else {
      console.log(`✅ ${g.flag} ${g.nome} ${g.cognome} (${g.naz})`);
      ok++;
    }
    await new Promise(r => setTimeout(r, 80));
  }

  // 3. Aggiorna standings
  const { data: allP } = await db.from('players').select('*').eq('tournament_id', torneo.id);
  if (allP?.length) {
    const standings = allP
      .filter(r => r.stato === 'approvato')
      .map(r => ({ ...r.payload, id: r.id, email: r.email, stato: r.stato }))
      .sort((a, b) => b.punti - a.punti || b.vittorie - a.vittorie)
      .map((p, i) => ({ ...p, rank: i + 1 }));
    await db.from('tournaments').update({ standings }).eq('id', torneo.id);
    console.log(`📊 Standings aggiornate: ${standings.length} giocatori approvati`);
  }

  console.log(`\n🎉 Completato: ${ok} inseriti, ${fail} errori.`);
})();
