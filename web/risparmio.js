// CRYON DSGN — Analisi risparmio: due chiller a confronto ora per ora, sul clima reale della località (media degli ultimi 2–3 anni)
// e sull'orario di lavoro dell'impianto. Tutto nel browser: matrice di resa dal configuratore (dati/configuratore.json), clima da Open-Meteo.
// Modello (le ipotesi finiscono anche nel report):
//  - carico costante = potenza richiesta × saturazione impianto, solo nelle ore di lavoro
//  - free cooling (doppia batteria): resa piena con aria ≤ acqua uscita − ΔT di targa (es. 15 − 8 = 7 °C), proporzionale fino all'acqua uscita, nulla sopra
//  - compressori sul carico residuo: potenza dalla matrice (acqua uscita × aria esterna), parzializzazione a gradini (1/n compressori)
//    con curva tarata sull'ESEER di catalogo; sotto il primo gradino on/off con Cd 0,9 (EN 14825)
//  - ventilatori brushless: in solo free cooling modulano (potenza proporzionale al cubo della velocità, minimo 15 %); potenza stimata finché non arrivano i dati di targa
//  - fattore di resa/consumo per macchina (100 % = catalogo; 110 % = consuma il 10 % in più)
import { resa, datiConfiguratore, coeffGlicole } from './configuratore.js';
import { datiListino, prezzoUnita } from './listino.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v, d = 0) => v == null || !isFinite(v) ? '—' : Number(v).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
const eur = v => v == null || !isFinite(v) ? '—' : '€ ' + num(v, 0);
const val = id => { const x = parseFloat(String($(id).value).replace(',', '.')); return isFinite(x) ? x : null; };
const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
const GIORNI = [[1, 'Lun'], [2, 'Mar'], [3, 'Mer'], [4, 'Gio'], [5, 'Ven'], [6, 'Sab'], [0, 'Dom']];
const SERIE_OK = ['PRO-A', 'PROS-A', 'F-PRO', 'F-PROS'];        // chiller condensati ad aria: il consumo dipende dall'aria esterna
const CD = 0.9, ESEER_PT = [[1, 35, .03], [.75, 30, .33], [.5, 25, .41], [.25, 20, .23]];
const R = { ctx: null, D: null, luogo: null, clima: null, giorni: new Set([1, 2, 3, 4, 5]), M: { A: null, B: null }, ris: null, prezzi: true, t: 0 };

// ================================================================ clima (Open-Meteo: geocoding + archivio orario)
const chiaveOM = () => { try { return localStorage.getItem('cryon.openmeteo') || ''; } catch (e) { return ''; } };
async function cercaLuoghi(nome) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nome)}&count=8&language=it&format=json`);
  if (!r.ok) throw new Error('ricerca località non disponibile');
  return (await r.json()).results || [];
}
const CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const gdA = (m, d) => CUM[m - 1] + d - 1;                       // giorno dell'anno su 365 (29 febbraio → 28)
function anniClima(n) { const y = new Date().getFullYear(); return [y - n, y - 1]; }
async function clima(l, n) {
  const [a0, a1] = anniClima(n), k = `cryon.clima|${l.latitude.toFixed(2)}|${l.longitude.toFixed(2)}|${a0}-${a1}`;
  try { const c = JSON.parse(localStorage.getItem(k) || 'null'); if (c?.t?.length === 8760) return c; } catch (e) { /* niente cache */ }
  const key = chiaveOM();
  const url = `https://${key ? 'customer-' : ''}archive-api.open-meteo.com/v1/archive?latitude=${l.latitude}&longitude=${l.longitude}&start_date=${a0}-01-01&end_date=${a1}-12-31&hourly=temperature_2m&timezone=auto${key ? '&apikey=' + encodeURIComponent(key) : ''}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`dati climatici non disponibili (${r.status})`);
  const j = await r.json(), tm = j.hourly?.time || [], tv = j.hourly?.temperature_2m || [];
  const s = new Float64Array(8760), c = new Uint16Array(8760);
  for (let i = 0; i < tm.length; i++) {
    const v = tv[i]; if (v == null) continue;
    const m = +tm[i].slice(5, 7), d = +tm[i].slice(8, 10), h = +tm[i].slice(11, 13);
    if (m === 2 && d === 29) continue;
    const x = gdA(m, d) * 24 + h; s[x] += v; c[x]++;
  }
  const t = new Array(8760);
  for (let x = 0; x < 8760; x++) t[x] = c[x] ? Math.round(s[x] / c[x] * 10) / 10 : null;
  for (let x = 0; x < 8760; x++) if (t[x] == null) t[x] = t[(x + 8759) % 8760] ?? 15;
  const out = { t, anni: [a0, a1], fonte: 'Open-Meteo (ERA5), media oraria ' + a0 + '–' + a1 };
  try { localStorage.setItem(k, JSON.stringify(out)); } catch (e) { /* spazio pieno: si riscarica la prossima volta */ }
  return out;
}

// ================================================================ calendario di lavoro
function pasqua(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return new Date(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1);
}
function feste(y) {
  const p = pasqua(y), lun = new Date(p.getFullYear(), p.getMonth(), p.getDate() + 1);
  return new Set(['1-1', '1-6', '4-25', '5-1', '6-2', '8-15', '11-1', '12-8', '12-25', '12-26', `${lun.getMonth() + 1}-${lun.getDate()}`]);
}
function orario() {
  const o = $('#rsOre').value;
  const [da, a] = o === 'x' ? [Math.max(0, Math.min(24, val('#rsDa') ?? 8)), Math.max(0, Math.min(24, val('#rsA') ?? 18))] : o.split('-').map(Number);
  return { da, a, attiva: h => da === a || (da < a ? h >= da && h < a : h >= da || h < a) };
}
// ore dell'anno scelto: [indice profilo clima, mese]
function oreLavoro(anno) {
  const F = $('#rsFeste').checked ? feste(anno) : new Set(), O = orario(), out = [];
  for (let d = new Date(anno, 0, 1); d.getFullYear() === anno; d = new Date(anno, d.getMonth(), d.getDate() + 1)) {
    const m = d.getMonth() + 1, g = d.getDate();
    if (!R.giorni.has(d.getDay()) || F.has(`${m}-${g}`)) continue;
    const base = gdA(m, m === 2 && g === 29 ? 28 : g) * 24;
    for (let h = 0; h < 24; h++) if (O.attiva(h)) out.push([base + h, m - 1]);
  }
  return out;
}

// ================================================================ macchine
const unitaSerie = (sid, gas) => R.D.unita.filter(u => u.s === sid && (!gas || u.g === gas)).sort((a, b) => a.kw - b.kw || a.c.localeCompare(b.c));
function limiti(u) {
  if (!u._rg) { const L = u.m.map(p => p[0]), A = u.m.map(p => p[1]); u._rg = [Math.min(...L), Math.max(...L), Math.min(...A), Math.max(...A)]; }
  return u._rg;
}
// resa e assorbimento della macchina (pieno carico) ad acqua uscita lwt e aria amb. Fuori matrice si tiene il bordo; se la matrice
// parte da un'aria più alta di 15 °C (es. R134A da 25 °C) si prolunga la tendenza fino a 15 °C, sotto si tiene 15 °C (controllo di condensazione)
function punto(u, L, A) {
  const [, , a0, a1] = limiti(u);
  return resa(u, L, A) || resa(u, Math.round(L), Math.max(a0, Math.min(a1, Math.round(A / 5) * 5))) || null;
}
function piena(M, lwt, amb) {
  const u = M.ref, [l0, l1, a0, a1] = limiti(u);
  const L = Math.max(l0, Math.min(l1, lwt)), A = Math.min(a1, Math.max(amb, Math.min(a0, 15)));
  let r = null;
  if (A < a0) {
    const r0 = punto(u, L, a0), r1 = punto(u, L, a0 + 5);
    if (r0 && r1) { const f = (a0 - A) / 5; r = { kw: r0.kw + (r0.kw - r1.kw) * f, pw: Math.max(r0.pw * 0.6, r0.pw - (r1.pw - r0.pw) * f) }; }
  }
  r = r || punto(u, L, Math.max(a0, A)) || { kw: u.kw, pw: u.pw };
  return { kw: r.kw * M.sk, pw: r.pw * M.sp };
}
// coefficiente di parzializzazione tarato sull'ESEER: EER(plr) = EER pieno × (1 + a·(1−plr)), gradino minimo 1/n compressori
function taraESEER(M) {
  const m = 1 / Math.max(1, M.nc);
  if (!M.es) { M.a = 0.25; M.aStima = true; return; }
  let s0 = 0, s1 = 0;
  for (const [p, amb, w] of ESEER_PT) {
    const r = piena(M, 7, amb), E = r.kw / r.pw, pe = Math.max(p, m), cy = p >= m ? 1 : 1 - CD * (1 - p / m);
    s0 += w * E * cy; s1 += w * E * cy * (1 - pe);
  }
  M.a = s1 > 0 ? Math.max(-0.3, Math.min(3, (M.es - s0) / s1)) : 0; M.aStima = false;
}
function kParz(M, plr) {
  const m = 1 / Math.max(1, M.nc);
  if (plr >= m) return 1 + M.a * (1 - plr);
  return (1 + M.a * (1 - m)) * Math.max(0.05, 1 - CD * (1 - plr / m));
}
// stima della potenza dei ventilatori (kW per ventilatore) finché Procryon non dà i dati di targa
const ventStima = u => Math.min(2.2, Math.max(0.12, 0.085 * u.pw / Math.max(1, u.nv || 1)));

// costruisce la macchina di calcolo dallo stato del pannello
function macchina(k) {
  const P = R.M[k];
  if (P.fonte === 'p') {
    const u = R.D.unita.find(x => x.c === P.codice); if (!u) return null;
    const M = { k, nome: u.c, procryon: true, u, ref: u, sk: 1, sp: 1, kw: u.kw, pw: u.pw, eer: u.eer, es: u.es, nc: u.nc || 1, fc: u.fc || 0, fcdt: u.fcdt || 8,
      nv: u.nv || 0, nfc: u.fc ? (u.nfc || u.nv || 0) : 0, condivisi: !u.nfc || u.nfc === u.nv, gas: u.g, dim: u.dim, serie: u.s, v: u.v };
    M.pv = ventStima(u); M.pvTot = P.pfan != null ? P.pfan : null;
    M.fatt = (P.fatt || 100) / 100; M.prezzo = P.prezzo ?? (R.prezzi ? prezzoUnita(u.c) : null);
    taraESEER(M); return M;
  }
  const x = P.man, fc = +x.fc || 0;
  if (!(x.kw > 0) || !(x.pw > 0)) return null;
  const tutte = R.D.unita.filter(u => SERIE_OK.includes(u.s) && !!u.fc === fc > 0), piene = tutte.filter(u => limiti(u)[2] <= 15);
  const cand = piene.length ? piene : tutte;
  const ref = cand.reduce((b, u) => Math.abs(Math.log(u.kw / x.kw)) < Math.abs(Math.log(b.kw / x.kw)) ? u : b, cand[0]);
  const M = { k, nome: x.nome || 'Macchina ' + k, procryon: false, u: null, ref, sk: x.kw / ref.kw, sp: x.pw / ref.pw, kw: x.kw, pw: x.pw, eer: x.kw / x.pw, es: +x.es || null,
    nc: Math.max(1, +x.nc || ref.nc || 1), fc, fcdt: +x.fcdt || 8, nv: Math.max(1, Math.round((ref.nv || 1) * x.kw / ref.kw)), gas: x.gas || '', dim: null };
  M.nfc = fc ? M.nv : 0; M.condivisi = true;
  M.pv = Math.min(2.2, Math.max(0.12, 0.085 * x.pw / M.nv)); M.pvTot = P.pfan != null ? P.pfan : null;
  M.fatt = (P.fatt || 100) / 100; M.prezzo = P.prezzo;
  taraESEER(M); return M;
}

// ================================================================ calcolo ora per ora
function calcola(M, Q, lwt, cf, ore, T) {
  const o = { el: 0, th: 0, mesi: Array(12).fill(0), mesiTh: Array(12).fill(0), ore: ore.length, oreFc: 0, oreMisto: 0, oreComp: 0, scoperto: 0, oreScop: 0, elFc: 0 };
  const pvFc = M.pvTot != null ? M.pvTot : M.nfc * M.pv;          // ventilatori del free cooling a piena velocità (kW, totale)
  for (const [x, mese] of ore) {
    const t = T[x];
    let fc = 0;
    if (M.fc) fc = M.fc * M.sk * cf * Math.max(0, Math.min(1, (lwt - t) / M.fcdt));
    const qfc = Math.min(fc, Q), qc = Q - qfc;
    let p = 0, dato = Q;
    if (qc <= 1e-6) {                                              // solo free cooling: compressori fermi, ventilatori modulanti
      p = pvFc * Math.pow(Math.max(0.15, Math.min(1, Q / fc)), 3); o.oreFc++; o.elFc += p * M.fatt;
    } else {
      const r = piena(M, lwt, t), cmax = r.kw * cf;
      let plr = qc / cmax;
      if (plr > 1) { o.scoperto += qc - cmax; o.oreScop++; dato -= qc - cmax; plr = 1; }
      p = plr * r.pw / kParz(M, plr);
      if (qfc > 0) { o.oreMisto++; if (!M.condivisi) p += pvFc; } else o.oreComp++;
    }
    p *= M.fatt;
    o.el += p; o.th += dato; o.mesi[mese] += p; o.mesiTh[mese] += dato;
  }
  o.rend = o.el ? o.th / o.el : null;
  return o;
}

// ================================================================ pannelli macchina
function predefinito(k) {
  const gas = R.D.unita.some(u => u.g === 'R454B') ? 'R454B' : R.D.unita[0].g;
  return { fonte: 'p', serie: k === 'A' ? 'PRO-A' : 'F-PRO', gas, codice: null, scelto: false, fatt: 100, pfan: null, prezzo: null, man: { nome: '', kw: null, pw: null, es: null, nc: 2, fc: 0, fcdt: 8, gas: '' } };
}
function sceltaAuto(P) {
  if (P.fonte !== 'p' || P.scelto) return;
  const Q = val('#rsKw') || 0, lwt = val('#rsLwt') ?? 7, cf = coeffGlicole(fluido());
  const us = unitaSerie(P.serie, P.gas), pref = us.filter(u => u.v === 'S' && u.sol === 'O');
  const lista = pref.length ? pref : us;
  const ok = lista.find(u => { const r = resa(u, Math.max(limiti(u)[0], Math.min(limiti(u)[1], lwt)), 35); return (r ? r.kw : u.kw) * cf >= Q; });
  P.codice = (ok || lista[lista.length - 1])?.c || null;
}
const fluido = () => ({ tipo: $('#rsFluido').value, pct: val('#rsPct') || 0 });
function pannello(k) {
  const P = R.M[k], el = $('#rsM' + k), D = R.D;
  sceltaAuto(P);
  const serie = D.serie.filter(s => SERIE_OK.includes(s.id));
  const gasS = [...new Set(D.unita.filter(u => u.s === P.serie).map(u => u.g))];
  if (!gasS.includes(P.gas)) P.gas = gasS[0];
  const us = unitaSerie(P.serie, P.gas), lwt = val('#rsLwt') ?? 7;
  const opz = us.map(u => { const r = resa(u, Math.max(limiti(u)[0], Math.min(limiti(u)[1], lwt)), 35); return `<option value="${esc(u.c)}" ${u.c === P.codice ? 'selected' : ''}>${esc(u.c)} · ${num(r ? r.kw : u.kw, 0)} kW${u.fc ? ' · FC ' + u.fc : ''}</option>`; }).join('');
  const M = P.fonte === 'p' ? macchina(k) : null;
  const campo = (lab, key, v, ph = '') => `<label>${lab}<input data-m="${key}" inputmode="decimal" value="${v ?? ''}" placeholder="${esc(ph)}"></label>`;
  const fcSi = P.fonte === 'p' ? !!M?.fc : +P.man.fc > 0;
  const stimaV = P.fonte === 'p' && M ? M.nfc * M.pv : (P.man.pw ? 0.085 * P.man.pw : null);
  el.innerHTML = `<div class="rs-mt"><b class="rs-let ${k}">${k}</b><select data-p="fonte"><option value="p" ${P.fonte === 'p' ? 'selected' : ''}>Procryon</option><option value="x" ${P.fonte === 'x' ? 'selected' : ''}>Altro costruttore (dati a mano)</option></select></div>
    <div class="cf-campi">
    ${P.fonte === 'p' ? `<label>Serie<select data-p="serie">${serie.map(s => `<option value="${s.id}" ${s.id === P.serie ? 'selected' : ''}>${esc(s.nome)}${s.freecooling ? ' · free cooling' : ''}</option>`).join('')}</select></label>
      <label>Refrigerante<select data-p="gas">${gasS.map(g => `<option ${g === P.gas ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
      <label class="cf-larga">Modello <span class="muted">· resa all'acqua di progetto, aria 35 °C${P.scelto ? '' : ' · scelto in automatico'}</span><select data-p="codice">${opz}</select></label>`
    : `<label class="cf-larga">Nome / modello<input data-n="nome" value="${esc(P.man.nome)}" placeholder="es. Concorrente X 200"></label>
      ${campo('Resa nominale (kW) · 12/7 °C, aria 35 °C', 'n:kw', P.man.kw)}${campo('Potenza assorbita (kW)', 'n:pw', P.man.pw)}
      ${campo('ESEER', 'n:es', P.man.es, 'se noto')}${campo('N. compressori', 'n:nc', P.man.nc)}
      ${campo('Free cooling (kW, 0 = no)', 'n:fc', P.man.fc)}${campo('ΔT free cooling (K)', 'n:fcdt', P.man.fcdt)}
      <label>Refrigerante<input data-n="gas" value="${esc(P.man.gas)}" placeholder="es. R32"></label>`}
      ${campo('Fattore di resa / consumo (%)', 'fatt', P.fatt, '100 = come da catalogo')}
      ${fcSi ? campo('Ventilatori free cooling (kW totali)', 'pfan', P.pfan, stimaV ? 'stima ' + num(stimaV, 1) : 'stima') : ''}
      ${R.prezzi && !$('#rsVc').checked ? campo('Prezzo macchina (€)', 'prezzo', P.prezzo ?? (M?.procryon && prezzoUnita(M.u.c) != null ? Math.round(prezzoUnita(M.u.c)) : ''), M?.procryon ? 'da listino' : '') : ''}
    </div>${scheda(M || (P.fonte === 'x' ? macchina(k) : null))}`;
}
// scheda semplificata (anche per il cliente): potenza, refrigerante, potenza elettrica, compressori, condensatore, dimensioni
function scheda(M) {
  if (!M) return '<p class="muted rs-sch">Completa i dati della macchina.</p>';
  const g = M.gas && R.D.gas[M.gas];
  const cond = M.procryon ? `${M.nv} ventilatori EC · ${M.v === 'C' ? 'rame-alluminio' : 'micro-canali'}` : '—';
  const r = [['Potenza frigorifera', `${num(M.kw, 1)} kW`], ['Refrigerante', M.gas ? `${M.gas}${g ? ` · GWP ${num(g.gwp, g.gwp < 10 ? 2 : 0)}` : ''}` : '—'], ['Potenza elettrica', `${num(M.pw, 1)} kW · EER ${num(M.eer, 2)}${M.es ? ' · ESEER ' + num(M.es, 2) : ''}`],
    ['Compressori', String(M.nc)], ['Condensatore', cond], ['Free cooling', M.fc ? `${num(M.fc)} kW · ΔT ${num(M.fcdt)} K` : 'no'], ['Dimensioni L×P×H', M.dim ? M.dim.map(v => num(v)).join(' × ') + ' mm' : '—']];
  return `<div class="rs-sch">${r.map(([a, b]) => `<div><span>${a}</span><b>${esc(b)}</b></div>`).join('')}</div>`;
}

// ================================================================ risultati
function disegnaRisultati() {
  const X = R.ris, el = $('#rsRis');
  if (!X) { el.innerHTML = ''; $('#rsPdf').disabled = true; return; }
  const { A, B, MA, MB, euro } = X, cli = !R.prezzi || $('#rsVc').checked;
  const dk = A.el - B.el, dp = A.el ? dk / A.el * 100 : 0, de = euro != null ? dk * euro : null;
  const meglio = dk >= 0 ? 'B' : 'A', peggio = meglio === 'B' ? 'A' : 'B';
  const pb = !cli && MA.prezzo != null && MB.prezzo != null && de ? (MB.prezzo - MA.prezzo) / de : null;
  const riga = (lab, a, b, cls = '') => `<tr class="${cls}"><td>${lab}</td><td>${a}</td><td>${b}</td></tr>`;
  const max = Math.max(1, ...A.mesi, ...B.mesi), Tm = X.tMese, tmin = Math.min(...Tm), tmax = Math.max(...Tm);
  const W = 640, H = 220, bw = (W - 40) / 12;
  const barre = A.mesi.map((a, i) => { const x = 30 + i * bw, ha = a / max * (H - 50), hb = B.mesi[i] / max * (H - 50);
    return `<rect x="${x + bw * .14}" y="${H - 24 - ha}" width="${bw * .34}" height="${ha}" class="ba"><title>A · ${MESI[i]}: ${num(a)} kWh</title></rect><rect x="${x + bw * .5}" y="${H - 24 - hb}" width="${bw * .34}" height="${hb}" class="bb"><title>B · ${MESI[i]}: ${num(B.mesi[i])} kWh</title></rect><text x="${x + bw / 2}" y="${H - 8}">${MESI[i]}</text>`; }).join('');
  const ty = t => 18 + (tmax - t) / Math.max(1, tmax - tmin) * (H - 70);
  const linea = Tm.map((t, i) => `${30 + i * bw + bw / 2},${ty(t)}`).join(' ');
  const punti = Tm.map((t, i) => `<circle cx="${30 + i * bw + bw / 2}" cy="${ty(t)}" r="3"><title>${MESI[i]}: ${num(t, 1)} °C medi nelle ore di lavoro</title></circle>`).join('');
  el.innerHTML = `<div class="rs-esito">
      <span class="lab">Risparmio annuo · macchina ${meglio} rispetto a ${peggio}</span>
      <div class="rs-big"><b>${num(Math.abs(dk))}</b><span>kWh/anno</span>${de != null ? `<b class="acc">${eur(Math.abs(de))}</b><span>/anno</span>` : ''}<i>−${num(Math.abs(dp), 1)} %</i></div>
      <p class="muted">${esc(X.luogo)} · ${num(A.ore)} ore di lavoro/anno · carico ${num(X.Q, 1)} kW (${num(X.sat)} % di ${num(X.Qr, 1)} kW) · acqua ${num(X.lwt, 1)} °C</p></div>
    <table class="rs-tab"><thead><tr><th></th><th><b class="rs-let A">A</b> ${esc(MA.nome)}</th><th><b class="rs-let B">B</b> ${esc(MB.nome)}</th></tr></thead><tbody>
      ${riga('Energia elettrica (kWh/anno)', num(A.el), num(B.el), 'forte')}
      ${euro != null ? riga('Costo energia (€/anno)', eur(A.el * euro), eur(B.el * euro), 'forte') : ''}
      ${riga('Energia frigorifera erogata (kWh/anno)', num(A.th), num(B.th))}
      ${riga('Rendimento stagionale (kWh frigo / kWh el.)', num(A.rend, 2), num(B.rend, 2))}
      ${riga('Ore solo free cooling', num(A.oreFc), num(B.oreFc))}
      ${riga('Ore free cooling + compressori', num(A.oreMisto), num(B.oreMisto))}
      ${riga('Ore solo compressori', num(A.oreComp), num(B.oreComp))}
      ${A.scoperto || B.scoperto ? riga('Carico non coperto (kWh · ore)', `${num(A.scoperto)} · ${num(A.oreScop)} h`, `${num(B.scoperto)} · ${num(B.oreScop)} h`, 'avv') : ''}
      ${!cli ? riga('Prezzo macchina', eur(MA.prezzo), eur(MB.prezzo)) : ''}
      ${pb != null ? riga('Rientro della differenza di prezzo', '', pb <= 0 ? 'immediato' : `${num(pb, 1)} anni`, 'forte') : ''}
      ${de != null ? riga('Risparmio in 10 anni (energia a prezzo costante)', '', eur(Math.abs(de) * 10)) : ''}
    </tbody></table>
    <div class="rs-graf"><div class="lab">Consumo elettrico mese per mese · <span class="ka">■ A</span> <span class="kb">■ B</span> · <span class="kt">● temperatura media nelle ore di lavoro</span></div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${barre}<polyline points="${linea}" class="tl"/>${punti}</svg></div>
    <details class="rs-ip"><summary>Ipotesi di calcolo</summary><ul>${ipotesi(X).map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>`;
  $('#rsPdf').disabled = false;
}
function ipotesi(X) {
  const L = [`Clima: ${X.fonteClima}, ${X.luogo}. Ogni ora dell'anno ${X.anno} usa la temperatura media di quella stessa ora negli anni indicati.`,
    `Carico frigorifero costante nelle ore di lavoro: ${num(X.Qr, 1)} kW × saturazione ${num(X.sat)} % = ${num(X.Q, 1)} kW. Fuori orario le macchine sono spente.`,
    'Free cooling (doppia batteria): resa piena con aria esterna ≤ acqua in uscita − ΔT di targa, proporzionale fino alla temperatura dell\'acqua in uscita, nulla sopra.',
    'Compressori: potenza dalla matrice di resa Procryon (acqua in uscita × aria esterna; se la matrice parte da un\'aria più alta si prolunga la tendenza fino a 15 °C, sotto 15 °C e sopra il massimo di catalogo si tiene il bordo). Parzializzazione a gradini (1/n compressori) con curva tarata sull\'ESEER di catalogo; sotto il primo gradino funzionamento on/off con coefficiente di degrado 0,9 (EN 14825).',
    'Ventilatori EC brushless: in solo free cooling modulano con la richiesta (potenza proporzionale al cubo della velocità, minimo 15 %). Potenza dei ventilatori stimata dalla gamma Procryon dove non indicata.',
    'Fattore di resa/consumo per macchina: moltiplica il consumo calcolato (100 % = catalogo).',
    'Pompe, ausiliari e perdite d\'impianto non considerati (uguali per le due macchine).'];
  for (const M of [X.MA, X.MB]) {
    if (!M.procryon) L.push(`${M.k} · ${M.nome}: curve di resa scalate dalla macchina Procryon più vicina (${M.ref.c}) sui dati nominali inseriti.`);
    if (M.aStima) L.push(`${M.k} · ${M.nome}: ESEER non disponibile, parzializzazione stimata.`);
    if (M.fatt !== 1) L.push(`${M.k} · ${M.nome}: fattore di resa/consumo ${num(M.fatt * 100)} %.`);
  }
  return L;
}

async function esegui() {
  const btn = $('#rsCalcola');
  try {
    if (!R.luogo) { R.ctx.toast('Scegli prima la città'); $('#rsCitta').focus(); return; }
    const Qr = val('#rsKw'), sat = val('#rsSat') ?? 100, lwt = val('#rsLwt'), anno = Math.round(val('#rsAnno') || new Date().getFullYear());
    if (!(Qr > 0) || lwt == null) { R.ctx.toast('Indica potenza richiesta e acqua in uscita'); return; }
    if (!R.giorni.size) { R.ctx.toast('Scegli almeno un giorno lavorativo'); return; }
    const MA = macchina('A'), MB = macchina('B');
    if (!MA || !MB) { R.ctx.toast('Completa i dati delle due macchine'); return; }
    btn.disabled = true; btn.textContent = 'Scarico il clima…';
    R.clima = await clima(R.luogo, +$('#rsAnni').value);
    disegnaClima();
    btn.textContent = 'Calcolo…';
    const Q = Qr * sat / 100, cf = coeffGlicole(fluido()), ore = oreLavoro(anno), T = R.clima.t;
    const tS = Array(12).fill(0), tN = Array(12).fill(0); for (const [x, m] of ore) { tS[m] += T[x]; tN[m]++; }
    const euro = val('#rsEuro');
    R.ris = { A: calcola(MA, Q, lwt, cf, ore, T), B: calcola(MB, Q, lwt, cf, ore, T), MA, MB, Q, Qr, sat, lwt, cf, anno, euro: euro > 0 ? euro : null,
      tMese: tS.map((s, i) => tN[i] ? s / tN[i] : 0), luogo: nomeLuogo(R.luogo), fonteClima: R.clima.fonte, quando: new Date() };
    disegnaRisultati();
  } catch (e) { R.ctx.toast('Analisi non riuscita: ' + e.message); console.error(e); }
  finally { btn.disabled = false; btn.textContent = 'Calcola il risparmio'; }
}
const nomeLuogo = l => [l.name, l.admin1, l.country_code].filter(Boolean).join(', ');
function disegnaClima() {
  const el = $('#rsClima');
  if (!R.luogo) { el.innerHTML = ''; return; }
  let h = `<b>${esc(nomeLuogo(R.luogo))}</b> <span class="muted">· ${num(R.luogo.latitude, 2)} N ${num(R.luogo.longitude, 2)} E${R.luogo.elevation != null ? ` · ${num(R.luogo.elevation)} m` : ''}</span>`;
  if (R.clima) {
    const T = R.clima.t, med = T.reduce((a, b) => a + b, 0) / T.length, lwt = val('#rsLwt') ?? 7;
    h += `<br><span class="muted">${esc(R.clima.fonte)} · media ${num(med, 1)} °C · min ${num(Math.min(...T), 1)} · max ${num(Math.max(...T), 1)} · ore/anno sotto ${num(lwt)} °C: ${num(T.filter(t => t < lwt).length)}</span>`;
  }
  el.innerHTML = h;
}

// ================================================================ report PDF
const SICURO = t => String(t ?? '').replace(/Δ/g, 'Delta ').replace(/→/g, '->').replace(/≈/g, '~').replace(/[≤]/g, '<=').replace(/[³]/g, '^3').replace(/−/g, '-').replace(/[^\x20-\x7E\xA0-\xFF–—‘’“”•…€·]/g, '?');
async function report() {
  const X = R.ris; if (!X) return;
  const cli = !R.prezzi || $('#rsVc').checked;
  const L = await import('./vendor/pdf-lib.esm.min.js');
  const doc = await L.PDFDocument.create();
  const F = await doc.embedFont(L.StandardFonts.Helvetica), FB = await doc.embedFont(L.StandardFonts.HelveticaBold);
  const AR = L.rgb(0.949, 0.612, 0.122), SC = L.rgb(0.137, 0.122, 0.125), GR = L.rgb(0.42, 0.4, 0.4), CH = L.rgb(0.78, 0.76, 0.76);
  const W = 595.28, H = 841.89, M = 48, oggi = X.quando.toLocaleDateString('it-IT');
  let pg, y;
  const nuova = () => { pg = doc.addPage([W, H]); pg.drawRectangle({ x: 0, y: H - 8, width: W, height: 8, color: AR });
    pg.drawText('PROCRYON', { x: M, y: H - 40, size: 16, font: FB, color: SC }); pg.drawText(SICURO('Analisi risparmio energetico · Energy saving analysis'), { x: M + 112, y: H - 40, size: 10, font: F, color: GR });
    pg.drawText(oggi, { x: W - M - F.widthOfTextAtSize(oggi, 9), y: H - 40, size: 9, font: F, color: GR }); y = H - 72; };
  const capo = (t, f, s, l) => { const o = []; let r = ''; for (const w of SICURO(t).split(/\s+/)) { const p = r ? r + ' ' + w : w; if (f.widthOfTextAtSize(p, s) > l && r) { o.push(r); r = w; } else r = p; } if (r) o.push(r); return o; };
  const testo = (t, { size = 9.5, font = F, color = SC, x = M, larg = W - 2 * M, dopo = 3 } = {}) => { for (const r of capo(t, font, size, larg)) { if (y < M + 30) nuova(); pg.drawText(r, { x, y, size, font, color }); y -= size + 3; } y -= dopo; };
  const titolo = t => { if (y < M + 90) nuova(); y -= 6; pg.drawText(SICURO(t.toUpperCase()), { x: M, y, size: 8.5, font: FB, color: AR }); y -= 5; pg.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: CH }); y -= 13; };
  const tab = righe => { for (const [a, b, c, forte] of righe) { if (y < M + 30) nuova(); pg.drawText(SICURO(a), { x: M, y, size: 9, font: F, color: GR });
    for (const [v, x] of [[b, M + 250], [c, M + 380]]) pg.drawText(SICURO(v), { x, y, size: 9.5, font: forte ? FB : F, color: SC }); y -= 14; } };
  const { A, B, MA, MB, euro } = X, dk = A.el - B.el, de = euro != null ? dk * euro : null, meglio = dk >= 0 ? 'B' : 'A';
  nuova();
  pg.drawText(SICURO(`Risparmio ${num(Math.abs(dk))} kWh/anno${de != null ? ' · ' + eur(Math.abs(de)) + '/anno' : ''}`), { x: M, y, size: 20, font: FB, color: SC }); y -= 20;
  testo(`Macchina ${meglio} rispetto alla ${meglio === 'B' ? 'A' : 'B'}: −${num(Math.abs(A.el ? dk / A.el * 100 : 0), 1)} % di energia elettrica`, { size: 11, color: GR, dopo: 8 });
  titolo('Impianto e utilizzo');
  tab([['Località', X.luogo, ''], ['Clima', X.fonteClima, ''], ['Potenza richiesta · saturazione', `${num(X.Qr, 1)} kW · ${num(X.sat)} %`, ''], ['Acqua in uscita', `${num(X.lwt, 1)} °C`, ''],
    ['Fluido', $('#rsFluido').selectedOptions[0].text + ($('#rsFluido').value !== 'acqua' ? ` ${num(val('#rsPct'))} %` : ''), ''],
    ['Orario', `${$('#rsOre').selectedOptions[0].text}${$('#rsOre').value === 'x' ? ` ${orario().da}–${orario().a}` : ''} · ${GIORNI.filter(g => R.giorni.has(g[0])).map(g => g[1]).join(' ')}`, ''],
    ['Ore di lavoro / anno', `${num(A.ore)} (anno ${X.anno}${$('#rsFeste').checked ? ', festività escluse' : ''})`, ''], ['Prezzo energia', euro != null ? `${num(euro, 3)} €/kWh` : 'non indicato', '']]);
  titolo('Confronto');
  tab([['', 'A · ' + MA.nome, 'B · ' + MB.nome, true], ['Energia elettrica (kWh/anno)', num(A.el), num(B.el), true], ...(euro != null ? [['Costo energia (€/anno)', eur(A.el * euro), eur(B.el * euro), true]] : []),
    ['Energia frigorifera (kWh/anno)', num(A.th), num(B.th)], ['Rendimento stagionale', num(A.rend, 2), num(B.rend, 2)], ['Ore solo free cooling', num(A.oreFc), num(B.oreFc)],
    ['Ore free cooling + compressori', num(A.oreMisto), num(B.oreMisto)], ['Ore solo compressori', num(A.oreComp), num(B.oreComp)],
    ...(A.scoperto || B.scoperto ? [['Carico non coperto (kWh)', num(A.scoperto), num(B.scoperto)]] : []),
    ...(!cli ? [['Prezzo macchina', eur(MA.prezzo), eur(MB.prezzo)]] : []),
    ...(!cli && MA.prezzo != null && MB.prezzo != null && de ? [['Rientro differenza di prezzo', '', (MB.prezzo - MA.prezzo) / de <= 0 ? 'immediato' : num((MB.prezzo - MA.prezzo) / de, 1) + ' anni', true]] : [])]);
  titolo('Consumo elettrico mese per mese (kWh)');
  if (y < M + 150) nuova();
  const gh = 110, mx = Math.max(1, ...A.mesi, ...B.mesi), bw = (W - 2 * M) / 12;
  A.mesi.forEach((a, i) => { const x = M + i * bw, ha = a / mx * gh, hb = B.mesi[i] / mx * gh;
    pg.drawRectangle({ x: x + bw * .14, y: y - gh, width: bw * .34, height: ha, color: CH }); pg.drawRectangle({ x: x + bw * .5, y: y - gh, width: bw * .34, height: hb, color: AR });
    pg.drawText(MESI[i], { x: x + bw / 2 - F.widthOfTextAtSize(MESI[i], 7.5) / 2, y: y - gh - 11, size: 7.5, font: F, color: GR }); });
  y -= gh + 26; testo('grigio = A · arancio = B', { size: 7.5, color: GR });
  titolo('Schede sintetiche');
  for (const Mx of [MA, MB]) {
    const g = Mx.gas && R.D.gas[Mx.gas];
    testo(`${Mx.k} · ${Mx.nome}`, { font: FB, size: 10, dopo: 1 });
    testo(`Potenza frigorifera ${num(Mx.kw, 1)} kW · refrigerante ${Mx.gas || '—'}${g ? ' (GWP ' + num(g.gwp, g.gwp < 10 ? 2 : 0) + ')' : ''} · potenza elettrica ${num(Mx.pw, 1)} kW · EER ${num(Mx.eer, 2)}${Mx.es ? ' · ESEER ' + num(Mx.es, 2) : ''} · compressori ${Mx.nc}${Mx.procryon ? ` · condensatore ${Mx.nv} ventilatori EC ${Mx.v === 'C' ? 'rame-alluminio' : 'micro-canali'}` : ''} · free cooling ${Mx.fc ? num(Mx.fc) + ' kW (Delta T ' + num(Mx.fcdt) + ' K)' : 'no'}${Mx.dim ? ' · ' + Mx.dim.map(v => num(v)).join(' x ') + ' mm' : ''}`, { size: 8.5, color: GR, dopo: 6 });
  }
  titolo('Ipotesi di calcolo');
  for (const t of ipotesi(X)) testo('•  ' + t, { size: 7.8, color: GR, dopo: 1 });
  y -= 6; testo('Stima a scopo comparativo, non vincolante: i consumi reali dipendono da impianto, regolazione e manutenzione. Procryon — Smart Cooling Engineering S.r.l.', { size: 7.5, color: GR });
  doc.setTitle('Analisi risparmio Procryon'); doc.setAuthor('Procryon — Cryon DSGN'); doc.setProducer('Cryon DSGN');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([await doc.save()], { type: 'application/pdf' }));
  a.download = `Procryon_Analisi_risparmio_${X.luogo.split(',')[0].replace(/\W+/g, '_')}_${X.anno}.pdf`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  R.ctx.toast('Report pronto');
}

// ================================================================ eventi
function ridisegna() { pannello('A'); pannello('B'); if (R.ris) { clearTimeout(R.t); R.t = setTimeout(esegui, 350); } }
function eventiPannello(k) {
  const el = $('#rsM' + k);
  el.addEventListener('change', e => {
    const t = e.target, P = R.M[k];
    if (t.dataset.p) { P[t.dataset.p] = t.value; if (t.dataset.p === 'codice') P.scelto = true; else if (t.dataset.p !== 'fonte') { P.scelto = false; P.codice = null; } if (t.dataset.p === 'fonte') P.prezzo = null; ridisegna(); }
    else if (t.dataset.n) { P.man[t.dataset.n] = t.dataset.n === 'nome' || t.dataset.n === 'gas' ? t.value : parseFloat(t.value.replace(',', '.')) || null; ridisegna(); }
    else if (t.dataset.m) { const v = parseFloat(String(t.value).replace(/\./g, '').replace(',', '.')); const key = t.dataset.m.replace(/^n:/, '');
      if (t.dataset.m.startsWith('n:')) P.man[key] = isFinite(v) ? parseFloat(t.value.replace(',', '.')) : null;
      else P[key] = t.value.trim() === '' ? (key === 'fatt' ? 100 : null) : (key === 'prezzo' ? v : parseFloat(t.value.replace(',', '.')));
      ridisegna(); }
  });
}
export async function apriRisparmio() {
  R.ctx.vai('risparmio');
  if (!R.D) {
    $('#rsRis').innerHTML = '<p class="muted">Carico i dati delle macchine…</p>';
    try { R.D = await datiConfiguratore(R.ctx); } catch (e) { $('#rsRis').innerHTML = `<p class="vuoto">${esc(e.message)}</p>`; return; }
    const API = window.CRYON_ACCESSO;
    R.prezzi = !API || API.puo('listino');
    if (R.prezzi) await datiListino().catch(() => null);
    $('#rsVcW').hidden = !R.prezzi;
    R.M.A = predefinito('A'); R.M.B = predefinito('B');
    $('#rsRis').innerHTML = '<p class="muted">Scegli la città e premi «Calcola il risparmio».</p>';
  }
  pannello('A'); pannello('B');
}
export function avviaRisparmio(ctx) {
  R.ctx = ctx;
  $('#rsAnno').value = new Date().getFullYear();
  $('#rsGiorni').innerHTML = GIORNI.map(([v, n]) => `<button class="fc ${R.giorni.has(v) ? 'on' : ''}" data-v="${v}">${n}</button>`).join('');
  $('#rsGiorni').onclick = e => { const b = e.target.closest('button[data-v]'); if (!b) return; const v = +b.dataset.v; R.giorni.has(v) ? R.giorni.delete(v) : R.giorni.add(v); b.classList.toggle('on', R.giorni.has(v)); ridisegna(); };
  const ore = () => { const x = $('#rsOre').value === 'x'; $('#rsDaW').hidden = $('#rsAW').hidden = !x; };
  $('#rsOre').addEventListener('change', ore); ore();
  const flu = () => { $('#rsPctW').hidden = $('#rsFluido').value === 'acqua'; }; $('#rsFluido').addEventListener('change', flu); flu();
  for (const id of ['#rsKw', '#rsSat', '#rsLwt', '#rsDt', '#rsPct', '#rsFluido', '#rsAnno', '#rsOre', '#rsDa', '#rsA', '#rsFeste', '#rsEuro', '#rsAnni'])
    $(id).addEventListener('change', () => { if (R.D) { if (id === '#rsAnni') R.clima = null; ridisegna(); } });
  $('#rsVc').addEventListener('change', () => { if (R.D) { pannello('A'); pannello('B'); disegnaRisultati(); } });
  eventiPannello('A'); eventiPannello('B');
  // ricerca della città
  let t = 0, ultimi = [];
  const lista = $('#rsLuoghi');
  $('#rsCitta').addEventListener('input', e => {
    clearTimeout(t); const q = e.target.value.trim();
    if (q.length < 2) { lista.hidden = true; return; }
    t = setTimeout(async () => {
      try { ultimi = await cercaLuoghi(q); } catch (er) { ultimi = []; }
      lista.innerHTML = ultimi.length ? ultimi.map((l, i) => `<button data-i="${i}"><b>${esc(l.name)}</b> <span>${esc([l.admin2, l.admin1, l.country].filter(Boolean).join(' · '))}</span></button>`).join('') : '<p class="muted">Nessuna località trovata</p>';
      lista.hidden = false;
    }, 300);
  });
  lista.addEventListener('click', e => {
    const b = e.target.closest('button[data-i]'); if (!b) return;
    R.luogo = ultimi[+b.dataset.i]; R.clima = null; lista.hidden = true; $('#rsCitta').value = nomeLuogo(R.luogo);
    disegnaClima(); if (R.ris) esegui();
  });
  $('#rsCalcola').onclick = esegui;
  $('#rsPdf').onclick = () => report().catch(e => R.ctx.toast('Report non riuscito: ' + e.message));
}
