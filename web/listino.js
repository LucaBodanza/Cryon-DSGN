// Cryon DSGN — listino prezzi modificabile (dati/listino_dati.json + modifiche salvate su questo computer)
// Le modifiche restano nel browser (localStorage 'cryon.prezzi'); si possono esportare/importare come file e stampare in PDF.
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = v => v == null ? 'su richiesta' : '€ ' + Math.round(v).toLocaleString('it-IT');
const nf = (v, d = 1) => v == null ? '—' : Number(v).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
const CHIAVE = 'cryon.prezzi';
let D = null, MOD = {}, PUB = {}, H = {}, SEL = { serie: null, gas: 'tutti' }, MODO = 'vista';
// PUB = prezzi pubblicati dagli Admin per il gruppo dell'utente (vedi accesso.js); MOD = bozza locale di chi modifica

const leggi = () => { try { return JSON.parse(localStorage.getItem(CHIAVE) || '{}'); } catch (e) { return {}; } };
const salva = () => { try { localStorage.setItem(CHIAVE, JSON.stringify(MOD)); } catch (e) { H.toast?.('Impossibile salvare su questo browser'); } conta(); };
const kU = c => 'u|' + c;
const prezzo = (k, base) => (k in MOD ? MOD[k] : k in PUB ? PUB[k] : base);

export function avviaListino(helper) {
  H = helper; MOD = leggi();
  $('#leSerie').onchange = e => { SEL.serie = e.target.value || null; SEL.gas = 'tutti'; disegna(); };
  $('#leGas').onchange = e => { SEL.gas = e.target.value; disegna(); };
  $('#leApplica').onclick = applicaPerc;
  $('#leRipristina').onclick = ripristina;
  $('#leEsporta').onclick = esporta;
  $('#leImporta').onchange = importa;
  $('#leStampa').onclick = () => window.print();
  $('#lePubblica').onclick = () => { $('#lePub').hidden = !$('#lePub').hidden; };
  $('#lePubNo').onclick = () => { $('#lePub').hidden = true; };
  $('#lePubOk').onclick = pubblicaPrezzi;
  $('#leDoc').addEventListener('change', e => {
    const i = e.target.closest('input[data-k]'); if (!i) return;
    const v = Number(String(i.value).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
    if (!i.value.trim()) delete MOD[i.dataset.k]; else if (Number.isFinite(v) && v >= 0) MOD[i.dataset.k] = Math.round(v);
    const base = Number(i.dataset.b);
    i.classList.toggle('mod', i.dataset.k in MOD && MOD[i.dataset.k] !== base);
    if (!(i.dataset.k in MOD)) i.value = Math.round(base);
    const st = i.nextElementSibling, v2 = Math.round(prezzo(i.dataset.k, base)).toLocaleString('it-IT');
    if (st) st.textContent = i.dataset.f === '%' ? v2 + ' %' : i.dataset.f === '€' ? '€ ' + v2 : v2;
    salva();
  });
}

export async function datiListino() {
  if (!D) {
    try { D = await fetch('dati/listino_dati.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null); } catch (e) { D = null; }
    if (D) $('#leSerie').innerHTML = '<option value="">Tutte le serie (listino completo)</option>' + D.serie.map(s => `<option value="${esc(s.id)}">${esc(s.numero)} · ${esc(s.nome)}</option>`).join('');
  }
  try { PUB = (await window.CRYON_ACCESSO?.prezzi?.()) || {}; } catch (e) { PUB = {}; }
  return D;
}
// prezzo di listino di un codice Procryon (con le modifiche/pubblicazioni valide per chi guarda); null se non c'è
export function prezzoUnita(codice) {
  if (!D) return null;
  for (const s of D.serie) for (const G of Object.values(s.gas)) for (const r of G.righe) for (const v of ['S', 'C']) if (r[v]?.c === codice) return r[v].p == null ? null : prezzo(kU(codice), r[v].p);
  return null;
}
// modo 'vista' = listino da consultare e scaricare; 'modifica' = prezzi modificabili (solo chi ha il permesso)
export async function apriEditor(serieId = null, gas = 'tutti', modo = 'modifica') {
  if (!(await datiListino())) return H.toast?.('Dati del listino non disponibili in questa versione');
  if (modo === 'modifica' && window.CRYON_ACCESSO && !window.CRYON_ACCESSO.puo('prezzi')) modo = 'vista';
  MODO = modo;
  document.body.classList.toggle('le-vista', modo === 'vista');
  $('#lePubblica').hidden = !(modo === 'modifica' && window.CRYON_ACCESSO?.puo('prezzi')); $('#lePub').hidden = true;
  SEL = { serie: serieId, gas: gas || 'tutti' };
  $('#leSerie').value = serieId || '';
  disegna();
  H.vai('listinoEd');
}

function serieVisibili() { return D.serie.filter(s => !SEL.serie || s.id === SEL.serie); }
function gasVisibili(s) { return Object.keys(s.gas).filter(g => SEL.gas === 'tutti' || g === SEL.gas); }

function conta() {
  const n = Object.keys(MOD).length;
  $('#leConta').textContent = MODO === 'vista' ? 'Listino in consultazione' : n ? `${n} prezzi modificati in bozza (non ancora pubblicati)` : 'Nessuna modifica in bozza';
}

function disegna() {
  const ss = serieVisibili();
  const gasTutti = [...new Set(ss.flatMap(s => Object.keys(s.gas)))];
  $('#leGas').innerHTML = '<option value="tutti">Tutti i gas</option>' + gasTutti.map(g => `<option ${g === SEL.gas ? 'selected' : ''}>${esc(g)}</option>`).join('');
  $('#leDoc').innerHTML = window.ListinoRender.render(D, { serie: SEL.serie, gas: SEL.gas, edit: MODO === 'modifica', mod: MODO === 'modifica' ? { ...PUB, ...MOD } : PUB, logo: H.svgLogo || '', picto: H.svgPicto || '' });
  conta();
}

// voci (chiave, prezzo base) della selezione visibile
function voci() {
  const out = [];
  for (const s of serieVisibili()) for (const g of gasVisibili(s)) {
    const G = s.gas[g];
    for (const r of G.righe) for (const v of G.varianti) if (r[v]?.p != null) out.push([kU(r[v].c), r[v].p, '€']);
    for (const op of G.opz) op.val.forEach((v, i) => { if (v != null) out.push([['o', s.id, g, op.n, i].join('|'), v, op.u]); });
  }
  return out;
}

function applicaPerc() {
  const pc = Number(String($('#lePerc').value).replace(',', '.'));
  if (!Number.isFinite(pc) || pc === 0) return H.toast?.('Scrivi una percentuale, per esempio 5 oppure -3');
  const cosa = $('#leCosa').value;
  let n = 0;
  for (const [k, base, u] of voci()) {
    if (u === '%') continue;                       // gli optional in % seguono già il prezzo dell'unità
    if (cosa === 'unita' && !k.startsWith('u|')) continue;
    if (cosa === 'opz' && !k.startsWith('o|')) continue;
    MOD[k] = Math.round(prezzo(k, base) * (1 + pc / 100)); n++;
  }
  salva(); disegna(); H.toast?.(`${pc > 0 ? '+' : ''}${pc}% applicato a ${n} prezzi`);
}

function ripristina() {
  const b = $('#leRipristina');
  if (!b.dataset.ok) { b.dataset.ok = '1'; b.textContent = 'Sicuro? Clicca di nuovo'; setTimeout(() => { delete b.dataset.ok; b.textContent = 'Ripristina selezione'; }, 3000); return; }
  delete b.dataset.ok; b.textContent = 'Ripristina selezione';
  let n = 0; for (const [k] of voci()) if (k in MOD) { delete MOD[k]; n++; }
  salva(); disegna(); H.toast?.(`${n} prezzi riportati al listino`);
}

function esporta() {
  const blob = new Blob([JSON.stringify({ tipo: 'cryon-prezzi', data: new Date().toISOString(), prezzi: MOD }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Procryon_prezzi_modificati_${new Date().toISOString().slice(0, 10)}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function importa(e) {
  const f = e.target.files[0]; if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (j.tipo !== 'cryon-prezzi' || typeof j.prezzi !== 'object') throw new Error();
    MOD = { ...MOD, ...j.prezzi }; salva(); disegna(); H.toast?.(`${Object.keys(j.prezzi).length} prezzi importati`);
  } catch (err) { H.toast?.('File non valido'); }
  e.target.value = '';
}

// ---------------------------------------------------------------- pubblicazione (Admin, versione web vDragon 5)
// per ogni gruppo scelto: prezzi pubblicati = quelli già pubblicati per quel gruppo + la bozza; un prezzo uguale al listino base torna "base"
function basi() {
  const b = {};
  for (const s of D.serie) for (const [g, G] of Object.entries(s.gas)) {
    for (const r of G.righe) for (const v of G.varianti) if (r[v]?.p != null) b[kU(r[v].c)] = r[v].p;
    for (const op of G.opz) op.val.forEach((v, i) => { if (v != null) b[['o', s.id, g, op.n, i].join('|')] = v; });
  }
  return b;
}
async function pubblicaPrezzi() {
  const gruppi = [...document.querySelectorAll('#lePub input:checked')].map(x => x.value);
  if (!gruppi.length) return H.toast?.('Scegli almeno un gruppo');
  if (!Object.keys(MOD).length) return H.toast?.('Nessun prezzo in bozza da pubblicare');
  const b = $('#lePubOk'); b.disabled = true; b.textContent = 'Pubblico…';
  try {
    const I = await import('./impostazioni.js');
    const C = await I.cassaforte(window.CRYON_ACCESSO), B = basi(), file = [];
    for (const g of gruppi) {
      let ora = {};
      try { const r = await fetch(`dati/prezzi_${g}.vd5`, { cache: 'no-cache' }); if (r.ok) ora = (await r.json()).prezzi || {}; } catch (e) { /* primo listino del gruppo */ }
      const nuovi = { ...ora, ...MOD };
      for (const k of Object.keys(nuovi)) if (B[k] === nuovi[k]) delete nuovi[k];
      file.push(await I.scriviPrezzi(C, g, nuovi, window.CRYON_ACCESSO.nome));
    }
    const sha = await I.pubblica(C, file, `Cryon DSGN: prezzi per ${gruppi.join(', ')} (${window.CRYON_ACCESSO.nome})`);
    if (gruppi.includes(window.CRYON_ACCESSO.gruppo)) PUB = { ...PUB, ...MOD };
    MOD = {}; salva(); disegna(); $('#lePub').hidden = true;
    H.toast?.(`Prezzi pubblicati (${sha}) · visibili sul sito in pochi minuti`);
  } catch (e) { H.toast?.('Pubblicazione non riuscita: ' + e.message); }
  b.disabled = false; b.textContent = 'Pubblica';
}
