// Cryon DSGN — impaginazione del listino prezzi (usata dall'app e dal generatore PDF catalogo/listino.py)
// Struttura come il listino di riferimento: indice, capitoli, per ogni serie scheda caratteristiche + tabella prezzi
// (taglie divise in gruppi A–D) + optional in % / € per gruppo; appendice tecnica con le tabelle rese.
(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (v, d = 0) => v == null ? '—' : Number(v).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
  const eur = v => v == null ? 'su richiesta' : nf(Math.round(v));
  const kU = c => 'u|' + c;
  const kO = (s, g, n, i) => ['o', s, g, n, i].join('|');

  function cella(o, k, base, fmt, vuoto = 'P.M.') {
    if (base == null) return `<span class="lr-rich">${vuoto}</span>`;
    const v = k in o.mod ? o.mod[k] : base;
    if (!o.edit) return fmt(v);
    return `<input data-k="${esc(k)}" data-b="${base}" data-f="${fmt(1).replace(/[\d.,\s]/g, '') || 'n'}" class="${k in o.mod && o.mod[k] !== base ? 'mod' : ''}" value="${v}" inputmode="decimal"><span class="lr-st">${fmt(v)}</span>`;
  }

  function copertina(D, o, ss) {
    const s1 = ss.length === 1 ? ss[0] : null;
    const gas = [...new Set(ss.flatMap(s => Object.keys(s.gas)))].filter(g => g !== '—');
    return `<section class="lr-cop"><div class="dots"></div><div class="logo">${o.logo || ''}</div><div class="picto">${o.picto || ''}</div>
      <div class="in"><div class="num">${s1 ? esc(s1.numero) : '00'}</div><div class="lab">Listino prezzi / Price list · ${esc(D.versione)}</div>
      <h1>${s1 ? 'Listino ' + esc(s1.nome) : 'Listino prezzi 2026'}</h1><div class="sub">${s1 ? esc(s1.sotto) : 'Refrigeratori d\'acqua, free cooling e dry cooler Procryon'}</div>
      <div class="meta">${gas.map(g => `<span class="pill">${esc(g)}</span>`).join('')}<span class="pill acc">Versione provvisoria</span></div></div>
      <div class="claim">Prezzi in euro, IVA esclusa<br>www.procryon.com</div></section>`;
  }

  function indice(D, capi) {
    return `<section class="lr-indice"><div class="lr-tit"><h2>Indice</h2><span>Index</span></div>` + capi.map(c => `
      <div class="lr-ic"><div class="n">${esc(c.numero)}</div><div><h3>${esc(c.titolo)}</h3><p>${esc(c.titolo_en)}</p>
      <ul>${c.serie.map(s => `<li><b>${esc(s.numero)}</b> ${esc(s.nome)}<span>${esc(s.sotto)}</span></li>`).join('')}</ul></div></div>`).join('') +
      `<div class="lr-ic"><div class="n">${String(capi.length + 1).padStart(2, '0')}</div><div><h3>Appendice tecnica</h3><p>Technical appendix · tabelle rese / capacity tables</p></div></div>
      <div class="lr-note"><h4>Condizioni del listino</h4><ul><li>Prezzi in euro, IVA esclusa, per singola unità, franco nostro stabilimento salvo diverso accordo.</li>
      <li>Ogni serie è divisa per refrigerante. Optional in % sul prezzo dell'unità (o in € dove indicato), per gruppo di taglie A–D.</li>
      <li>P.M. = prezzo su richiesta. Esecuzioni speciali X (Configure To Order): quotazione dedicata.</li>
      <li>Procryon si riserva di modificare prezzi e caratteristiche senza preavviso. Versione provvisoria.</li></ul></div></section>`;
  }

  function divisore(c) {
    return `<section class="lr-div"><div class="n">${esc(c.numero)}</div><h2>${esc(c.titolo)}</h2><p>${esc(c.titolo_en)}</p>
      <ul>${c.serie.map(s => `<li><b>${esc(s.numero)}</b> ${esc(s.nome)}</li>`).join('')}</ul></section>`;
  }

  function testata(s, g) {
    return `<div class="lr-testa"><div><b>${esc(s.cap_titolo)}</b><span>${esc(s.cap_titolo_en)}</span></div>
      <div class="lr-cod"><span class="n">${esc(s.numero)}</span>${esc(s.nome.replace('Serie ', ''))}${g ? `<i>${esc(g)}</i>` : ''}</div></div>`;
  }

  function scheda(s, g, G) {
    const k = (a, b, c) => `<div class="lr-k"><span>${esc(a)}</span><b>${b}</b>${c ? `<i>${esc(c)}</i>` : ''}</div>`;
    const gi = s.gasinfo[g];
    return `<div class="lr-scheda">${s.scheda.map(([a, b, c]) => k(a, esc(b), c)).join('')}
      ${gi ? k('Refrigerante / Gas', esc(g), `GWP ${nf(gi.gwp)} · classe ${gi.classe}`) : ''}</div>`;
  }

  function tabellaPrezzi(s, g, G, o) {
    const vv = G.varianti;
    let h = `<table class="lr-tb lr-prezzi"><thead><tr><th>Gruppo</th><th>Taglia</th><th class="n">Compr.</th><th class="n">Circuiti</th><th class="n">Portata<br>l/min</th>
      <th class="n">Resa<br>kW</th><th class="n">Resa<br>kcal/h</th><th class="n">EER</th>${vv.map(v => `<th class="n pz">Listino ${esc(v)}<br>€</th>`).join('')}</tr></thead><tbody>`;
    let gr0 = null;
    for (const r of G.righe) {
      const nuovo = r.gr !== gr0; gr0 = r.gr;
      h += `<tr class="${nuovo ? 'gr-inizio' : ''}"><td class="gr">${nuovo ? `<b>${esc(r.gr)}</b>` : ''}</td><td class="cod">${esc(r.t)}</td><td class="n">${nf(r.nc)}</td><td class="n">${nf(r.ncirc)}</td>
        <td class="n">${nf(r.lmin)}</td><td class="n">${nf(r.kw, 1)}</td><td class="n">${nf(r.kcal)}</td><td class="n">${nf(r.eer, 2)}</td>` +
        vv.map(v => { const x = r[v]; return `<td class="n p" title="${esc(x?.c || '')}">${x ? cella(o, kU(x.c), x.p, eur) : '—'}</td>`; }).join('') + '</tr>';
    }
    h += `</tbody></table><p class="lr-leg">Codice completo: ${esc(G.schema)} · H = idronico (vasca/serbatoio integrato) · O = senza modulo idronico · S / C = variante (${esc(vv.map(v => v + ' ' + (s.var_testi[v] || '')).join(' · '))}).
      Resa nominale: acqua 12/7 °C, ${esc(s.cond_nom)}.</p>`;
    return h;
  }

  function tabellaOpz(s, g, G, o) {
    if (!G.opz.length) return '';
    const L = G.gruppi.map(x => x.lettera);
    let h = `<h4>Optional · ${esc(g)}</h4><table class="lr-tb lr-opz"><thead><tr><th>Optional</th><th>Versione</th>${G.gruppi.map(x => `<th class="n">Gruppo ${esc(x.lettera)}<br><small>${esc(x.da)}–${esc(x.a)}</small></th>`).join('')}</tr></thead><tbody>`;
    let cat0 = null;
    for (const op of G.opz) {
      if (op.cat !== cat0) { h += `<tr class="cat"><td colspan="${2 + L.length}">${esc(op.cat_lab)}</td></tr>`; cat0 = op.cat; }
      const fmt = op.u === '%' ? (v => nf(v) + ' %') : (v => '€ ' + nf(v));
      h += `<tr><td>${esc(op.n)}</td><td>${esc(op.ver)}</td>` + op.val.map((v, i) => `<td class="n p">${cella(o, kO(s.id, g, op.n, i), v, fmt, '—')}</td>`).join('') + '</tr>';
    }
    return h + '</tbody></table><p class="lr-leg">% = percentuale da applicare al prezzo di listino dell\'unità · € = importo fisso per unità · — = non disponibile per il gruppo.</p>';
  }

  function appendice(D, ss) {
    let h = `<section class="lr-app"><div class="lr-tit"><h2>Appendice tecnica</h2><span>Technical appendix · Tabelle rese / Capacity tables</span></div>
      <p class="lr-leg">Fattori medi della serie rispetto alla resa nominale (acqua 12/7 °C). In alto la resa frigorifera, sotto la potenza assorbita. Acqua pura, salto termico 5 K; con glicole moltiplicare la resa per il coefficiente della tabella in fondo.</p>`;
    for (const s of ss) {
      const R = s.rese; if (!R) continue;
      h += `<div class="lr-resa"><h4>${esc(s.numero)} · ${esc(s.nome)} <span>${esc(R.asse)}</span></h4><table class="lr-tb"><thead><tr><th>Acqua uscita °C</th>${R.amb.map(a => `<th class="n">${nf(a)}</th>`).join('')}</tr></thead><tbody>` +
        R.lwt.map((l, i) => `<tr><td class="cod">${nf(l)}</td>${R.kw[i].map((v, j) => `<td class="n">${v == null ? '—' : `<b>${nf(v)}%</b><br><small>${nf(R.pw[i][j])}%</small>`}</td>`).join('')}</tr>`).join('') +
        '</tbody></table></div>';
    }
    h += `<div class="lr-resa"><h4>Coefficienti glicole / Glycol factors</h4><table class="lr-tb"><thead><tr><th>Miscela</th>${D.glicole.perc.map(p => `<th class="n">${p}%</th>`).join('')}</tr></thead><tbody>` +
      D.glicole.righe.map(([n, vals]) => `<tr><td>${esc(n)}</td>${vals.map(v => `<td class="n">${nf(v, 3)}</td>`).join('')}</tr>`).join('') + '</tbody></table></div>';
    return h + '</section>';
  }

  function render(D, o) {
    o = { edit: false, mod: {}, serie: null, gas: 'tutti', ...o };
    const ss = D.serie.filter(s => !o.serie || s.id === o.serie);
    const capi = D.capitoli.map(c => ({ ...c, serie: c.serie.map(id => D.serie.find(s => s.id === id)) })).filter(c => c.serie.some(s => ss.includes(s)));
    let h = copertina(D, o, ss);
    if (!o.serie) h += indice(D, capi);
    for (const c of capi) {
      if (!o.serie) h += divisore(c);
      for (const s of c.serie.filter(x => ss.includes(x))) {
        for (const [g, G] of Object.entries(s.gas)) {
          if (o.gas !== 'tutti' && g !== o.gas) continue;
          h += `<section class="lr-sez">${testata(s, g === '—' ? '' : g)}${scheda(s, g, G)}`;
          if (!G.righe.some(r => G.varianti.some(v => r[v]?.p != null))) h += '<p class="lr-rich-box">Prezzi <b>su richiesta</b>: contattare l\'ufficio commerciale Procryon.</p>';
          h += tabellaPrezzi(s, g, G, o) + '</section>';
          if (G.opz.length) h += `<section class="lr-sez">${testata(s, g)}${tabellaOpz(s, g, G, o)}</section>`;
        }
      }
    }
    return h + appendice(D, ss);
  }
  window.ListinoRender = { render, eur, nf };
})();
