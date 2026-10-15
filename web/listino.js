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
const kO = (s, g, c0, n) => ['o', s, g, c0, n].join('|');
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
    i.nextElementSibling.textContent = eur(prezzo(i.dataset.k, base));
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
  const inp = (k, base) => base == null ? '<span class="le-rich">su richiesta</span>' :
    `<input data-k="${esc(k)}" data-b="${base}" class="${k in MOD && MOD[k] !== base ? 'mod' : ''}" value="${Math.round(prezzo(k, base))}" inputmode="numeric"><span class="le-st">${eur(prezzo(k, base))}</span>`;
  const cop = SEL.serie ? ss[0] : null;
  const gasCop = [...new Set(ss.flatMap(s => Object.keys(s.gas)))].filter(g => g !== '—');
  let h = `<section class="le-cop"><div class="dots"></div><span class="logo" data-svg="logo"></span><span class="picto" data-svg="pittogramma"></span>
    <div class="in"><div class="num">${cop ? esc(cop.numero) : '00'}</div><div class="lab">Listino prezzi / Price list · ${esc(D.versione)}</div>
    <h1>${cop ? 'Listino ' + esc(cop.nome) : 'Listino completo 2026'}</h1><div class="sub">${cop ? esc(cop.sotto) : 'Tutte le serie Procryon, divise per serie e refrigerante'}</div>
    <div class="meta">${gasCop.map(g => `<span class="pill">${esc(g)}</span>`).join('')}<span class="pill acc">Versione provvisoria</span></div></div>
    <div class="claim">Prezzi in euro, IVA esclusa<br>www.procryon.com</div></section>`;
  for (const s of ss) {
    h += `<section class="le-sez"><div class="le-testa"><span class="n">${esc(s.numero)}</span><div><h2>${esc(s.nome)} <span>· Listino prezzi</span></h2><p>${esc(s.sotto)}</p></div></div>`;
    for (const g of gasVisibili(s)) {
      const G = s.gas[g];
      h += `<div class="le-gas"><h3><b>${esc(g === '—' ? 'Dry cooler' : g)}</b><span>${G.unita.length} unità</span></h3>
        <table class="le-tb"><thead><tr><th>Codice</th><th>Var.</th><th class="n">Resa kW</th><th class="n">EER</th><th class="n">Prezzo €</th></tr></thead><tbody>` +
        G.unita.map(([c, v, kw, eer, p]) => `<tr><td class="cod">${esc(c)}</td><td>${esc(v)}</td><td class="n">${nf(kw)}</td><td class="n">${nf(eer, 2)}</td><td class="n p">${inp(kU(c), p)}</td></tr>`).join('') +
        '</tbody></table>';
      if (G.opz.length) {
        h += `<h4>Optional · ${esc(g)}</h4><div class="le-opz">`;
        for (const b of G.opz) {
          let cat0 = null;
          h += `<div class="le-blocco"><div class="bt"><b>${esc(b.c.join(' · '))}</b><span>${nf(b.kw)} kW</span></div><table class="le-tb op"><tbody>`;
          for (const [n, cat, p] of b.o) {
            if (cat !== cat0) { h += `<tr class="cat"><td colspan="2">${esc(D.categorie[cat] || cat)}</td></tr>`; cat0 = cat; }
            h += `<tr><td>${esc(n)}</td><td class="n p">${inp(kO(s.id, g, b.c[0], n), p)}</td></tr>`;
          }
          h += '</tbody></table></div>';
        }
        h += '</div>';
      }
      h += '</div>';
    }
    h += '</section>';
  }
  $('#leDoc').innerHTML = h;
  H.caricaSvg?.($('#leDoc'));
  conta();
}

// voci (chiave, prezzo base) della selezione visibile
function voci() {
  const out = [];
  for (const s of serieVisibili()) for (const g of gasVisibili(s)) {
    const G = s.gas[g];
    for (const [c, , , , p] of G.unita) if (p != null) out.push([kU(c), p]);
    for (const b of G.opz) for (const [n, , p] of b.o) out.push([kO(s.id, g, b.c[0], n), p]);
  }
  return out;
}

function applicaPerc() {
  const pc = Number(String($('#lePerc').value).replace(',', '.'));
  if (!Number.isFinite(pc) || pc === 0) return H.toast?.('Scrivi una percentuale, per esempio 5 oppure -3');
  const cosa = $('#leCosa').value;
  let n = 0;
  for (const [k, base] of voci()) {
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
