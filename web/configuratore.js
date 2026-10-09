// CRYON DSGN — Configuratore Procryon: dalle condizioni di progetto alla configurazione, agli optional, alla richiesta d'offerta.
// Tutto gira nel browser sul file dati/configuratore.json (serie, configurazioni, matrice di resa completa, optional: nessun prezzo).
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v, d = 1) => v == null || isNaN(v) ? '—' : Number(v).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
const kwt = v => num(v, v < 100 ? 1 : 0);

const VAR = { S: ['Standard · condensatore a micro-canali', 'micro-canali'], C: ['Standard · condensatore rame-alluminio', 'rame-alluminio'], X: ['Esecuzione speciale · CTO (Configure To Order)', 'CTO'] };
const vt = (sid, v, i = 0) => ((v !== 'X' && C.D?.S?.[sid]?.testi_varianti?.[v]) || VAR[v] || ['', ''])[i];
const VAR_W = { S: ['Standard · condensatore a piastre', 'standard'] };
const C = { D: null, ctx: null, serie: new Set(), varianti: new Set(['S', 'C']), gas: new Set(), gwp: 0, sel: null, opt: new Set(), lista: [] };

async function dati() {
  if (C.D) return C.D;
  const url = C.ctx.WEB ? 'dati/configuratore.json' : '/api/configuratore';
  const r = await fetch(url);
  if (!r.ok) throw new Error(`dati del configuratore non disponibili (${r.status})`);
  C.D = await r.json();
  C.D.S = Object.fromEntries(C.D.serie.map(s => [s.id, s]));
  return C.D;
}

// ---------------------------------------------------------------- resa alle condizioni (interpolazione nella matrice LWT × condensazione)
function griglia(u) {
  if (!u._g) {
    const mp = new Map(); for (const [l, a, k, p] of u.m) mp.set(l + '|' + a, [k, p]);
    u._g = { mp, L: [...new Set(u.m.map(p => p[0]))].sort((a, b) => a - b), A: [...new Set(u.m.map(p => p[1]))].sort((a, b) => a - b) };
  }
  return u._g;
}
function vicini(V, x) {
  if (x < V[0] || x > V[V.length - 1]) return null;
  let i = V.findIndex(v => v >= x);
  if (V[i] === x) return [V[i], V[i], 0];
  return [V[i - 1], V[i], (x - V[i - 1]) / (V[i] - V[i - 1])];
}
export function resa(u, lwt, amb) {
  const g = griglia(u), l = vicini(g.L, lwt), a = vicini(g.A, amb);
  if (!l || !a) return null;
  const P = (x, y) => g.mp.get(x + '|' + y);
  const q = [P(l[0], a[0]), P(l[1], a[0]), P(l[0], a[1]), P(l[1], a[1])];
  if (q.some(v => !v)) return null;
  const mix = i => (q[0][i] * (1 - l[2]) + q[1][i] * l[2]) * (1 - a[2]) + (q[2][i] * (1 - l[2]) + q[3][i] * l[2]) * a[2];
  return { kw: mix(0), pw: mix(1) };
}
function coeffFluido(f) {
  if (!f.tipo || f.tipo === 'acqua') return 1;
  const t = C.D.glicole[f.tipo] || {}; const k = Object.keys(t).map(Number).sort((a, b) => a - b);
  const p = k.find(x => x >= f.pct) ?? k[k.length - 1];
  return t[String(p)] ?? 1;
}

// ---------------------------------------------------------------- lettura del modulo
function cond() {
  const v = id => parseFloat(String($(id).value).replace(',', '.'));
  return { kw: v('#cfKw'), lwt: v('#cfLwt'), dt: v('#cfDt'), amb: v('#cfAmb'), acq: v('#cfAcq'), fluido: { tipo: $('#cfFluido').value, pct: v('#cfPct') || 0 }, qta: Math.max(1, parseInt($('#cfQta').value, 10) || 1) };
}
function serieAttive() {
  const D = C.D, fc = $('#cfCond').value, cp = $('#cfComp').value, fr = $('#cfFree').value;
  return D.serie.filter(s => (!C.serie.size || C.serie.has(s.id)) && (fc === 'tutte' || s.condensazione === fc || (s.dry && fc === 'A')) &&
    (cp === 'tutti' || s.compressore === cp) && (fr === 'tutti' || (fr === 'si') === s.freecooling) && (!s.dry || $('#cfDry').checked));
}
function calcola() {
  const D = C.D, k = cond(), cf = coeffFluido(k.fluido), ser = new Set(serieAttive().map(s => s.id));
  const L = [];
  for (const u of D.unita) {
    if (!ser.has(u.s)) continue;
    const s = D.S[u.s];
    if (!s.dry && !C.varianti.has(u.v) && !(C.varianti.has('X') && C.varianti.size === 1)) continue;
    if (C.gas.size && !s.dry && !C.gas.has(u.g)) continue;
    if (C.gwp && !s.dry && (D.gas[u.g]?.gwp ?? 9999) >= C.gwp) continue;
    let r = s.dry ? { kw: u.kw, pw: u.pw } : resa(u, k.lwt, s.condensazione === 'W' ? k.acq : k.amb);
    if (!r) continue;
    const kwc = r.kw * cf;
    L.push({ u, s, kw: kwc, pw: r.pw, eer: r.pw ? kwc / r.pw : null, margine: k.kw ? (kwc / k.kw - 1) * 100 : null });
  }
  const ok = k.kw ? L.filter(x => x.kw >= k.kw) : L;
  ok.sort((a, b) => a.kw - b.kw || (b.eer || 0) - (a.eer || 0));
  C.lista = ok; C.fuori = L.length - ok.length; C.k = k; C.cf = cf;
  return ok;
}

// ---------------------------------------------------------------- disegno
function chips(el, valori, attivi, etichetta = v => v) {
  el.innerHTML = valori.map(v => `<button class="fc ${attivi.has(v) ? 'on' : ''}" data-v="${esc(v)}">${etichetta(v)}</button>`).join('');
}
function disegnaFiltri() {
  const D = C.D;
  chips($('#cfSerie'), D.serie.map(s => s.id), C.serie, id => `<b>${esc(D.S[id].nome.replace('Serie ', ''))}</b><span>${esc(D.S[id].sottotitolo.split(' · ').slice(0, 2).join(' · '))}</span>`);
  chips($('#cfVar'), ['S', 'C', 'X'], C.varianti, v => `<b>${v}</b><span>${esc(VAR[v][1])}</span>`);
  const gas = [...new Set(D.serie.flatMap(s => s.gas))];
  chips($('#cfGas'), gas, C.gas, g => `<b>${esc(g)}</b><span>GWP ${num(D.gas[g]?.gwp, D.gas[g]?.gwp < 10 ? 2 : 0)} · ${esc(D.gas[g]?.classe || '')}</span>`);
  const att = serieAttive();
  $('#cfAmbW').style.display = att.some(s => s.condensazione !== 'W') ? '' : 'none';
  $('#cfAcqW').style.display = att.some(s => s.condensazione === 'W') ? '' : 'none';
  $('#cfPctW').style.display = $('#cfFluido').value === 'acqua' ? 'none' : '';
}
function avvisi(k) {
  const a = [];
  if (k.fluido.tipo === 'acqua' && k.lwt < 5) a.push('Acqua in uscita sotto 5 °C: serve glicole (rischio gelo).');
  if (Math.abs(k.dt - 5) > 0.01) a.push(`Le rese sono calcolate con salto termico 5 K; con ${num(k.dt, 1)} K la portata cambia e il valore va confermato dall'ufficio tecnico.`);
  if (C.varianti.has('X')) a.push('X (CTO): scegli la configurazione standard più vicina e descrivi le richieste speciali nelle note; diventa una richiesta dedicata.');
  return a;
}
function disegnaRisultati() {
  const L = calcola(), k = C.k;
  const el = $('#cfRis');
  const av = avvisi(k).map(t => `<div class="ai-nota">${esc(t)}</div>`).join('');
  if (!L.length) {
    el.innerHTML = av + `<div class="vuoto">Nessuna configurazione con queste condizioni${k.kw ? ` raggiunge ${kwt(k.kw)} kW` : ''}. Prova ad allargare serie, varianti o refrigeranti, oppure a cambiare le temperature (alcune combinazioni sono fuori dal campo di lavoro).</div>`;
    return;
  }
  el.innerHTML = av + `<div class="ai-testa"><b>${L.length}</b> configurazioni adatte${k.kw ? ` a ${kwt(k.kw)} kW` : ''} · acqua in uscita ${num(k.lwt, 1)} °C · aria ${num(k.amb, 1)} °C / acqua condensatore ${num(k.acq, 1)} °C${C.cf !== 1 ? ` · ${k.fluido.tipo} ${k.fluido.pct}% (resa × ${num(C.cf, 3)})` : ''}</div>` +
    L.slice(0, 40).map((x, i) => `<div class="pr cf-r ${C.sel === x.u ? 'sel' : ''}" data-i="${i}">
      <div class="pc"><div class="cod">${esc(x.u.c)}<span>${esc(x.s.nome)} · ${esc(x.u.v)} · ${esc(x.u.g || 'dry cooler')}</span></div>
        <div class="ets"><span class="et">${kwt(x.kw)} kW</span>${x.eer ? `<span class="et">EER ${num(x.eer, 2)}</span>` : ''}<span class="et">${kwt(x.pw)} kW assorbiti</span>${x.margine != null ? `<span class="et ${x.margine > 25 ? 'muted' : ''}">margine +${num(x.margine, 0)}%</span>` : ''}${x.u.fc ? `<span class="et">free cooling ${x.u.fc} kW</span>` : ''}</div></div>
      <div class="pd"><div class="az"><button class="pri" data-a="scegli">Scegli</button></div></div></div>`).join('') +
    (L.length > 40 ? `<p class="muted">Mostro le prime 40 (le più vicine alla potenza richiesta).</p>` : '');
}
function disegnaScelta() {
  const el = $('#cfScelta'), x = C.lista.find(y => y.u === C.sel) || (C.sel && { u: C.sel, s: C.D.S[C.sel.s] });
  if (!C.sel) { el.innerHTML = '<div class="vuoto">Scegli una configurazione dall\'elenco per aggiungere optional e preparare la richiesta d\'offerta.</div>'; return; }
  const u = C.sel, D = C.D, cat = Object.fromEntries((D.categorie || []).map(c => [c[0], c[1]]));
  const gruppi = {};
  for (const i of u.opt) { const [n, c] = D.opzioni[i]; (gruppi[c] = gruppi[c] || []).push([i, n]); }
  el.innerHTML = `<div class="cf-testa"><div><span class="pill cool">Configurazione</span><h3>${esc(u.c)}</h3><p class="muted">${esc(x.s.nome)} · ${esc(vt(u.s, u.v))} · ${esc(u.g || 'dry cooler')}</p></div>
      <button class="btn ghost" data-a="catalogo">Scheda nel catalogo ↗</button></div>
    <div class="cf-dati">
      <div><b>${kwt(u.kw)}</b><span>kW nominali 12/7 °C · 35 °C</span></div><div><b>${num(u.eer, 2)}</b><span>EER nominale</span></div>
      <div><b>${u.nc || '—'} / ${u.ncirc || '—'}</b><span>compressori / circuiti</span></div><div><b>${u.dim ? u.dim.map(v => num(v, 0)).join(' × ') : 'su richiesta'}</b><span>L × P × H mm</span></div>
    </div>
    <details class="cf-std"><summary>Dotazioni di serie (${u.std.length})</summary><ul>${u.std.map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>
    <h4>Optional</h4>
    ${Object.keys(gruppi).length ? Object.entries(gruppi).map(([c, L]) => `<div class="cf-gr"><div class="lab">${esc(cat[c] || c)}</div>${L.map(([i, n]) => `<label class="cf-o"><input type="checkbox" data-o="${i}" ${C.opt.has(i) ? 'checked' : ''}><span>${esc(n)}</span></label>`).join('')}</div>`).join('') : '<p class="muted">Nessun optional per questa configurazione.</p>'}`;
}

// ---------------------------------------------------------------- uscite: PDF e riga CRM
function richiesta() {
  const u = C.sel, x = C.lista.find(y => y.u === u) || { kw: null, pw: null, eer: null, margine: null }, k = C.k, D = C.D;
  const f = id => $(id).value.trim();
  const ora = new Date(), id = 'RQ-' + ora.toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2');
  const X = C.varianti.has('X');
  return {
    id, data: ora.toLocaleDateString('it-IT'), azienda: f('#cfAz'), referente: f('#cfRef'), email: f('#cfMail'), telefono: f('#cfTel'), paese: f('#cfPaese'), progetto: f('#cfProg'),
    serie: D.S[u.s].nome, codice: X ? u.c.replace(/-([HO])[SC]([A-Z])/, '-$1X$2') : u.c, base: u.c, variante: X ? 'X' : u.v, var_testo: vt(u.s, X ? 'X' : u.v), gas: u.g || '—', gwp: D.gas[u.g]?.gwp, classe: D.gas[u.g]?.classe,
    qta: k.qta, kw_rich: k.kw, lwt: k.lwt, ewt: k.lwt + k.dt, dt: k.dt, amb: D.S[u.s].condensazione === 'W' ? k.acq : k.amb, amb_lab: D.S[u.s].condensazione === 'W' ? 'Acqua in ingresso al condensatore' : 'Aria esterna',
    fluido: k.fluido.tipo === 'acqua' ? 'Acqua' : `${k.fluido.tipo === 'MEG' ? 'Glicole etilenico' : 'Glicole propilenico'} ${k.fluido.pct}%`,
    kw: x.kw, pw: x.pw, eer: x.eer, margine: x.margine, u, opt: [...C.opt].map(i => D.opzioni[i][0]), note: f('#cfNote'), cto: X,
  };
}
const SICURO = t => String(t ?? '').replace(/Δ/g, 'Delta ').replace(/→/g, '->').replace(/≈/g, '~').replace(/[^\x20-\x7E\xA0-\xFF–—‘’“”•…€·]/g, '?');
async function pdf() {
  if (!C.sel) return C.ctx.toast('Scegli prima una configurazione');
  const R = richiesta();
  if (!R.azienda) { C.ctx.toast('Scrivi almeno il nome dell\'azienda'); $('#cfAz').focus(); return; }
  const L = await import('./vendor/pdf-lib.esm.min.js');
  const doc = await L.PDFDocument.create();
  const F = await doc.embedFont(L.StandardFonts.Helvetica), FB = await doc.embedFont(L.StandardFonts.HelveticaBold);
  const ARANCIO = L.rgb(0.949, 0.612, 0.122), SCURO = L.rgb(0.137, 0.122, 0.125), GRIGIO = L.rgb(0.42, 0.4, 0.4);
  let pg, y;
  const W = 595.28, H = 841.89, M = 48;
  const nuova = () => {
    pg = doc.addPage([W, H]); y = H - M;
    pg.drawRectangle({ x: 0, y: H - 8, width: W, height: 8, color: ARANCIO });
    pg.drawText('PROCRYON', { x: M, y: H - 40, size: 16, font: FB, color: SCURO });
    pg.drawText(SICURO('Richiesta d\'offerta · Request for quotation'), { x: M + 112, y: H - 40, size: 10, font: F, color: GRIGIO });
    pg.drawText(SICURO(`${R.id} · ${R.data}`), { x: W - M - F.widthOfTextAtSize(`${R.id} · ${R.data}`, 9), y: H - 40, size: 9, font: F, color: GRIGIO });
    y = H - 72;
  };
  const a_capo = (t, font, size, larg) => {
    const out = []; let riga = '';
    for (const w of SICURO(t).split(/\s+/)) { const prova = riga ? riga + ' ' + w : w; if (font.widthOfTextAtSize(prova, size) > larg && riga) { out.push(riga); riga = w; } else riga = prova; }
    if (riga) out.push(riga); return out;
  };
  const testo = (t, { size = 9.5, font = F, color = SCURO, x = M, larg = W - 2 * M, dopo = 3 } = {}) => {
    for (const r of a_capo(t, font, size, larg)) { if (y < M + 40) nuova(); pg.drawText(r, { x, y, size, font, color }); y -= size + 3; }
    y -= dopo;
  };
  const titolo = t => { if (y < M + 80) nuova(); y -= 6; pg.drawText(SICURO(t.toUpperCase()), { x: M, y, size: 8.5, font: FB, color: ARANCIO }); y -= 5; pg.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: L.rgb(0.85, 0.83, 0.83) }); y -= 13; };
  const righe = coppie => { for (const [a, b] of coppie) { if (b == null || b === '') continue; if (y < M + 40) nuova(); pg.drawText(SICURO(a), { x: M, y, size: 9, font: F, color: GRIGIO }); const r = a_capo(String(b), FB, 9.5, W - 2 * M - 170); r.forEach((t, i) => pg.drawText(t, { x: M + 170, y: y - i * 12.5, size: 9.5, font: FB, color: SCURO })); y -= 12.5 * r.length + 3; } };
  nuova();
  pg.drawText(SICURO(R.codice), { x: M, y, size: 22, font: FB, color: SCURO }); y -= 20;
  testo(`${R.serie} · ${R.variante} — ${R.var_testo} · ${R.gas}${R.qta > 1 ? ` · ${R.qta} unità` : ''}`, { size: 11, color: GRIGIO, dopo: 8 });
  titolo('Cliente');
  righe([['Azienda', R.azienda], ['Referente', R.referente], ['E-mail', R.email], ['Telefono', R.telefono], ['Paese / località', R.paese], ['Progetto / riferimento', R.progetto]]);
  titolo('Condizioni di progetto');
  righe([['Potenza frigorifera richiesta', R.kw_rich ? `${kwt(R.kw_rich)} kW` : 'non indicata'], ['Acqua uscita / ingresso', `${num(R.lwt, 1)} / ${num(R.ewt, 1)} °C (salto ${num(R.dt, 1)} K)`],
    [R.amb_lab, `${num(R.amb, 1)} °C`], ['Fluido', R.fluido], ['Quantità', String(R.qta)]]);
  titolo('Prestazioni calcolate alle condizioni di progetto');
  righe([['Resa frigorifera', R.kw ? `${kwt(R.kw)} kW` : '—'], ['Potenza assorbita (compressori)', R.pw ? `${kwt(R.pw)} kW` : '—'], ['EER', R.eer ? num(R.eer, 2) : '—'],
    ['Margine sulla richiesta', R.margine != null ? `+${num(R.margine, 0)} %` : '—']]);
  titolo('Configurazione');
  const u = R.u;
  righe([['Serie', R.serie], ['Codice Procryon', R.codice + (R.cto ? `  (base standard ${R.base})` : '')], ['Esecuzione', `${R.variante} — ${R.var_testo}`],
    ['Refrigerante', `${R.gas}${R.gwp != null ? ` · GWP ${num(R.gwp, R.gwp < 10 ? 2 : 0)} · classe ${R.classe}` : ''}`],
    ['Resa nominale 12/7 °C · 35 °C', `${kwt(u.kw)} kW · EER ${num(u.eer, 2)}`], ['Compressori / circuiti', `${u.nc || '—'} / ${u.ncirc || '—'}`],
    ['Dimensioni L × P × H', u.dim ? `${u.dim.map(v => num(v, 0)).join(' × ')} mm` : 'su richiesta'], ['Free cooling', u.fc ? `${u.fc} kW` : null]]);
  titolo(`Optional richiesti (${R.opt.length})`);
  if (R.opt.length) R.opt.forEach(o => testo('•  ' + o, { size: 9, dopo: 0 })); else testo('Nessuno', { color: GRIGIO });
  titolo('Dotazioni di serie');
  testo(u.std.join(' · '), { size: 8.5, color: GRIGIO });
  if (R.note || R.cto) { titolo(R.cto ? 'Esecuzione speciale (CTO) e note' : 'Note'); testo(R.note || '—'); }
  y -= 10;
  testo('Valori calcolati dalla matrice di resa Procryon (acqua, salto 5 K, interpolazione tra i punti di catalogo; con glicole resa ridotta con il coefficiente del fluido). Documento non vincolante: offerta, prezzi e conferma tecnica a cura dell\'ufficio commerciale Procryon — Smart Cooling Engineering S.r.l.', { size: 7.5, color: GRIGIO });
  doc.setTitle(`Richiesta d'offerta ${R.codice}`); doc.setAuthor('Procryon — Cryon DSGN'); doc.setProducer('Cryon DSGN');
  scarica(await doc.save(), `Procryon_Richiesta_${R.codice}_${R.id}.pdf`, 'application/pdf');
  C.ctx.toast('Richiesta d\'offerta pronta');
}
function csv() {
  if (!C.sel) return C.ctx.toast('Scegli prima una configurazione');
  const R = richiesta();
  const col = [['data', R.data], ['richiesta', R.id], ['azienda', R.azienda], ['referente', R.referente], ['email', R.email], ['telefono', R.telefono], ['paese', R.paese], ['progetto', R.progetto],
    ['serie', R.serie], ['codice', R.codice], ['codice_base', R.base], ['variante', R.variante], ['refrigerante', R.gas], ['quantita', R.qta], ['kw_richiesti', R.kw_rich ?? ''],
    ['acqua_uscita_C', R.lwt], ['acqua_ingresso_C', R.ewt], ['temp_condensazione_C', R.amb], ['fluido', R.fluido], ['kw_calcolati', R.kw ? R.kw.toFixed(1).replace('.', ',') : ''],
    ['kw_assorbiti', R.pw ? R.pw.toFixed(1).replace('.', ',') : ''], ['eer', R.eer ? R.eer.toFixed(2).replace('.', ',') : ''], ['margine_pct', R.margine != null ? R.margine.toFixed(0) : ''], ['optional', R.opt.join(' | ')], ['note', R.note]];
  const q = v => { const s = String(v ?? '').replace(/\./g, m => m); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const testo = '﻿' + col.map(c => c[0]).join(';') + '\r\n' + col.map(c => q(typeof c[1] === 'number' ? String(c[1]).replace('.', ',') : c[1])).join(';') + '\r\n';
  scarica(new TextEncoder().encode(testo), `Procryon_Richiesta_${R.codice}_${R.id}.csv`, 'text/csv');
  C.ctx.toast('Riga per CRM / Excel pronta');
}
function scarica(byte, nome, tipo) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([byte], { type: tipo })); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

// ---------------------------------------------------------------- eventi
function aggiorna() { disegnaFiltri(); disegnaRisultati(); disegnaScelta(); }
export async function apriConfiguratore() {
  C.ctx.vai('config');
  try { await dati(); } catch (e) { $('#cfRis').innerHTML = `<div class="vuoto">${esc(e.message)}</div>`; return; }
  aggiorna();
}
export function avviaConfiguratore(ctx) {
  C.ctx = ctx;
  const tog = (set, el, unico) => el.addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (!b) return; const v = b.dataset.v; set.has(v) ? set.delete(v) : set.add(v); C.sel = null; C.opt.clear(); aggiorna(); });
  tog(C.serie, $('#cfSerie')); tog(C.varianti, $('#cfVar')); tog(C.gas, $('#cfGas'));
  let t = 0;
  for (const id of ['#cfKw', '#cfLwt', '#cfDt', '#cfAmb', '#cfAcq', '#cfPct', '#cfQta', '#cfCond', '#cfComp', '#cfFree', '#cfFluido', '#cfGwp', '#cfDry'])
    $(id).addEventListener(id.match(/Kw|Lwt|Dt|Amb|Acq|Pct|Qta/) ? 'input' : 'change', () => { C.gwp = +$('#cfGwp').value; clearTimeout(t); t = setTimeout(() => { disegnaFiltri(); disegnaRisultati(); }, 160); });
  $('#cfRis').addEventListener('click', e => {
    const r = e.target.closest('.cf-r'); if (!r) return;
    C.sel = C.lista[+r.dataset.i].u; C.opt.clear();
    document.querySelectorAll('.cf-r').forEach(x => x.classList.toggle('sel', x === r));
    disegnaScelta(); $('#cfScelta').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#cfScelta').addEventListener('change', e => { const i = e.target.dataset.o; if (i == null) return; e.target.checked ? C.opt.add(+i) : C.opt.delete(+i); });
  $('#cfScelta').addEventListener('click', e => { if (e.target.closest('[data-a="catalogo"]')) C.ctx.apriScheda?.(C.sel.c, C.sel.s); });
  $('#cfPdf').onclick = pdf; $('#cfCsv').onclick = csv;
}
