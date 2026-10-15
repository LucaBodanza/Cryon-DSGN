// Cryon DSGN — listino prezzi modificabile (dati/listino_dati.json + modifiche salvate su questo computer)
// Le modifiche restano nel browser (localStorage 'cryon.prezzi'); si possono esportare/importare come file e stampare in PDF.
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = v => v == null ? 'su richiesta' : '€ ' + Math.round(v).toLocaleString('it-IT');
const nf = (v, d = 1) => v == null ? '—' : Number(v).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
const CHIAVE = 'cryon.prezzi';
let D = null, MOD = {}, H = {}, SEL = { serie: null, gas: 'tutti' };

const leggi = () => { try { return JSON.parse(localStorage.getItem(CHIAVE) || '{}'); } catch (e) { return {}; } };
const salva = () => { try { localStorage.setItem(CHIAVE, JSON.stringify(MOD)); } catch (e) { H.toast?.('Impossibile salvare su questo browser'); } conta(); };
const kU = c => 'u|' + c;
const prezzo = (k, base) => (k in MOD ? MOD[k] : base);

export function avviaListino(helper) {
  H = helper; MOD = leggi();
  $('#leSerie').onchange = e => { SEL.serie = e.target.value || null; SEL.gas = 'tutti'; disegna(); };
  $('#leGas').onchange = e => { SEL.gas = e.target.value; disegna(); };
  $('#leApplica').onclick = applicaPerc;
  $('#leRipristina').onclick = ripristina;
  $('#leEsporta').onclick = esporta;
  $('#leImporta').onchange = importa;
  $('#leStampa').onclick = () => window.print();
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

export async function apriEditor(serieId = null) {
  if (!D) {
    try { D = await fetch('dati/listino_dati.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null); } catch (e) { D = null; }
    if (!D) return H.toast?.('Dati del listino non disponibili in questa versione');
    $('#leSerie').innerHTML = '<option value="">Tutte le serie (listino completo)</option>' + D.serie.map(s => `<option value="${esc(s.id)}">${esc(s.numero)} · ${esc(s.nome)}</option>`).join('');
  }
  SEL = { serie: serieId, gas: 'tutti' };
  $('#leSerie').value = serieId || '';
  disegna();
  H.vai('listinoEd');
}

function serieVisibili() { return D.serie.filter(s => !SEL.serie || s.id === SEL.serie); }
function gasVisibili(s) { return Object.keys(s.gas).filter(g => SEL.gas === 'tutti' || g === SEL.gas); }

function conta() {
  const n = Object.keys(MOD).length;
  $('#leConta').textContent = n ? `${n} prezzi modificati su questo computer` : 'Prezzi di listino (nessuna modifica)';
}

function disegna() {
  const ss = serieVisibili();
  const gasTutti = [...new Set(ss.flatMap(s => Object.keys(s.gas)))];
  $('#leGas').innerHTML = '<option value="tutti">Tutti i gas</option>' + gasTutti.map(g => `<option ${g === SEL.gas ? 'selected' : ''}>${esc(g)}</option>`).join('');
  $('#leDoc').innerHTML = window.ListinoRender.render(D, { serie: SEL.serie, gas: SEL.gas, edit: true, mod: MOD, logo: H.svgLogo || '', picto: H.svgPicto || '' });
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
