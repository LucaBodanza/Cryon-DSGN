// CRYON DSGN — sfogliatore a libro: pdf.js disegna le pagine, l'anta 3D le gira
import * as pdfjs from './vendor/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;

const RAPP = 297 / 210;   // A4 verticale

export class Libro {
  constructor(host, { onCambio } = {}) {
    this.host = host; this.onCambio = onCambio || (() => {});
    this.doc = null; this.n = 0; this.k = 0; this.cache = new Map(); this.inCorso = false; this.coda = 0; this.gen = 0;
    host.innerHTML = '<div class="pag sx vuota"></div><div class="pag dx vuota"></div>';
    this.sx = host.querySelector('.sx'); this.dx = host.querySelector('.dx');
    this._ro = new ResizeObserver(() => this.adatta()); this._ro.observe(host.parentElement);
  }

  async apri(url) {
    this.gen++; const g = this.gen;
    if (this.doc) { try { await this.doc.destroy(); } catch (e) {} }
    this.cache.clear(); this.doc = null; this.n = 0;
    const task = pdfjs.getDocument({ url, rangeChunkSize: 1 << 18, disableAutoFetch: true, disableStream: false });
    const doc = await task.promise;
    if (g !== this.gen) { doc.destroy(); return; }
    this.doc = doc; this.n = doc.numPages; this.k = 0;
    this.adatta();
    await this.mostra(0);
    return this.n;
  }

  // ---------------- geometria
  adatta() {
    const box = this.host.parentElement.getBoundingClientRect();
    // schermo verticale (tablet in piedi): una pagina alla volta, grande; altrimenti il libro aperto a due pagine
    const singola = box.width < box.height * 0.95;
    if (singola !== this.singola) {
      const p = this.doc ? (this.pagine(this.k)[0] || this.pagine(this.k)[1] || 1) : 1;
      this.singola = singola; this.host.classList.toggle('singola', singola);
      this.k = this.aperturaDi(p); this.cache.clear(); this._hRender = 0;
    }
    const h = Math.max(200, singola ? Math.min(box.height - 40, (box.width - 36) * RAPP) : Math.min(box.height - 48, (box.width - 190) / 2 * RAPP));
    const w = h / RAPP;
    this.w = w; this.h = h;
    // centrato a mano: quando il libro è più largo dello schermo (pagina singola) il centraggio automatico non vale
    Object.assign(this.host.style, { width: `${2 * w}px`, height: `${h}px`, justifySelf: 'start', marginLeft: `${(box.width - 2 * w) / 2}px` });
    for (const p of [this.sx, this.dx]) Object.assign(p.style, { width: `${w}px`, height: `${h}px` });
    this.centra();
    if (this.doc && Math.abs((this._hRender || 0) - h) > 60) { this._hRender = h; this.cache.clear(); this.mostra(this.k); }
    this._hRender = this._hRender || h;
  }
  pagine(k) {                       // pagine (1..n) visibili per l'apertura k: 0 = sola copertina a destra
    if (this.singola) return [null, k + 1 <= this.n ? k + 1 : null];
    if (k === 0) return [null, 1];
    const a = 2 * k, b = 2 * k + 1;
    return [a <= this.n ? a : null, b <= this.n ? b : null];
  }
  get ultima() { return this.singola ? Math.max(0, this.n - 1) : Math.floor(this.n / 2); }
  centra() {
    const [a, b] = this.pagine(this.k);
    const dx = !a ? -this.w / 2 : (!b ? this.w / 2 : 0);
    this.host.style.transform = `translateX(${dx}px)`;
  }
  aperturaDi(p) { return this.singola ? Math.max(0, p - 1) : (p <= 1 ? 0 : Math.floor(p / 2)); }

  // ---------------- disegno pagine
  async tela(p) {
    if (!p) return null;
    if (this.cache.has(p)) { const c = this.cache.get(p); this.cache.delete(p); this.cache.set(p, c); return c; }
    const page = await this.doc.getPage(p);
    const dpr = Math.min(devicePixelRatio || 1, document.body.classList.contains('leggero') ? 1.25 : 2);   // grafica leggera: pagine meno dense, si girano più in fretta
    const vp0 = page.getViewport({ scale: 1 });
    const sc = (this.h * dpr * 1.15) / vp0.height;
    const vp = page.getViewport({ scale: sc });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    await page.render({ canvasContext: c.getContext('2d', { alpha: false }), viewport: vp }).promise;
    this.cache.set(p, c);
    while (this.cache.size > 26) this.cache.delete(this.cache.keys().next().value);
    return c;
  }
  copia(c) {
    const d = document.createElement('canvas');
    if (!c) return d;
    d.width = c.width; d.height = c.height; d.getContext('2d').drawImage(c, 0, 0); return d;
  }
  async metti(el, p) {
    el.innerHTML = '';
    el.classList.toggle('vuota', !p);
    if (!p) return;
    const c = await this.tela(p);
    el.innerHTML = ''; el.appendChild(this.copia(c));
  }
  async mostra(k) {
    this.k = Math.max(0, Math.min(k, this.ultima));
    const [a, b] = this.pagine(this.k);
    await Promise.all([this.metti(this.sx, a), this.metti(this.dx, b)]);
    this.centra(); this.onCambio(this.stato()); this.precarica();
  }
  precarica() {
    const [a, b] = this.pagine(Math.min(this.k + 1, this.ultima)); const [c, d] = this.pagine(Math.max(this.k - 1, 0));
    setTimeout(() => { for (const p of [a, b, c, d]) if (p) this.tela(p); }, 120);
  }
  stato() { const [a, b] = this.pagine(this.k); return { k: this.k, a, b, n: this.n, ultima: this.ultima, prima: this.k === 0, fine: this.k >= this.ultima }; }

  // ---------------- girare pagina
  async gira(dir) {
    if (!this.doc) return;
    const nk = this.k + dir;
    if (nk < 0 || nk > this.ultima) return;
    if (this.inCorso) { this.coda = dir; return; }
    this.inCorso = true;
    if (this.singola) {                       // pagina singola: scorrimento laterale, più leggero dell'anta 3D
      const el = this.dx, d = 190;
      await el.animate([{ transform: 'none', opacity: 1 }, { transform: `translateX(${-dir * 14}%)`, opacity: 0 }], { duration: d, easing: 'ease-in', fill: 'forwards' }).finished;
      await this.mostra(nk);
      await el.animate([{ transform: `translateX(${dir * 14}%)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: d, easing: 'ease-out', fill: 'forwards' }).finished;
      this.inCorso = false;
      if (this.coda) { const c = this.coda; this.coda = 0; this.gira(c); }
      return;
    }
    const [a0, b0] = this.pagine(this.k), [a1, b1] = this.pagine(nk);
    const [cF, cR] = dir > 0 ? await Promise.all([this.tela(b0), this.tela(a1)]) : await Promise.all([this.tela(a0), this.tela(b1)]);
    const anta = document.createElement('div');
    anta.className = 'anta ' + (dir > 0 ? 'avanti' : 'indietro');
    Object.assign(anta.style, { width: `${this.w}px`, height: `${this.h}px`, left: dir > 0 ? `${this.w}px` : '0px',
      transformOrigin: dir > 0 ? 'left center' : 'right center' });
    const fr = document.createElement('div'); fr.className = 'faccia fronte'; fr.appendChild(this.copia(cF));
    const rt = document.createElement('div'); rt.className = 'faccia retro'; rt.appendChild(this.copia(cR));
    anta.append(fr, rt); this.host.appendChild(anta);
    // sotto l'anta compare già la pagina che resterà scoperta
    if (dir > 0) await this.metti(this.dx, b1); else await this.metti(this.sx, a1);
    // la copertina sola sta al centro: spostamento del libro insieme alla rotazione
    const dur = 760;
    const prev = this.k; this.k = nk;
    const [na, nb] = this.pagine(nk);
    const sposta = !na ? -this.w / 2 : (!nb ? this.w / 2 : 0);
    this.host.style.transition = `transform ${dur}ms cubic-bezier(.45,.05,.25,1)`;
    this.host.style.transform = `translateX(${sposta}px)`;
    const ang = dir > 0 ? -180 : 180;
    const an = anta.animate([
      { transform: 'rotateY(0deg)' },
      { transform: `rotateY(${ang / 2}deg) translateZ(12px)`, offset: .5 },
      { transform: `rotateY(${ang}deg)` }], { duration: dur, easing: 'cubic-bezier(.45,.05,.25,1)', fill: 'forwards' });
    fr.animate([{ opacity: 1 }, { opacity: 1, filter: 'brightness(.72)', offset: .49 }, { opacity: 0, offset: .5 }, { opacity: 0 }], { duration: dur, fill: 'forwards' });
    rt.animate([{ filter: 'brightness(.6)' }, { filter: 'brightness(.6)', offset: .5 }, { filter: 'brightness(1)' }], { duration: dur, fill: 'forwards' });
    await an.finished;
    if (dir > 0) await this.metti(this.sx, a1); else await this.metti(this.dx, b1);
    anta.remove();
    this.host.style.transition = '';
    this.inCorso = false;
    this.onCambio(this.stato()); this.precarica();
    if (this.coda) { const c = this.coda; this.coda = 0; this.gira(c); }
    return prev;
  }
  async vaiPagina(p) {
    if (!this.doc) return;
    p = Math.max(1, Math.min(this.n, p | 0));
    const k = this.aperturaDi(p);
    if (Math.abs(k - this.k) === 1) return this.gira(k - this.k);
    if (k === this.k) return;
    const via = this.host.animate([{ opacity: 1, transform: this.host.style.transform }, { opacity: 0, transform: this.host.style.transform + ' scale(.97)' }], { duration: 180, fill: 'forwards' });
    await new Promise(r => setTimeout(r, 180));
    await this.mostra(k);
    via.cancel();                     // altrimenti l'animazione tiene fermo il libro nella posizione di prima (fuori centro)
    this.host.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260 });
  }
  chiudi() { this.gen++; if (this.doc) this.doc.destroy(); this.doc = null; this.cache.clear(); }
}
