// CRYON DSGN — logica dell'interfaccia: intro, libreria, scheda catalogo, sfoglia, sotto-cataloghi
import { avviaScena } from './scena.js';
import { Libro } from './libro.js';
import { avviaConfiguratore, apriConfiguratore } from './configuratore.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v, d = 1) => v == null ? '—' : Number(v).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
const kw = v => num(v, v < 100 ? 1 : 0);
// Versione web / tablet (window.CRYON_WEB): nessun server dietro, i dati sono file statici accanto alla pagina
const WEB = !!window.CRYON_WEB;
async function apiWeb(u, body) {
  if (u === '/api/cataloghi') return (await fetch('dati/cataloghi.json')).json();
  if (u === '/api/stato') return { app: 'Cryon DSGN', web: true, pacchetto: true, versione: window.CRYON_WEB.versione, dati: window.CRYON_WEB.dati, db: true };
  throw new Error('Disponibile solo nell\'app da scrivania');
}
const api = async (u, body) => {
  if (WEB) return apiWeb(u, body);
  const r = await fetch(u, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json(); if (!r.ok) throw new Error(j.errore || r.status); return j;
};
const SVG = {};
async function svg(nome) { if (!SVG[nome]) SVG[nome] = await (await fetch(`web/img/${nome}.svg`)).text(); return SVG[nome]; }
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('su'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('su'), 2600); }
const ICON = {
  libro: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 7c4-2 8-2 12 1v18c-4-3-8-3-12-1z"/><path d="M28 7c-4-2-8-2-12 1v18c4-3 8-3 12-1z"/></svg>',
  griglia: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="4" width="10" height="10" rx="2"/><rect x="18" y="4" width="10" height="10" rx="2"/><rect x="4" y="18" width="10" height="10" rx="2"/><rect x="18" y="18" width="10" height="10" rx="2"/></svg>',
};

const S = { cataloghi: [], cur: null, vista: 'intro', storia: [], libro: null, sfFonte: null, gas: 'tutti' };
let scena = null;

// ================================================================ viste
function vai(v, { push = true } = {}) {
  if (push && S.vista !== v && S.vista !== 'intro') S.storia.push(S.vista);
  document.querySelectorAll('.vista').forEach(el => el.classList.toggle('attiva', el.id === v));
  S.vista = v; scena?.modo(v);
  document.body.classList.toggle('dentro', v !== 'intro');
  document.body.className = document.body.className.replace(/\bv-\S+/g, '').trim() + ` v-${v}`;
  briciole();
  if (v !== 'sfoglia') S.libro?.chiudi();
}
function indietro() {
  const v = S.storia.pop() || 'home';
  if (v === 'sfoglia') return indietro();
  vai(v, { push: false });
}
function briciole() {
  const b = $('#briciole'), c = S.cur;
  const p = [];
  if (S.vista !== 'home' && S.vista !== 'intro') p.push('<span>Libreria</span>');
  if (c && ['catalogo', 'sfoglia', 'sotto'].includes(S.vista)) p.push(`<b>${esc(String(c.numero).padStart(2, '0'))} · ${esc(c.nome)}</b>`);
  if (S.vista === 'sfoglia') p.push(`<span>${S.sfFonte?.sotto ? esc(S.sfFonte.sotto) : 'Catalogo completo'}</span>`);
  if (S.vista === 'sotto') p.push('<span>Sotto-cataloghi</span>');
  if (S.vista === 'config') p.push('<b>Configuratore</b>');
  b.innerHTML = p.join('<span class="muted">/</span>');
}

// scheda di una configurazione nel suo catalogo (dal configuratore)
async function apriScheda(codice, serie) {
  const c = S.cataloghi.find(x => x.manifest?.sotto?.some(z => z.codice === codice));
  if (!c) { toast('Scheda non trovata nei cataloghi installati'); return; }
  const m = c.manifest, z = m.sotto.find(x => x.codice === codice);
  S.cur = c;
  sfoglia({ url: `cat/${encodeURI(m.slug)}/${encodeURI(z.file)}`, titolo: codice, sotto: codice });
}

// ================================================================ intro
function intro() {
  const t = 'CRYON DSGN';
  $('#introTit').innerHTML = [...t].map((ch, i) => `<span class="${i > 5 ? 'a' : ''}" style="animation-delay:${0.9 + i * 0.07}s">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
  const entra = () => { if (S.vista === 'intro') vai('home', { push: false }); };
  $('#salta').onclick = entra;
  $('#intro').addEventListener('click', entra);
  addEventListener('keydown', e => { if (S.vista === 'intro') entra(); }, { once: true });
  setTimeout(entra, 4300);
}

// ================================================================ libreria
function copertinaDisegnata(c, logo, picto) {
  return `<div class="cov"><div class="p">${picto}</div>
    <div class="n">${String(c.numero).padStart(2, '0')}</div><div class="t">${esc(c.nome)}</div><div class="s">${esc(c.sottotitolo || '')}</div></div>`;
}
function libro3d(c, logo, picto, i = 0, grande = false) {
  const m = c.manifest;
  const img = m && m.pronto ? `<img src="cat/${encodeURI(m.slug)}/${m.copertina}?v=${encodeURIComponent(m.generato)}" alt="">` : copertinaDisegnata(c, logo, picto);
  const badge = c.stato === 'pronto' ? '' : `<span class="pill ${c.stato === 'da generare' ? 'acc' : ''} badge">${esc(c.stato)}</span>`;
  const meta = grande ? '' : `<div class="meta"><b>${esc(c.nome)}</b>${c.stato === 'pronto' ? `${m.pagine} pagine · ${m.configurazioni} configurazioni` : `${c.configurazioni} configurazioni · ${esc(c.stato)}`}</div>`;
  return `<div class="libro3d ${grande ? 'grande' : ''} ${c.stato === 'in arrivo' ? 'spento' : ''}" tabindex="0" data-n="${c.numero}" style="animation-delay:${0.08 * i}s">
    <div class="fr">${img}</div><div class="dorso">${String(c.numero).padStart(2, '0')} · ${esc(c.nome)}</div><div class="tg"></div><div class="rt"></div>
    ${badge}<div class="ombra"></div>${meta}</div>`;
}
async function libreria() {
  S.cataloghi = await api('/api/cataloghi');
  const [logo, picto] = await Promise.all([svg('logo'), svg('pittogramma')]);
  const sc = $('#scaffale');
  sc.innerHTML = S.cataloghi.map((c, i) => libro3d(c, logo, picto, i)).join('');
  sc.querySelectorAll('.libro3d').forEach(el => {
    const apri = () => apriCatalogo(+el.dataset.n, el);
    el.addEventListener('click', apri);
    el.addEventListener('keydown', e => { if (e.key === 'Enter') apri(); });
  });
  const pronti = S.cataloghi.filter(c => c.stato === 'pronto').length;
  const conf = S.cataloghi.reduce((a, c) => a + (c.configurazioni || 0), 0);
  const pag = S.cataloghi.reduce((a, c) => a + (c.manifest?.pagine || 0), 0);
  $('#numeri').innerHTML = `<div><b>13</b><span>serie · series</span></div><div><b>${conf}</b><span>configurazioni</span></div>
    <div><b>${pronti}</b><span>cataloghi pronti</span></div><div><b>${pag}</b><span>pagine generate</span></div>`;
  $('#scaffaleInfo').textContent = `${pronti} pronto · ${S.cataloghi.filter(c => c.stato === 'da generare').length} da generare · ${S.cataloghi.filter(c => c.stato === 'in arrivo').length} in arrivo`;
  $('#scSx').onclick = () => sc.scrollBy({ left: -560, behavior: 'smooth' });
  $('#scDx').onclick = () => sc.scrollBy({ left: 560, behavior: 'smooth' });
  sc.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { sc.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
}

// volo del libro dalla libreria alla scheda (FLIP)
function volo(daEl, aEl) {
  if (!daEl || !aEl) return;
  const a = daEl.getBoundingClientRect(), b = aEl.getBoundingClientRect();
  const clone = daEl.cloneNode(true);
  clone.classList.add('volo'); clone.style.animation = 'none'; clone.style.opacity = 1;
  Object.assign(clone.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`, margin: 0 });
  clone.querySelector('.meta')?.remove();
  document.body.appendChild(clone);
  aEl.style.opacity = 0;
  const sx = b.width / a.width;
  clone.animate([
    { transform: 'rotateY(-18deg) rotateX(4deg)' },
    { transform: `translate(${(b.left - a.left) * .5}px, ${(b.top - a.top) * .5 - 80}px) scale(${(1 + sx) / 2}) rotateY(-200deg) rotateX(10deg)`, offset: .55 },
    { transform: `translate(${b.left - a.left + (b.width - a.width) / 2}px, ${b.top - a.top + (b.height - a.height) / 2}px) scale(${sx}) rotateY(-382deg) rotateX(6deg)` }
  ], { duration: 1100, easing: 'cubic-bezier(.6,.05,.25,1)', fill: 'forwards' }).finished.then(() => {
    aEl.style.transition = 'opacity .25s'; aEl.style.opacity = 1; setTimeout(() => clone.remove(), 260);
  });
}

// ================================================================ scheda catalogo
async function apriCatalogo(n, daEl) {
  const c = S.cataloghi.find(x => x.numero === n);
  if (!c) return;
  if (c.stato === 'in arrivo') { toast(`${c.nome}: catalogo in arrivo — la famiglia va ancora configurata.`); return; }
  S.cur = c;
  const [logo, picto] = await Promise.all([svg('logo'), svg('pittogramma')]);
  const lg = $('#libroGrande');
  lg.outerHTML = libro3d(c, logo, picto, 0, true).replace('class="libro3d', 'id="libroGrande" class="libro3d');
  schedaInfo();
  vai('catalogo');
  volo(daEl, $('#libroGrande'));
}
function schedaInfo() {
  const c = S.cur, m = c.manifest;
  const gas = (c.gas || []).filter(Boolean).map(g => `<span class="pill gas">${esc(g)}</span>`).join('');
  let corpo;
  if (m && m.pronto) {
    const data = new Date(m.generato).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
    corpo = `<div class="stat"><div><b>${m.pagine}</b><span>pagine · pages</span></div><div><b>${m.configurazioni}</b><span>configurazioni</span></div>
      <div><b>${esc(m.kw_max)}</b><span>kW max · da ${esc(m.kw_min)}</span></div><div><b>${m.pdf_mb ?? '—'}</b><span>MB · ${data}</span></div></div>
      <div class="azioni">
        <button class="tile" id="aSfoglia"><span class="ic">${ICON.libro}</span><span class="go">→</span><h3>Sfoglia il catalogo</h3><p>${m.pagine} pagine · sfoglio a libro, indice, ricerca per codice</p></button>
        <button class="tile" id="aSotto"><span class="ic">${ICON.griglia}</span><span class="go">→</span><h3>Sotto-cataloghi</h3><p>${m.sotto.length} schede modello × gas, ognuna in PDF</p></button>
      </div>
      <div class="secondarie"><a class="btn ghost" href="cat/${encodeURI(m.slug)}/${encodeURI(m.file)}" target="_blank">Apri PDF ↗</a>
        <button class="btn ghost" id="aCartella">Mostra nella cartella</button><button class="btn ghost" id="aRigenera">Rigenera</button>${WEB ? '<button class="btn ghost" id="aOffline">Offline…</button>' : ''}</div>
      ${m.provvisoria ? `<div class="avviso">• Versione provvisoria · codici in verifica${WEB ? '' : ' con Riccardo'}</div>` : ''}`;
  } else {
    corpo = `<div class="stat"><div><b>${c.configurazioni}</b><span>configurazioni</span></div><div><b>${kw(c.kw?.[0])}</b><span>kW min</span></div><div><b>${kw(c.kw?.[1])}</b><span>kW max</span></div><div><b>—</b><span>pagine</span></div></div>
      <div class="azioni"><button class="tile" id="aGenera"><span class="ic">${ICON.libro}</span><span class="go">→</span><h3>Genera il catalogo</h3><p>Catalogo completo + sotto-cataloghi in PDF (qualche minuto)</p></button></div>`;
  }
  $('#catInfo').innerHTML = `<div class="num">${String(c.numero).padStart(2, '0')}</div>
    <h2>${esc(c.nome)}</h2>${c.nome_en ? `<div class="en">${esc(c.nome_en)}</div>` : ''}
    <p class="sub">${esc(m?.sottotitolo || c.sottotitolo || '')}${m?.sottotitolo_en ? `<br><span class="muted">${esc(m.sottotitolo_en)}</span>` : ''}</p>
    <div class="chips">${gas}${c.interno ? `<span class="pill">${esc(c.interno)}</span>` : ''}</div>${corpo}<div id="lavoro"></div>`;
  $('#aSfoglia')?.addEventListener('click', () => sfoglia({ url: `cat/${encodeURI(m.slug)}/${encodeURI(m.file)}`, titolo: c.nome }));
  $('#aSotto')?.addEventListener('click', sotto);
  $('#aCartella')?.addEventListener('click', () => api('/api/apri', { percorso: `${m.slug}/${m.file}` }).catch(e => toast(e.message)));
  $('#aRigenera')?.addEventListener('click', () => generaCat(c));
  if (WEB) offline(c);
  $('#aGenera')?.addEventListener('click', () => generaCat(c));
}
async function generaCat(c) {
  try { await api('/api/genera', { famiglia: c.famiglia }); } catch (e) { return toast(e.message); }
  const box = $('#lavoro');
  box.innerHTML = '<div class="barra-p"><i></i></div><div class="log" id="logLav">Avvio…</div>';
  const t = setInterval(async () => {
    const L = await api('/api/lavoro');
    $('#logLav').textContent = L.righe.join('\n'); $('#logLav').scrollTop = 1e6;
    const r = L.righe.join(' ');
    const mm = [...r.matchAll(/sotto-cataloghi (\d+)\/(\d+)/g)].pop();
    let p = /HTML pronto/.test(r) ? 18 : 6; if (/PDF catalogo completo/.test(r)) p = 30; if (mm) p = 40 + 58 * (+mm[1] / +mm[2]);
    box.querySelector('.barra-p i').style.width = `${L.esito ? 100 : p}%`;
    if (!L.attivo && L.esito) {
      clearInterval(t);
      toast(L.esito === 'ok' ? 'Catalogo generato ✓' : 'Errore nella generazione: vedi il registro');
      if (L.esito === 'ok') { await libreria(); S.cur = S.cataloghi.find(x => x.numero === c.numero); schedaInfo(); }
    }
  }, 1200);
}

// ================================================================ uso senza rete (solo versione web / tablet)
// Il catalogo scelto viene salvato sul dispositivo: PDF completo, copertina e immagini delle schede; i sotto-cataloghi a richiesta.
const CACHE_CAT = 'cryon-cat-v1';
async function offline(c) {
  const b = $('#aOffline'), m = c.manifest;
  if (!b) return;
  if (!('caches' in window) || !navigator.serviceWorker) { b.style.display = 'none'; return; }
  const base = new URL(`cat/${encodeURI(m.slug)}/`, location.href).href;
  const principali = [m.file, m.copertina, ...new Set(m.sotto.map(x => x.foto ? 'html/' + x.foto : null).filter(Boolean))].map(f => base + encodeURI(f));
  const sottoPdf = m.sotto.map(x => base + encodeURI(x.file));
  const cache = await caches.open(CACHE_CAT);
  const haTutti = async L => (await Promise.all(L.map(u => cache.match(u)))).every(Boolean);
  const aggiorna = async () => {
    const p = await haTutti([principali[0]]), s = p && await haTutti(sottoPdf);
    b.dataset.stato = s ? 'tutto' : (p ? 'catalogo' : 'no');
    b.textContent = s ? 'Offline ✓ · rimuovi' : (p ? 'Offline ✓ · aggiungi sotto-cataloghi' : 'Scarica per uso offline');
  };
  const scarica = async L => {
    let fatti = 0;
    for (const u of L) {
      if (!(await cache.match(u))) { const r = await fetch(u); if (!r.ok) throw new Error(`scaricamento non riuscito (${r.status})`); await cache.put(u, r); }
      b.textContent = `Scarico… ${Math.round(++fatti / L.length * 100)}%`;
    }
  };
  b.onclick = async () => {
    if (b.disabled) return;
    b.disabled = true;
    try {
      if (b.dataset.stato === 'tutto') { for (const u of [...principali, ...sottoPdf]) await cache.delete(u); toast('Catalogo rimosso dal dispositivo'); }
      else {
        try { await navigator.storage?.persist?.(); } catch (e) { /* facoltativo */ }
        await scarica(b.dataset.stato === 'catalogo' ? sottoPdf : principali);
        toast(b.dataset.stato === 'catalogo' ? 'Sotto-cataloghi salvati sul dispositivo' : 'Catalogo salvato: si apre anche senza rete');
      }
    } catch (e) { toast('Non riuscito: ' + e.message); }
    b.disabled = false; aggiorna();
  };
  aggiorna();
}

// ================================================================ sfoglia
async function sfoglia({ url, titolo, sotto = null, pagina = 1 }) {
  S.sfFonte = { url, titolo, sotto };
  vai('sfoglia');
  const m = S.cur.manifest;
  $('#sfTit').innerHTML = `${esc(titolo)}<span>${sotto ? 'sotto-catalogo' : 'catalogo completo'}</span>`;
  $('#sfPdf').href = url; $('#sfCerca').value = '';
  $('#sfCarica').classList.remove('via');
  const sel = $('#sfIndice');
  sel.innerHTML = sotto ? `<option value="">Sotto-catalogo ${esc(sotto)}</option>` :
    '<option value="">Vai alla sezione…</option>' + m.indice.filter(x => x.pagina).map(x => `<option value="${x.pagina}">${String(x.pagina).padStart(3, '0')} · ${esc(x.titolo)}</option>`).join('');
  sel.disabled = !!sotto;
  if (!S.libro) S.libro = new Libro($('#libro'), { onCambio: aggiornaSf });
  try {
    const n = await S.libro.apri(url);
    $('#sfScorri').max = S.libro.ultima;
    if (pagina > 1) await S.libro.vaiPagina(pagina);
    $('#sfCarica').classList.add('via');
    toast(matchMedia('(pointer: coarse)').matches ? `${n} pagine · scorri con il dito o tocca i bordi` : `${n} pagine · usa ← → o clicca sui bordi`);
  } catch (e) { $('#sfCarica').innerHTML = `<span>Impossibile aprire il PDF: ${esc(e.message)}</span>`; }
}
function aggiornaSf(s) {
  const txt = !s.a ? `${String(s.b).padStart(3, '0')}` : (!s.b ? `${String(s.a).padStart(3, '0')}` : `${String(s.a).padStart(3, '0')}–${String(s.b).padStart(3, '0')}`);
  $('#sfPag').textContent = `${txt} / ${s.n}`;
  $('#sfPrev').disabled = s.prima; $('#sfNext').disabled = s.fine;
  if (s.ultima != null) $('#sfScorri').max = s.ultima;
  $('#sfScorri').value = s.k;
  const m = S.cur?.manifest;
  if (m && !S.sfFonte?.sotto) {
    const p = s.a || s.b;
    const sez = [...m.indice].filter(x => x.pagina && x.pagina <= p).pop();
    const conf = m.sotto.find(x => p >= x.pagina_catalogo && p < x.pagina_catalogo + x.pagine_catalogo);
    $('#sfScorriLab').textContent = conf ? `${conf.codice} · ${conf.gas}` : (sez ? sez.titolo : 'Copertina');
  } else $('#sfScorriLab').textContent = S.sfFonte?.sotto || '';
}
function sfogliaEventi() {
  $('#sfPrev').onclick = () => S.libro.gira(-1);
  $('#sfNext').onclick = () => S.libro.gira(1);
  $('#sfIndietro').onclick = indietro;
  $('#libro').addEventListener('click', e => {
    if (performance.now() - (S.libro._striscio || 0) < 400) return;        // era uno striscio, non un tocco
    const r = $('#libro').getBoundingClientRect(); S.libro.gira(e.clientX > r.left + r.width / 2 ? 1 : -1);
  });
  $('#sfIndice').onchange = e => { if (e.target.value) S.libro.vaiPagina(+e.target.value); e.target.value = ''; };
  $('#sfScorri').oninput = e => { const k = +e.target.value, [a, b] = S.libro.pagine(k); aggiornaSf({ ...S.libro.stato(), k, a, b }); };
  $('#sfScorri').onchange = e => { const [a, b] = S.libro.pagine(+e.target.value); S.libro.vaiPagina(a || b || 1); };
  // dito: scorri a sinistra / destra per girare pagina
  let tx = null, ty = 0;
  $('#libro').addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') { tx = e.clientX; ty = e.clientY; } });
  $('#libro').addEventListener('pointerup', e => {
    if (tx === null) return;
    const dx = e.clientX - tx, dy = e.clientY - ty; tx = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) { S.libro._striscio = performance.now(); S.libro.gira(dx < 0 ? 1 : -1); }
  });
  $('#sfCerca').onkeydown = e => {
    if (e.key !== 'Enter') return;
    const q = e.target.value.trim().toUpperCase(); if (!q) return;
    if (/^\d+$/.test(q)) return S.libro.vaiPagina(+q);
    const m = S.cur.manifest;
    const hit = m.sotto.find(x => x.codice.toUpperCase() === q) || m.sotto.find(x => x.codice.toUpperCase().includes(q));
    if (hit) { if (S.sfFonte?.sotto) sfoglia({ url: `cat/${encodeURI(m.slug)}/${encodeURI(m.file)}`, titolo: S.cur.nome, pagina: hit.pagina_catalogo }); else S.libro.vaiPagina(hit.pagina_catalogo); toast(`${hit.codice} · pagina ${hit.pagina_catalogo}`); }
    else toast('Nessuna configurazione trovata');
  };
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && S.vista !== 'home' && S.vista !== 'intro') { e.target.blur?.(); return indietro(); }
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (S.vista === 'sfoglia') {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); S.libro.gira(1); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); S.libro.gira(-1); }
      if (e.key === 'Home') S.libro.vaiPagina(1);
      if (e.key === 'End') S.libro.vaiPagina(S.libro.n);
    }
  });
}

// ================================================================ sotto-cataloghi
function sotto() {
  const c = S.cur, m = c.manifest;
  $('#soTit').textContent = c.nome;
  $('#soSub').textContent = `${m.sotto.length} configurazioni modello × refrigerante · ogni scheda è un PDF a sé`;
  $('#soGas').innerHTML = ['tutti', ...m.gas].map(g => `<button data-g="${g}" class="${g === S.gas ? 'on' : ''}">${g === 'tutti' ? 'Tutti' : g}</button>`).join('');
  $('#soGas').querySelectorAll('button').forEach(b => b.onclick = () => { S.gas = b.dataset.g; sotto(); });
  $('#soCerca').oninput = disegnaGriglia; $('#soOrd').onchange = disegnaGriglia;
  disegnaGriglia();
  if (S.vista !== 'sotto') vai('sotto');
}
function disegnaGriglia() {
  const m = S.cur.manifest, q = $('#soCerca').value.trim().toLowerCase(), ord = $('#soOrd').value;
  let L = m.sotto.filter(x => (S.gas === 'tutti' || x.gas === S.gas));
  if (q) {
    const n = parseFloat(q.replace(',', '.'));
    L = L.filter(x => x.codice.toLowerCase().includes(q) || (!isNaN(n) && Math.abs(x.kw - n) <= Math.max(5, n * .12)));
  }
  L.sort({ kw: (a, b) => a.kw - b.kw, kwd: (a, b) => b.kw - a.kw, eer: (a, b) => b.eer - a.eer, cod: (a, b) => a.codice.localeCompare(b.codice) }[ord]);
  const base = `cat/${encodeURI(m.slug)}`;
  $('#soGriglia').innerHTML = L.length ? L.map((x, i) => `<div class="carta" data-c="${esc(x.codice)}" style="animation-delay:${Math.min(i, 24) * 0.025}s">
      <span class="pill gas gp">${esc(x.gas)}</span>
      <div class="ft">${x.foto ? `<img src="${base}/html/${encodeURI(x.foto)}" alt="" loading="lazy">` : ''}</div>
      <div class="cp"><div class="cd">${esc(x.codice)}</div>
        <div class="rg"><div><b>${kw(x.kw)}</b><small>kW</small></div><span>${x.eer == null ? "" : `EER ${num(x.eer, 2)} · `}${x.pagine} pag.</span></div></div>
      <div class="az"><button data-a="sf">Sfoglia</button><a href="${base}/${encodeURI(x.file)}" target="_blank">PDF</a><button data-a="cat">p. ${x.pagina_catalogo}</button></div>
    </div>`).join('') : '<div class="vuoto">Nessuna configurazione con questi filtri.</div>';
  $('#soGriglia').querySelectorAll('.carta').forEach(el => {
    const x = m.sotto.find(s => s.codice === el.dataset.c);
    el.addEventListener('click', e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (e.target.closest('a')) return;
      if (a === 'cat') return sfoglia({ url: `${base}/${encodeURI(m.file)}`, titolo: S.cur.nome, pagina: x.pagina_catalogo });
      sfoglia({ url: `${base}/${encodeURI(x.file)}`, titolo: x.codice, sotto: x.codice });
    });
  });
}

// ================================================================ qualità grafica (automatica / leggera / piena)
// Leggera = niente sfocature e grana, scena 3D a densità e ritmo ridotti, pagine meno dense: per i computer con scheda grafica integrata.
function grafica() {
  const leggi = () => { try { return localStorage.getItem('cryon.grafica') || 'auto'; } catch (e) { return 'auto'; } };
  let scelta = leggi(), lenta = false;
  const applica = () => {
    const leggera = scelta === 'leggera' || (scelta === 'auto' && (lenta || !scena || scena.gpuDebole));
    document.body.classList.toggle('leggero', leggera);
    scena?.leggero(leggera);
    $('#grafica').textContent = 'grafica ' + (scelta === 'auto' ? `auto · ${leggera ? 'leggera' : 'piena'}` : scelta);
  };
  scena?.seLenta(() => { lenta = true; if (scelta === 'auto') applica(); });
  $('#grafica').onclick = () => {
    scelta = { auto: 'leggera', leggera: 'piena', piena: 'auto' }[scelta];
    try { localStorage.setItem('cryon.grafica', scelta); } catch (e) { /* preferenza non salvata */ }
    applica(); toast('Grafica: ' + scelta);
  };
  applica();
}

// ================================================================ avvio
async function stato() {
  try {
    const s = await api('/api/stato');
    $('#statoDb').className = 'chip ' + (s.db ? 'ok' : ''); $('#statoDb').textContent = s.pacchetto ? `versione ${s.versione}` : (s.db ? 'database collegato' : 'database non trovato');
    document.body.classList.toggle('pacchetto', !!s.pacchetto);   // app installata: niente rigenerazione
    if (s.web) { document.body.classList.add('web'); $('#statoDb').textContent = `cataloghi ${s.dati}`; }
    else if (s.pacchetto) {                                        // i cataloghi sono un pacchetto di dati a parte: versione e aggiornamenti
      const c = $('#statoDb'); c.textContent = s.aggiornamento ? `nuovi dati ${s.aggiornamento} · aggiorna` : `app ${s.versione} · dati ${s.dati}`;
      c.style.cursor = 'pointer'; c.title = 'Dati dei cataloghi: versione e aggiornamento'; c.onclick = () => { location.href = '/dati'; };
      if (s.aggiornamento) { c.classList.add('acc'); toast(`Sono disponibili cataloghi aggiornati (${s.aggiornamento})`); }
    }
  } catch (e) { $('#statoDb').textContent = 'server non raggiungibile'; }
}
function orologio() { $('#orologio').textContent = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }); }
function vita() {   // la finestra-app tiene acceso il server; alla chiusura lo spegne
  if (WEB) return;
  setInterval(() => fetch('/api/ping').catch(() => {}), 20000);
  addEventListener('pagehide', () => navigator.sendBeacon('/api/chiudi', '{}'));
}

(async function main() {
  intro();
  try { scena = await avviaScena($('#scena')); window.cryonScena = scena; scena.modo(S.vista); } catch (e) { console.warn('scena 3D non disponibile', e); }
  grafica();
  $('#vaiHome').onclick = () => { S.storia = []; vai('home', { push: false }); };
  document.querySelector('[data-svg="logo"]').innerHTML = await svg('logo');
  avviaConfiguratore({ S, WEB, vai, toast, apriScheda });
  for (const id of ['#hConfig', '#nConfig']) $(id).onclick = () => apriConfiguratore();
  sfogliaEventi(); stato(); orologio(); setInterval(orologio, 30000); vita();
  await libreria();
})();
