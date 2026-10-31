/* Más: inventario, producción, gastos, inversiones, informes/exportaciones, respaldo y ajustes de seguridad. */
(function () {
  'use strict';
  const MC = window.MC, DB = window.DB, App = window.App, S = App.S;
  const { esc, $, $$, numStr, leer, toast, modal, cerrar, confirmar, pend, PEND } = App;
  const hoy = () => MC.hoyISO();
  const cop = (v, d) => MC.fmtCOP(v, { dec: d == null ? 2 : d });
  const descargar = (nombre, blob) => { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); };
  const campo = (id, lbl, o) => { o = o || {}; return `<label class="campo">${lbl}${o.ayuda ? `<span class="ayuda">${o.ayuda}</span>` : ''}<div class="${o.u === '$' ? 'mon' : o.u ? 'u' : ''}" ${o.u && o.u !== '$' ? `data-u="${o.u}"` : ''}><input class="in" id="${id}" inputmode="${o.inm || 'decimal'}" value="${numStr(o.v)}" ${o.i ? `data-i="${o.i}"` : ''} placeholder="${esc(o.ph || '')}"></div></label>`; };

  // ================================================================ MÁS (menú)
  App.vistas.mas = () => {
    const it = (href, ico, t, d) => `<a class="card" href="${href}" style="text-decoration:none;color:inherit;display:flex;gap:12px;align-items:center;min-height:64px"><span style="font-size:1.6rem">${ico}</span><span><b style="color:var(--cafe)">${t}</b><br><small class="nota">${d}</small></span></a>`;
    return `<section class="vista"><div class="titulo"><h2>Más opciones</h2></div><div class="grid g2m">
      ${it('#/productos', '🏷️', 'Productos y precios', 'Presentaciones, precio al tendero y al público')}
      ${it('#/costos', '☕', 'Centro de costos', 'Café, bolsas, etiquetas y otros costos')}
      ${it('#/inventario', '📦', 'Inventario', 'Café, bolsas, etiquetas y producto terminado')}
      ${it('#/produccion', '🏭', 'Producción', 'Registrar lotes elaborados')}
      ${it('#/gastos', '🧮', 'Gastos', 'Gastos operativos y otros movimientos')}
      ${it('#/inversiones', '💰', 'Inversiones y ROI', 'Recuperación de la inversión')}
      ${it('#/informes', '📄', 'Informes', 'CSV, Excel y PDF')}
      ${it('#/respaldo', '🛡️', 'Respaldo', 'Copia de seguridad y restauración')}
      ${it('#/ajustes', '⚙️', 'Ajustes', 'PIN de acceso y datos')}</div>
      <div class="nota" style="text-align:center;margin-top:14px">Café Mero Campo · Cucutilla, Norte de Santander · «Del campo a tu taza»</div></section>`;
  };

  // ================================================================ INVENTARIO
  const nombreProd = (id) => (S.productos.find((p) => p.id === +id) || { nombre: 'Producto ' + id }).nombre;
  function nombreItem(item, clave) {
    if (item === 'cafe') { const l = S.lotesCafe.find((x) => x.id === +clave); return l ? `${l.modo === 'comprado' ? 'Compra' : 'Lote'} ${MC.fechaCorta(l.fecha)}${l.referencia ? ' · ' + l.referencia : ''}` : 'Lote ' + clave; }
    if (item === 'bolsa') return (S.costos.bolsas.refs[clave] || { nombre: clave }).nombre;
    return nombreProd(clave);
  }
  const unidadItem = (item) => (item === 'cafe' ? 'kg' : 'u');
  function existencias() {
    const st = MC.stock(S.inventarioMov), out = { cafe: [], bolsa: [], etiqueta: [], terminado: [] };
    for (const k of Object.keys(st)) { const [item, clave] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)]; if (out[item]) out[item].push({ item, clave, cant: st[k], nombre: nombreItem(item, clave) }); }
    // muestra también los insumos sin movimientos
    Object.keys(S.costos.bolsas.refs).forEach((k) => { if (!out.bolsa.some((x) => x.clave === k)) out.bolsa.push({ item: 'bolsa', clave: k, cant: 0, nombre: nombreItem('bolsa', k) }); });
    S.productos.forEach((p) => { ['etiqueta', 'terminado'].forEach((it) => { if (!out[it].some((x) => x.clave === String(p.id))) out[it].push({ item: it, clave: String(p.id), cant: 0, nombre: p.nombre }); }); });
    return out;
  }
  App.existencias = existencias;
  App.vistas.inventario = () => {
    const ex = existencias(), tit = { cafe: 'Café (kg por lote)', bolsa: 'Bolsas', etiqueta: 'Etiquetas', terminado: 'Producto terminado' };
    const bloque = (it) => `<div class="card"><h3>${tit[it]}</h3><div class="tabla-w" style="margin-top:8px"><table><thead><tr><th>Concepto</th><th class="n">Disponible</th></tr></thead><tbody>${ex[it].length ? ex[it].map((x) => `<tr><td>${esc(x.nombre)}</td><td class="n ${x.cant < 0 ? 'neg-txt' : ''}">${MC.fmtNumero(x.cant, unidadItem(it) === 'kg' ? 3 : 0, true)} ${unidadItem(it)}${x.cant < 0 ? ' ⚠️' : ''}</td></tr>`).join('') : '<tr><td colspan="2" class="vacio">Sin movimientos todavía.</td></tr>'}</tbody></table></div></div>`;
    const movs = S.inventarioMov.slice().sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.id - a.id)).slice(0, 60);
    const motivos = { compra: 'Entrada', venta: 'Venta', produccion: 'Producción', ajuste: 'Ajuste', merma: 'Merma', entrada: 'Entrada', salida: 'Salida' };
    return `<section class="vista"><div class="titulo"><h2>Inventario</h2><button class="btn sm pri" data-a="nuevoMov">＋ Registrar movimiento</button></div>
      <div class="alerta">ℹ️ <span>Las existencias salen de los movimientos que registras (compras, producción, ventas por producto, ajustes y mermas). No hay cifras de ejemplo.</span></div>
      ${['terminado', 'cafe', 'bolsa', 'etiqueta'].map(bloque).join('')}
      <div class="card"><h3>Historial de movimientos</h3>${movs.length ? `<div class="tabla-w" style="margin-top:8px"><table><thead><tr><th>Fecha</th><th>Concepto</th><th>Motivo</th><th class="n">Cantidad</th></tr></thead><tbody>${movs.map((m) => `<tr><td>${esc(MC.fechaCorta(m.fecha))}</td><td>${esc(nombreItem(m.item, m.clave))}<br><small class="nota">${esc(({ cafe: 'Café', bolsa: 'Bolsas', etiqueta: 'Etiquetas', terminado: 'Terminado' })[m.item])}${m.nota ? ' · ' + esc(m.nota) : ''}</small></td><td>${esc(motivos[m.motivo] || m.motivo)}</td><td class="n ${m.cantidad < 0 ? 'neg-txt' : 'pos-txt'}">${m.cantidad > 0 ? '+' : ''}${MC.fmtNumero(m.cantidad, 3, true)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="vacio">Sin movimientos.</div>'}</div></section>`;
  };
  function opcionesClave(item) {
    if (item === 'cafe') return S.lotesCafe.map((l) => [l.id, nombreItem('cafe', l.id)]);
    if (item === 'bolsa') return Object.keys(S.costos.bolsas.refs).map((k) => [k, S.costos.bolsas.refs[k].nombre]);
    return S.productos.map((p) => [p.id, p.nombre]);
  }
  App.acciones.nuevoMov = () => modal(`<h2>Registrar movimiento de inventario</h2><form class="form" id="fMov" novalidate>
    <label class="campo">Qué es<select class="in" id="m-item"><option value="terminado">Producto terminado</option><option value="cafe">Café (lote)</option><option value="bolsa">Bolsas</option><option value="etiqueta">Etiquetas</option></select></label>
    <label class="campo">Cuál<select class="in" id="m-clave"></select></label>
    <label class="campo">Tipo de movimiento<select class="in" id="m-tipo"><option value="entrada">Entrada de mercancía (+)</option><option value="ajuste_mas">Ajuste manual: sumar (+)</option><option value="ajuste_menos">Ajuste manual: restar (−)</option><option value="merma">Merma o desperdicio (−)</option><option value="salida">Salida (−)</option></select></label>
    ${campo('m-cant', 'Cantidad', { u: '', inm: 'decimal' })}
    <label class="campo">Fecha<input class="in" type="date" id="m-fecha" value="${hoy()}" max="${hoy()}"></label>
    <label class="campo">Observaciones<input class="in" id="m-nota" maxlength="120" placeholder="Ej. conteo físico, producto dañado…"></label>
    <div class="error" id="m-err" role="alert"></div><div class="acciones"><button type="button" class="btn" data-a="cerrar">Cancelar</button><button class="btn pri" type="submit">Guardar</button></div></form>`, (m) => {
    const rell = () => { const it = $('#m-item', m).value; $('#m-clave', m).innerHTML = opcionesClave(it).map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('') || '<option value="">(no hay opciones: registra primero una compra)</option>'; };
    $('#m-item', m).addEventListener('change', rell); rell();
    $('#fMov', m).addEventListener('submit', async (e) => {
      e.preventDefault(); const err = $('#m-err', m), cant = leer($('#m-cant', m)), tipo = $('#m-tipo', m).value, item = $('#m-item', m).value, clave = $('#m-clave', m).value;
      if (!clave) { err.textContent = 'No hay un concepto para elegir.'; return; }
      if (!(cant > 0)) { err.textContent = 'La cantidad debe ser mayor que cero.'; return; }
      const signo = ['entrada', 'ajuste_mas'].includes(tipo) ? 1 : -1, mov = { fecha: $('#m-fecha', m).value, item, clave, cantidad: signo * cant, motivo: tipo.startsWith('ajuste') ? 'ajuste' : tipo, refTipo: 'manual', refId: null, nota: $('#m-nota', m).value.trim(), creado: Date.now() };
      if (!MC.esFecha(mov.fecha) || mov.fecha > hoy()) { err.textContent = 'Elige una fecha válida (no futura).'; return; }
      const adv = MC.advertenciasStock(S.inventarioMov, [mov]);
      if (adv.length && !(await confirmar({ titulo: 'Inventario insuficiente', html: `Solo hay <b>${MC.fmtNumero(adv[0].disponible, 3, true)}</b> disponibles y quedaría en <b>${MC.fmtNumero(adv[0].quedaria, 3, true)}</b>. ¿Registrar de todos modos?`, ok: 'Registrar igual' }))) return;
      await DB.transaccion(['inventarioMov'], (a) => a.put('inventarioMov', mov)); await App.recargar(); cerrar(m); toast('Movimiento registrado ✔', 'ok'); App.render();
    });
  });

  // ================================================================ PRODUCCIÓN
  App.vistas.produccion = () => {
    const lista = S.produccion.slice().sort((a, b) => (a.fecha < b.fecha ? 1 : b.id - a.id));
    return `<section class="vista"><div class="titulo"><h2>Producción</h2><button class="btn sm pri" data-a="nuevaProd">＋ Registrar producción</button></div>
      <div class="alerta">ℹ️ <span>Al registrar una producción se descuenta el café, las bolsas y las etiquetas, y se suman las unidades buenas al inventario de producto terminado.</span></div>
      <div class="card">${lista.length ? lista.map((p) => `<div class="item"><div class="cuerpo"><b>${p.buenas} × ${esc(nombreProd(p.productoId))}</b><small>${esc(MC.fechaCorta(p.fecha))} · ${esc(nombreItem('cafe', p.loteId))}</small>
        <small>Café ${MC.fmtKg(p.kgConsumidos)} · bolsas ${p.bolsas || 0} · etiquetas ${p.etiquetas || 0} · defectuosas ${p.defectuosas || 0}</small>
        <small>${p.costoUnit != null ? `Costo por unidad buena: <b>${cop(p.costoUnit)}</b> (total ${MC.fmtCOP(p.costoTotal)})` : '<span class="pend">Costo pendiente de datos</span>'}</small></div>
        <button class="btn sm" data-a="borrarProd" data-id="${p.id}" aria-label="Eliminar">🗑️</button></div>`).join('') : '<div class="vacio">Aún no has registrado producción.</div>'}</div></section>`;
  };
  App.acciones.nuevaProd = () => {
    const ex = existencias();
    const lotes = S.lotesCafe.map((l) => ({ l, disp: (ex.cafe.find((x) => x.clave === String(l.id)) || { cant: 0 }).cant }));
    if (!lotes.length) { toast('Primero registra una compra o lote de café (Costos → Café).', 'err'); return; }
    modal(`<h2>Registrar producción</h2><form class="form" id="fPro" novalidate>
      <label class="campo">Lote de café usado<select class="in" id="r-lote">${lotes.map(({ l, disp }) => `<option value="${l.id}">${esc(nombreItem('cafe', l.id))} · disp. ${MC.fmtNumero(disp, 3, true)} kg · ${MC.fmtCOP(l.costoKg)}/kg</option>`).join('')}</select></label>
      <label class="campo">Presentación<select class="in" id="r-prod">${S.productos.filter((p) => p.activo).map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('')}</select></label>
      <div class="fila2">${campo('r-buenas', 'Unidades buenas', { inm: 'numeric', i: 'previoProd' })}${campo('r-def', 'Defectuosas o desperdiciadas', { inm: 'numeric', i: 'previoProd' })}</div>
      ${campo('r-kg', 'Café consumido', { u: 'kg', i: 'previoProd', ayuda: 'Incluye el café de las unidades defectuosas. Se sugiere según los gramos × unidades.' })}
      <div class="fila2">${campo('r-bolsas', 'Bolsas usadas', { inm: 'numeric', i: 'previoProd', ayuda: 'Vacío = buenas + defectuosas' })}${campo('r-etq', 'Etiquetas usadas', { inm: 'numeric', i: 'previoProd', ayuda: 'Vacío = buenas + defectuosas' })}</div>
      <label class="campo">Fecha<input class="in" type="date" id="r-fecha" value="${hoy()}" max="${hoy()}"></label>
      <label class="campo">Observaciones<input class="in" id="r-obs" maxlength="200"></label>
      <div id="r-prev" class="card" style="background:var(--dorado-bg)"></div>
      <div class="error" id="r-err" role="alert"></div><div class="acciones"><button type="button" class="btn" data-a="cerrar">Cancelar</button><button class="btn pri" type="submit">Guardar</button></div></form>`, (m) => {
      $$('select', m).forEach((s) => s.addEventListener('change', () => previoProd(m, true)));
      previoProd(m, true);
      $('#fPro', m).addEventListener('submit', (e) => { e.preventDefault(); guardarProd(m); });
    });
  };
  function datosProd(m, sugerir) {
    const n = (id) => leer($('#' + id, m)), pid = +$('#r-prod', m).value, p = S.productos.find((x) => x.id === pid), buenas = n('r-buenas') || 0, def = n('r-def') || 0;
    let kg = n('r-kg');
    if (sugerir && kg == null && p && buenas + def > 0) { kg = Math.round(((p.gramos / 1000) * (buenas + def)) * 1000) / 1000; }
    return { loteId: +$('#r-lote', m).value, productoId: pid, buenas, defectuosas: def, kgConsumidos: kg, bolsas: n('r-bolsas') != null ? n('r-bolsas') : buenas + def, etiquetas: n('r-etq') != null ? n('r-etq') : buenas + def, fecha: $('#r-fecha', m).value, bolsaRef: p ? p.bolsaRef : null, observaciones: $('#r-obs', m).value.trim() };
  }
  function previoProd(m, forzarSugerencia) {
    const d = datosProd(m, true), el = $('#r-prev', m);
    if (forzarSugerencia && !$('#r-kg', m).value && d.kgConsumidos != null && !$('#r-kg', m).dataset.manual) $('#r-kg', m).value = numStr(d.kgConsumidos);
    const r = costoProd(d);
    el.innerHTML = r.ok ? `<div class="grid g2" style="gap:8px"><div><div class="nota">Costo total de la producción</div><b>${MC.fmtCOP(r.total)}</b></div><div><div class="nota">Costo por unidad buena</div><b>${cop(r.unit)}</b></div></div><div class="nota">Café ${MC.fmtCOP(r.cafe)} · bolsas ${MC.fmtCOP(r.bolsas)} · etiquetas ${MC.fmtCOP(r.etiquetas)} · otros ${MC.fmtCOP(r.otros)}</div>` : pend(r.motivo);
  }
  App.entradas.previoProd = (el) => { const m = el.closest('.modal'); if (el.id === 'r-kg') el.dataset.manual = '1'; else if (!$('#r-kg', m).dataset.manual) $('#r-kg', m).value = ''; previoProd(m, true); };
  function costoProd(d) {
    const l = S.lotesCafe.find((x) => x.id === d.loteId), p = S.productos.find((x) => x.id === d.productoId);
    if (!l || !p) return { ok: false, motivo: 'Elige el lote y la presentación.' };
    const b = MC.costoBolsaRef(S.costos, p.bolsaRef), e = MC.costoEtiquetaProducto(S.costos, p), o = MC.otrosCostosUnit(S.costos, p);
    if (!b.ok) return { ok: false, motivo: b.motivo }; if (!e.ok) return { ok: false, motivo: e.motivo };
    if (o.issues.length) return { ok: false, motivo: o.issues[0] };
    return MC.costoProduccion({ buenas: d.buenas, kgConsumidos: d.kgConsumidos, costoKgCafe: l.costoKg, bolsas: d.bolsas, costoBolsa: b.valor, etiquetas: d.etiquetas, costoEtiqueta: e.valor, otrosUnit: o.total });
  }
  async function guardarProd(m) {
    if (App.ocupado) return; const d = datosProd(m, true), err = $('#r-err', m);
    if (!(d.buenas > 0)) { err.textContent = 'Escribe cuántas unidades buenas se elaboraron.'; return; }
    if ([d.buenas, d.defectuosas, d.kgConsumidos, d.bolsas, d.etiquetas].some((v) => v == null || Number.isNaN(v) || v < 0)) { err.textContent = 'Revisa los números: no pueden ser negativos ni estar vacíos.'; return; }
    if (!MC.esFecha(d.fecha) || d.fecha > hoy()) { err.textContent = 'Elige una fecha válida (no futura).'; return; }
    const r = costoProd(d);
    const movs = MC.movimientosProduccion(Object.assign({}, d), 0);
    const adv = MC.advertenciasStock(S.inventarioMov, movs);
    if (adv.length) {
      const txt = adv.map((w) => { const [it, cl] = [w.clave.slice(0, w.clave.indexOf(':')), w.clave.slice(w.clave.indexOf(':') + 1)]; return `${esc(nombreItem(it, cl))}: hay ${MC.fmtNumero(w.disponible, 3, true)}, quedaría en ${MC.fmtNumero(w.quedaria, 3, true)}`; }).join('<br>');
      if (!(await confirmar({ titulo: 'Inventario insuficiente', html: txt + '<br><br>¿Registrar de todos modos?', ok: 'Registrar igual' }))) return;
    }
    App.ocupado = true;
    try {
      await DB.transaccion(['produccion', 'inventarioMov'], async (a) => {
        const rec = Object.assign({}, d, { costoUnit: r.ok ? r.unit : null, costoTotal: r.ok ? r.total : null, creado: Date.now() });
        const id = await a.put('produccion', rec);
        for (const mv of MC.movimientosProduccion(d, id)) await a.put('inventarioMov', Object.assign(mv, { creado: Date.now() }));
      });
      await App.recargar(); cerrar(m); toast('Producción registrada ✔', 'ok'); App.render();
    } catch (e) { err.textContent = 'No se pudo guardar: ' + e.message; }
    App.ocupado = false;
  }
  App.acciones.borrarProd = async (b) => {
    const id = +b.dataset.id;
    if (S.ventas.some((v) => (v.items || []).some((i) => i.produccionId === id))) { toast('Hay ventas que usan el costo de esta producción; no se puede eliminar.', 'err'); return; }
    if (!(await confirmar({ titulo: 'Eliminar producción', texto: 'Se devolverán al inventario los insumos y se quitarán las unidades terminadas de esta producción.', ok: 'Eliminar', peligro: true }))) return;
    await DB.transaccion(['produccion', 'inventarioMov'], async (a) => { await a.del('produccion', id); for (const m of S.inventarioMov.filter((x) => x.refTipo === 'produccion' && x.refId === id)) await a.del('inventarioMov', m.id); });
    await App.recargar(); toast('Eliminada', 'ok'); App.render();
  };

  // ================================================================ GASTOS
  const TIPOS_GASTO = { operativo: 'Gasto operativo', otro_gasto: 'Otro gasto', otro_ingreso: 'Otro ingreso', pago_prestamo: 'Pago de préstamo' };
  const AYUDA_GASTO = { operativo: 'Se resta de la ganancia (transporte, servicios, arriendo, publicidad…).', otro_gasto: 'Gasto no operativo que sí resta de la ganancia neta.', otro_ingreso: 'Ingreso que no viene de vender café; suma a la ganancia neta.', pago_prestamo: 'Pago de deuda: se registra aparte y NO se cuenta como gasto de la utilidad.' };
  const uiG = { desde: null, hasta: null };
  App.vistas.gastos = () => {
    const pr = MC.periodo('mes', hoy()); uiG.desde = uiG.desde || pr.desde; uiG.hasta = uiG.hasta || pr.hasta;
    const lista = MC.enRango(S.gastos, uiG.desde, uiG.hasta).sort((a, b) => (a.fecha < b.fecha ? 1 : b.id - a.id));
    const tot = (t) => lista.filter((g) => g.tipo === t).reduce((a, g) => a + g.monto, 0);
    return `<section class="vista"><div class="titulo"><h2>Gastos</h2><button class="btn sm pri" data-a="nuevoGasto">＋ Registrar gasto</button></div>
      <div class="card form no-print"><div class="fila2"><label class="campo">Desde<input class="in" type="date" value="${uiG.desde}" data-c="rangoGasto" data-w="desde"></label><label class="campo">Hasta<input class="in" type="date" value="${uiG.hasta}" data-c="rangoGasto" data-w="hasta"></label></div></div>
      <div class="grid g2m">${Object.keys(TIPOS_GASTO).map((t) => `<div class="card kpi"><div class="lbl">${TIPOS_GASTO[t]}</div><div class="val">${MC.fmtCOP(tot(t))}</div></div>`).join('')}</div>
      <div class="alerta">ℹ️ <span>Los gastos de operar van aquí. La compra de maquinaria o equipos va en <b>Inversiones</b>: no registres lo mismo en los dos sitios.</span></div>
      <div class="card">${lista.length ? lista.map((g) => `<div class="item"><div class="cuerpo"><b>${esc(g.descripcion || g.categoria || TIPOS_GASTO[g.tipo])}</b><small>${esc(MC.fechaCorta(g.fecha))} · ${esc(TIPOS_GASTO[g.tipo])}${g.categoria ? ' · ' + esc(g.categoria) : ''}</small></div><div style="text-align:right"><div class="monto ${g.tipo === 'otro_ingreso' ? 'pos-txt' : ''}">${MC.fmtCOP(g.monto)}</div><div style="display:flex;gap:6px;margin-top:6px"><button class="btn sm" data-a="editarGasto" data-id="${g.id}" aria-label="Editar">✏️</button><button class="btn sm" data-a="borrarGasto" data-id="${g.id}" aria-label="Eliminar">🗑️</button></div></div></div>`).join('') : '<div class="vacio">Sin gastos en este período.</div>'}</div></section>`;
  };
  App.cambios.rangoGasto = (el) => { uiG[el.dataset.w] = el.value; if (uiG.desde > uiG.hasta) { toast('La fecha inicial debe ser anterior a la final.', 'err'); uiG.desde = uiG.hasta; } App.render(); };
  function abrirGasto(id) {
    const g = id ? S.gastos.find((x) => x.id === id) : { tipo: 'operativo', fecha: hoy(), categoria: '', descripcion: '', monto: null };
    modal(`<h2>${id ? 'Editar' : 'Registrar'} gasto</h2><form class="form" id="fGas" novalidate>
      <label class="campo">Tipo<select class="in" id="g-tipo">${Object.keys(TIPOS_GASTO).map((t) => `<option value="${t}" ${g.tipo === t ? 'selected' : ''}>${TIPOS_GASTO[t]}</option>`).join('')}</select><span class="ayuda" id="g-ayuda">${AYUDA_GASTO[g.tipo]}</span></label>
      ${campo('g-monto', 'Valor', { u: '$', v: g.monto })}
      <div class="fila2"><label class="campo">Fecha<input class="in" type="date" id="g-fecha" value="${g.fecha}" max="${hoy()}"></label><label class="campo">Categoría<input class="in" id="g-cat" list="cats" maxlength="40" value="${esc(g.categoria)}"></label></div>
      <datalist id="cats">${['Transporte', 'Servicios', 'Arriendo', 'Publicidad', 'Mantenimiento', 'Impuestos', 'Nómina'].map((c) => `<option>${c}</option>`).join('')}</datalist>
      <label class="campo">Descripción<input class="in" id="g-desc" maxlength="120" value="${esc(g.descripcion)}"></label>
      <div class="error" id="g-err" role="alert"></div><div class="acciones"><button type="button" class="btn" data-a="cerrar">Cancelar</button><button class="btn pri" type="submit">Guardar</button></div></form>`, (m) => {
      $('#g-tipo', m).addEventListener('change', (e) => { $('#g-ayuda', m).textContent = AYUDA_GASTO[e.target.value]; });
      $('#fGas', m).addEventListener('submit', async (e) => {
        e.preventDefault(); const err = $('#g-err', m), monto = leer($('#g-monto', m)), fecha = $('#g-fecha', m).value;
        if (!(monto > 0)) { err.textContent = 'El valor debe ser mayor que cero.'; return; }
        if (!MC.esFecha(fecha) || fecha > hoy()) { err.textContent = 'Elige una fecha válida (no futura).'; return; }
        const rec = { tipo: $('#g-tipo', m).value, monto, fecha, categoria: $('#g-cat', m).value.trim(), descripcion: $('#g-desc', m).value.trim(), creado: g.creado || Date.now() };
        if (id) rec.id = id;
        await DB.transaccion(['gastos'], (a) => a.put('gastos', rec)); await App.recargar(); cerrar(m); toast('Gasto guardado ✔', 'ok'); App.render();
      });
    });
  }
  App.acciones.nuevoGasto = () => abrirGasto();
  App.acciones.editarGasto = (b) => abrirGasto(+b.dataset.id);
  App.acciones.borrarGasto = async (b) => { if (!(await confirmar({ titulo: 'Eliminar gasto', texto: '¿Eliminar este registro?', ok: 'Eliminar', peligro: true }))) return; await DB.transaccion(['gastos'], (a) => a.del('gastos', +b.dataset.id)); await App.recargar(); toast('Eliminado', 'ok'); App.render(); };

  // ================================================================ INVERSIONES Y ROI
  const TIPOS_INV = { inicial: 'Inversión inicial', aporte: 'Aporte de capital posterior', maquinaria: 'Compra de maquinaria', equipos: 'Compra de equipos', inventario: 'Inventario inicial', otro: 'Otro desembolso de inversión', recuperacion: 'Recuperación de efectivo' };
  const uiI = { desde: null, hasta: null, manual: '', usarManual: false };
  App.vistas.inversiones = () => {
    const h = hoy(), pr = MC.periodo('ano', h); uiI.desde = uiI.desde || pr.desde; uiI.hasta = uiI.hasta || pr.hasta;
    const r = MC.resumenInversiones(S.inversiones);
    const res = MC.resultadoPeriodo({ ventas: S.ventas, gastos: S.gastos, costos: S.costos, desde: uiI.desde, hasta: uiI.hasta, hoy: h });
    const manual = uiI.usarManual ? MC.parseNumero(uiI.manual) : null;
    const benef = uiI.usarManual ? (Number.isNaN(manual) ? null : manual) : res.gananciaNeta;
    const roi = MC.roiContable(benef, r.invertido);
    return `<section class="vista"><div class="titulo"><h2>Inversiones y ROI</h2><button class="btn sm pri" data-a="nuevaInv">＋ Registrar inversión</button></div>
      <div class="grid g2m"><div class="card kpi dor"><div class="lbl">Total invertido</div><div class="val">${MC.fmtCOP(r.invertido)}</div></div>
        <div class="card kpi"><div class="lbl">Recuperado (efectivo)</div><div class="val">${MC.fmtCOP(r.recuperado)}</div></div>
        <div class="card kpi"><div class="lbl">Falta por recuperar</div><div class="val">${MC.fmtCOP(r.falta)}</div>${r.exceso > 0 ? `<div class="ayuda">Ya recuperaste ${MC.fmtCOP(r.exceso)} más de lo invertido</div>` : ''}</div></div>
      <div class="card"><div style="display:flex;justify-content:space-between"><b>Recuperación de la inversión</b><b>${r.pct != null ? MC.fmtPct(Math.min(r.pct, 100)) : PEND}</b></div><div class="barra" style="margin-top:8px"><i style="width:${r.pct != null ? Math.min(100, r.pct) : 0}%"></i></div>
        <div class="nota" style="margin-top:6px">${r.pct == null ? 'Registra al menos una inversión.' : 'Es la recuperación de EFECTIVO: lo que has devuelto al negocio o a ti. No es lo mismo que el ROI.'}</div></div>
      <div class="card form"><h3>ROI contable</h3><div class="sub">ROI = beneficio neto atribuido ÷ inversión total × 100. Nunca se usan las ventas como beneficio.</div>
        <div class="fila2 no-print"><label class="campo">Desde<input class="in" type="date" value="${uiI.desde}" data-c="rangoInv" data-w="desde"></label><label class="campo">Hasta<input class="in" type="date" value="${uiI.hasta}" data-c="rangoInv" data-w="hasta"></label></div>
        <label class="campo no-print">Beneficio atribuido a la inversión<select class="in" data-c="origenBenef"><option value="auto" ${!uiI.usarManual ? 'selected' : ''}>Ganancia neta calculada de ese período</option><option value="manual" ${uiI.usarManual ? 'selected' : ''}>Un valor que yo escribo</option></select></label>
        ${uiI.usarManual ? campo('i-manual', 'Beneficio neto atribuido', { u: '$', v: Number.isNaN(manual) ? null : manual, i: 'benefManual', ph: 'Escríbelo' }) : ''}
        ${roi.ok ? `<div class="alerta ${roi.valor >= 0 ? 'ok' : 'bad'}"><span>ROI del período: <b>${MC.fmtPct(roi.valor)}</b> (beneficio ${MC.fmtCOP(benef)} sobre ${MC.fmtCOP(r.invertido)} invertidos)</span></div>` : `<div class="alerta">ℹ️ <span><b>${PEND}.</b> ${esc(roi.motivo)}${!uiI.usarManual && res.estado !== 'completo' ? ' Para el cálculo automático hacen falta ventas «por producto» con costo conocido en todo el período.' : ''}</span></div>`}</div>
      <div class="card"><h3>Movimientos</h3>${S.inversiones.length ? r.lista.map((m) => `<div class="item"><div class="cuerpo"><b>${esc(m.descripcion || TIPOS_INV[m.tipo])}</b><small>${esc(MC.fechaCorta(m.fecha))} · ${esc(TIPOS_INV[m.tipo])}</small><span class="chip ${m.estado === 'Recuperada' ? 'v' : m.estado === 'Parcial' ? 'a' : ''}">${m.estado}${m.estado === 'Parcial' ? ' ' + MC.fmtPct(m.pct, 0) : ''}</span></div><div class="monto">${MC.fmtCOP(m.valor)}</div><button class="btn sm" data-a="borrarInv" data-id="${m.id}" aria-label="Eliminar">🗑️</button></div>`).join('') + S.inversiones.filter((m) => m.tipo === 'recuperacion').map((m) => `<div class="item"><div class="cuerpo"><b>${esc(m.descripcion || 'Recuperación de efectivo')}</b><small>${esc(MC.fechaCorta(m.fecha))} · Recuperación</small></div><div class="monto pos-txt">${MC.fmtCOP(m.valor)}</div><button class="btn sm" data-a="borrarInv" data-id="${m.id}" aria-label="Eliminar">🗑️</button></div>`).join('') : '<div class="vacio">Aún no has registrado inversiones.</div>'}</div>
      <div class="alerta">ℹ️ <span>Distingue: <b>inversión</b> (maquinaria, capital, inventario inicial), <b>gastos operativos</b> (en Gastos) y <b>pagos de préstamos</b> (en Gastos, no restan utilidad). No registres el mismo dinero en dos lugares.</span></div></section>`;
  };
  App.cambios.rangoInv = (el) => { uiI[el.dataset.w] = el.value; if (uiI.desde > uiI.hasta) { uiI.desde = uiI.hasta; toast('La fecha inicial debe ser anterior a la final.', 'err'); } App.render(); };
  App.cambios.origenBenef = (el) => { uiI.usarManual = el.value === 'manual'; App.render(); };
  App.entradas.benefManual = (el) => { uiI.manual = el.value; };
  App.acciones.nuevaInv = () => modal(`<h2>Registrar inversión</h2><form class="form" id="fInv" novalidate>
    <label class="campo">Tipo<select class="in" id="i-tipo">${Object.keys(TIPOS_INV).map((t) => `<option value="${t}">${TIPOS_INV[t]}</option>`).join('')}</select></label>
    ${campo('i-valor', 'Valor', { u: '$' })}
    <label class="campo">Fecha<input class="in" type="date" id="i-fecha" value="${hoy()}" max="${hoy()}"></label>
    <label class="campo">Descripción<input class="in" id="i-desc" maxlength="120" placeholder="Ej. Tostadora de 5 kg"></label>
    <div class="error" id="i-err" role="alert"></div><div class="acciones"><button type="button" class="btn" data-a="cerrar">Cancelar</button><button class="btn pri" type="submit">Guardar</button></div></form>`, (m) => {
    $('#fInv', m).addEventListener('submit', async (e) => {
      e.preventDefault(); const err = $('#i-err', m), valor = leer($('#i-valor', m)), fecha = $('#i-fecha', m).value;
      if (!(valor > 0)) { err.textContent = 'El valor debe ser mayor que cero.'; return; }
      if (!MC.esFecha(fecha) || fecha > hoy()) { err.textContent = 'Elige una fecha válida (no futura).'; return; }
      await DB.transaccion(['inversiones'], (a) => a.put('inversiones', { tipo: $('#i-tipo', m).value, valor, fecha, descripcion: $('#i-desc', m).value.trim(), creado: Date.now() })); await App.recargar(); cerrar(m); toast('Guardado ✔', 'ok'); App.render();
    });
  });
  App.acciones.borrarInv = async (b) => { if (!(await confirmar({ titulo: 'Eliminar movimiento', texto: '¿Eliminar este registro?', ok: 'Eliminar', peligro: true }))) return; await DB.transaccion(['inversiones'], (a) => a.del('inversiones', +b.dataset.id)); await App.recargar(); toast('Eliminado', 'ok'); App.render(); };

  // ================================================================ INFORMES Y EXPORTACIONES
  const uiR = { tipo: 'ventas_dia', desde: null, hasta: null };
  const INFORMES = {
    ventas_dia: 'Ventas diarias', ventas_detalle: 'Detalle de ventas', semanal: 'Resumen semanal', mensual: 'Resumen mensual', trimestral: 'Resumen trimestral', anual: 'Resumen anual',
    costos: 'Costos por presentación', rentabilidad: 'Rentabilidad por producto', gastos: 'Gastos operativos', evolucion: 'Evolución de los costos', compras: 'Historial de compras', inventario: 'Inventario', inversion: 'Recuperación de la inversión',
  };
  /** Cada informe devuelve { titulo, columnas:[{n,t}], filas:[[valores crudos]], notas:[] } — t: cop, pct, num, txt */
  function construirInforme(tipo, desde, hasta) {
    const h = hoy(), C = (n) => ({ n, t: 'cop' }), T = (n) => ({ n, t: 'txt' }), N = (n) => ({ n, t: 'num' }), P = (n) => ({ n, t: 'pct' });
    const agr = (nivel) => MC.agruparVentas(S.ventas, desde, hasta, nivel);
    switch (tipo) {
      case 'ventas_dia': { const f = agr('dia').filter((b) => b.n > 0); return { titulo: 'Ventas diarias', columnas: [T('Fecha'), N('Ventas'), C('Total vendido')], filas: f.map((b) => [MC.fechaCorta(b.desde), b.n, b.total]), total: [ 'Total', f.reduce((a, b) => a + b.n, 0), f.reduce((a, b) => a + b.total, 0)] }; }
      case 'ventas_detalle': { const f = MC.enRango(S.ventas, desde, hasta).sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.id - b.id)); return { titulo: 'Detalle de ventas', columnas: [T('Fecha'), T('Hora'), T('Referencia'), T('Cliente'), T('Medio de pago'), T('Productos'), C('Monto')], filas: f.map((v) => [MC.fechaCorta(v.fecha), v.hora || '', v.referencia || '', v.cliente || '', MC.MEDIOS[v.medio] || '', (v.items || []).map((i) => `${i.cantidad}× ${i.nombre}`).join('; '), v.monto]), total: ['Total', '', '', '', '', '', f.reduce((a, v) => a + v.monto, 0)] }; }
      case 'semanal': case 'mensual': case 'trimestral': case 'anual': {
        const nivel = { semanal: 'semana', mensual: 'mes', trimestral: 'trimestre', anual: 'ano' }[tipo], f = agr(nivel), tit = INFORMES[tipo];
        const filas = f.map((b) => { const r = MC.resultadoPeriodo({ ventas: S.ventas, gastos: S.gastos, costos: S.costos, desde: b.desde, hasta: b.hasta, hoy: h }); return [b.etiqueta, b.n, b.total, r.gananciaBruta != null && r.estado === 'completo' ? r.gananciaBruta : null, r.gananciaNeta]; });
        return { titulo: tit, columnas: [T('Período'), N('Ventas'), C('Total vendido'), C('Ganancia bruta'), C('Ganancia neta est.')], filas, total: ['Total', f.reduce((a, b) => a + b.n, 0), f.reduce((a, b) => a + b.total, 0), '', ''], notas: ['Ganancia bruta y neta aparecen solo cuando todas las ventas del período tienen costo conocido; si no, la celda queda vacía («Pendiente de datos»).'] };
      }
      case 'costos': { const t = App.tabla(); return { titulo: 'Costos por presentación', columnas: [T('Presentación'), N('Gramos netos'), C('Costo café'), C('Costo bolsa'), C('Costo etiqueta'), C('Otros costos'), C('Costo total unitario'), C('Precio al tendero'), C('Ganancia bruta'), P('Margen bruto'), P('ROI unitario'), C('Precio sugerido público')], filas: t.map((r) => [r.nombre, r.gramos, r.cafe, r.bolsa.ok ? r.bolsa.valor : null, r.etiqueta.ok ? r.etiqueta.valor : null, r.otros.issues.length ? null : r.otros.total, r.total, r.precio, r.ganancia, r.margen.ok ? r.margen.valor : null, r.roi.ok ? r.roi.valor : null, r.precioPublico]), notas: [`Modo de costo del café: ${S.costos.modoCafe === 'comprado' ? 'café tostado y molido comprado' : 'café verde procesado'}.`, 'Celdas vacías = «Pendiente de datos».'] }; }
      case 'rentabilidad': { const r = MC.rentabilidadPorProducto(S.ventas, desde, hasta); return { titulo: 'Rentabilidad por producto', columnas: [T('Producto'), N('Unidades'), C('Ingresos'), C('Costo'), C('Ganancia bruta'), P('Margen bruto')], filas: r.map((p) => [p.nombre, p.unidades, p.ingresos, p.completo ? p.costo : null, p.ganancia, p.margen]), notas: ['Solo incluye ventas registradas «por producto». El costo es el que tenía cada venta cuando se registró.'] }; }
      case 'gastos': { const f = MC.enRango(S.gastos, desde, hasta).sort(MC.porFecha); return { titulo: 'Gastos y otros movimientos', columnas: [T('Fecha'), T('Tipo'), T('Categoría'), T('Descripción'), C('Valor')], filas: f.map((g) => [MC.fechaCorta(g.fecha), TIPOS_GASTO[g.tipo], g.categoria || '', g.descripcion || '', g.monto]), total: ['Total', '', '', '', f.reduce((a, g) => a + g.monto, 0)] }; }
      case 'evolucion': { const f = App.historialFilas().filter((x) => x.fecha >= desde && x.fecha <= hasta); return { titulo: 'Evolución de los costos y precios', columnas: [T('Fecha'), T('Tipo'), T('Concepto'), T('Valor anterior'), T('Valor nuevo'), T('Proveedor'), T('Motivo')], filas: f.map((x) => [MC.fechaCorta(x.fecha), x.tipo, x.etiqueta, App.fmtHistTexto(x.concepto, x.anterior), App.fmtHistTexto(x.concepto, x.nuevo), x.proveedor || '', x.motivo || '']) }; }
      case 'compras': { const a = S.lotesCafe.filter((l) => l.fecha >= desde && l.fecha <= hasta).map((l) => [MC.fechaCorta(l.fecha), l.modo === 'comprado' ? 'Café tostado y molido' : 'Café verde (lote)', l.proveedor || '', l.referencia || '', l.modo === 'comprado' ? l.kg : l.kgUtilizables, l.costoTotal, l.costoKg]); const b = S.compras.filter((c) => c.fecha >= desde && c.fecha <= hasta).map((c) => [MC.fechaCorta(c.fecha), c.tipo === 'bolsas' ? 'Bolsas' : 'Etiquetas', c.proveedor || '', c.referencia || '', c.tipo === 'bolsas' ? c.cantidad : c.utiles, c.costoTotal, c.costoUnit]); return { titulo: 'Historial de compras', columnas: [T('Fecha'), T('Concepto'), T('Proveedor'), T('Referencia'), N('Cantidad (kg o unidades)'), C('Costo total'), C('Costo por kg / unidad')], filas: a.concat(b) }; }
      case 'inventario': { const ex = App.existencias(), f = []; const t = { terminado: 'Producto terminado', cafe: 'Café (kg)', bolsa: 'Bolsas', etiqueta: 'Etiquetas' }; ['terminado', 'cafe', 'bolsa', 'etiqueta'].forEach((it) => ex[it].forEach((x) => f.push([t[it], x.nombre, x.cant]))); return { titulo: 'Inventario al ' + MC.fechaCorta(h), columnas: [T('Tipo'), T('Concepto'), N('Disponible')], filas: f }; }
      case 'inversion': { const r = MC.resumenInversiones(S.inversiones); return { titulo: 'Recuperación de la inversión', columnas: [T('Fecha'), T('Tipo'), T('Descripción'), C('Valor'), C('Recuperado'), T('Estado')], filas: r.lista.map((m) => [MC.fechaCorta(m.fecha), TIPOS_INV[m.tipo], m.descripcion || '', m.valor, m.recuperadoParte, m.estado]), total: ['Total', '', '', r.invertido, r.recuperado, r.pct != null ? MC.fmtPct(r.pct) : ''], notas: [`Falta por recuperar: ${MC.fmtCOP(r.falta)}.`] }; }
    }
    return { titulo: '', columnas: [], filas: [] };
  }
  const fmtCelda = (v, t) => (v === null || v === undefined || v === '' ? '<span class="pend">Pendiente</span>' : t === 'cop' ? cop(v) : t === 'pct' ? MC.fmtPct(v) : t === 'num' ? MC.fmtNumero(v, 3, true) : esc(v));
  const sinPend = (v, t) => (v === null || v === undefined ? '' : v);
  function notasInforme(inf, desde, hasta) {
    return [`Café Mero Campo · Del campo a tu taza`, inf.titulo, `Período analizado: ${MC.fechaCorta(desde)} a ${MC.fechaCorta(hasta)}`, `Generado el: ${MC.fechaHoraBogota()}`, 'Moneda: pesos colombianos (COP)', 'Las cifras de ganancia son estimaciones calculadas con los datos que registraste; las celdas vacías significan «Pendiente de datos».'].concat(inf.notas || []);
  }
  App.vistas.informes = () => {
    const pr = MC.periodo('mes', hoy()); uiR.desde = uiR.desde || pr.desde; uiR.hasta = uiR.hasta || pr.hasta;
    const inf = construirInforme(uiR.tipo, uiR.desde, uiR.hasta);
    const sinRango = ['costos', 'inventario', 'inversion'].includes(uiR.tipo);
    return `<section class="vista"><div class="titulo"><h2>Informes</h2></div>
      <div class="card form no-print"><label class="campo">Informe<select class="in" data-c="tipoInforme">${Object.keys(INFORMES).map((k) => `<option value="${k}" ${uiR.tipo === k ? 'selected' : ''}>${INFORMES[k]}</option>`).join('')}</select></label>
        ${sinRango ? '<div class="nota">Este informe muestra la situación actual; no depende de fechas.</div>' : `<div class="fila2"><label class="campo">Desde<input class="in" type="date" value="${uiR.desde}" data-c="rangoInforme" data-w="desde"></label><label class="campo">Hasta<input class="in" type="date" value="${uiR.hasta}" data-c="rangoInforme" data-w="hasta"></label></div>`}
        <div class="acciones"><button class="btn" data-a="expCSV">⬇ CSV</button><button class="btn" data-a="expXLSX">⬇ Excel</button><button class="btn pri" data-a="expPDF">🖨 PDF</button></div></div>
      <div class="solo-impresion"><h1 style="font-family:Georgia,serif;color:#3b2314;margin:0">Café Mero Campo</h1><div style="color:#9a7a12;font-style:italic">Del campo a tu taza</div><hr></div>
      <div class="card"><h3>${esc(inf.titulo)}</h3>
        <div class="nota">${sinRango ? '' : `Período: ${esc(MC.fechaCorta(uiR.desde))} a ${esc(MC.fechaCorta(uiR.hasta))} · `}Generado el ${esc(MC.fechaHoraBogota())} · Moneda: COP</div>
        ${inf.filas.length ? `<div class="tabla-w" style="margin-top:10px"><table><thead><tr>${inf.columnas.map((c) => `<th class="${c.t === 'txt' ? '' : 'n'}">${esc(c.n)}</th>`).join('')}</tr></thead><tbody>${inf.filas.map((f) => `<tr>${f.map((v, i) => `<td class="${inf.columnas[i].t === 'txt' ? '' : 'n'}">${fmtCelda(v, inf.columnas[i].t)}</td>`).join('')}</tr>`).join('')}${inf.total ? `<tr class="tot">${inf.total.map((v, i) => `<td class="${inf.columnas[i].t === 'txt' ? '' : 'n'}">${typeof v === 'number' ? fmtCelda(v, inf.columnas[i].t) : esc(v)}</td>`).join('')}</tr>` : ''}</tbody></table></div>` : '<div class="vacio">No hay datos para este informe en el período elegido.</div>'}
        <div class="nota" style="margin-top:10px">${(inf.notas || []).map(esc).join('<br>')}<br>Las cifras de ganancia son estimaciones con los datos registrados. «Pendiente» = falta información; no es cero.</div></div></section>`;
  };
  App.cambios.tipoInforme = (el) => { uiR.tipo = el.value; if (['semanal'].includes(el.value)) { uiR.desde = MC.addDias(hoy(), -55); uiR.hasta = hoy(); } if (el.value === 'mensual') { uiR.desde = MC.periodo('ano', hoy()).desde; uiR.hasta = hoy(); } if (el.value === 'trimestral' || el.value === 'anual') { uiR.desde = MC.addDias(MC.periodo('ano', hoy()).desde, el.value === 'anual' ? -730 : -365); uiR.hasta = hoy(); } App.render(); };
  App.cambios.rangoInforme = (el) => { uiR[el.dataset.w] = el.value; if (uiR.desde > uiR.hasta) { toast('La fecha inicial debe ser anterior a la final.', 'err'); uiR.desde = uiR.hasta; } App.render(); };
  const nombreArchivo = (ext) => `CafeMeroCampo_${uiR.tipo}_${hoy()}.${ext}`;
  App.acciones.expCSV = () => { const inf = construirInforme(uiR.tipo, uiR.desde, uiR.hasta); const filas = inf.filas.concat(inf.total ? [inf.total] : []).map((f) => f.map((v) => sinPend(v))); descargar(nombreArchivo('csv'), new Blob([XLSX_MC.csv(inf.columnas.map((c) => c.n), filas, notasInforme(inf, uiR.desde, uiR.hasta))], { type: 'text/csv;charset=utf-8' })); toast('CSV generado ✔', 'ok'); };
  App.acciones.expXLSX = () => { const inf = construirInforme(uiR.tipo, uiR.desde, uiR.hasta); const filas = inf.filas.concat(inf.total ? [inf.total] : []).map((f) => f.map((v) => sinPend(v))); const bytes = XLSX_MC.libro([{ nombre: inf.titulo.slice(0, 28), columnas: inf.columnas.map((c) => c.n), filas, notas: notasInforme(inf, uiR.desde, uiR.hasta) }]); descargar(nombreArchivo('xlsx'), new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); toast('Excel generado ✔', 'ok'); };
  App.acciones.expPDF = () => { toast('En la ventana de impresión elige «Guardar como PDF».'); setTimeout(() => window.print(), 350); };

  // ================================================================ RESPALDO
  function crearRespaldo() {
    const datos = {};
    for (const t of DB.TABLAS) datos[t] = t === 'ventas' ? S.ventas.map((v) => { const c = Object.assign({}, v); delete c.items; return c; }) : S[t];
    return { app: 'cafe-mero-campo', formato: 1, creado: new Date().toISOString(), zona: 'America/Bogota', datos };
  }
  App.crearRespaldo = crearRespaldo;
  App.vistas.respaldo = () => {
    const d = diasRespaldo();
    return `<section class="vista"><div class="titulo"><h2>Copia de seguridad</h2></div>
      <div class="card form"><h3>Crear copia de seguridad</h3><div class="sub">Descarga un archivo con TODOS tus datos (ventas, costos, historial, inventario…) en formato JSON.</div>
        <div class="${d == null || d >= 7 ? 'alerta warn' : 'alerta ok'}">${d == null ? '⚠️ Aún no has creado ninguna copia.' : `Última copia: hace ${d} día(s).`}</div>
        <button class="btn pri block" data-a="hacerRespaldo">💾 Crear copia de seguridad</button></div>
      <div class="card form"><h3>Restaurar una copia</h3><div class="sub">Reemplaza los datos actuales por los de un archivo de copia. Antes se revisa que el archivo sea válido y se te pide confirmación.</div>
        <input type="file" id="archivoRespaldo" accept=".json,application/json" class="in" data-c="archivoRespaldo"></div>
      <div class="card"><h3>¿Dónde están mis datos?</h3><div class="nota" style="line-height:1.55">Esta aplicación guarda los datos <b>solo en este dispositivo</b> (base de datos del navegador). <b>No hay sincronización con otros dispositivos ni copia en la nube.</b><br><br>Si pierdes el teléfono, lo formateas o borras los datos del navegador/aplicación, <b>los datos se pierden</b> a menos que tengas una copia descargada. Por eso:<br>• Crea una copia con frecuencia (la app te avisa si pasan 7 días).<br>• Guarda el archivo fuera del teléfono: envíalo a tu correo, Google Drive o un computador.<br>• Para pasar los datos a otro dispositivo: crea la copia aquí y restáurala allá.</div></div></section>`;
  };
  const diasRespaldo = () => (S.ajustes.ultimoRespaldo ? Math.max(0, MC.difDias(S.ajustes.ultimoRespaldo, hoy())) : null);
  App.acciones.hacerRespaldo = async () => {
    const r = crearRespaldo();
    descargar(`CafeMeroCampo_respaldo_${hoy()}.json`, new Blob([JSON.stringify(r)], { type: 'application/json' }));
    S.ajustes.ultimoRespaldo = hoy(); await App.guardarConfig('ajustes', S.ajustes); await App.recargar();
    toast('Copia creada ✔ Guárdala fuera del teléfono', 'ok'); App.render();
  };
  App.cambios.archivoRespaldo = async (el) => {
    const f = el.files && el.files[0]; if (!f) return;
    if (f.size > 60 * 1024 * 1024) { toast('El archivo es demasiado grande para ser una copia válida.', 'err'); el.value = ''; return; }
    let obj;
    try { obj = JSON.parse(await f.text()); } catch (e) { toast('El archivo no es un JSON válido.', 'err'); el.value = ''; return; }
    const v = MC.validarRespaldo(obj);
    if (!v.ok) { modal(`<h2>No se puede restaurar</h2><p>El archivo no pasó la validación:</p><ul>${v.errores.map((e) => `<li>${esc(e)}</li>`).join('')}</ul><p class="nota">No se cambió ningún dato.</p><div class="acciones"><button class="btn pri" data-a="cerrar">Entendido</button></div>`); el.value = ''; return; }
    const resumen = `${v.resumen.ventas} ventas, ${v.resumen.productos} productos, ${v.resumen.lotesCafe} lotes de café, ${v.resumen.gastos} gastos, ${v.resumen.inversiones} inversiones`;
    const ok = await confirmar({ titulo: 'Restaurar copia de seguridad', html: `Copia creada: <b>${esc(v.creado ? new Date(v.creado).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : 'fecha desconocida')}</b><br>Contiene: ${esc(resumen)}.<br><br><b>Esto reemplazará TODOS los datos actuales</b> (hoy tienes ${S.ventas.length} ventas). Si no estás seguro, crea primero una copia de los datos actuales.`, ok: 'Reemplazar mis datos', peligro: true });
    el.value = ''; if (!ok) return;
    try {
      const datos = obj.datos; datos.ventas = datos.ventas.map((x) => { const c = Object.assign({}, x); delete c.items; return c; });
      await DB.reemplazarTodo(datos); await App.recargar();
      if (!S.costos) await App.sembrar(); // por si la copia no traía configuración de costos
      toast('Datos restaurados ✔', 'ok'); App.render();
    } catch (e) { toast('No se pudo restaurar: ' + e.message + '. Tus datos anteriores no se modificaron.', 'err'); await App.recargar(); }
  };

  // ================================================================ AJUSTES + PIN
  async function hashPin(pin, sal) {
    const texto = sal + ':' + pin;
    if (window.crypto && crypto.subtle) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)); return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join(''); }
    let h = 5381; for (let r = 0; r < 5000; r++) for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) | 0; return 'f' + h;
  }
  App.hashPin = hashPin;
  App.vistas.ajustes = () => {
    const tienePin = !!S.ajustes.pinHash;
    return `<section class="vista"><div class="titulo"><h2>Ajustes</h2></div>
      <div class="card form"><h3>PIN de acceso</h3><div class="sub">Pide un PIN al abrir la aplicación. Evita que otra persona vea tus cifras si usa tu teléfono.</div>
        <div class="alerta ${tienePin ? 'ok' : ''}">${tienePin ? '🔒 El PIN está activado.' : 'El PIN no está activado.'}</div>
        <button class="btn" data-a="cambiarPin">${tienePin ? 'Cambiar PIN' : 'Activar PIN'}</button>${tienePin ? '<button class="btn" data-a="quitarPin">Quitar PIN</button>' : ''}
        <div class="nota">Es un bloqueo de pantalla local, no cifra los datos. Esta aplicación no usa Internet ni cuentas: no hay inicio de sesión remoto. Si olvidas el PIN, restaura una copia de seguridad en un navegador nuevo o borra los datos de la aplicación (se pierden los datos no respaldados).</div></div>
      <div class="card"><h3>Sobre los datos</h3><div class="nota" style="line-height:1.55">Zona horaria: America/Bogota · Moneda: COP · Idioma: español de Colombia.<br>Almacenamiento: ${S.persistente ? 'persistente (el navegador no lo borrará por falta de espacio)' : 'estándar del navegador (puede borrarse si limpias los datos del sitio: haz copias de seguridad)'}.<br>Versión 1.0</div></div>
      <div class="card form"><h3>Borrar todos los datos</h3><div class="sub">Elimina ventas, costos, historial y todo lo demás de este dispositivo. No se puede deshacer.</div><button class="btn rojo" data-a="borrarTodo">Borrar todo…</button></div></section>`;
  };
  const pedirPin = (titulo, texto) => new Promise((res) => {
    const m = modal(`<h2>${esc(titulo)}</h2><p class="nota">${esc(texto)}</p><form class="form" id="fPin" novalidate><input class="in" id="pin1" type="password" inputmode="numeric" maxlength="8" placeholder="PIN (4 a 8 números)" autocomplete="off"><input class="in" id="pin2" type="password" inputmode="numeric" maxlength="8" placeholder="Repite el PIN" autocomplete="off"><div class="error" id="pin-err" role="alert"></div><div class="acciones"><button type="button" class="btn" data-x="no">Cancelar</button><button class="btn pri" type="submit">Guardar</button></div></form>`);
    m.dataset.fijo = '1';
    m.addEventListener('click', (e) => { if (e.target.closest('[data-x]')) { m.remove(); res(null); } });
    $('#fPin', m).addEventListener('submit', (e) => { e.preventDefault(); const a = $('#pin1', m).value, b = $('#pin2', m).value; if (!/^\d{4,8}$/.test(a)) { $('#pin-err', m).textContent = 'El PIN debe tener de 4 a 8 números.'; return; } if (a !== b) { $('#pin-err', m).textContent = 'Los PIN no coinciden.'; return; } m.remove(); res(a); });
  });
  App.acciones.cambiarPin = async () => {
    const pin = await pedirPin('PIN de acceso', 'Elige un PIN que recuerdes.'); if (!pin) return;
    const sal = Math.random().toString(36).slice(2) + Date.now().toString(36);
    S.ajustes.pinSal = sal; S.ajustes.pinHash = await hashPin(pin, sal); await App.guardarConfig('ajustes', S.ajustes); await App.recargar();
    toast('PIN activado ✔', 'ok'); App.actualizarBloqueo(); App.render();
  };
  App.acciones.quitarPin = async () => {
    if (!(await confirmar({ titulo: 'Quitar PIN', texto: '¿Quitar el PIN de acceso?', ok: 'Quitar' }))) return;
    delete S.ajustes.pinHash; delete S.ajustes.pinSal; await App.guardarConfig('ajustes', S.ajustes); await App.recargar(); toast('PIN quitado', 'ok'); App.actualizarBloqueo(); App.render();
  };
  App.acciones.borrarTodo = async () => {
    if (!(await confirmar({ titulo: 'Borrar todos los datos', html: 'Se eliminará <b>todo</b> de este dispositivo. Te recomendamos crear antes una copia de seguridad.', ok: 'Continuar', peligro: true }))) return;
    const m = modal(`<h2>Escribe BORRAR para confirmar</h2><form class="form" id="fB" novalidate><input class="in" id="b-txt" autocomplete="off"><div class="acciones"><button type="button" class="btn" data-a="cerrar">Cancelar</button><button class="btn rojo" type="submit">Borrar todo</button></div></form>`);
    $('#fB', m).addEventListener('submit', async (e) => { e.preventDefault(); if ($('#b-txt', m).value.trim().toUpperCase() !== 'BORRAR') { toast('No coincide. No se borró nada.', 'err'); return; } await DB.borrarTodo(); await App.recargar(); await App.sembrar(); cerrar(m); toast('Datos borrados', 'ok'); location.hash = '#/inicio'; App.render(); });
  };
})();
