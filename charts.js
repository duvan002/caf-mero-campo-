/* Gráficos SVG propios (barras / líneas / agrupados) — sin librerías, funcionan sin conexión. */
(function () {
  'use strict';
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function escalaBonita(max) {
    if (!(max > 0)) return { max: 1, paso: 0.25 };
    const exp = Math.pow(10, Math.floor(Math.log10(max))), f = max / exp;
    const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    const tope = n * exp; return { max: tope, paso: tope / 4 };
  }
  /** cfg: { labels, series:[{nombre,valores,color}], tipo:'barras'|'lineas', fmt(n), fmtEje(n), tooltips:[...] , altura } */
  function dibujar(cfg) {
    const W = 640, H = cfg.altura || 260, m = { t: 14, r: 12, b: 30, l: 52 };
    const n = cfg.labels.length, S = cfg.series, iw = W - m.l - m.r, ih = H - m.t - m.b;
    const todos = [].concat(...S.map((s) => s.valores.map((v) => v || 0)));
    const min = Math.min(0, ...todos), maxDato = Math.max(0, ...todos);
    const esc1 = escalaBonita(Math.max(maxDato, Math.abs(min)));
    const top = maxDato > 0 ? esc1.max : 0, bot = min < 0 ? -esc1.max : 0;
    const rango = top - bot || 1;
    const y = (v) => m.t + ih - ((v - bot) / rango) * ih;
    const slot = iw / Math.max(n, 1);
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const v = bot + (rango / 4) * i, yy = y(v);
      g += `<line x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}" class="grid"/><text x="${m.l - 6}" y="${yy + 4}" text-anchor="end" class="eje">${esc((cfg.fmtEje || String)(v))}</text>`;
    }
    g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}" class="cero"/>`;
    const cada = Math.ceil(n / 12);
    cfg.labels.forEach((l, i) => { if (i % cada === 0 || n <= 12) g += `<text x="${m.l + slot * i + slot / 2}" y="${H - 10}" text-anchor="middle" class="eje">${esc(l)}</text>`; });
    const tip = (i) => esc((cfg.tooltips && cfg.tooltips[i]) || (cfg.labels[i] + ': ' + S.map((s) => (S.length > 1 ? s.nombre + ' ' : '') + (cfg.fmt || String)(s.valores[i] || 0)).join(' · ')));
    if (cfg.tipo === 'lineas') {
      S.forEach((s, k) => {
        const pts = s.valores.map((v, i) => [m.l + slot * i + slot / 2, y(v || 0)]);
        g += `<polyline fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" points="${pts.map((p) => p.join(',')).join(' ')}"/>`;
        pts.forEach((p, i) => { if (n <= 40) g += `<circle cx="${p[0]}" cy="${p[1]}" r="3.2" fill="${s.color}"/>`; });
      });
      cfg.labels.forEach((_, i) => { g += `<rect x="${m.l + slot * i}" y="${m.t}" width="${slot}" height="${ih}" fill="transparent" class="hit" tabindex="0" data-tip="${tip(i)}"/>`; });
    } else {
      const bw = Math.min(46, (slot * 0.78) / S.length);
      cfg.labels.forEach((_, i) => {
        S.forEach((s, k) => {
          const v = s.valores[i] || 0, x = m.l + slot * i + slot / 2 - (bw * S.length) / 2 + bw * k;
          const y0 = y(0), y1 = y(v), alto = Math.abs(y1 - y0);
          g += `<rect x="${x}" y="${Math.min(y0, y1)}" width="${Math.max(bw - 2, 1)}" height="${v ? Math.max(alto, 1.5) : 0}" rx="3" fill="${v < 0 ? 'var(--rojo)' : s.color}"/>`;
        });
        g += `<rect x="${m.l + slot * i}" y="${m.t}" width="${slot}" height="${ih}" fill="transparent" class="hit" tabindex="0" data-tip="${tip(i)}"/>`;
      });
    }
    const leyenda = S.length > 1 ? `<div class="leyenda">${S.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.nombre)}</span>`).join('')}</div>` : '';
    return `<div class="grafico"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cfg.titulo || 'Gráfico')}">${g}</svg><div class="tip" hidden></div>${leyenda}</div>`;
  }
  /** Activa los textos emergentes (tocar o pasar el cursor). */
  function activar(raiz) {
    raiz.querySelectorAll('.grafico').forEach((gr) => {
      const tip = gr.querySelector('.tip');
      const mostrar = (e) => { const r = e.target.closest('.hit'); if (!r) return; tip.textContent = r.dataset.tip; tip.hidden = false; const b = gr.getBoundingClientRect(), t = r.getBoundingClientRect(); tip.style.left = Math.min(Math.max(t.left - b.left + t.width / 2, 70), b.width - 70) + 'px'; };
      gr.addEventListener('pointerover', mostrar); gr.addEventListener('pointerdown', mostrar); gr.addEventListener('focusin', mostrar);
      gr.addEventListener('pointerleave', () => { tip.hidden = true; });
    });
  }
  window.Charts = { dibujar, activar };
})();
