/* Café Mero Campo Business Manager — núcleo de la interfaz: estado, utilidades, Inicio, Ventas y Estadísticas. */
(function () {
  'use strict';
  const MC = window.MC, DB = window.DB;
  const S = {
    ventas: [], ventaDetalles: [], productos: [], historialPrecios: [], historialCostos: [], snapshots: [], compras: [], lotesCafe: [],
    produccion: [], inventarioMov: [], gastos: [], inversiones: [], diasSinVentas: [], config: [],
    costos: null, ajustes: {},
    ui: { dash: { kind: 'mes', anchor: null, desde: null, hasta: null }, stats: { kind: 'mes', anchor: null, desde: null, hasta: null, tipo: 'barras', producto: '' }, ventas: { q: '', desde: '', hasta: '', medio: '', limite: 40 }, costosTab: 'cafe', motivo: '', proveedor: '' },
  };
  const App = (window.App = { S, acciones: {}, cambios: {}, entradas: {}, vistas: {}, ocupado: false });

  // ================================================================ Utilidades
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const clonar = (o) => JSON.parse(JSON.stringify(o));
  const hoy = () => MC.hoyISO();
  const numStr = (v) => (v == null || !Number.isFinite(v) ? '' : MC.fmtNumero(v, 4, true));
  /** Lee un campo numérico. '' → null; texto inválido → NaN */
  const leer = (el) => { const t = (el.value || '').trim(); return t === '' ? null : MC.parseNumero(t); };
  const PEND = MC.PENDIENTE;
  const pend = (motivo) => `<span class="pend" title="${esc(motivo || '')}">${PEND}</span>` + (motivo ? `<div class="nota">${esc(motivo)}</div>` : '');
  Object.assign(App, { esc, $, $$, clonar, hoy, numStr, leer, PEND, pend });

  function toast(msg, tipo) {
    const t = document.createElement('div'); t.className = 'toast ' + (tipo || ''); t.textContent = msg; t.setAttribute('role', tipo === 'err' ? 'alert' : 'status');
    $('#toasts').appendChild(t); setTimeout(() => t.remove(), tipo === 'err' ? 6000 : 2800);
  }
  function modal(html, alMontar) {
    const f = document.createElement('div'); f.className = 'modal-fondo';
    f.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    f.addEventListener('mousedown', (e) => { if (e.target === f && !f.dataset.fijo) cerrar(f); });
    $('#modales').appendChild(f);
    const first = $('input:not([type=hidden]),select,textarea', f); if (first && !first.dataset.noFocus && matchMedia('(pointer:fine)').matches) first.focus();
    if (alMontar) alMontar(f);
    return f;
  }
  function cerrar(f) { (f && f.closest ? f.closest('.modal-fondo') : $('#modales .modal-fondo:last-child'))?.remove(); }
  function confirmar(o) {
    return new Promise((res) => {
      const f = modal(`<h2>${esc(o.titulo || 'Confirmar')}</h2><p>${o.html || esc(o.texto || '')}</p>
        <div class="acciones"><button class="btn" data-x="no">${esc(o.cancelar || 'Cancelar')}</button><button class="btn ${o.peligro ? 'rojo' : 'pri'}" data-x="si">${esc(o.ok || 'Aceptar')}</button></div>`);
      f.dataset.fijo = '1';
      f.addEventListener('click', (e) => { const b = e.target.closest('[data-x]'); if (!b) return; f.remove(); res(b.dataset.x === 'si'); });
    });
  }
  function info(titulo, html) { modal(`<h2>${esc(titulo)}</h2><div>${html}</div><div class="acciones" style="margin-top:14px"><button class="btn pri" data-a="cerrar">Entendido</button></div>`); }
  Object.assign(App, { toast, modal, cerrar, confirmar, info });

  // ================================================================ Datos
  async function recargar() {
    const d = await DB.cargarTodo();
    for (const t of DB.TABLAS) S[t] = d[t] || [];
    const porVenta = {};
    for (const x of S.ventaDetalles) (porVenta[x.ventaId] || (porVenta[x.ventaId] = [])).push(x);
    S.ventas.forEach((v) => { v.items = porVenta[v.id] || []; });
    const get = (id) => (S.config.find((c) => c.id === id) || {}).valor;
    S.costos = get('costos') || null; S.ajustes = get('ajustes') || {};
    S.productos.sort((a, b) => a.gramos - b.gramos);
  }
  async function guardarConfig(id, valor) { return DB.transaccion(['config'], (a) => a.put('config', { id, valor })); }
  Object.assign(App, { recargar, guardarConfig });

  const ctxCostos = () => ({ costos: S.costos, lotes: S.lotesCafe, valoracion: S.ajustes.valoracion || 'vigente' });
  const productosActivos = () => S.productos.filter((p) => p.activo);
  const tabla = () => MC.tablaCostos(productosActivos(), ctxCostos());
  const costoDe = (p) => MC.costoProducto(p, ctxCostos());
  /** Costo unitario aplicable a una venta en cierta fecha: usa el registro histórico si existe; nunca inventa. */
  function costoUnitFecha(p, fecha) {
    const snaps = S.snapshots.filter((s) => s.fecha <= fecha).sort(MC.porFecha), ult = snaps[snaps.length - 1];
    if (ult) {
      const it = ult.items.find((i) => i.productoId === p.id);
      if (it && it.completo && MC.esNum(it.total)) return { valor: it.total, fuente: `Costo registrado al ${MC.fechaCorta(ult.fecha)}` };
      if (it && !it.completo) return { valor: null, fuente: 'Pendiente de datos: ese día el costo no estaba completo' };
    }
    const c = costoDe(p);
    if (c.completo) return { valor: c.total, fuente: ult ? 'Costo actual (no hay registro de costos de esa fecha)' : 'Costo actual' };
    return { valor: null, fuente: 'Pendiente de datos: completa los costos en Costos' };
  }
  const inversionTotal = () => MC.resumenInversiones(S.inversiones).invertido;
  const diasDesdeRespaldo = () => (S.ajustes.ultimoRespaldo ? Math.max(0, MC.difDias(S.ajustes.ultimoRespaldo, hoy())) : null);
  Object.assign(App, { ctxCostos, productosActivos, tabla, costoDe, costoUnitFecha, inversionTotal });

  // ================================================================ Snapshots y historial de costos
  function tablaSnapshot() {
    return productosActivos().map((p) => { const c = costoDe(p); return { productoId: p.id, nombre: p.nombre, total: c.total, precio: c.precio, margen: c.margen.ok ? c.margen.valor : null, completo: c.completo }; });
  }
  /** Valores "planos" que se vigilan para el historial de costos y precios. */
  function planos(costos, productos) {
    const m = {};
    const pon = (k, valor, etiqueta, tipo) => { m[k] = { valor, etiqueta, tipo: tipo || 'costo' }; };
    pon('modo', costos.modoCafe === 'comprado' ? 'Café tostado y molido comprado' : 'Café verde procesado', 'Modo de costos del café');
    pon('cafe_kg', costos.cafe.comprado.precioKg, 'Café tostado y molido: precio por kg');
    pon('cafe_proc_fuente', costos.cafe.procesado.fuente, 'Café procesado: fuente del costo');
    pon('cafe_proc_manual', costos.cafe.procesado.costoKgManual, 'Café procesado: costo manual por kg');
    pon('bolsas_kg', costos.bolsas.precioKg, 'Bolsas: precio por kg del material');
    for (const k of Object.keys(costos.bolsas.refs)) {
      const r = costos.bolsas.refs[k];
      pon('bolsa_ref_' + k, r.costoReferencia, `${r.nombre}: costo de referencia por unidad`);
      pon('bolsa_real_' + k, r.costoReal, `${r.nombre}: costo real por unidad`);
      pon('bolsa_peso_' + k, r.pesoG, `${r.nombre}: peso de la bolsa vacía (g)`);
      pon('bolsa_metodo_' + k, r.metodo, `${r.nombre}: método de cálculo`);
    }
    pon('etiq_metro', costos.etiquetas.precioMetro, 'Etiquetas: precio por metro');
    pon('etiq_metodo', costos.etiquetas.metodo, 'Etiquetas: método de cálculo');
    for (const p of productos) {
      pon('etiq_rend_' + p.id, p.etiquetasPorMetro, `Etiquetas por metro de ${p.nombre}`);
      pon('etiq_real_' + p.id, p.etiquetaCostoReal, `Etiqueta ${p.nombre}: costo real por unidad`);
      pon('precio_tienda_' + p.id, p.precioTienda, `${p.nombre}: precio de venta al tendero`, 'precio');
      pon('precio_esp_' + p.id, p.precioEspecial, `${p.nombre}: precio especial por cantidad`, 'precio');
      pon('cant_esp_' + p.id, p.cantEspecial, `${p.nombre}: cantidad mínima del precio especial`, 'precio');
      pon('precio_pub_' + p.id, p.precioPublico, `${p.nombre}: precio sugerido al consumidor`, 'precio');
      pon('gramos_' + p.id, p.gramos, `${p.nombre}: gramos netos de café`, 'costo');
      pon('activo_' + p.id, p.activo ? 'Activo' : 'Inactivo', `${p.nombre}: estado`, 'costo');
    }
    for (const o of costos.otros || []) {
      pon('otro_' + o.id, o.valor, `${o.nombre} (${MC.TIPOS_OTROS[o.tipo] || o.tipo})`);
      pon('otroact_' + o.id, o.activo ? 'Activo' : 'Inactivo', `${o.nombre}: estado`);
    }
    return m;
  }
  const igual = (a, b) => (a == null && b == null) || a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-9);
  function diferencias(antes, despues, meta) {
    const hist = [], prec = [], f = hoy(), ahora = Date.now();
    for (const k of Object.keys(despues)) {
      const a = antes[k], b = despues[k];
      if (a && igual(a.valor, b.valor)) continue;
      if (!a && b.valor == null) continue;
      const e = { fecha: f, creado: ahora, concepto: k, etiqueta: b.etiqueta, anterior: a ? a.valor : null, nuevo: b.valor, proveedor: (meta && meta.proveedor) || '', motivo: (meta && meta.motivo) || '' };
      (b.tipo === 'precio' ? prec : hist).push(e);
    }
    for (const k of Object.keys(antes)) if (!despues[k]) hist.push({ fecha: f, creado: ahora, concepto: k, etiqueta: antes[k].etiqueta + ' (eliminado)', anterior: antes[k].valor, nuevo: null, proveedor: '', motivo: (meta && meta.motivo) || '' });
    return { hist, prec };
  }
  /** Aplica un cambio a costos/productos, lo guarda y registra el historial (valor anterior, nuevo y fecha). Todo en UNA transacción. */
  async function cambiarCostos(mutador, meta) {
    const antes = planos(S.costos, S.productos);
    const costos = clonar(S.costos), productos = clonar(S.productos);
    await mutador(costos, productos);
    const despues = planos(costos, productos);
    const { hist, prec } = diferencias(antes, despues, meta || { motivo: S.ui.motivo, proveedor: S.ui.proveedor });
    const idsNuevos = new Set(productos.map((p) => p.id));
    const cambiosHist = hist.length > 0 || prec.length > 0;
    await DB.transaccion(['config', 'productos', 'historialCostos', 'historialPrecios', 'snapshots'], async (a) => {
      await a.put('config', { id: 'costos', valor: costos });
      for (const p of productos) await a.put('productos', p);
      for (const p of S.productos) if (!idsNuevos.has(p.id)) await a.del('productos', p.id);
      for (const h of hist) await a.put('historialCostos', h);
      for (const h of prec) await a.put('historialPrecios', h);
      if (cambiosHist) {
        const ctx = { costos, lotes: S.lotesCafe, valoracion: S.ajustes.valoracion || 'vigente' };
        const items = productos.filter((p) => p.activo).map((p) => { const c = MC.costoProducto(p, ctx); return { productoId: p.id, nombre: p.nombre, total: c.total, precio: c.precio, margen: c.margen.ok ? c.margen.valor : null, completo: c.completo }; });
        await a.put('snapshots', { fecha: hoy(), creado: Date.now(), items });
      }
    });
    await recargar();
    return { hist, prec };
  }
  Object.assign(App, { cambiarCostos, planos, tablaSnapshot });

  // ================================================================ Ventas: guardar / eliminar
  async function guardarVenta(datos, items, editarId) {
    const previas = S.inventarioMov.filter((m) => !(m.refTipo === 'venta' && m.refId === editarId));
    const nuevos = datos.descuenta ? MC.movimientosVenta(Object.assign({}, datos, { items }), editarId || 0) : [];
    const adv = MC.advertenciasStock(previas, nuevos);
    if (adv.length) {
      const nombres = (k) => { const [, id] = k.split(':'); const p = S.productos.find((x) => String(x.id) === id); return p ? p.nombre : 'producto'; };
      const ok = await confirmar({ titulo: 'Inventario insuficiente', html: adv.map((w) => `Hay <b>${MC.fmtNumero(w.disponible, 0)}</b> unidades de ${esc(nombres(w.clave))} y la venta descuenta más; quedaría en <b>${MC.fmtNumero(w.quedaria, 0)}</b>.`).join('<br>') + '<br><br>¿Registrar la venta de todos modos?', ok: 'Registrar igual' });
      if (!ok) return null;
    }
    const id = await DB.transaccion(['ventas', 'ventaDetalles', 'inventarioMov'], async (a) => {
      const viejo = editarId ? S.ventas.find((v) => v.id === editarId) : null;
      const rec = Object.assign({}, datos, { creado: viejo ? viejo.creado : Date.now(), actualizado: Date.now() });
      let vid = editarId;
      if (editarId) { rec.id = editarId; await a.put('ventas', rec); } else vid = await a.put('ventas', rec);
      for (const d of S.ventaDetalles.filter((x) => x.ventaId === vid)) await a.del('ventaDetalles', d.id);
      for (const it of items) await a.put('ventaDetalles', stripId(Object.assign({}, it, { ventaId: vid })));
      for (const m of S.inventarioMov.filter((x) => x.refTipo === 'venta' && x.refId === vid)) await a.del('inventarioMov', m.id);
      if (datos.descuenta) for (const m of MC.movimientosVenta(Object.assign({}, datos, { items }), vid)) await a.put('inventarioMov', Object.assign(m, { creado: Date.now() }));
      return vid;
    });
    await recargar();
    return id;
  }
  const stripId = (o) => { const c = Object.assign({}, o); delete c.id; return c; };
  async function eliminarVenta(id) {
    await DB.transaccion(['ventas', 'ventaDetalles', 'inventarioMov'], async (a) => {
      await a.del('ventas', id);
      for (const d of S.ventaDetalles.filter((x) => x.ventaId === id)) await a.del('ventaDetalles', d.id);
      for (const m of S.inventarioMov.filter((x) => x.refTipo === 'venta' && x.refId === id)) await a.del('inventarioMov', m.id);
    });
    await recargar();
  }
  Object.assign(App, { guardarVenta, eliminarVenta });

  // ================================================================ Formulario de venta
  const CLIENTES = () => Array.from(new Set(S.ventas.map((v) => v.cliente).filter(Boolean))).sort();
  function lineaHTML(i, l) {
    const prods = productosActivos();
    return `<div class="card linea" data-i="${i}" style="padding:10px">
      <div class="fila2">
        <label class="campo">Producto<select class="in l-prod" data-c="lineaProd"><option value="">Elige…</option>${prods.map((p) => `<option value="${p.id}" ${l.productoId === p.id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></label>
        <label class="campo">Cantidad<input class="in l-cant" inputmode="numeric" value="${l.cantidad || ''}" data-i="lineaCant"></label>
      </div>
      <div class="fila2" style="margin-top:8px">
        <label class="campo">Precio unitario<div class="mon"><input class="in l-precio" inputmode="decimal" value="${numStr(l.precioUnit)}" data-i="lineaPrecio"></div></label>
        <label class="campo">Costo unitario aplicado<div class="mon"><input class="in l-costo" inputmode="decimal" value="${numStr(l.costoUnit)}" placeholder="Pendiente" data-i="lineaCosto"></div></label>
      </div>
      <div class="nota l-fuente" style="margin-top:6px">${esc(l.costoFuente || '')}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px"><b class="l-sub"></b><button type="button" class="btn sm" data-a="quitarLinea">Quitar</button></div>
    </div>`;
  }
  function abrirFormVenta(editar) {
    const v = editar ? S.ventas.find((x) => x.id === editar) : null;
    const tipo = v ? v.tipo : 'rapida';
    const fecha = v ? v.fecha : hoy();
    const f = modal(`<h2>${v ? 'Editar venta' : 'Registrar venta'}</h2>
      <form id="fVenta" class="form" novalidate autocomplete="off">
        <div class="seg" role="tablist"><button type="button" data-a="tipoVenta" data-t="rapida" class="${tipo === 'rapida' ? 'on' : ''}">Por monto total</button><button type="button" data-a="tipoVenta" data-t="detallada" class="${tipo === 'detallada' ? 'on' : ''}">Por producto</button></div>
        <input type="hidden" id="v-tipo" value="${tipo}">
        <div id="bloqueRapida" ${tipo === 'detallada' ? 'hidden' : ''}>
          <label class="campo">Monto total de la venta<span class="ayuda">Registro rápido: se conocen los ingresos, pero no la ganancia real.</span>
          <div class="mon"><input class="in" id="v-monto" inputmode="decimal" placeholder="0" value="${v && tipo === 'rapida' ? numStr(v.monto) : ''}" ${matchMedia('(pointer:fine)').matches ? '' : ''}></div></label>
        </div>
        <div id="bloqueDetalle" ${tipo === 'rapida' ? 'hidden' : ''}>
          <div id="lineas" class="form"></div>
          <button type="button" class="btn block" data-a="agregarLinea" style="margin-top:10px">＋ Agregar producto</button>
          <div class="card" style="margin-top:10px;background:var(--dorado-bg)"><div style="display:flex;justify-content:space-between"><b>Total de la venta</b><b id="v-total">$0</b></div></div>
        </div>
        <div class="fila2">
          <label class="campo">Fecha de la venta<input class="in" type="date" id="v-fecha" value="${fecha}" max="${hoy()}"></label>
          <label class="campo">Hora (opcional)<input class="in" type="time" id="v-hora" value="${v ? esc(v.hora || '') : ''}"></label>
        </div>
        <div class="fila2">
          <label class="campo">Factura o referencia<input class="in" id="v-ref" maxlength="40" value="${v ? esc(v.referencia || '') : ''}"></label>
          <label class="campo">Medio de pago<select class="in" id="v-medio">${Object.keys(MC.MEDIOS).map((k) => `<option value="${k}" ${(v ? v.medio : 'sin_especificar') === k ? 'selected' : ''}>${MC.MEDIOS[k]}</option>`).join('')}</select></label>
        </div>
        <label class="campo">Cliente o establecimiento (opcional)<input class="in" id="v-cliente" maxlength="80" list="lista-clientes" value="${v ? esc(v.cliente || '') : ''}"></label>
        <datalist id="lista-clientes">${CLIENTES().map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
        <label class="campo">Observaciones (opcional)<textarea class="in" id="v-obs" rows="2" maxlength="300">${v ? esc(v.observaciones || '') : ''}</textarea></label>
        <label class="check" id="bloqueDesc" ${tipo === 'rapida' ? 'hidden' : ''}><input type="checkbox" id="v-desc" ${v && v.descuenta ? 'checked' : ''}><span>Descontar estas unidades del inventario de producto terminado<br><small class="nota">Solo se descuenta una vez; al editar o eliminar la venta se ajusta solo.</small></span></label>
        <div class="error" id="v-err" role="alert"></div>
        <div class="acciones"><button type="button" class="btn" data-a="cerrar">Cancelar</button><button type="submit" class="btn pri" id="v-guardar">Guardar venta</button></div>
      </form>`, (m) => {
      const cont = $('#lineas', m);
      const items = v && v.tipo === 'detallada' ? v.items : [];
      (items.length ? items : [{}]).forEach((l, i) => cont.insertAdjacentHTML('beforeend', lineaHTML(i, l)));
      recalcularLineas(m);
      $('#fVenta', m).addEventListener('submit', (e) => { e.preventDefault(); enviarVenta(m, editar); });
    });
    return f;
  }
  function leerLineas(m) {
    return $$('.linea', m).map((el) => ({
      el, productoId: +$('.l-prod', el).value || null, cantidad: leer($('.l-cant', el)), precioUnit: leer($('.l-precio', el)), costoUnit: leer($('.l-costo', el)),
      fuente: $('.l-fuente', el).textContent,
    }));
  }
  function recalcularLineas(m) {
    let total = 0;
    for (const l of leerLineas(m)) {
      const sub = (l.cantidad > 0 && MC.esNum(l.precioUnit) ? l.cantidad * l.precioUnit : 0);
      total += sub; $('.l-sub', l.el).textContent = sub ? 'Subtotal ' + MC.fmtCOP(sub) : '';
    }
    $('#v-total', m).textContent = MC.fmtCOP(total);
  }
  /** Al elegir producto/fecha/cantidad: sugiere precio y costo (el usuario puede cambiarlos). */
  function sugerirLinea(el, m, cambioProducto) {
    const p = S.productos.find((x) => x.id === +$('.l-prod', el).value); if (!p) return;
    const cant = leer($('.l-cant', el)) || 1, fecha = $('#v-fecha', m).value || hoy();
    const precioEl = $('.l-precio', el), costoEl = $('.l-costo', el);
    if (cambioProducto || !precioEl.dataset.manual) { const pr = MC.precioParaCantidad(p, cant); precioEl.value = pr != null ? numStr(pr) : ''; delete precioEl.dataset.manual; }
    if (cambioProducto || !costoEl.dataset.manual) { const c = costoUnitFecha(p, fecha); costoEl.value = c.valor != null ? numStr(Math.round(c.valor * 100) / 100) : ''; $('.l-fuente', el).textContent = c.fuente; delete costoEl.dataset.manual; }
    if (!(p.precioTienda > 0) && cambioProducto) $('.l-fuente', el).textContent += ' · Falta el precio de venta de ' + p.nombre + ' (escríbelo aquí o en Productos).';
  }
  async function enviarVenta(m, editar) {
    if (App.ocupado) return;
    const err = $('#v-err', m), btn = $('#v-guardar', m);
    const tipo = $('#v-tipo', m).value, fecha = $('#v-fecha', m).value;
    let items = [], monto;
    if (tipo === 'rapida') monto = leer($('#v-monto', m));
    else {
      items = leerLineas(m).filter((l) => l.productoId || l.cantidad || l.precioUnit != null).map((l) => {
        const p = S.productos.find((x) => x.id === l.productoId);
        return { productoId: l.productoId, nombre: p ? p.nombre : '', cantidad: l.cantidad, precioUnit: l.precioUnit, costoUnit: MC.esNum(l.costoUnit) ? l.costoUnit : null, costoFuente: l.fuente || '' };
      });
      if (items.some((i) => !i.productoId)) { err.textContent = 'Elige el producto en todas las líneas.'; return; }
      monto = items.reduce((a, i) => a + (i.cantidad > 0 && MC.esNum(i.precioUnit) ? i.cantidad * i.precioUnit : 0), 0);
    }
    if (typeof monto === 'number' && Number.isNaN(monto)) { err.textContent = 'El monto no es un número válido.'; return; }
    const datos = {
      fecha, hora: $('#v-hora', m).value || '', referencia: $('#v-ref', m).value.trim(), cliente: $('#v-cliente', m).value.trim(), medio: $('#v-medio', m).value,
      monto: monto == null ? NaN : monto, observaciones: $('#v-obs', m).value.trim(), tipo, descuenta: tipo === 'detallada' && $('#v-desc', m).checked,
    };
    const errores = MC.validarVenta(Object.assign({}, datos, { items }), hoy());
    if (items.some((i) => Number.isNaN(i.cantidad) || Number.isNaN(i.precioUnit) || Number.isNaN(i.costoUnit))) errores.push('Revisa los números de las líneas.');
    if (datos.referencia && S.ventas.some((v) => v.referencia && v.referencia.toLowerCase() === datos.referencia.toLowerCase() && v.id !== editar)) errores.push(`Ya existe una venta con la referencia «${datos.referencia}».`);
    if (errores.length) { err.textContent = errores[0]; return; }
    if (!editar) { // evita registrar dos veces la misma operación por doble toque
      const huella = [datos.fecha, datos.hora, datos.monto, datos.cliente, datos.referencia, datos.medio].join('|');
      if (App.ultimaHuella && App.ultimaHuella.h === huella && Date.now() - App.ultimaHuella.t < 8000) { err.textContent = 'Esta venta ya se registró hace un momento.'; return; }
    }
    App.ocupado = true; btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const id = await guardarVenta(datos, items, editar);
      if (id == null) { App.ocupado = false; btn.disabled = false; btn.textContent = 'Guardar venta'; return; }
      if (!editar) App.ultimaHuella = { h: [datos.fecha, datos.hora, datos.monto, datos.cliente, datos.referencia, datos.medio].join('|'), t: Date.now() };
      cerrar(m); toast(editar ? 'Venta actualizada ✔' : `Venta registrada: ${MC.fmtCOP(datos.monto)} ✔`, 'ok'); render();
    } catch (e) { err.textContent = 'No se pudo guardar: ' + (e && e.message ? e.message : e); btn.disabled = false; btn.textContent = 'Guardar venta'; }
    App.ocupado = false;
  }
  Object.assign(App, { abrirFormVenta });

  // ================================================================ Definiciones de indicadores
  const DEF = {
    ventas: ['Ventas', 'Dinero que entró por las ventas registradas en el período. <b>No es ganancia</b>: todavía no se han restado los costos.', 'Σ monto de las ventas del período'],
    costo: ['Costo de productos vendidos', 'Lo que costó producir las unidades que vendiste (café + bolsa + etiqueta + otros costos). Solo se conoce con las <b>ventas por producto</b>, que guardan el costo del momento.', 'Σ cantidad × costo unitario aplicado'],
    bruta: ['Ganancia bruta', 'Ventas menos el costo de los productos vendidos. Aún no incluye los gastos operativos.', 'Ventas − costo de productos vendidos'],
    gastos: ['Gastos operativos', 'Gastos de funcionar (transporte, arriendo, servicios…) registrados en Gastos, más los costos mensuales configurados, prorrateados por días.', 'Σ gastos operativos + costos mensuales prorrateados'],
    neta: ['Ganancia neta estimada', 'Lo que realmente queda: ganancia bruta − gastos operativos + otros ingresos − otros gastos. Solo se calcula si TODAS las ventas del período tienen costo conocido.', 'Ganancia bruta − gastos operativos + otros ingresos − otros gastos'],
    mbruto: ['Margen bruto', 'De cada $100 que vendes, cuánto queda después del costo del producto.', 'Ganancia bruta ÷ ventas × 100'],
    mneto: ['Margen neto', 'De cada $100 que vendes, cuánto queda después de TODOS los costos y gastos.', 'Ganancia neta ÷ ventas × 100'],
    roi: ['ROI (retorno de la inversión)', 'Cuánto beneficio neto generaste frente al dinero invertido en el negocio. Usa la ganancia neta, <b>nunca las ventas</b>. Es un ROI contable; no es lo mismo que recuperar el efectivo.', 'Ganancia neta del período ÷ inversión total × 100'],
    trans: ['Transacciones', 'Cantidad de ventas registradas en el período (cada registro cuenta una vez).', 'Número de ventas'],
    comp: ['Comparación con el período anterior', 'Compara las ventas con el período anterior de igual duración. Si el período actual no ha terminado, se compara contra los mismos días del anterior para ser justo.', '(Ventas actuales − anteriores) ÷ anteriores × 100'],
  };
  const info1 = (k) => `<button class="info-btn" data-a="def" data-k="${k}" aria-label="¿Qué significa?">i</button>`;
  App.acciones.def = (b) => { const d = DEF[b.dataset.k]; info(d[0], `<p>${d[1]}</p><code class="formula">${esc(d[2])}</code>`); };
  function kpi(clave, titulo, valor, o) {
    o = o || {};
    return `<div class="card kpi ${o.cls || ''} ${o.pend ? 'pend' : ''}"><div class="lbl">${esc(titulo)} ${info1(clave)}</div><div class="val">${valor}</div>${o.ayuda ? `<div class="ayuda">${o.ayuda}</div>` : ''}</div>`;
  }
  const pendKpi = (motivo) => ({ valor: PEND, o: { pend: true, ayuda: esc(motivo) } });

  // ================================================================ Selector de período (dashboard y estadísticas)
  function selectorPeriodo(ui, ruta, opciones) {
    const kinds = opciones || [['dia', 'Hoy'], ['semana', 'Semana'], ['mes', 'Mes'], ['trimestre', 'Trimestre'], ['ano', 'Año'], ['rango', 'Rango']];
    return `<div class="seg no-print" role="tablist">${kinds.map(([k, t]) => `<button class="${ui.kind === k ? 'on' : ''}" data-a="kind" data-r="${ruta}" data-k="${k}">${t}</button>`).join('')}</div>`;
  }
  function periodoDe(ui) {
    const ancla = ui.anchor || hoy();
    if (ui.kind === 'rango') { const h = ui.hasta || hoy(), d = ui.desde || MC.addDias(h, -29); return MC.periodo('rango', d <= h ? d : h, h); }
    return MC.periodo(ui.kind, ancla);
  }
  function navPeriodo(ui, ruta, pr) {
    if (ui.kind === 'rango') return `<div class="fila2"><label class="campo">Desde<input class="in" type="date" value="${pr.desde}" data-c="rango" data-r="${ruta}" data-w="desde"></label><label class="campo">Hasta<input class="in" type="date" value="${pr.hasta}" data-c="rango" data-r="${ruta}" data-w="hasta"></label></div>`;
    return `<div style="display:flex;align-items:center;gap:8px" class="no-print"><button class="btn sm" data-a="navPeriodo" data-r="${ruta}" data-d="-1" aria-label="Período anterior">◀</button><div style="flex:1;text-align:center;font-weight:700;color:var(--cafe)">${esc(pr.etiqueta)}</div><button class="btn sm" data-a="navPeriodo" data-r="${ruta}" data-d="1" aria-label="Período siguiente">▶</button></div>`;
  }
  const uiDe = (r) => (r === 'dash' ? S.ui.dash : S.ui.stats);
  App.acciones.kind = (b) => { const ui = uiDe(b.dataset.r); ui.kind = b.dataset.k; if (ui.kind !== 'rango') ui.anchor = ui.anchor || hoy(); if (ui.kind === 'rango') { ui.hasta = hoy(); ui.desde = MC.addDias(hoy(), -29); } render(); };
  App.acciones.navPeriodo = (b) => {
    const ui = uiDe(b.dataset.r), d = +b.dataset.d, pr = periodoDe(ui);
    ui.anchor = d < 0 ? MC.addDias(pr.desde, -1) : MC.addDias(pr.hasta, 1); render();
  };
  App.cambios.rango = (el) => { const ui = uiDe(el.dataset.r), pr = periodoDe(ui); ui[el.dataset.w] = el.value || pr[el.dataset.w]; if (ui.desde && ui.hasta && ui.desde > ui.hasta) { toast('La fecha inicial debe ser anterior a la final.', 'err'); ui.desde = ui.hasta; } render(); };

  // ================================================================ INICIO
  function vistaInicio() {
    const h = hoy(), ui = S.ui.dash, pr = periodoDe(ui);
    const fijo = (k) => { const p = MC.periodo(k, h); return MC.sumaVentas(S.ventas, p.desde, p.hasta).total; };
    const res = MC.resultadoPeriodo({ ventas: S.ventas, gastos: S.gastos, costos: S.costos, desde: pr.desde, hasta: pr.hasta, hoy: h });
    const ant = MC.periodoAnteriorComparable(pr, h), totAnt = MC.sumaVentas(S.ventas, ant.desde, ant.hasta).total, cmp = MC.variacion(res.ingresos, totAnt);
    const tb = tabla();
    const inv = inversionTotal();
    const roi = MC.roiContable(res.gananciaNeta, inv);
    const alertas = MC.generarAlertas({ hoy: h, tabla: tb, comparacion: res.nVentas ? cmp : null, resultado: res, historialCostos: S.historialCostos, snapshots: S.snapshots, diasDesdeRespaldo: diasDesdeRespaldo() });

    const sinVentas = S.ventas.length === 0;
    let cards = '';
    const ventasK = kpi('ventas', 'Ventas del período', MC.fmtCOP(res.ingresos), { cls: 'dor', ayuda: res.nVentas ? `${res.nVentas} venta(s)` : 'Sin ventas registradas' });
    cards += ventasK;
    cards += kpi('trans', 'Transacciones', MC.fmtNumero(res.nVentas), {});
    // Costo / ganancia bruta
    const cob = res.cobertura != null ? ` · cubre ${MC.fmtNumero(res.cobertura, 0)}% de las ventas` : '';
    if (res.estado === 'sin_ventas') {
      const p = pendKpi('No hay ventas en este período.');
      ['costo', 'bruta'].forEach((k, i) => { cards += kpi(k, ['Costo de productos vendidos', 'Ganancia bruta'][i], p.valor, p.o); });
    } else if (res.estado === 'sin_detalle') {
      const p = pendKpi('Las ventas están registradas solo por monto. Registra ventas «por producto» para conocer el costo real.');
      ['costo', 'bruta'].forEach((k, i) => { cards += kpi(k, ['Costo de productos vendidos', 'Ganancia bruta'][i], p.valor, p.o); });
    } else {
      cards += kpi('costo', 'Costo de productos vendidos', MC.fmtCOP(res.cogs), { ayuda: res.estado === 'parcial' ? 'Parcial' + cob : 'Costo real guardado en cada venta' });
      cards += kpi('bruta', 'Ganancia bruta', MC.fmtCOP(res.gananciaBruta), { cls: res.gananciaBruta < 0 ? 'neg' : 'pos', ayuda: res.estado === 'parcial' ? 'Parcial' + cob : '' });
    }
    cards += kpi('gastos', 'Gastos operativos', MC.fmtCOP(res.gastosTotalOp), { ayuda: res.costosMensuales > 0 ? `Incluye ${MC.fmtCOP(res.costosMensuales)} de costos mensuales` : (S.gastos.length ? '' : 'Aún no has registrado gastos') });
    if (res.completo) cards += kpi('neta', 'Ganancia neta estimada', MC.fmtCOP(res.gananciaNeta), { cls: res.gananciaNeta < 0 ? 'neg' : 'pos' });
    else { const p = pendKpi(res.estado === 'sin_ventas' ? 'No hay ventas en este período.' : 'Faltan ventas por producto con costo conocido.'); cards += kpi('neta', 'Ganancia neta estimada', p.valor, p.o); }
    cards += res.margenBruto != null ? kpi('mbruto', 'Margen bruto', MC.fmtPct(res.margenBruto), { cls: res.margenBruto < 0 ? 'neg' : '' }) : kpi('mbruto', 'Margen bruto', PEND, { pend: true, ayuda: 'Necesita ventas por producto.' });
    cards += res.margenNeto != null ? kpi('mneto', 'Margen neto', MC.fmtPct(res.margenNeto), { cls: res.margenNeto < 0 ? 'neg' : '' }) : kpi('mneto', 'Margen neto', PEND, { pend: true, ayuda: 'Necesita ventas por producto con costo.' });
    cards += roi.ok ? kpi('roi', 'ROI', MC.fmtPct(roi.valor), { cls: roi.valor < 0 ? 'neg' : 'pos', ayuda: 'Sobre ' + MC.fmtCOP(inv) + ' invertidos' }) : kpi('roi', 'ROI', PEND, { pend: true, ayuda: esc(roi.motivo) });
    let cmpTxt, cmpCls = '';
    if (cmp.estado === 'sin_base') cmpTxt = `<span class="pend">Sin ventas en el período anterior para comparar</span>`;
    else { cmpTxt = `${cmp.abs >= 0 ? '▲' : '▼'} ${MC.fmtPct(Math.abs(cmp.pct))}`; cmpCls = cmp.estado === 'sube' ? 'pos' : cmp.estado === 'baja' ? 'neg' : ''; }
    cards += kpi('comp', 'Comparación con el período anterior', cmpTxt, { cls: cmpCls, ayuda: `Anterior${ant.parcial ? ' (mismos ' + ant.dias + ' días)' : ''}: ${MC.fmtCOP(totAnt)}` });

    const sr = MC.serie(pr.kind === 'dia' ? MC.periodo('rango', MC.addDias(pr.desde, -13), pr.desde) : pr, S.ventas);
    const grafico = sinVentas ? '' : `<div class="card"><h3>Ventas del período</h3>${Charts.dibujar({ labels: sr.labels, series: [{ nombre: 'Ventas', valores: sr.values, color: 'var(--dorado)' }], tipo: 'barras', fmt: MC.fmtCOP, fmtEje: MC.fmtCompacto, altura: 210, tooltips: sr.fechas.map((f, i) => `${MC.fechaCorta(f)}: ${MC.fmtCOP(sr.values[i])}`) })}</div>`;

    return `<section class="vista">
      <div class="card cafe"><div class="lbl">Ventas de hoy · ${esc(MC.fechaLarga(h))}</div><div style="font-size:2rem;font-weight:800;margin-top:4px">${MC.fmtCOP(fijo('dia'))}</div>
        <div class="sub">${MC.sumaVentas(S.ventas, h, h).n} venta(s) hoy</div></div>
      <div class="scroll-x">
        ${[['semana', 'Ventas de la semana', 'Semana en curso'], ['mes', 'Ventas del mes', 'Mes en curso'], ['trimestre', 'Ventas del trimestre', 'Trimestre en curso'], ['ano', 'Ventas del año', 'Año en curso']].map(([k, t, a]) => `<div class="card kpi dor"><div class="lbl">${t} ${info1('ventas')}</div><div class="val">${MC.fmtCOP(fijo(k))}</div><div class="ayuda">${a}</div></div>`).join('')}
      </div>
      <div class="titulo"><h2>Resumen financiero</h2></div>
      ${selectorPeriodo(ui, 'dash')}
      ${navPeriodo(ui, 'dash', pr)}
      ${sinVentas ? `<div class="card vacio"><b>Aún no hay ventas registradas.</b><br>Pulsa «＋ Registrar venta» para empezar. Los indicadores se llenan solos con tus datos reales.</div>` : ''}
      <div class="alertas">${alertas.map((a) => `<div class="alerta ${a.nivel}"><span>${a.nivel === 'bad' ? '⛔' : a.nivel === 'warn' ? '⚠️' : 'ℹ️'}</span><span>${esc(a.texto)}</span></div>`).join('')}</div>
      <div class="grid g4">${cards}</div>
      ${grafico}
      <div class="nota">Las cifras son estimaciones basadas en los datos que registras. Lo que falta aparece como «${PEND}», nunca como cero inventado. Pulsa la <b>i</b> de cada indicador para ver su cálculo.</div>
    </section>`;
  }
  App.vistas.inicio = vistaInicio;

  // ================================================================ VENTAS (historial)
  function ventasFiltradas() {
    const f = S.ui.ventas, q = f.q.trim().toLowerCase(), qn = MC.parseNumero(f.q);
    return S.ventas.filter((v) => {
      if (f.desde && v.fecha < f.desde) return false;
      if (f.hasta && v.fecha > f.hasta) return false;
      if (f.medio && v.medio !== f.medio) return false;
      if (q) {
        const txt = [v.cliente, v.referencia, v.observaciones, v.fecha, MC.fechaCorta(v.fecha), (v.items || []).map((i) => i.nombre).join(' ')].join(' ').toLowerCase();
        if (!txt.includes(q) && !(Number.isFinite(qn) && v.monto === qn)) return false;
      }
      return true;
    }).sort((a, b) => (a.fecha !== b.fecha ? (a.fecha < b.fecha ? 1 : -1) : (b.hora || '').localeCompare(a.hora || '') || b.id - a.id));
  }
  function listaVentas() {
    const lista = ventasFiltradas(), f = S.ui.ventas, total = lista.reduce((a, v) => a + v.monto, 0);
    if (!lista.length) return `<div class="card vacio">${S.ventas.length ? 'Ninguna venta coincide con los filtros.' : 'Todavía no has registrado ventas.'}</div>`;
    const visibles = lista.slice(0, f.limite);
    let diaAnt = '', html = '';
    for (const v of visibles) {
      if (v.fecha !== diaAnt) { diaAnt = v.fecha; const t = MC.sumaVentas(lista, v.fecha, v.fecha); html += `<div style="display:flex;justify-content:space-between;margin-top:10px;font-weight:800;color:var(--cafe2)"><span>${esc(MC.fechaLarga(v.fecha))}</span><span>${MC.fmtCOP(t.total)}</span></div>`; }
      const prod = v.items && v.items.length ? v.items.map((i) => `${i.cantidad}× ${i.nombre}`).join(', ') : '';
      const sinCosto = v.tipo === 'detallada' && v.items.some((i) => !MC.esNum(i.costoUnit));
      html += `<div class="item"><div class="cuerpo"><b>${esc(v.cliente || 'Venta')}</b> ${v.referencia ? `<span class="chip">#${esc(v.referencia)}</span>` : ''}
        <small>${esc(MC.MEDIOS[v.medio] || '')}${v.hora ? ' · ' + esc(v.hora) : ''}${prod ? ' · ' + esc(prod) : ''}</small>
        ${v.observaciones ? `<small>“${esc(v.observaciones)}”</small>` : ''}
        <span class="chip ${v.tipo === 'detallada' ? (sinCosto ? 'a' : 'v') : ''}">${v.tipo === 'detallada' ? (sinCosto ? 'Por producto · costo pendiente' : 'Por producto') : 'Monto total'}</span></div>
        <div style="text-align:right"><div class="monto">${MC.fmtCOP(v.monto)}</div>
        <div style="display:flex;gap:6px;margin-top:6px"><button class="btn sm" data-a="editarVenta" data-id="${v.id}" aria-label="Editar venta">✏️</button><button class="btn sm" data-a="borrarVenta" data-id="${v.id}" aria-label="Eliminar venta">🗑️</button></div></div></div>`;
    }
    return `<div class="card"><div style="display:flex;justify-content:space-between;font-weight:800"><span>${lista.length} venta(s)</span><span>${MC.fmtCOP(total)}</span></div>${html}
      ${lista.length > visibles.length ? `<button class="btn block" style="margin-top:12px" data-a="masVentas">Ver más (${lista.length - visibles.length})</button>` : ''}</div>`;
  }
  function vistaVentas() {
    const f = S.ui.ventas;
    return `<section class="vista"><div class="titulo"><h2>Historial de ventas</h2></div>
      <div class="card form no-print">
        <label class="campo">Buscar<input class="in" id="f-q" type="search" placeholder="Cliente, referencia, producto, monto…" value="${esc(f.q)}" data-i="filtroVentas"></label>
        <div class="fila2"><label class="campo">Desde<input class="in" type="date" id="f-desde" value="${f.desde}" data-c="filtroVentas"></label><label class="campo">Hasta<input class="in" type="date" id="f-hasta" value="${f.hasta}" data-c="filtroVentas"></label></div>
        <label class="campo">Medio de pago<select class="in" id="f-medio" data-c="filtroVentas"><option value="">Todos</option>${Object.keys(MC.MEDIOS).map((k) => `<option value="${k}" ${f.medio === k ? 'selected' : ''}>${MC.MEDIOS[k]}</option>`).join('')}</select></label>
        <button class="btn sm" data-a="limpiarFiltros">Limpiar filtros</button>
      </div>
      <div id="lista-ventas">${listaVentas()}</div></section>`;
  }
  App.vistas.ventas = vistaVentas;
  const leerFiltros = () => { const f = S.ui.ventas; f.q = $('#f-q').value; f.desde = $('#f-desde').value; f.hasta = $('#f-hasta').value; f.medio = $('#f-medio').value; f.limite = 40; };
  App.entradas.filtroVentas = () => { leerFiltros(); $('#lista-ventas').innerHTML = listaVentas(); };
  App.cambios.filtroVentas = App.entradas.filtroVentas;
  App.acciones.limpiarFiltros = () => { Object.assign(S.ui.ventas, { q: '', desde: '', hasta: '', medio: '', limite: 40 }); render(); };
  App.acciones.masVentas = () => { S.ui.ventas.limite += 40; $('#lista-ventas').innerHTML = listaVentas(); };
  App.acciones.editarVenta = (b) => abrirFormVenta(+b.dataset.id);
  App.acciones.borrarVenta = async (b) => {
    const v = S.ventas.find((x) => x.id === +b.dataset.id); if (!v) return;
    const ok = await confirmar({ titulo: 'Eliminar venta', html: `¿Eliminar la venta de <b>${MC.fmtCOP(v.monto)}</b> del ${esc(MC.fechaCorta(v.fecha))}${v.cliente ? ' a ' + esc(v.cliente) : ''}?<br><span class="nota">Se actualizarán los indicadores, los gráficos y el inventario.</span>`, ok: 'Eliminar', peligro: true });
    if (!ok) return;
    try { await eliminarVenta(v.id); toast('Venta eliminada', 'ok'); render(); } catch (e) { toast('No se pudo eliminar: ' + e.message, 'err'); }
  };

  // Eventos del formulario de venta
  App.acciones.tipoVenta = (b) => {
    const m = b.closest('.modal'), t = b.dataset.t; $('#v-tipo', m).value = t;
    $$('.seg button', m).forEach((x) => x.classList.toggle('on', x === b));
    $('#bloqueRapida', m).hidden = t !== 'rapida'; $('#bloqueDetalle', m).hidden = t !== 'detallada'; $('#bloqueDesc', m).hidden = t !== 'detallada';
  };
  App.acciones.agregarLinea = (b) => { const m = b.closest('.modal'), c = $('#lineas', m); c.insertAdjacentHTML('beforeend', lineaHTML(c.children.length, {})); };
  App.acciones.quitarLinea = (b) => { const m = b.closest('.modal'); if ($$('.linea', m).length > 1) b.closest('.linea').remove(); else toast('La venta necesita al menos un producto.'); recalcularLineas(m); };
  App.cambios.lineaProd = (el) => { const m = el.closest('.modal'), l = el.closest('.linea'); if (!$('.l-cant', l).value) $('.l-cant', l).value = '1'; sugerirLinea(l, m, true); recalcularLineas(m); };
  App.entradas.lineaCant = (el) => { const m = el.closest('.modal'), l = el.closest('.linea'); sugerirLinea(l, m, false); recalcularLineas(m); };
  App.entradas.lineaPrecio = (el) => { el.dataset.manual = '1'; recalcularLineas(el.closest('.modal')); };
  App.entradas.lineaCosto = (el) => { el.dataset.manual = '1'; $('.l-fuente', el.closest('.linea')).textContent = 'Costo escrito por ti'; };
  App.cambios.fechaVenta = (el) => { const m = el.closest('.modal'); $$('.linea', m).forEach((l) => sugerirLinea(l, m, false)); };

  // ================================================================ ESTADÍSTICAS
  function vistaStats() {
    const ui = S.ui.stats, h = hoy();
    const pr = periodoDe(ui);
    const prodId = +ui.producto || 0;
    const prodSel = prodId ? S.productos.find((p) => p.id === prodId) : null;
    const sinDetalle = prodId && !S.ventas.some((v) => (v.items || []).some((i) => i.productoId === prodId));
    const prSerie = pr.kind === 'dia' ? MC.periodo('rango', MC.addDias(pr.desde, -13), pr.desde) : pr;
    const sr = MC.serie(prSerie, S.ventas, prodId || null);
    const ant = MC.periodoAnteriorComparable(pr, h), totalAct = MC.sumaVentas(S.ventas, pr.desde, pr.hasta, prodId || null), totalAnt = MC.sumaVentas(S.ventas, ant.desde, ant.hasta, prodId || null);
    const cmp = MC.variacion(totalAct.total, totalAnt.total);
    const nombreAnt = { dia: 'día anterior', semana: 'semana anterior', mes: 'mes anterior', trimestre: 'trimestre anterior', ano: 'año anterior', rango: 'período anterior' }[pr.kind];
    const prom = MC.promedios(S.ventas, pr.desde, pr.hasta, h, S.diasSinVentas.map((d) => d.fecha));
    const cl = MC.clasificarDias(pr.desde, pr.hasta, h, MC.enRango(S.ventas, pr.desde, pr.hasta), S.diasSinVentas.map((d) => d.fecha));
    const top = MC.topDias(S.ventas, pr.desde, pr.hasta, 5, prodId || null);
    // Ventas vs costos vs ganancia por tramo (solo si todas las ventas del tramo tienen costo)
    const tramos = pr.kind === 'trimestre' || pr.kind === 'ano' ? MC.agruparVentas(S.ventas, pr.desde, pr.hasta, 'mes') : MC.listarDias(prSerie.desde, prSerie.hasta).map((d) => ({ etiqueta: String(MC.parseISO(d).d), desde: d, hasta: d }));
    const comp = tramos.map((t) => ({ t, r: MC.resultadoPeriodo({ ventas: S.ventas, gastos: S.gastos, costos: S.costos, desde: t.desde, hasta: t.hasta, hoy: h }) })).filter((x) => x.r.completo);
    const graficoCostos = comp.length >= 1 ? Charts.dibujar({ labels: comp.map((x) => x.t.etiqueta), series: [{ nombre: 'Ventas', valores: comp.map((x) => x.r.ingresos), color: 'var(--dorado)' }, { nombre: 'Costo', valores: comp.map((x) => x.r.cogs), color: 'var(--cafe-claro)' }, { nombre: 'Ganancia bruta', valores: comp.map((x) => x.r.gananciaBruta), color: 'var(--verde)' }], tipo: 'barras', fmt: MC.fmtCOP, fmtEje: MC.fmtCompacto, altura: 240 }) : '';
    const porProd = MC.rentabilidadPorProducto(S.ventas, pr.desde, pr.hasta);
    const selectores = (() => {
      if (ui.kind === 'dia') return `<label class="campo">Día<input class="in" type="date" value="${ui.anchor || h}" max="${h}" data-c="anclaStats"></label>`;
      if (ui.kind === 'semana') return `<label class="campo">Cualquier día de la semana<input class="in" type="date" value="${ui.anchor || h}" data-c="anclaStats"></label>`;
      const p = MC.parseISO(ui.anchor || h), anios = []; for (let y = p.y - 5; y <= MC.parseISO(h).y + 1; y++) anios.push(y);
      const selA = `<label class="campo">Año<select class="in" data-c="anioStats">${anios.map((y) => `<option ${y === p.y ? 'selected' : ''}>${y}</option>`).join('')}</select></label>`;
      const selM = `<label class="campo">Mes<select class="in" data-c="mesStats">${MC.MESES.map((n, i) => `<option value="${i + 1}" ${i + 1 === p.m ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
      const selQ = `<label class="campo">Trimestre<select class="in" data-c="trimStats">${[1, 2, 3, 4].map((q) => `<option value="${q}" ${q === Math.floor((p.m - 1) / 3) + 1 ? 'selected' : ''}>Trimestre ${q}</option>`).join('')}</select></label>`;
      if (ui.kind === 'mes') return `<div class="fila2">${selM}${selA}</div>`;
      if (ui.kind === 'trimestre') return `<div class="fila2">${selQ}${selA}</div>`;
      if (ui.kind === 'ano') return selA;
      return '';
    })();
    const cmpHtml = cmp.estado === 'sin_base' ? `<span class="pend">Sin datos del ${nombreAnt} para comparar</span>` : `<b class="${cmp.estado === 'sube' ? 'pos-txt' : cmp.estado === 'baja' ? 'neg-txt' : ''}">${cmp.abs >= 0 ? '▲' : '▼'} ${MC.fmtPct(Math.abs(cmp.pct))}</b> frente al ${nombreAnt}`;
    return `<section class="vista">
      <div class="titulo"><h2>Estadísticas</h2></div>
      ${selectorPeriodo(S.ui.stats, 'stats', [['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes'], ['trimestre', 'Trimestre'], ['ano', 'Año'], ['rango', 'Rango']])}
      <div class="card form no-print">${navPeriodo(ui, 'stats', pr)}${selectores}
        <div class="fila2"><label class="campo">Producto<select class="in" data-c="prodStats"><option value="">Todas las ventas</option>${S.productos.map((p) => `<option value="${p.id}" ${prodId === p.id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></label>
        <label class="campo">Tipo de gráfico<select class="in" data-c="tipoStats"><option value="barras" ${ui.tipo === 'barras' ? 'selected' : ''}>Barras</option><option value="lineas" ${ui.tipo === 'lineas' ? 'selected' : ''}>Líneas</option></select></label></div></div>
      <div class="card">
        <div class="lbl sub">${esc(pr.etiqueta)}${prodSel ? ' · ' + esc(prodSel.nombre) : ''}</div>
        <div style="font-size:1.7rem;font-weight:800;color:var(--cafe)">${MC.fmtCOP(totalAct.total)}</div>
        <div class="sub">${totalAct.n} venta(s) · ${cmpHtml}</div>
        <div class="sub">${esc(nombreAnt[0].toUpperCase() + nombreAnt.slice(1))}${ant.parcial ? ` (primeros ${ant.dias} días)` : ''}: ${MC.fmtCOP(totalAnt.total)}</div>
        ${sinDetalle ? `<div class="alerta" style="margin-top:8px">ℹ️ Aún no hay ventas «por producto» de ${esc(prodSel.nombre)}. El filtro por producto solo cuenta ventas detalladas.</div>` : ''}
        ${pr.kind === 'dia' ? '<div class="nota">El gráfico muestra los 14 días que terminan en la fecha elegida.</div>' : ''}
        ${Charts.dibujar({ labels: sr.labels, series: [{ nombre: 'Ventas', valores: sr.values, color: 'var(--dorado)' }], tipo: ui.tipo, fmt: MC.fmtCOP, fmtEje: MC.fmtCompacto, titulo: 'Ventas', tooltips: sr.fechas.map((f, i) => `${MC.fechaCorta(f)}: ${MC.fmtCOP(sr.values[i])} (${sr.conteos[i]} venta${sr.conteos[i] === 1 ? '' : 's'})`) })}
      </div>
      <div class="grid g2m">
        <div class="card"><h3>Promedio diario</h3>
          <div style="font-size:1.3rem;font-weight:800">${prom.porDiaConInfo != null ? MC.fmtCOP(prom.porDiaConInfo) : PEND}</div>
          <div class="nota">${prom.porDiaConInfo != null ? `Sobre ${prom.diasInfo} día(s) con información (ventas o «sin ventas» confirmado).` : 'Aún no hay días con información en este período.'}</div>
          ${prom.porDiaConVentas != null ? `<div class="sub">Promedio solo de días con ventas: ${MC.fmtCOP(prom.porDiaConVentas)}</div>` : ''}</div>
        <div class="card"><h3>Días del período</h3>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0"><span class="chip v">${cl.conVentas} con ventas</span><span class="chip">${cl.sinVentas} sin ventas (confirmados)</span><span class="chip a">${cl.sinInfo} sin información</span>${cl.futuros ? `<span class="chip">${cl.futuros} por venir</span>` : ''}</div>
          <div class="nota">«Sin información» significa que no registraste nada: no se asume que fue cero. Si ese día no vendiste, confírmalo.</div>
          ${cl.sinInfo ? `<button class="btn sm no-print" style="margin-top:8px" data-a="marcarSinVentas">Confirmar días sin ventas</button>` : ''}</div>
      </div>
      <div class="card"><h3>Días con mayores ventas</h3>${top.length ? `<div class="tabla-w" style="margin-top:8px"><table><thead><tr><th>Fecha</th><th class="n">Total</th><th class="n">Ventas</th></tr></thead><tbody>${top.map((t) => `<tr><td>${esc(MC.fechaLarga(t.fecha))}</td><td class="n">${MC.fmtCOP(t.total)}</td><td class="n">${t.n}</td></tr>`).join('')}</tbody></table></div>` : '<div class="vacio">Sin ventas en este período.</div>'}</div>
      <div class="card"><h3>Ventas, costos y ganancias</h3>${graficoCostos || `<div class="vacio">${pend('Se necesitan ventas «por producto» con costo conocido en este período para comparar ventas, costos y ganancias.')}</div>`}</div>
      <div class="card"><h3>Rentabilidad por producto</h3>${porProd.length ? `<div class="tabla-w" style="margin-top:8px"><table><thead><tr><th>Producto</th><th class="n">Unid.</th><th class="n">Ingresos</th><th class="n">Costo</th><th class="n">Ganancia</th><th class="n">Margen</th></tr></thead><tbody>${porProd.map((p) => `<tr><td>${esc(p.nombre)}</td><td class="n">${MC.fmtNumero(p.unidades, 0)}</td><td class="n">${MC.fmtCOP(p.ingresos)}</td><td class="n">${p.completo ? MC.fmtCOP(p.costo) : '<span class="pend">Pendiente</span>'}</td><td class="n ${p.ganancia != null && p.ganancia < 0 ? 'neg-txt' : ''}">${p.completo ? MC.fmtCOP(p.ganancia) : '<span class="pend">Pendiente</span>'}</td><td class="n">${p.margen != null ? MC.fmtPct(p.margen) : '—'}</td></tr>`).join('')}</tbody></table></div>` : `<div class="vacio">${pend('Registra ventas «por producto» para ver la rentabilidad de cada presentación.')}</div>`}</div>
    </section>`;
  }
  App.vistas.stats = vistaStats;
  const setAncla = (f) => { S.ui.stats.anchor = f; render(); };
  App.cambios.anclaStats = (el) => { if (MC.esFecha(el.value)) setAncla(el.value); };
  const ymd = (y, m) => MC.periodo('mes', `${y}-${String(m).padStart(2, '0')}-01`).desde;
  App.cambios.anioStats = (el) => { const p = MC.parseISO(S.ui.stats.anchor || hoy()); setAncla(ymd(+el.value, p.m)); };
  App.cambios.mesStats = (el) => { const p = MC.parseISO(S.ui.stats.anchor || hoy()); setAncla(ymd(p.y, +el.value)); };
  App.cambios.trimStats = (el) => { const p = MC.parseISO(S.ui.stats.anchor || hoy()); setAncla(ymd(p.y, (+el.value - 1) * 3 + 1)); };
  App.cambios.prodStats = (el) => { S.ui.stats.producto = el.value; render(); };
  App.cambios.tipoStats = (el) => { S.ui.stats.tipo = el.value; render(); };
  App.acciones.marcarSinVentas = () => {
    const pr = periodoDe(S.ui.stats), h = hoy(), con = new Set(S.ventas.map((v) => v.fecha)), cero = new Set(S.diasSinVentas.map((d) => d.fecha));
    const dias = MC.listarDias(pr.desde, pr.hasta).filter((d) => d <= h && !con.has(d) && !cero.has(d));
    modal(`<h2>Confirmar días sin ventas</h2><p class="nota">Marca solo los días en que de verdad no vendiste. Los demás seguirán como «sin información».</p>
      <div style="max-height:46vh;overflow:auto">${dias.map((d) => `<label class="check" style="padding:8px 0"><input type="checkbox" value="${d}"><span>${esc(MC.fechaLarga(d))}</span></label>`).join('')}</div>
      <div class="acciones" style="margin-top:12px"><button class="btn" data-a="marcarTodos">Marcar todos</button><button class="btn pri" data-a="guardarSinVentas">Guardar</button></div>`);
  };
  App.acciones.marcarTodos = (b) => $$('input[type=checkbox]', b.closest('.modal')).forEach((c) => { c.checked = true; });
  App.acciones.guardarSinVentas = async (b) => {
    const m = b.closest('.modal'), fechas = $$('input:checked', m).map((c) => c.value);
    if (!fechas.length) { cerrar(m); return; }
    await DB.transaccion(['diasSinVentas'], async (a) => { for (const f of fechas) await a.put('diasSinVentas', { fecha: f, creado: Date.now() }); });
    await recargar(); cerrar(m); toast(`${fechas.length} día(s) confirmados sin ventas`, 'ok'); render();
  };

  // ================================================================ Router y eventos globales
  function rutaActual() { return (location.hash.replace(/^#\/?/, '') || 'inicio').split('?')[0]; }
  function render() {
    const r = rutaActual(), v = App.vistas[r] || App.vistas.inicio;
    const principal = { inicio: 'inicio', ventas: 'ventas', stats: 'stats', costos: 'costos' }[r] || 'mas';
    $$('#nav a').forEach((a) => a.classList.toggle('act', a.dataset.r === principal));
    $('#fabVenta').hidden = !['inicio', 'ventas'].includes(r);
    const y = window.scrollY;
    $('#app').innerHTML = v();
    Charts.activar($('#app'));
    if (App.alMontar && App.alMontar[r]) App.alMontar[r]();
    window.scrollTo(0, App.mantenerScroll ? y : 0); App.mantenerScroll = false;
  }
  App.render = render; App.renderConScroll = () => { App.mantenerScroll = true; render(); };
  App.acciones.cerrar = (b) => cerrar(b);

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const fn = App.acciones[b.dataset.a]; if (fn) { e.preventDefault(); Promise.resolve(fn(b, e)).catch((err) => { console.error(err); toast('Ocurrió un error: ' + (err && err.message ? err.message : err), 'err'); }); }
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-c]'); if (!el) return;
    const fn = App.cambios[el.dataset.c]; if (fn) Promise.resolve(fn(el, e)).catch((err) => { console.error(err); toast('Ocurrió un error: ' + (err && err.message ? err.message : err), 'err'); });
    if (el.id === 'v-fecha') App.cambios.fechaVenta(el);
  });
  document.addEventListener('input', (e) => {
    const el = e.target.closest('[data-i]'); if (!el) return;
    const fn = App.entradas[el.dataset.i]; if (fn) fn(el, e);
  });
  window.addEventListener('hashchange', render);
  $('#fabVenta').addEventListener('click', () => abrirFormVenta());
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
})();
