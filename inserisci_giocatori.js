#!/usr/bin/env node
// Esegui con: node inserisci_giocatori.js

const https = require('https');

const SUPABASE_URL = 'efkavbdfzhyuixuvgtqd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pBMN8gWe5KDrAAPvAAIMkQ_g8GI-KzP';

const GIOCATORI = [
  { nome: 'Marco',      cognome: 'Rossi',        naz: 'Italia',      flag: '🇮🇹', tel: '+39 340 1234001' },
  { nome: 'Luca',       cognome: 'Ferrari',      naz: 'Italia',      flag: '🇮🇹', tel: '+39 340 1234002' },
  { nome: 'Davide',     cognome: 'Conti',        naz: 'Italia',      flag: '🇮🇹', tel: '+39 340 1234003' },
  { nome: 'Andrea',     cognome: 'Russo',        naz: 'Italia',      flag: '🇮🇹', tel: '+39 340 1234004' },
  { nome: 'Stefano',    cognome: 'Esposito',     naz: 'Italia',      flag: '🇮🇹', tel: '+39 340 1234005' },
  { nome: 'Matteo',     cognome: 'Romano',       naz: 'Italia',      flag: '🇮🇹', tel: '+39 340 1234006' },
  { nome: 'Francesco',  cognome: 'Colombo',      naz: 'Italia',      flag: '🇮🇹', tel: '+39 340 1234007' },
  { nome: 'Giovanni',   cognome: 'Mancini',      naz: 'Italia',      flag: '🇮🇹', tel: '+39 340 1234008' },
  { nome: 'Roberto',    cognome: 'Ricci',        naz: 'Italia',      flag: '🇮🇹', tel: '+39 340 1234009' },
  { nome: 'Alessandro', cognome: 'Marino',       naz: 'Italia',      flag: '🇮🇹', tel: '+39 340 1234010' },
  { nome: 'Simone',     cognome: 'De Luca',      naz: 'Italia',      flag: '🇮🇹', tel: '+39 340 1234011' },
  { nome: 'Paolo',      cognome: 'Gallo',        naz: 'Italia',      flag: '🇮🇹', tel: '+39 340 1234012' },
  { nome: 'Nicolò',     cognome: 'Barbieri',     naz: 'Italia',      flag: '🇮🇹', tel: '+39 340 1234013' },
  { nome: 'Michele',    cognome: 'Fontana',      naz: 'Italia',      flag: '🇮🇹', tel: '+39 340 1234014' },
  { nome: 'Carlos',     cognome: 'García',       naz: 'Spagna',      flag: '🇪🇸', tel: '+34 612 345015' },
  { nome: 'Thomas',     cognome: 'Müller',       naz: 'Germania',    flag: '🇩🇪', tel: '+49 151 234016' },
  { nome: 'Antoine',    cognome: 'Dubois',       naz: 'Francia',     flag: '🇫🇷', tel: '+33 612 345017' },
  { nome: 'James',      cognome: 'Wilson',       naz: 'Regno Unito', flag: '🇬🇧', tel: '+44 712 345018' },
  { nome: 'Pedro',      cognome: 'Santos',       naz: 'Brasile',     flag: '🇧🇷', tel: '+55 11 91234019' },
  { nome: 'Alexandros', cognome: 'Papadopoulos', naz: 'Grecia',      flag: '🇬🇷', tel: '+30 693 456020' },
];

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: SUPABASE_URL,
      path: '/rest/v1/' + path,
      method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': method === 'POST' ? 'return=minimal' : '',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const r = https.request(options, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: raw ? JSON.parse(raw) : null }); }
        catch { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  // 1. Trova torneo "prova"
  console.log('🔍 Cerco torneo "prova"...');
  const tRes = await req('GET', 'tournaments?select=id,nome,stato&nome=ilike.*prova*');
  if (!tRes.data?.length) {
    console.error('❌ Torneo "prova" non trovato.');
    // Mostra tutti i tornei disponibili
    const all = await req('GET', 'tournaments?select=id,nome,stato');
    console.log('Tornei nel DB:', all.data);
    return;
  }

  const torneo = tRes.data[0];
  console.log(`✅ Trovato: "${torneo.nome}" — id: ${torneo.id}\n`);

  // 2. Inserisci giocatori
  let ok = 0, fail = 0;
  for (const g of GIOCATORI) {
    const id = 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const slug = (g.nome + g.cognome)
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s/g, '');
    const email = slug + '@fittizio.it';

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

    const res = await req('POST', 'players', {
      id,
      tournament_id: torneo.id,
      email,
      stato: 'approvato',
      payload,
    });

    if (res.status >= 200 && res.status < 300) {
      console.log(`✅ ${g.flag}  ${g.nome} ${g.cognome} (${g.naz})`);
      ok++;
    } else {
      console.error(`❌ ${g.flag}  ${g.nome} ${g.cognome}: ${JSON.stringify(res.data)}`);
      fail++;
    }

    await new Promise(r => setTimeout(r, 80));
  }

  // 3. Aggiorna standings
  console.log('\n📊 Aggiorno standings...');
  const pRes = await req('GET', `players?tournament_id=eq.${torneo.id}&select=*`);
  const allPlayers = (pRes.data || []).filter(r => r.stato === 'approvato');
  const standings = allPlayers
    .map(r => ({ ...r.payload, id: r.id, email: r.email, stato: r.stato }))
    .sort((a, b) => b.punti - a.punti || b.vittorie - a.vittorie)
    .map((p, i) => ({ ...p, rank: i + 1 }));

  await req('PATCH', `tournaments?id=eq.${torneo.id}`, { standings });
  console.log(`✅ Standings: ${standings.length} giocatori approvati`);

  console.log(`\n🎉 Fatto! ${ok} inseriti, ${fail} errori.`);
}

main().catch(console.error);
