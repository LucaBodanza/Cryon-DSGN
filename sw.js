// CRYON DSGN — versione web: funziona anche senza rete.
// - l'interfaccia viene salvata alla prima apertura
// - i cataloghi vengono salvati solo quando l'utente preme "Scarica per uso offline" (lo fa la pagina, nella cache CAT)
// - pdf.js legge i PDF a pezzi: qui i pezzi vengono ritagliati dalla copia salvata
const VERSIONE = '1.1.0-2026.10.1-ab68690bb0';
const GUSCIO = 'cryon-guscio-' + VERSIONE, CAT = 'cryon-cat-v1';
const FILE = ["index.html", "manifest.webmanifest", "dati/cataloghi.json", "web/app.css", "web/app.js", "web/font/Doto-Bold.ttf", "web/font/IBMPlexMono-Medium.woff2", "web/font/IBMPlexMono-Regular.woff2", "web/font/Inter-Regular.ttf", "web/font/Inter-SemiBold.ttf", "web/img/icona_192.png", "web/img/icona_512.png", "web/img/logo.svg", "web/img/pittogramma.svg", "web/index.html", "web/libro.js", "web/scena.js", "web/vendor/RoomEnvironment.js", "web/vendor/SVGLoader.js", "web/vendor/pdf.min.mjs", "web/vendor/pdf.worker.min.mjs", "web/vendor/three.module.min.js"];

self.addEventListener('install', e => { e.waitUntil(caches.open(GUSCIO).then(c => c.addAll(FILE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('cryon-guscio-') && k !== GUSCIO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

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
  const rel = u.pathname.slice(new URL(self.registration.scope).pathname.length);
  if (rel.startsWith('cat/')) {
    e.respondWith((async () => {
      const salvato = await (await caches.open(CAT)).match(u.origin + u.pathname);
      if (salvato) return req.headers.has('range') ? pezzo(salvato, req.headers.get('range')) : salvato;
      return fetch(req);
    })());
    return;
  }
  // interfaccia: prima la copia salvata (veloce, anche senza rete), intanto si aggiorna in sottofondo
  e.respondWith((async () => {
    const c = await caches.open(GUSCIO);
    const chiave = rel === '' ? 'index.html' : rel;
    const salvato = await c.match(chiave, { ignoreSearch: true });
    const rete = fetch(req).then(r => { if (r.ok) c.put(chiave, r.clone()); return r; }).catch(() => null);
    return salvato || (await rete) || new Response('Senza rete', { status: 503 });
  })());
});
