// CRYON DSGN — versione web: funziona anche senza rete.
// - l'interfaccia viene salvata alla prima apertura
// - i cataloghi vengono salvati solo quando l'utente preme "Scarica per uso offline" (lo fa la pagina, nella cache CAT)
// - pdf.js legge i PDF a pezzi: qui i pezzi vengono ritagliati
// - vDragon 5 (true): tutto ciò che sta in cat/ e dati/ è cifrato (AES-256-GCM a blocchi da 256 KB) e ogni file
//   dice nell'intestazione con quale chiave è chiuso. Qui si decifra al volo con le chiavi dell'account (IndexedDB).
//   Nelle cache resta tutto cifrato. File senza chiave per quell'account → 403.
const VERSIONE = '1.1.0-2026.10.11-d18f727bd9';
const CIFRATA = true;
const GUSCIO = 'cryon-guscio-' + VERSIONE, CAT = 'cryon-cat-v1';
const FILE = ["index.html", "manifest.webmanifest", "dati/cataloghi.json", "dati/configuratore.json", "dati/listino_dati.json", "web/accesso.css", "web/accesso.js", "web/app.css", "web/app.js", "web/configuratore.js", "web/font/Doto-Bold.ttf", "web/font/IBMPlexMono-Medium.woff2", "web/font/IBMPlexMono-Regular.woff2", "web/font/Inter-Regular.ttf", "web/font/Inter-SemiBold.ttf", "web/img/icona_192.png", "web/img/icona_512.png", "web/img/logo.svg", "web/img/pittogramma.svg", "web/impostazioni.js", "web/index.html", "web/libro.js", "web/listino.css", "web/listino.js", "web/listino_render.js", "web/risparmio.css", "web/risparmio.js", "web/scena.js", "web/vendor/RoomEnvironment.js", "web/vendor/SVGLoader.js", "web/vendor/pdf-lib.esm.min.js", "web/vendor/pdf.min.mjs", "web/vendor/pdf.worker.min.mjs", "web/vendor/three.module.min.js"];
const TIPI = { pdf: 'application/pdf', json: 'application/json', vd5: 'application/json', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', svg: 'image/svg+xml', webp: 'image/webp' };
// file che l'app cambia pubblicando (account, cassaforte, prezzi): sempre prima dalla rete
const VIVI = /^(web\/accesso\.json|dati\/vault\.vd5|dati\/prezzi_[a-z]+\.vd5)$/;

self.addEventListener('install', e => { e.waitUntil(caches.open(GUSCIO).then(c => c.addAll(FILE.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('cryon-guscio-') && k !== GUSCIO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// ---------------------------------------------------------------- chiavi dell'account
let CHIAVI = null;
function sessione() {
  return new Promise(ok => {
    const r = indexedDB.open('cryon-accesso', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('k');
    r.onerror = () => ok(null);
    r.onsuccess = () => { try { const q = r.result.transaction('k').objectStore('k').get('sessione'); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); } catch (e) { ok(null); } };
  });
}
async function chiavi() { if (!CHIAVI) { const s = await sessione(); CHIAVI = s && s.chiavi || null; } return CHIAVI; }
self.addEventListener('message', e => { if (e.data && (e.data.tipo === 'esci' || e.data.tipo === 'entra')) { CHIAVI = null; INFO.clear(); } });

// ---------------------------------------------------------------- formato VDRAGON5: testa 80 | blocchi (cifrato + 16 di tag)
const TESTA = 80, INFO = new Map();
function leggiTesta(buf) {
  const u = new Uint8Array(buf), v = new DataView(buf);
  if (buf.byteLength < TESTA || String.fromCharCode(...u.slice(0, 8)) !== 'VDRAGON5') throw new Error('file non cifrato o rovinato');
  const C = v.getUint32(8), size = v.getUint32(12) * 4294967296 + v.getUint32(16);
  return { C, size, n: Math.ceil(size / C), nonce: u.slice(20, 28), kid: new TextDecoder().decode(u.slice(32, 32 + u[28])) };
}
const posBlocco = (I, i) => TESTA + i * (I.C + 16);
const lunBlocco = (I, i) => Math.min(I.C, I.size - i * I.C) + 16;
async function apriBlocchi(k, I, i0, i1, buf) {
  const out = new Uint8Array(Math.min(I.size, (i1 + 1) * I.C) - i0 * I.C);
  let p = 0;
  for (let i = i0; i <= i1; i++) {
    const l = lunBlocco(I, i), iv = new Uint8Array(12); iv.set(I.nonce); new DataView(iv.buffer).setUint32(8, i);
    out.set(new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, k, buf.slice(p, p + l))), (i - i0) * I.C); p += l;
  }
  return out;
}
const daBlob = blob => (a, b) => blob.slice(a, b).arrayBuffer();
function daRete(url) {
  let intero = null;
  return async (a, b) => {
    if (intero) return intero.slice(a, b).arrayBuffer();
    const r = await fetch(url, { headers: { Range: `bytes=${a}-${b - 1}` } });
    if (r.status === 206) return r.arrayBuffer();
    if (!r.ok) throw new Error('rete ' + r.status);
    intero = await r.blob();
    return intero.slice(a, b).arrayBuffer();
  };
}
async function testa(url, src) {
  if (!INFO.has(url)) INFO.set(url, src(0, TESTA).then(leggiTesta).catch(e => { INFO.delete(url); throw e; }));
  return INFO.get(url);
}
const errore = (st, msg) => new Response(JSON.stringify({ errore: msg }), { status: st, headers: { 'Content-Type': 'application/json' } });

async function servi(req, url, rel) {
  if (req.headers.get('x-vd5-grezzo')) return fetch(url, { cache: 'no-cache' });     // copia cifrata (offline, cassaforte, pubblicazione)
  const K = await chiavi();
  if (!K) return errore(401, 'Accesso richiesto');
  const tipo = TIPI[(rel.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';
  try {
    if (tipo !== 'application/pdf') {                              // file piccoli: tutto in una volta
      let r = VIVI.test(rel) ? await fetch(url, { cache: 'no-cache' }).catch(() => null) : null;
      if (!r || !r.ok) r = (await (await caches.open(CAT)).match(url)) || (await (await caches.open(GUSCIO)).match(rel)) || await fetch(url);
      if (!r.ok) return r;
      let buf = await r.arrayBuffer(), I = leggiTesta(buf.slice(0, TESTA)), k = K[I.kid];
      if (!k) {                                                      // copia salvata chiusa con una chiave vecchia (dopo una revoca): si riprende dal sito
        const n = await fetch(url, { cache: 'no-cache' }).catch(() => null);
        if (n && n.ok) { buf = await n.arrayBuffer(); I = leggiTesta(buf.slice(0, TESTA)); k = K[I.kid]; if (k) (await caches.open(GUSCIO)).put(rel, new Response(buf.slice(0))).catch(() => {}); }
      }
      if (!k) return errore(403, 'Questo account non ha accesso a questo contenuto');
      const out = I.n ? await apriBlocchi(k, I, 0, I.n - 1, buf.slice(TESTA)) : new Uint8Array(0);
      return new Response(out, { headers: { 'Content-Type': tipo, 'Content-Length': out.length } });
    }
    const salvato = await (await caches.open(CAT)).match(url);
    const src = salvato ? daBlob(await salvato.blob()) : daRete(url);
    const I = await testa(url, src), k = K[I.kid];
    if (!k) return errore(403, 'Questo account non ha accesso a questo catalogo');
    const range = req.headers.get('range');
    const m = range && /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m && (m[1] || m[2])) {
      const a = m[1] ? parseInt(m[1], 10) : Math.max(0, I.size - parseInt(m[2], 10));
      const b = m[1] && m[2] ? Math.min(parseInt(m[2], 10), I.size - 1) : I.size - 1;
      if (a > b || a >= I.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${I.size}` } });
      const i0 = Math.floor(a / I.C), i1 = Math.floor(b / I.C);
      const buf = await src(posBlocco(I, i0), posBlocco(I, i1) + lunBlocco(I, i1));
      const out = (await apriBlocchi(k, I, i0, i1, buf)).subarray(a - i0 * I.C, b - i0 * I.C + 1);
      return new Response(out, { status: 206, headers: { 'Content-Type': tipo, 'Content-Range': `bytes ${a}-${b}/${I.size}`, 'Content-Length': out.length, 'Accept-Ranges': 'bytes' } });
    }
    let i = 0;
    const corpo = new ReadableStream({
      async pull(ctl) {
        if (i >= I.n) { ctl.close(); return; }
        const j = Math.min(I.n - 1, i + 15);
        const buf = await src(posBlocco(I, i), posBlocco(I, j) + lunBlocco(I, j));
        ctl.enqueue(await apriBlocchi(k, I, i, j, buf)); i = j + 1;
      },
    });
    return new Response(corpo, { status: 200, headers: { 'Content-Type': tipo, 'Content-Length': I.size, 'Accept-Ranges': 'bytes' } });
  } catch (e) {
    return errore(e.name === 'OperationError' ? 403 : 502, 'Non riesco ad aprire il file: ' + e.message);
  }
}

async function pezzo(risposta, range) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(range);
  const blob = await risposta.blob(), size = blob.size;
  if (!m || (!m[1] && !m[2])) return new Response(blob, { status: 200, headers: { 'Content-Type': risposta.headers.get('Content-Type') || 'application/pdf', 'Accept-Ranges': 'bytes', 'Content-Length': size } });
  const a = m[1] ? parseInt(m[1], 10) : Math.max(0, size - parseInt(m[2], 10));
  const b = m[1] && m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
  if (a > b || a >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(blob.slice(a, b + 1), { status: 206, headers: { 'Content-Type': risposta.headers.get('Content-Type') || 'application/pdf',
    'Content-Range': `bytes ${a}-${b}/${size}`, 'Content-Length': b - a + 1, 'Accept-Ranges': 'bytes' } });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== location.origin) return;
  const rel = decodeURI(u.pathname.slice(new URL(self.registration.scope).pathname.length));
  if (CIFRATA && (rel.startsWith('cat/') || rel.startsWith('dati/'))) { e.respondWith(servi(req, u.origin + u.pathname, rel)); return; }
  if (rel.startsWith('cat/')) {
    e.respondWith((async () => {
      const salvato = await (await caches.open(CAT)).match(u.origin + u.pathname);
      if (salvato) return req.headers.has('range') ? pezzo(salvato, req.headers.get('range')) : salvato;
      return fetch(req);
    })());
    return;
  }
  if (VIVI.test(rel)) { e.respondWith(fetch(u.href, { cache: 'no-cache' }).catch(async () => (await (await caches.open(GUSCIO)).match(rel)) || new Response('Senza rete', { status: 503 }))); return; }
  // interfaccia: prima la copia salvata (veloce, anche senza rete), intanto si aggiorna in sottofondo
  e.respondWith((async () => {
    const c = await caches.open(GUSCIO);
    const chiave = rel === '' ? 'index.html' : rel;
    const salvato = await c.match(chiave, { ignoreSearch: true });
    const rete = fetch(u.href, { cache: 'no-cache' }).then(r => { if (r.ok) c.put(chiave, r.clone()); return r; }).catch(() => null);
    return salvato || (await rete) || new Response('Senza rete', { status: 503 });
  })());
});
