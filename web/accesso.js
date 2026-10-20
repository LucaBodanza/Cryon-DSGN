// Cryon DSGN — accesso riservato "vDragon 5" (solo versione web).
// Senza accesso non si vede niente: cataloghi, configuratore, listino e prezzi sul sito sono cifrati (AES-256-GCM),
// ogni file con la sua chiave (vedi pwa/vdragon5.py). Ogni account ha una chiave personale (AK) chiusa con la sua password
// (PBKDF2-SHA-256) e, a parte, con la chiave madre: così gli Admin possono dare o togliere cataloghi e strumenti senza
// conoscere le password. Le password non stanno da nessuna parte.
// Ruoli: dev (Admin DEV: tutto + crea/revoca account) · admin (tutto + impostazioni e prezzi) ·
//        client (User-Client: strumenti scelti dagli Admin) · select (User-Select: solo i cataloghi scelti dagli Admin).
const $ = s => document.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const b64 = u => { let s = ''; const a = new Uint8Array(u); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); return btoa(s); };
export const ub64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const TE = new TextEncoder(), TD = new TextDecoder();
const DB = 'cryon-accesso', ST = 'k', VOCE = 'sessione';
export const GIRI = 600000;
export const RUOLI = { dev: 'Admin DEV', admin: 'Admin', client: 'User-Client', select: 'User-Select' };

// ---------------------------------------------------------------- IndexedDB (la sessione resta sul dispositivo finché non si preme Esci)
function idb() {
  return new Promise((ok, ko) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
}
export async function sessione(v) {          // sessione() legge, sessione(x) scrive, sessione(null) cancella
  const db = await idb();
  return new Promise((ok, ko) => {
    const t = db.transaction(ST, v === undefined ? 'readonly' : 'readwrite'), s = t.objectStore(ST);
    const r = v === undefined ? s.get(VOCE) : (v === null ? s.delete(VOCE) : s.put(v, VOCE));
    r.onsuccess = () => ok(v === undefined ? (r.result || null) : true); r.onerror = () => ko(r.error);
  });
}

// ---------------------------------------------------------------- cifratura
export async function kek(pw, sale, it = GIRI) {
  const base = await crypto.subtle.importKey('raw', TE.encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: sale, iterations: it, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export const chiaveAES = (raw, usi = ['decrypt']) => crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, usi);
export async function apriBlob(k, x) { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ub64(x.v) }, k, ub64(x.w))); }
export async function chiudiBlob(k, dati) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return { v: b64(iv), w: b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, dati)) };
}
// formato file VDRAGON5 (uguale a vdragon5.py): testa 80 byte con il nome della chiave, poi blocchi da 256 KB
const MAGIC = 'VDRAGON5', TESTA = 80;
export function kidDi(buf) {
  const u = new Uint8Array(buf);
  if (u.length < TESTA || String.fromCharCode(...u.slice(0, 8)) !== MAGIC) throw new Error('file non vDragon 5');
  return TD.decode(u.slice(32, 32 + u[28]));
}
export async function decifraVD5(buf, k) {
  const u = new Uint8Array(buf), v = new DataView(u.buffer, u.byteOffset);
  const C = v.getUint32(8), size = v.getUint32(12) * 4294967296 + v.getUint32(16), nonce = u.slice(20, 28);
  const out = new Uint8Array(size); let p = TESTA;
  for (let i = 0; i * C < size; i++) {
    const l = Math.min(C, size - i * C) + 16, iv = new Uint8Array(12); iv.set(nonce); new DataView(iv.buffer).setUint32(8, i);
    out.set(new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, k, u.slice(p, p + l))), i * C); p += l;
  }
  return out;
}
export async function cifraVD5(dati, k, kid) {        // k: CryptoKey con 'encrypt'; nonce casuale (file piccoli scritti dall'app)
  const C = 1 << 18, kb = TE.encode(kid), nonce = crypto.getRandomValues(new Uint8Array(8));
  const testa = new Uint8Array(TESTA); testa.set(TE.encode(MAGIC)); const dv = new DataView(testa.buffer);
  dv.setUint32(8, C); dv.setUint32(12, Math.floor(dati.length / 4294967296)); dv.setUint32(16, dati.length >>> 0);
  testa.set(nonce, 20); testa[28] = kb.length; testa.set(kb, 32);
  const parti = [testa];
  for (let i = 0; i * C < dati.length; i++) {
    const iv = new Uint8Array(12); iv.set(nonce); new DataView(iv.buffer).setUint32(8, i);
    parti.push(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, dati.subarray(i * C, (i + 1) * C))));
  }
  const out = new Uint8Array(parti.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of parti) { out.set(p, o); o += p.length; }
  return out;
}
export const json = async (u, grezzo) => { const r = await fetch(u, { cache: 'no-cache', headers: grezzo ? { 'x-vd5-grezzo': '1' } : {} }); if (!r.ok) throw new Error(`${u}: ${r.status}`); return grezzo ? new Uint8Array(await r.arrayBuffer()) : r.json(); };

// ---------------------------------------------------------------- accesso
// password giusta → chiave personale (AK) → mazzo di chiavi dell'account (+ cassaforte se Admin)
async function mazzo(acc, ak) {
  const raw = JSON.parse(TD.decode(await apriBlob(ak, acc.k)));        // { id chiave: chiave in base64 }
  const chiavi = {};
  for (const [id, k] of Object.entries(raw)) chiavi[id] = await chiaveAES(ub64(k), id.startsWith('master') ? ['encrypt', 'decrypt'] : ['decrypt']);
  const mid = Object.keys(raw).find(id => id.startsWith('master'));
  if (mid) {                                                                   // Admin: tutte le chiavi dalla cassaforte
    const V = JSON.parse(TD.decode(await decifraVD5(await json('dati/vault.vd5', true), chiavi[mid])));
    for (const x of Object.values(V.chiavi)) chiavi[x.id] = await chiaveAES(ub64(x.k));
  }
  return { chiavi, mid };
}
async function entra(acc, ak) {
  const { chiavi, mid } = await mazzo(acc, ak);
  const s = { id: acc.id, nome: acc.n, ruolo: acc.r, tipo: acc.t, rev: acc.rev, kh: acc.k.w.slice(0, 24), ak, chiavi, mid: mid || null, quando: Date.now() };
  await sessione(s);
  return s;
}
async function conPassword(acc, pw) {
  const k = await kek(pw, ub64(acc.s), acc.it || GIRI);
  const ak = await chiaveAES(await apriBlob(k, acc.pw), ['encrypt', 'decrypt']);
  return entra(acc, ak);
}

// ---------------------------------------------------------------- schermata profili
const SVG = {};
export const svg = async n => (SVG[n] ??= fetch(`web/img/${n}.svg`).then(r => r.text()).catch(() => ''));
const metti = async root => { const t = await svg('pittogramma'); root.querySelectorAll('.ac-pit').forEach(x => { x.innerHTML = t; }); };
export const avatar = (a, i) => `<span class="ac-av t${a.t || 'client'}"><span class="ac-in">${esc(a.i)}</span><span class="ac-pit"></span></span>`;

async function schermata(A) {
  const ACC = A.account;
  const el = document.createElement('section');
  el.id = 'accesso';
  el.innerHTML = `
    <div class="ac-marchio"><span class="logo" data-ac="logo"></span><span class="sep"></span><span class="app">CRYON DSGN</span></div>
    <div class="ac-scelta">
      <h1>Chi sta usando <span class="acc">CRYON DSGN</span>?</h1>
      <p class="lab">Accesso riservato · vDragon 5 · Who's using Cryon DSGN?</p>
      <div class="ac-profili">${ACC.map((a, i) => `<button class="ac-p" data-i="${i}" style="--d:${i * 80}ms">${avatar(a, i)}<b>${esc(a.n)}</b><span class="lab">${esc(RUOLI[a.t] || '')}${a.r ? ' · ' + esc(a.r.replace(/^Admin DEV · /, '')) : ''}</span></button>`).join('')}</div>
    </div>
    <form class="ac-pw" autocomplete="on">
      <div class="ac-chi"></div>
      <div class="ac-att"><p class="lab">Prima attivazione · scegli il file privato vDragon 5 e poi la tua password</p>
        <label class="btn ghost ac-file">Scegli il file privato…<input type="file" accept=".json" hidden></label><span class="ac-file-n lab"></span></div>
      <label class="lab ac-l1" for="acPw">Password</label>
      <div class="ac-campo"><input id="acPw" type="password" autocomplete="current-password" spellcheck="false" required>
        <button type="button" class="ac-occhio" title="Mostra / nascondi">◉</button></div>
      <label class="lab ac-l2" for="acPw2">Ripeti la password</label>
      <div class="ac-campo ac-c2"><input id="acPw2" type="password" autocomplete="new-password" spellcheck="false"></div>
      <input type="text" name="username" autocomplete="username" class="ac-nascosto" tabindex="-1" aria-hidden="true">
      <div class="ac-err" role="alert"></div>
      <div class="ac-az"><button type="button" class="btn ghost ac-indietro">← Cambia profilo</button><button class="btn ac-entra">Entra →</button></div>
    </form>
    <p class="ac-piede lab">Cataloghi, configuratore e listino cifrati · si aprono solo con un account autorizzato</p>`;
  document.body.appendChild(el);
  el.querySelector('[data-ac="logo"]').innerHTML = await svg('logo');
  await metti(el);
  requestAnimationFrame(() => el.classList.add('su'));
  return new Promise(fine => {
    let scelto = null, privato = null;
    const pw = el.querySelector('#acPw'), pw2 = el.querySelector('#acPw2'), err = el.querySelector('.ac-err'), btn = el.querySelector('.ac-entra');
    el.querySelectorAll('.ac-p').forEach(b => b.onclick = () => {
      scelto = +b.dataset.i; const a = ACC[scelto];
      el.querySelector('.ac-chi').innerHTML = `${avatar(a, scelto)}<div><b>${esc(a.n)}</b><span class="lab">${esc(RUOLI[a.t] || '')}</span></div>`;
      metti(el.querySelector('.ac-chi'));
      el.querySelector('.ac-nascosto').value = a.n;
      el.classList.toggle('att', !!a.att);
      pw.autocomplete = a.att ? 'new-password' : 'current-password';
      el.querySelector('.ac-l1').textContent = a.att ? 'Scegli la tua password (almeno 10 caratteri)' : 'Password';
      err.textContent = ''; pw.value = ''; pw2.value = ''; privato = null; el.querySelector('.ac-file-n').textContent = '';
      el.classList.add('pw'); setTimeout(() => (a.att ? el.querySelector('.ac-file') : pw).focus(), 350);
    });
    el.querySelector('.ac-file input').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try { privato = JSON.parse(await f.text()); if (!privato.master) throw new Error(); el.querySelector('.ac-file-n').textContent = '✓ ' + f.name; err.textContent = ''; }
      catch (x) { privato = null; err.textContent = 'Questo non è il file privato vDragon 5'; }
    };
    el.querySelector('.ac-indietro').onclick = () => { el.classList.remove('pw', 'att'); scelto = null; };
    el.querySelector('.ac-occhio').onclick = () => { pw.type = pw2.type = pw.type === 'password' ? 'text' : 'password'; pw.focus(); };
    addEventListener('keydown', e => { if (e.key === 'Escape' && el.classList.contains('pw')) el.classList.remove('pw', 'att'); });
    el.querySelector('form').onsubmit = async e => {
      e.preventDefault();
      if (scelto == null || btn.disabled) return;
      const a = ACC[scelto];
      btn.disabled = true; btn.textContent = 'Verifico…'; err.textContent = '';
      try {
        let s;
        if (a.att) s = await attiva(A, a, privato, pw.value, pw2.value);
        else s = await conPassword(a, pw.value);
        el.classList.add('via'); setTimeout(() => el.remove(), 700);
        fine(s);
      } catch (x) {
        err.textContent = x && x.name === 'OperationError' ? (a.att ? 'Il file privato non corrisponde' : 'Password non corretta') : (x.message || String(x));
        el.querySelector('.ac-pw').classList.remove('scuoti'); void el.offsetWidth; el.querySelector('.ac-pw').classList.add('scuoti');
        pw.select();
      }
      btn.disabled = false; btn.textContent = 'Entra →';
    };
  });
}

// Prima attivazione dell'Admin DEV: file privato (chiave madre) + password scelta da Luca. L'account resta "da attivare"
// sul sito finché non si pubblica (Impostazioni → GitHub → Pubblica): nel frattempo l'accesso vale su questo dispositivo.
async function attiva(A, a, privato, p1, p2) {
  if (!privato) throw new Error('Scegli prima il file privato vDragon 5');
  if (p1.length < 10) throw new Error('La password deve avere almeno 10 caratteri');
  if (p1 !== p2) throw new Error('Le due password non coincidono');
  const master = await chiaveAES(ub64(privato.master), ['encrypt', 'decrypt']);
  const akRaw = await apriBlob(master, a.ka);
  const sale = crypto.getRandomValues(new Uint8Array(16));
  const k = await kek(p1, sale);
  const nuovo = { ...a, s: b64(sale), it: GIRI, pw: await chiudiBlob(k, akRaw), att: false, rev: (a.rev || 1) + 1 };
  A.account = A.account.map(x => x.id === a.id ? nuovo : x); A.agg = new Date().toISOString();
  try { localStorage.setItem('cryon.accesso.bozza', JSON.stringify(A)); } catch (e) { /* niente */ }
  return entra(nuovo, await chiaveAES(akRaw, ['encrypt', 'decrypt']));
}

// ---------------------------------------------------------------- service worker
async function swPronto() {              // la pagina deve passare dal service worker, se no i dati arrivano ancora cifrati
  const sw = navigator.serviceWorker;
  await sw.ready;
  if (!sw.controller) await new Promise(r => { sw.addEventListener('controllerchange', r, { once: true }); setTimeout(r, 5000); });
  if (!sw.controller) {
    let fatto = false; try { fatto = sessionStorage.getItem('cryon-ricarica') === '1'; sessionStorage.setItem('cryon-ricarica', '1'); } catch (e) { /* niente */ }
    if (!fatto) { location.reload(); await new Promise(() => {}); }
    throw new Error('il browser non fa passare la pagina dal suo service worker');
  }
  try { sessionStorage.removeItem('cryon-ricarica'); } catch (e) { /* niente */ }
}

// ---------------------------------------------------------------- permessi (usati da app.js, listino.js, configuratore.js)
function permessi(s, acc) {
  const p = acc?.p || {}, admin = s.tipo === 'dev' || s.tipo === 'admin';
  const gruppo = admin ? 'admin' : s.tipo;
  const API = {
    s, acc, tipo: s.tipo, nome: s.nome, gruppo,
    puo(x) {
      if (x === 'account') return s.tipo === 'dev';
      if (x === 'prezzi' || x === 'impostazioni') return admin;
      if (admin) return true;
      if (['conf', 'listino', 'pdf', 'risp'].includes(x)) return !!p[x];
      return true;
    },
    // User-Select: solo i cataloghi permessi (gli altri non si possono neanche aprire: niente chiave)
    filtraCataloghi(cs) { return s.tipo === 'select' ? cs.filter(c => (p.cat || []).includes(c.slug)) : cs; },
    serieListino() {
      if (s.tipo !== 'select') return null;
      return [...new Set((window.CRYON_CATALOGHI || []).filter(c => (p.cat || []).includes(c.slug)).map(c => `${c.serie_base}|${c.gas?.[0] || '—'}`))];   // 'PRO-A|R410A'
    },
    async prezzi() {
      try { const r = await fetch(`dati/prezzi_${gruppo}.vd5`, { cache: 'no-cache' }); return r.ok ? (await r.json()).prezzi || {} : {}; } catch (e) { return {}; }
    },
  };
  return API;
}

function strumenti(API) {             // nasconde ciò che l'account non può usare
  const nascondi = (sel, no) => document.querySelectorAll(sel).forEach(x => { x.hidden = no; if (no) x.style.display = 'none'; });
  nascondi('#nConfig, #hConfig, #mnConf', !API.puo('conf'));
  nascondi('#nListino, #hListino', !API.puo('listino'));
  nascondi('#nRisp, #hRisp', !API.puo('risp'));
  document.body.classList.toggle('no-pdf', !API.puo('pdf'));
  document.body.classList.toggle('u-select', API.tipo === 'select');
}

function profiloInBarra(API) {
  const dx = $('#barra .dx'); if (!dx) return;
  const s = API.s, a = API.acc || { n: s.nome, t: s.tipo, i: (s.nome || '?').split(/\s+/).map(x => x[0]).join('').slice(0, 2) };
  const b = document.createElement('div');
  b.className = 'ac-menu';
  b.innerHTML = `<button class="ac-mini" title="${esc(a.n)} · ${esc(RUOLI[a.t])}">${avatar(a)}</button>
    <div class="ac-tendina"><div class="ac-chi">${avatar(a)}<div><b>${esc(a.n)}</b><span class="lab">${esc(RUOLI[a.t])}</span></div></div>
      ${API.puo('impostazioni') ? '<button data-a="imp">Impostazioni</button>' : ''}<button data-a="cambia">Cambia profilo</button><button data-a="esci">Esci</button></div>`;
  dx.appendChild(b);
  metti(b);
  b.querySelector('.ac-mini').onclick = e => { e.stopPropagation(); b.classList.toggle('aperto'); };
  addEventListener('click', () => b.classList.remove('aperto'));
  b.querySelectorAll('[data-a="cambia"], [data-a="esci"]').forEach(x => x.onclick = esci);
  b.querySelector('[data-a="imp"]')?.addEventListener('click', async () => { const m = await import('./impostazioni.js'); m.apri(API); });
}
export async function esci() {
  try { await sessione(null); } catch (e) { /* niente */ }
  try { navigator.serviceWorker.controller?.postMessage({ tipo: 'esci' }); } catch (e) { /* niente */ }
  location.reload();
}
// l'interfaccia salvata non parte (versione a metà): si buttano le copie salvate dell'interfaccia e si riprende tutto dal sito
async function riparaApp() {
  let gia = false; try { gia = sessionStorage.getItem('cryon-ripara') === '1'; sessionStorage.setItem('cryon-ripara', '1'); } catch (e) { /* niente */ }
  if (!gia) {
    try { for (const k of await caches.keys()) if (k.startsWith('cryon-guscio-')) await caches.delete(k); } catch (e) { /* niente */ }
    try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.update(); } catch (e) { /* niente */ }
    location.reload(); return;
  }
  blocco('L\'app non è riuscita a partire. Chiudi tutte le schede di Cryon DSGN e riapri il sito.');
}
function blocco(msg) {
  document.body.insertAdjacentHTML('beforeend', `<section id="accesso" class="su"><div class="ac-scelta"><h1>CRYON <span class="acc">DSGN</span></h1>
    <p class="ac-err">${esc(msg)}</p><p class="lab">Apri il sito con Chrome, Edge o Safari aggiornati, non in finestra anonima.</p></div></section>`);
}

// elenco account: dal sito; se l'Admin DEV ha appena attivato o modificato qualcosa e non ha ancora pubblicato, vale la bozza locale
async function leggiAccount() {
  let A = null;
  try { A = await json('web/accesso.json'); } catch (e) { A = null; }
  try { const b = JSON.parse(localStorage.getItem('cryon.accesso.bozza') || 'null'); if (b && (!A || (Date.parse(b.agg) || 0) >= (Date.parse(A.agg) || 0))) A = b; } catch (e) { /* niente */ }
  return A;
}

(async function avvio() {
  if (!('serviceWorker' in navigator) || !window.crypto?.subtle || !window.indexedDB) return blocco('Questo browser non può aprire Cryon DSGN riservato.');
  // aggiornamenti: la versione nuova del service worker prende subito il posto della vecchia e la pagina si ricarica una volta
  const avevaSw = !!navigator.serviceWorker.controller; let ricaricata = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (avevaSw && !ricaricata) { ricaricata = true; location.reload(); } });
  navigator.serviceWorker.register('sw.js').then(r => {
    const vai = w => w && w.postMessage({ tipo: 'aggiorna' });
    vai(r.waiting);
    r.addEventListener('updatefound', () => { const w = r.installing; w?.addEventListener('statechange', () => { if (w.state === 'installed') vai(w); }); });
    r.update().catch(() => {});
  }).catch(e => console.warn('service worker', e));
  const A = await leggiAccount();
  if (!A) return blocco('Non riesco a leggere gli account: controlla la connessione e ricarica.');
  let s = null;
  try { s = await sessione(); } catch (e) { return blocco('Il browser non permette di salvare l\'accesso (finestra anonima?).'); }
  let acc = s && A.account.find(x => x.id === s.id);
  // account revocato o password reimpostata dall'Admin DEV → fuori subito
  if (s && navigator.onLine && (!acc || (acc.rev || 1) !== (s.rev || 1))) { await sessione(null); s = null; acc = null; }
  // permessi cambiati dagli Admin → mazzo di chiavi aggiornato (senza chiedere la password)
  if (s && acc && acc.k.w.slice(0, 24) !== s.kh) { try { s = await entra(acc, s.ak); } catch (e) { await sessione(null); s = null; } }
  if (!s || !s.chiavi) { s = await schermata(A); acc = A.account.find(x => x.id === s.id); }
  try { await swPronto(); } catch (e) { return blocco('Accesso fatto, ma ' + e.message + '. Ricarica la pagina.'); }
  navigator.serviceWorker.controller.postMessage({ tipo: 'entra' });
  const API = permessi(s, acc);
  window.CRYON_ACCESSO = API;
  try { await import('./app.js'); } catch (e) { console.error(e); return riparaApp(); }
  try { sessionStorage.removeItem('cryon-ripara'); } catch (e) { /* niente */ }
  const attendi = setInterval(() => { if (document.querySelector('#barra .logo svg')) { clearInterval(attendi); profiloInBarra(API); strumenti(API); } }, 200);
})();
