// Cryon DSGN — Impostazioni (solo Admin DEV e Admin, versione web vDragon 5)
// - permessi degli account: strumenti degli User-Client, cataloghi degli User-Select
// - Admin DEV: nuovi account, password reimpostate, revoca (con cambio immediato delle chiavi di configuratore, listino e prezzi)
// - pubblicazione sul sito (GitHub) con il token salvato nella cassaforte cifrata
import { esc, b64, ub64, kek, chiaveAES, apriBlob, chiudiBlob, cifraVD5, decifraVD5, json, sessione, avatar, RUOLI, GIRI } from './accesso.js';
const $ = s => document.querySelector(s);
const TE = new TextEncoder(), TD = new TextDecoder();
const GRUPPI = ['admin', 'client', 'select'];
const FILE_DI = { base: 'dati/cataloghi.json', conf: 'dati/configuratore.json', listino: 'dati/listino_dati.json' };

// ---------------------------------------------------------------- cassaforte (chiave madre dal mazzo dell'account)
export async function cassaforte(API) {
  const s = API.s, A = await leggiAccount(), io = A.account.find(x => x.id === s.id);
  const anello = JSON.parse(TD.decode(await apriBlob(s.ak, io.k)));
  const mid = Object.keys(anello).find(k => k.startsWith('master'));
  if (!mid) throw new Error('Questo account non ha la chiave madre');
  const masterRaw = ub64(anello[mid]), master = await chiaveAES(masterRaw, ['encrypt', 'decrypt']);
  const V = JSON.parse(TD.decode(await decifraVD5(await json('dati/vault.vd5', true), master)));
  return { A, V, mid, master, masterRaw };
}
export async function leggiAccount() {
  let A = await json('web/accesso.json').catch(() => null);
  try { const b = JSON.parse(localStorage.getItem('cryon.accesso.bozza') || 'null'); if (b && (!A || (Date.parse(b.agg) || 0) >= (Date.parse(A.agg) || 0))) A = b; } catch (e) { /* niente */ }
  return A;
}
const bozza = (A, nuova = true) => { if (nuova) A.agg = new Date().toISOString(); try { localStorage.setItem('cryon.accesso.bozza', JSON.stringify(A)); } catch (e) { /* niente */ } };

// mazzo di chiavi di un account, sempre ricalcolato da tipo + permessi + cassaforte
async function mazzo(acc, C) {
  const K = C.V.chiavi, r = {};
  const metti = n => { if (K[n]) r[K[n].id] = K[n].k; };
  if (acc.t === 'dev' || acc.t === 'admin') r[C.mid] = b64(C.masterRaw);
  else {
    const p = acc.p || {};
    metti('base'); metti(`prezzi:${acc.t}`);
    if (p.conf || p.risp) metti('conf');
    if (p.listino) metti('listino');
    for (const n of Object.keys(K)) if (n.startsWith('cat:') && (acc.t === 'client' || (p.cat || []).includes(n.slice(4)))) metti(n);
  }
  const ak = await chiaveAES(await apriBlob(C.master, acc.ka), ['encrypt', 'decrypt']);
  acc.k = await chiudiBlob(ak, TE.encode(JSON.stringify(r)));
}
async function nuovoAccount(C, { n, r, t, p, pw }) {
  const akRaw = crypto.getRandomValues(new Uint8Array(32)), sale = crypto.getRandomValues(new Uint8Array(16));
  const acc = { id: `${t}-${Date.now().toString(36)}`, n, r, t, i: n.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase(), rev: 1, p,
    s: b64(sale), it: GIRI, pw: await chiudiBlob(await kek(pw, sale), akRaw), ka: await chiudiBlob(C.master, akRaw) };
  await mazzo(acc, C);
  return acc;
}
async function nuovaPassword(C, acc, pw) {
  const akRaw = await apriBlob(C.master, acc.ka), sale = crypto.getRandomValues(new Uint8Array(16));
  Object.assign(acc, { s: b64(sale), it: GIRI, pw: await chiudiBlob(await kek(pw, sale), akRaw), rev: (acc.rev || 1) + 1, att: false });
}

// ---------------------------------------------------------------- GitHub: un commit con tutti i file
export async function pubblica(C, file, messaggio) {
  const g = C.V.github || {};
  if (!g.token) throw new Error('Manca il token GitHub: Impostazioni → Pubblicazione');
  const api = (u, o = {}) => fetch(`https://api.github.com/repos/${g.repo}/${u}`, { ...o, headers: { Authorization: `Bearer ${g.token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' } })
    .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`GitHub ${r.status}: ${j.message || ''}`); return j; });
  const ramo = g.ramo || 'main';
  const ref = await api(`git/ref/heads/${ramo}`), base = await api(`git/commits/${ref.object.sha}`);
  const albero = [];
  for (const f of file) {
    const dati = typeof f.dati === 'string' ? TE.encode(f.dati) : f.dati;
    const bl = await api('git/blobs', { method: 'POST', body: JSON.stringify({ content: b64(dati), encoding: 'base64' }) });
    albero.push({ path: f.path, mode: '100644', type: 'blob', sha: bl.sha });
  }
  const t = await api('git/trees', { method: 'POST', body: JSON.stringify({ base_tree: base.tree.sha, tree: albero }) });
  const c = await api('git/commits', { method: 'POST', body: JSON.stringify({ message: messaggio, tree: t.sha, parents: [ref.object.sha] }) });
  await api(`git/refs/heads/${ramo}`, { method: 'PATCH', body: JSON.stringify({ sha: c.sha }) });
  return c.sha.slice(0, 7);
}
export async function fileVault(C) { return { path: 'dati/vault.vd5', dati: await cifraVD5(TE.encode(JSON.stringify(C.V)), C.master, C.mid) }; }
export const fileAccount = A => ({ path: 'web/accesso.json', dati: JSON.stringify(A, null, 1) });

// prezzi pubblicati per un gruppo (admin / client / select)
export async function scriviPrezzi(C, gruppo, prezzi, chi) {
  const x = C.V.chiavi[`prezzi:${gruppo}`];
  const k = await chiaveAES(ub64(x.k), ['encrypt']);
  return { path: `dati/prezzi_${gruppo}.vd5`, dati: await cifraVD5(TE.encode(JSON.stringify({ prezzi, agg: new Date().toISOString(), da: chi })), k, x.id) };
}

// revoca: chiavi nuove per base, configuratore, listino e prezzi; i file vengono richiusi con le chiavi nuove
async function ruotaChiavi(C) {
  const file = [];
  for (const n of ['base', 'conf', 'listino', ...GRUPPI.map(g => `prezzi:${g}`)]) {
    const vecchia = C.V.chiavi[n]; if (!vecchia) continue;
    const path = FILE_DI[n] || `dati/prezzi_${n.slice(7)}.vd5`;
    const r = await fetch(path, { cache: 'no-cache' });                // in chiaro grazie al service worker (chiave vecchia)
    const nv = Number(vecchia.id.split('#')[1] || 1) + 1, raw = crypto.getRandomValues(new Uint8Array(32));
    C.V.chiavi[n] = { id: `${n}#${nv}`, k: b64(raw) };
    if (r.ok) file.push({ path, dati: await cifraVD5(new Uint8Array(await r.arrayBuffer()), await chiaveAES(raw, ['encrypt']), C.V.chiavi[n].id) });
  }
  return file;
}

// ---------------------------------------------------------------- interfaccia
let C = null, API = null, CAMBI = false;
const cataloghi = () => (window.CRYON_CATALOGHI || []).slice().sort((a, b) => a.numero - b.numero);
function toast(t) { const el = $('#toast'); if (!el) return alert(t); el.textContent = t; el.classList.add('su'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('su'), 3200); }

export async function apri(api) {
  API = api;
  let el = $('#impostazioni');
  if (!el) { el = document.createElement('section'); el.id = 'impostazioni'; document.body.appendChild(el); }
  el.innerHTML = '<div class="im-in"><p class="lab">Apro la cassaforte…</p></div>'; el.classList.add('su');
  try { C = await cassaforte(API); } catch (e) { el.innerHTML = `<div class="im-in"><p class="ac-err">${esc(e.message)}</p><button class="btn ghost" data-x>Chiudi</button></div>`; el.querySelector('[data-x]').onclick = chiudi; return; }
  try { const b = JSON.parse(localStorage.getItem('cryon.accesso.bozza') || 'null'); CAMBI = !!b && b.agg !== localStorage.getItem('cryon.accesso.pubblicato'); } catch (e) { CAMBI = false; }
  disegna();
}
function chiudi() { $('#impostazioni')?.classList.remove('su'); }

function interruttore(acc, k, lab) {
  return `<label class="im-sw"><input type="checkbox" data-a="${esc(acc.id)}" data-p="${k}" ${acc.p?.[k] ? 'checked' : ''}><span></span>${esc(lab)}</label>`;
}
function sceltaCataloghi(acc) {
  const fam = new Map();
  for (const c of cataloghi()) { const g = c.gruppo?.nome || 'Altri'; if (!fam.has(g)) fam.set(g, []); fam.get(g).push(c); }
  return `<div class="im-cat">${[...fam].map(([g, cc]) => `<div><span class="lab">${esc(g)}</span>${cc.map(c => `<label class="im-ck"><input type="checkbox" data-a="${esc(acc.id)}" data-c="${esc(c.slug)}" ${(acc.p?.cat || []).includes(c.slug) ? 'checked' : ''}>${esc(c.sigla || c.nome)}${c.gas?.[0] ? ` <i>${esc(c.gas[0])}</i>` : ''}</label>`).join('')}</div>`).join('')}</div>`;
}
function disegna() {
  const el = $('#impostazioni'), dev = API.puo('account'), A = C.A;
  const riga = (a, i) => `<div class="im-acc" data-id="${esc(a.id)}">
    <div class="im-chi">${avatar(a, i)}<div><b>${esc(a.n)}</b><span class="lab">${esc(RUOLI[a.t])}${a.r ? ' · ' + esc(a.r) : ''}${a.att ? ' · da attivare' : ''}</span></div>
      ${dev && a.id !== API.s.id ? `<span class="im-az"><button class="btn ghost mini" data-pw="${esc(a.id)}">Reimposta password</button><button class="btn ghost mini rosso" data-rev="${esc(a.id)}">Revoca</button></span>` : ''}</div>
    ${a.t === 'client' || a.t === 'select' ? `<div class="im-perm">${interruttore(a, 'conf', 'Configuratore')}${interruttore(a, 'risp', 'Analisi risparmio')}${interruttore(a, 'listino', 'Listino prezzi')}${interruttore(a, 'pdf', 'Scarica PDF')}</div>` : ''}
    ${a.t === 'select' ? sceltaCataloghi(a) : ''}</div>`;
  el.innerHTML = `<div class="im-in">
    <div class="im-testa"><div><span class="pill cool">vDragon 5</span><h2>Impostazioni</h2><p class="lab">${esc(API.nome)} · ${esc(RUOLI[API.tipo])} · Cryon DSGN è di Procryon</p></div>
      <button class="btn ghost" data-x>Chiudi</button></div>
    <h3>Account</h3>
    <div class="im-lista">${A.account.map(riga).join('')}</div>
    ${dev ? `<details class="im-nuovo"><summary class="btn ghost mini">+ Nuovo account (genera chiave)</summary>
      <div class="im-form"><label>Nome e cognome<input id="imN"></label><label>Ruolo (es. Sales Engineer)<input id="imR"></label>
        <label>Tipo<select id="imT"><option value="admin">Admin · accesso completo</option><option value="client" selected>User-Client · strumenti scelti</option><option value="select">User-Select · solo cataloghi scelti</option></select></label>
        <label>Password<input id="imP1" type="password" autocomplete="new-password"></label><label>Ripeti<input id="imP2" type="password" autocomplete="new-password"></label>
        <button class="btn" id="imCrea">Crea account</button></div></details>` : ''}
    <h3>La mia password</h3>
    <div class="im-form"><label>Nuova password<input id="imM1" type="password" autocomplete="new-password"></label><label>Ripeti<input id="imM2" type="password" autocomplete="new-password"></label><button class="btn ghost" id="imMia">Cambia</button></div>
    <h3>Pubblicazione sul sito</h3>
    <div class="im-form"><label>Repository<input id="imRepo" value="${esc(C.V.github?.repo || '')}"></label>
      <label>Token GitHub (fine-grained, solo questo repository, Contents: Read and write)<input id="imTok" type="password" autocomplete="off" placeholder="${C.V.github?.token ? '•••••••• salvato nella cassaforte' : 'incolla il token'}"></label></div>
    <div class="im-piede"><span class="lab" id="imStato">${CAMBI ? 'Modifiche da pubblicare' : 'Tutto pubblicato'}</span><button class="btn" id="imPub">Pubblica sul sito</button></div>
    <p class="lab muted">La pubblicazione arriva sul sito in 1–10 minuti. Gli account già aperti si aggiornano al prossimo avvio con la rete.</p></div>`;
  el.querySelector('[data-x]').onclick = chiudi;
  $('#imTok').value = C.tokNuovo || '';
  $('#imTok').oninput = e => { C.tokNuovo = e.target.value; };            // resta anche se la pagina si ridisegna
  const segna = () => { CAMBI = true; bozza(C.A); $('#imStato').textContent = 'Modifiche da pubblicare'; };
  el.querySelectorAll('input[data-p]').forEach(x => x.onchange = () => { const a = A.account.find(y => y.id === x.dataset.a); a.p = { ...(a.p || {}), [x.dataset.p]: x.checked }; segna(); });
  el.querySelectorAll('input[data-c]').forEach(x => x.onchange = () => {
    const a = A.account.find(y => y.id === x.dataset.a), s = new Set(a.p?.cat || []);
    x.checked ? s.add(x.dataset.c) : s.delete(x.dataset.c); a.p = { ...(a.p || {}), cat: [...s] }; segna();
  });
  el.querySelectorAll('[data-pw]').forEach(b => b.onclick = async () => {
    const a = A.account.find(y => y.id === b.dataset.pw);
    const p1 = prompt(`Nuova password per ${a.n} (almeno 10 caratteri)`); if (!p1) return;
    if (p1.length < 10) return toast('Password troppo corta');
    if (prompt('Ripeti la password') !== p1) return toast('Le password non coincidono');
    await nuovaPassword(C, a, p1); segna(); toast(`Password di ${a.n} reimpostata: pubblica per renderla valida`);
  });
  el.querySelectorAll('[data-rev]').forEach(b => b.onclick = async () => {
    const a = A.account.find(y => y.id === b.dataset.rev);
    if (!confirm(`Revocare l'accesso a ${a.n}?\n\nL'account sparisce e, alla pubblicazione, le chiavi di configuratore, listino e prezzi vengono cambiate subito.`)) return;
    C.A.account = A.account.filter(y => y.id !== a.id); C.ruota = true; segna(); disegna();
    toast(`${a.n} revocato: premi "Pubblica sul sito"`);
  });
  $('#imCrea')?.addEventListener('click', async () => {
    const n = $('#imN').value.trim(), r = $('#imR').value.trim(), t = $('#imT').value, p1 = $('#imP1').value;
    if (!n) return toast('Scrivi il nome');
    if (p1.length < 10) return toast('La password deve avere almeno 10 caratteri');
    if (p1 !== $('#imP2').value) return toast('Le password non coincidono');
    const p = t === 'admin' ? {} : { conf: t === 'client', listino: false, pdf: false, ...(t === 'select' ? { cat: [] } : {}) };
    C.A.account.push(await nuovoAccount(C, { n, r, t, p, pw: p1 })); segna(); disegna();
    toast(`Account di ${n} creato: scegli i permessi e pubblica`);
  });
  $('#imMia').onclick = async () => {
    const p1 = $('#imM1').value;
    if (p1.length < 10) return toast('La password deve avere almeno 10 caratteri');
    if (p1 !== $('#imM2').value) return toast('Le password non coincidono');
    const io = C.A.account.find(y => y.id === API.s.id); await nuovaPassword(C, io, p1);
    const s = await sessione(); s.rev = io.rev; await sessione(s);
    segna(); toast('Password cambiata: pubblica per renderla valida anche sugli altri dispositivi');
  };
  $('#imPub').onclick = async () => {
    const b = $('#imPub'); b.disabled = true; b.textContent = 'Pubblico…';
    try {
      const tok = (C.tokNuovo || '').trim(), repo = $('#imRepo').value.trim();
      C.V.github = { ...(C.V.github || {}), repo: repo || C.V.github?.repo, ...(tok ? { token: tok } : {}) };
      const file = C.ruota ? await ruotaChiavi(C) : [];
      C.A.agg = new Date().toISOString();
      for (const a of C.A.account) if (!a.att) await mazzo(a, C);
      file.push(fileAccount(C.A), await fileVault(C));
      const sha = await pubblica(C, file, `Cryon DSGN: account e permessi (${API.nome})`);
      C.tokNuovo = '';
      bozza(C.A, false); localStorage.setItem('cryon.accesso.pubblicato', C.A.agg); CAMBI = false; C.ruota = false;   // la bozza resta finché il sito non la raggiunge (CDN fino a 10 min)
      // il mio mazzo aggiornato (chiavi nuove dopo una revoca)
      const s = await sessione(), io = C.A.account.find(y => y.id === s.id);
      if (io) { s.kh = ''; await sessione(s); }
      $('#imStato').textContent = `Pubblicato ✓ (${sha}) · ricarica tra qualche minuto`; toast('Pubblicato sul sito ✓');
    } catch (e) { toast(e.message); $('#imStato').textContent = 'Errore: ' + e.message; }
    b.disabled = false; b.textContent = 'Pubblica sul sito';
  };
}
