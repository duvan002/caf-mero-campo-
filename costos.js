/* Centro de costos y Productos: TODO editable desde la pantalla. Los cambios se guardan al salir de cada campo,
 * dejan registro (valor anterior, valor nuevo, fecha) y actualizan los cálculos al instante. */
(function () {
  'use strict';
  const MC = window.MC, DB = window.DB, App = window.App, S = App.S;
  const { esc, $, $$, numStr, leer, toast, modal, cerrar, confirmar, pend, PEND } = App;
  const hoy = () => MC.hoyISO();
  const cop = (v, d) => MC.fmtCOP(v, { dec: d == null ? 2 : d });

  // ================================================================ Campos editables
  function campoNum(lbl, clave, valor, o) {
    o = o || {};
    return `<label class="campo">${lbl}${o.ayuda ? `<span class="ayuda">${o.ayuda}</span>` : ''}<div class="${o.u ? 'u' : 'mon'}" ${o.u ? `data-u="${o.u}"` : ''}><input class="in" inputmode="decimal" data-c="costo" data-k="${clave}" data-t="num" value="${numStr(valor)}" placeholder="${esc(o.ph || 'Escríbelo')}" aria-label="${esc(o.aria || lbl.replace(/<[^>]+>/g, ''))}"></div></label>`;
  }
  function campoSel(lbl, clave, valor, opciones, o) {
    return `<label class="campo">${lbl}${o && o.ayuda ? `<span class="ayuda">${o.ayuda}</span>` : ''}<select class="in" data-c="costo" data-k="${clave}" data-t="txt">${opciones.map(([v, t]) => `<option value="${esc(v)}" ${String(valor) === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  }
  function campoTxt(lbl, clave, valor) {
    return `<label class="campo">${lbl}<input class="in" data-c="costo" data-k="${clave}" data-t="txt" value="${esc(valor || '')}" maxlength="40"></label>`;
  }

  /** Aplica el valor a la ruta indicada dentro de costos/productos. Devuelve un error de texto si no es válido. */
  function asignar(costos, productos, clave, v) {
    const p = clave.split('.'), prod = (id) => productos.find((x) => x.id === +id);
    const num = (min, exclusivo) => (v == null || (typeof v === 'number' && (exclusivo ? v > min : v >= min)));
    switch (p[0]) {
      case 'cafe':
        if (p[1] === 'precioKg') { if (!num(0)) return 'El precio no puede ser negativo.'; costos.cafe.comprado.precioKg = v; costos.cafe.comprado.actualizado = hoy(); costos.cafe.comprado.referencia = false; }
        else if (p[1] === 'procManual') { if (!num(0)) return 'El costo no puede ser negativo.'; costos.cafe.procesado.costoKgManual = v; }
        else if (p[1] === 'procFuente') costos.cafe.procesado.fuente = v;
        break;
      case 'bolsas': if (!num(0)) return 'El precio no puede ser negativo.'; costos.bolsas.precioKg = v; costos.bolsas.actualizado = hoy(); break;
      case 'bolsa': {
        const r = costos.bolsas.refs[p[2]]; if (!r) return 'Tipo de bolsa desconocido.';
        if (p[1] === 'metodo') r.metodo = v;
        else { if (!num(0, p[1] === 'peso')) return p[1] === 'peso' ? 'El peso debe ser mayor que cero.' : 'El costo no puede ser negativo.'; r[{ ref: 'costoReferencia', real: 'costoReal', peso: 'pesoG' }[p[1]]] = v; }
        break;
      }
      case 'etiq':
        if (p[1] === 'metro') { if (!num(0)) return 'El precio no puede ser negativo.'; costos.etiquetas.precioMetro = v; costos.etiquetas.actualizado = hoy(); }
        else if (p[1] === 'metodo') costos.etiquetas.metodo = v;
        else if (p[1] === 'rend') { if (!num(0, true)) return 'Las etiquetas por metro deben ser más de cero.'; prod(p[2]).etiquetasPorMetro = v; }
        else if (p[1] === 'real') { if (!num(0)) return 'El costo no puede ser negativo.'; prod(p[2]).etiquetaCostoReal = v; }
        break;
      case 'prod': {
        const x = prod(p[1]); if (!x) return 'Producto no encontrado.';
        const f = p[2];
        if (f === 'nombre') { if (!v || !String(v).trim()) return 'El nombre no puede quedar vacío.'; x.nombre = String(v).trim(); }
        else if (f === 'bolsaRef') x.bolsaRef = v;
        else if (f === 'activo') x.activo = v === true || v === 'true';
        else if (f === 'gramos') { if (!num(0, true)) return 'Los gramos deben ser más de cero.'; x.gramos = v; }
        else { if (!num(0)) return 'El valor no puede ser negativo.'; x[f] = v; }
        break;
      }
      default: return 'Campo desconocido.';
    }
    return null;
  }
  let cola = Promise.resolve();
  /** Guarda un campo editado (se pone en cola para que dos cambios seguidos nunca se pisen). */
  App.cambios.costo = (el) => {
    const clave = el.dataset.k, tipo = el.dataset.t;
    let v;
    if (tipo === 'num') { v = leer(el); if (typeof v === 'number' && Number.isNaN(v)) { toast('Eso no es un número válido. Ejemplo: 26.000 o 40,34', 'err'); el.classList.add('err'); return; } }
    else v = el.value;
    el.classList.remove('err');
    cola = cola.then(async () => {
      let errorValidacion = null;
      const antes = App.planos(S.costos, S.productos);
      try {
        const r = await App.cambiarCostos((c, ps) => { errorValidacion = asignar(c, ps, clave, v); if (errorValidacion) throw new Error(errorValidacion); });
        const cambio = r.hist.concat(r.prec)[0];
        if (cambio) toast('Guardado ✔  ' + (cambio.anterior != null && typeof cambio.anterior === 'number' ? `(antes ${MC.fmtNumero(cambio.anterior, 4, true)})` : ''), 'ok');
        if (tipo === 'num') el.value = numStr(v);
        if (/^(cafe\.procFuente|bolsa\.metodo|etiq\.metodo|prod\..*\.(activo|bolsaRef))/.test(clave)) App.renderConScroll(); else refrescarVivo();
        void antes;
      } catch (e) {
        toast(e.message, 'err'); el.classList.add('err');
      }
    });
    return cola;
  };

  // ================================================================ Partes "vivas" (se recalculan al cambiar cualquier dato)
  const claseNeg = (v) => (v != null && v < 0 ? 'neg-txt' : '');
  const celda = (r, v, f) => (r.completo || v != null ? f(v) : '<span class="pend">Pendiente</span>');

  function tablaCentral() {
    const rows = App.tabla();
    const faltan = Array.from(new Set(rows.flatMap((r) => r.faltan)));
    const filas = rows.map((r) => {
      const p = S.productos.find((x) => x.id === r.productoId);
      const refBolsa = r.bolsa.ok && r.bolsa.metodo === 'referencia' ? ' <small class="nota" title="Costo de referencia, editable en Costos → Bolsas">ref.</small>' : '';
      return `<tr>
        <td><b>${esc(r.nombre)}</b></td><td class="n">${MC.fmtNumero(r.gramos, 0)} g</td>
        <td class="n">${r.cafe != null ? cop(r.cafe) : '<span class="pend">Pendiente</span>'}</td>
        <td class="n">${r.bolsa.ok ? cop(r.bolsa.valor) + refBolsa : '<span class="pend">Pendiente</span>'}</td>
        <td class="n">${r.etiqueta.ok ? cop(r.etiqueta.valor) : '<span class="pend">Pendiente</span>'}</td>
        <td class="n">${r.otros.issues.length ? '<span class="pend">Pendiente</span>' : cop(r.otros.total)}</td>
        <td class="n"><b>${r.total != null ? cop(r.total) : '<span class="pend">Pendiente</span>'}</b></td>
        <td class="n">${r.precio != null ? MC.fmtCOP(r.precio) : '<span class="pend">Pendiente</span>'}</td>
        <td class="n ${claseNeg(r.ganancia)}">${r.ganancia != null ? cop(r.ganancia) : '<span class="pend">Pendiente</span>'}</td>
        <td class="n ${claseNeg(r.margen.valor)}" title="${esc(r.margen.motivo || '')}">${r.margen.ok ? MC.fmtPct(r.margen.valor) : '<span class="pend">No calculable</span>'}</td>
        <td class="n ${claseNeg(r.roi.valor)}" title="${esc(r.roi.motivo || '')}">${r.roi.ok ? MC.fmtPct(r.roi.valor) : '<span class="pend">No calculable</span>'}</td>
        <td class="n">${r.precioPublico != null ? MC.fmtCOP(r.precioPublico) : '<span class="pend">—</span>'}</td></tr>`;
    }).join('');
    return `<div class="tabla-w"><table><thead><tr><th>Presentación</th><th class="n">Café neto</th><th class="n">Costo café</th><th class="n">Costo bolsa</th><th class="n">Costo etiqueta</th><th class="n">Otros costos</th><th class="n">Costo total unitario</th><th class="n">Precio al tendero</th><th class="n">Ganancia bruta</th><th class="n">Margen bruto</th><th class="n">ROI unitario</th><th class="n">Precio sugerido público</th></tr></thead><tbody>${filas || '<tr><td colspan="12" class="vacio">No hay presentaciones activas.</td></tr>'}</tbody></table></div>
      ${faltan.length ? `<div class="alertas" style="margin-top:10px">${faltan.map((f) => `<div class="alerta">ℹ️ <span>${esc(f)}</span></div>`).join('')}</div>` : ''}`;
  }
  function resumenCafe() {
    const comprado = MC.costoCafeKg(Object.assign({}, S.costos, { modoCafe: 'comprado' }), S.lotesCafe, S.ajustes.valoracion || 'vigente');
    const procesado = MC.costoCafeKg(Object.assign({}, S.costos, { modoCafe: 'procesado' }), S.lotesCafe, S.ajustes.valoracion || 'vigente');
    const act = MC.costoCafeKg(S.costos, S.lotesCafe, S.ajustes.valoracion || 'vigente');
    const cmp = MC.compararCafe(comprado.ok ? comprado.valor : null, procesado.ok ? procesado.valor : null);
    const filas = S.productos.map((p) => `<tr><td>${esc(p.nombre)}</td><td class="n">${MC.fmtNumero(p.gramos, 0)} g</td><td class="n">${act.ok ? cop((p.gramos / 1000) * act.valor) : '<span class="pend">Pendiente</span>'}</td></tr>`).join('');
    return `${act.ok ? `<div class="sub">Costo usado ahora: <b>${MC.fmtCOP(act.valor)}</b>/kg · ${MC.fmtCOP(act.valor / 1000, 2)}/g<br>${esc(act.fuente)}</div>` : `<div class="alerta">ℹ️ ${esc(act.motivo)}</div>`}
      <div class="tabla-w" style="margin-top:10px"><table><thead><tr><th>Presentación</th><th class="n">Café</th><th class="n">Costo del café en la unidad</th></tr></thead><tbody>${filas}</tbody></table></div>
      <code class="formula">Costo del café = (gramos ÷ 1.000) × costo por kg</code>
      <hr class="sep"><h3>Comprado vs. procesado en casa</h3>
      ${cmp.ok ? `<div class="alerta ${cmp.conviene === 'procesar' ? 'ok' : 'warn'}">${cmp.conviene === 'igual' ? 'Cuestan igual.' : `Procesar en casa cuesta <b>${MC.fmtCOP(Math.abs(cmp.porKg))}</b> por kg ${cmp.porKg < 0 ? 'menos' : 'más'} que comprarlo tostado y molido${cmp.pct != null ? ` (${MC.fmtPct(Math.abs(cmp.pct))})` : ''}.`}</div>
        <div class="nota">Comprado: ${MC.fmtCOP(comprado.valor)}/kg · Procesado: ${MC.fmtCOP(procesado.valor)}/kg (${esc(procesado.fuente)})</div>` : `<div class="nota">${pend(!comprado.ok ? comprado.motivo : procesado.motivo)}</div>`}`;
  }
  function filaBolsa(k) {
    const r = MC.costoBolsaRef(S.costos, k);
    const dif = r.diferencia ? `<div>Costo teórico ${cop(r.teorico)} vs ${r.diferencia.contraCon} → diferencia <b class="${r.diferencia.valor > 0 ? 'neg-txt' : 'pos-txt'}">${cop(r.diferencia.valor)}</b> por bolsa</div>` : '';
    return `${r.ok ? `<div style="display:flex;gap:16px;flex-wrap:wrap"><div><div class="nota">Costo por bolsa (aplicado)</div><b style="font-size:1.2rem">${cop(r.valor)}</b></div><div><div class="nota">Costo de 100 bolsas</div><b style="font-size:1.2rem">${cop(r.por100)}</b></div></div>` : `<div>${pend(r.motivo)}</div>`}
      <div class="nota" style="margin-top:6px">Método: ${{ referencia: 'costo de referencia por unidad', real: 'costo real por unidad (lote)', teorico: 'teórico por peso (peso ÷ 1.000 × precio por kg)' }[r.metodo]}</div>
      ${r.teorico != null ? `<div class="nota">Costo teórico por peso: ${cop(r.teorico)} · ${MC.fmtNumero(r.bolsasPorKg, 1)} bolsas por kg de material</div>` : '<div class="nota">Para estimar el costo teórico y cuántas bolsas salen por kg, escribe el peso real de una bolsa vacía.</div>'}
      <div class="nota">${dif}</div>`;
  }
  function filaEtiqueta(pid) {
    const p = S.productos.find((x) => x.id === +pid); if (!p) return '';
    const e = MC.costoEtiquetaProducto(S.costos, p);
    return e.ok ? `<div style="display:flex;gap:16px;flex-wrap:wrap"><div><div class="nota">Por etiqueta (aplicado)</div><b>${cop(e.valor)}</b></div><div><div class="nota">Por 100 etiquetas</div><b>${cop(e.por100)}</b></div></div>
      ${e.teorico != null && e.real != null ? `<div class="nota">Teórico ${cop(e.teorico)} vs real ${cop(e.real)} → diferencia <b>${cop(e.teorico - e.real)}</b></div>` : e.teorico != null ? `<div class="nota">Teórico por metro: ${cop(e.teorico)}</div>` : ''}` : pend(e.motivo);
  }
  function filaProducto(pid) {
    const p = S.productos.find((x) => x.id === +pid); if (!p) return '';
    const c = App.costoDe(p);
    if (!c.completo) return `<div class="alerta">ℹ️ <span>No se puede calcular el costo total: ${esc(c.faltan[0] || 'faltan datos')}</span></div>`;
    return `<div class="grid g2" style="gap:8px"><div><div class="nota">Costo total unitario</div><b>${cop(c.total)}</b></div>
      <div><div class="nota">Ganancia bruta por unidad</div>${c.ganancia != null ? `<b class="${claseNeg(c.ganancia)}">${cop(c.ganancia)}</b>` : pend('Escribe el precio al tendero')}</div>
      <div><div class="nota">Margen bruto</div>${c.margen.ok ? `<b class="${claseNeg(c.margen.valor)}">${MC.fmtPct(c.margen.valor)}</b>` : pend(c.margen.motivo)}</div>
      <div><div class="nota">ROI unitario</div>${c.roi.ok ? `<b class="${claseNeg(c.roi.valor)}">${MC.fmtPct(c.roi.valor)}</b>` : pend(c.roi.motivo)}</div></div>
      ${c.negativo ? '<div class="alerta bad" style="margin-top:8px">⛔ Rentabilidad negativa: cada unidad se vende por menos de lo que cuesta.</div>' : ''}`;
  }
  function otrosResumen() {
    const act = (S.costos.otros || []).filter((o) => o.activo);
    if (!act.length) return '<div class="vacio">Aún no has agregado otros costos. Agrégalos si quieres que se sumen al costo de cada presentación.</div>';
    const filas = S.productos.map((p) => { const r = MC.otrosCostosUnit(S.costos, p); return `<tr><td>${esc(p.nombre)}</td><td class="n">${r.issues.length ? '<span class="pend">Pendiente</span>' : cop(r.total)}</td></tr>`; }).join('');
    const mens = act.filter((o) => o.tipo === 'mensual' || o.tipo === 'gasto');
    const dobles = procesadoDoble();
    return `<div class="tabla-w"><table><thead><tr><th>Presentación</th><th class="n">Otros costos por unidad</th></tr></thead><tbody>${filas}</tbody></table></div>
      ${mens.length ? '<div class="nota" style="margin-top:6px">Los costos mensuales y los gastos operativos no se suman al costo del producto: se descuentan en el resultado del período (Inicio).</div>' : ''}
      ${dobles ? `<div class="alerta warn" style="margin-top:8px">⚠️ <span>${dobles}</span></div>` : ''}`;
  }
  function procesadoDoble() {
    if (S.costos.modoCafe !== 'procesado') return '';
    const raros = (S.costos.otros || []).filter((o) => o.activo && ['unidad', 'kg', 'lote'].includes(o.tipo) && /Mano de obra|Energía|Combustible|Mantenimiento|Depreciación/.test(o.concepto));
    return raros.length ? `Estás en modo «café procesado»: si ${raros.map((o) => '«' + esc(o.nombre) + '»').join(', ')} ya está incluido en los costos de tus lotes, no lo repitas aquí o se contará dos veces.` : '';
  }
  const VIVOS = { act: (k) => `<div class="nota">${esc(k === 'cafe' ? ultimaAct(/^cafe_kg/, S.costos.cafe.comprado.actualizado) : k === 'bolsas' ? ultimaAct(/^bolsas_kg/, S.costos.bolsas.actualizado) : ultimaAct(/^etiq_metro/, S.costos.etiquetas.actualizado))}</div>`, tabla: tablaCentral, cafe: resumenCafe, bolsa: filaBolsa, etiqueta: filaEtiqueta, prod: filaProducto, otros: otrosResumen };
  const vivo = (n, arg) => `<div data-live="${n}" ${arg != null ? `data-arg="${arg}"` : ''}>${VIVOS[n](arg)}</div>`;
  function refrescarVivo() { $$('[data-live]').forEach((el) => { const f = VIVOS[el.dataset.live]; if (f) el.innerHTML = f(el.dataset.arg); }); const l = $('[data-live-lotes]'); if (l && App.listaLotes) l.innerHTML = App.listaLotes(); }
  App.refrescarVivo = refrescarVivo;

  // ================================================================ Fecha de última actualización
  function ultimaAct(re, inicial) {
    const f = S.historialCostos.filter((h) => re.test(h.concepto)).map((h) => h.fecha).sort().pop();
    return f ? `Actualizado el ${MC.fechaCorta(f)}` : `Valor de referencia inicial (${MC.fechaCorta(inicial)}), aún sin cambios`;
  }
  const notaMotivo = () => `<div class="card form no-print" style="background:var(--dorado-bg)"><b>Al cambiar un costo, anótalo (opcional)</b>
    <div class="fila2"><label class="campo">Proveedor<input class="in" data-i="motivoCosto" data-w="proveedor" value="${esc(S.ui.proveedor)}" maxlength="60"></label><label class="campo">Motivo del cambio<input class="in" data-i="motivoCosto" data-w="motivo" value="${esc(S.ui.motivo)}" maxlength="80" placeholder="Ej. subió el precio"></label></div>
    <div class="nota">Cada cambio se guarda solo al salir del campo, con valor anterior, valor nuevo y fecha.</div></div>`;
  App.entradas.motivoCosto = (el) => { S.ui[el.dataset.w] = el.value; };

  // ================================================================ Pestañas del Centro de costos
  function pestañaTabla() {
    const modo = S.costos.modoCafe;
    return `<div class="card"><div class="titulo"><h3>Costos por presentación</h3></div>
      <div class="sub">Se actualiza sola cuando cambias cualquier costo o precio.</div>
      <div class="seg no-print" style="margin:10px 0"><button class="${modo === 'comprado' ? 'on' : ''}" data-a="modoCafe" data-m="comprado">Compro café tostado y molido</button><button class="${modo === 'procesado' ? 'on' : ''}" data-a="modoCafe" data-m="procesado">Proceso café verde</button></div>
      ${vivo('tabla')}</div>
      <details class="card"><summary>Cómo se calcula cada columna</summary>
        <code class="formula">Costo del café = gramos ÷ 1.000 × costo por kg</code>
        <code class="formula">Costo total unitario = café + bolsa + etiqueta + otros costos</code>
        <code class="formula">Ganancia bruta = precio al tendero − costo total unitario</code>
        <code class="formula">Margen bruto % = ganancia ÷ precio al tendero × 100</code>
        <code class="formula">ROI unitario % = ganancia ÷ costo total unitario × 100</code>
        <div class="nota" style="margin-top:8px">Margen y ROI no son lo mismo: el margen se mide contra el precio de venta y el ROI contra el costo. Si falta un dato, verás «Pendiente» y arriba se explica qué escribir.</div></details>`;
  }
  App.acciones.modoCafe = async (b) => {
    await App.cambiarCostos((c) => { c.modoCafe = b.dataset.m; });
    toast(b.dataset.m === 'comprado' ? 'Modo: café tostado y molido comprado ✔' : 'Modo: café verde procesado en casa ✔', 'ok'); App.renderConScroll();
  };

  function pestañaCafe() {
    const modo = S.costos.modoCafe, c = S.costos.cafe;
    const lotes = S.lotesCafe.slice().sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    return `<div class="card form"><div class="titulo"><h3>Café</h3><span class="chip d">${modo === 'comprado' ? 'Modo actual: comprado' : 'Modo actual: procesado'}</span></div>
      <div class="seg ajusta no-print"><button class="${modo === 'comprado' ? 'on' : ''}" data-a="modoCafe" data-m="comprado">Hoy: compro café tostado y molido</button><button class="${modo === 'procesado' ? 'on' : ''}" data-a="modoCafe" data-m="procesado">Futuro: compro café verde y lo proceso</button></div>
      ${modo === 'comprado' ? `
        ${campoNum('Precio del café tostado y molido por kg', 'cafe.precioKg', c.comprado.precioKg, { u: 'COP/kg', ayuda: 'Valor inicial de referencia: cámbialo cuando cambie tu proveedor.' })}
        ${vivo('act', 'cafe')}
        <label class="campo">Cómo valorar el costo cuando hay varias compras<select class="in" data-c="valoracion"><option value="vigente" ${(S.ajustes.valoracion || 'vigente') === 'vigente' ? 'selected' : ''}>Precio vigente (el último que escribí)</option><option value="promedio_ponderado" ${S.ajustes.valoracion === 'promedio_ponderado' ? 'selected' : ''}>Promedio ponderado de las compras registradas</option></select><span class="ayuda">El promedio ponderado solo usa compras que tú hayas registrado.</span></label>
        <button class="btn" data-a="nuevoLote" data-m="comprado">＋ Registrar compra de café</button>` : `
        <div class="alerta">ℹ️ <span>No se supone que 1 kg de café verde da 1 kg de tostado: escribe el peso real antes y después del proceso en cada lote.</span></div>
        ${campoSel('¿De dónde sale el costo por kg del café procesado?', 'cafe.procFuente', c.procesado.fuente, [['ultimo_lote', 'Del último lote registrado'], ['promedio_ponderado', 'Promedio ponderado de los lotes'], ['manual', 'Un costo que yo escribo']])}
        ${c.procesado.fuente === 'manual' ? campoNum('Costo manual por kg de café procesado', 'cafe.procManual', c.procesado.costoKgManual, { u: 'COP/kg' }) : ''}
        <button class="btn pri" data-a="nuevoLote" data-m="procesado">＋ Registrar lote de café verde</button>
        ${procesadoDoble() ? `<div class="alerta warn">⚠️ <span>${procesadoDoble()}</span></div>` : ''}`}
      </div>
      <div class="card"><h3>Costo del café por presentación</h3><div style="margin-top:8px">${vivo('cafe')}</div></div>
      <div class="card"><h3>Compras y lotes de café</h3><div data-live-lotes style="margin-top:8px">${listaLotes()}</div></div>`;
  }
  function listaLotes() {
    const lotes = S.lotesCafe.slice().sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.id - a.id));
    if (!lotes.length) return '<div class="vacio">Aún no has registrado compras ni lotes. Se guardan aquí y no se borran cuando cambia el precio.</div>';
    return lotes.map((l) => `<div class="item"><div class="cuerpo"><b>${l.modo === 'comprado' ? 'Compra de café tostado y molido' : 'Lote de café verde'}</b> ${l.referencia ? `<span class="chip">${esc(l.referencia)}</span>` : ''}
      <small>${esc(MC.fechaCorta(l.fecha))}${l.proveedor ? ' · ' + esc(l.proveedor) : ''}</small>
      <small>${l.modo === 'comprado' ? `${MC.fmtKg(l.kg)} a ${MC.fmtCOP(l.precioKg)}/kg` : `${MC.fmtKg(l.kgVerde)} verde → ${MC.fmtKg(l.kgUtilizables)} utilizable${l.estimado ? ' (pérdida estimada)' : ''} · rendimiento ${MC.fmtPct(l.rendimientoPct)}`}</small>
      <small>Costo total ${MC.fmtCOP(l.costoTotal)} · <b>${MC.fmtCOP(l.costoKg)}/kg</b> · ${MC.fmtCOP(l.costoKg / 1000, 2)}/g</small></div>
      <div style="display:flex;flex-direction:column;gap:6px"><button class="btn sm" data-a="editarLote" data-id="${l.id}" aria-label="Editar">✏️</button><button class="btn sm" data-a="borrarLote" data-id="${l.id}" aria-label="Eliminar">🗑️</button></div></div>`).join('');
  }
  App.listaLotes = listaLotes;
  App.cambios.valoracion = async (el) => { S.ajustes.valoracion = el.value; await App.guardarConfig('ajustes', S.ajustes); await App.recargar(); toast('Guardado ✔', 'ok'); refrescarVivo(); };

  // ---- Formulario de lote de café
  const fLote = (id, lbl, val, u, ayuda) => `<label class="campo">${lbl}${ayuda ? `<span class="ayuda">${ayuda}</span>` : ''}<div class="${u === '$' ? 'mon' : 'u'}" ${u !== '$' ? `data-u="${u}"` : ''}><input class="in" inputmode="decimal" id="${id}" data-i="previoLote" value="${numStr(val)}"></div></label>`;
  function abrirLote(modo, editarId) {
    const l = editarId ? S.lotesCafe.find((x) => x.id === editarId) : {};
    modo = l.modo || modo;
    const html = `<h2>${editarId ? 'Editar' : 'Registrar'} ${modo === 'comprado' ? 'compra de café tostado y molido' : 'lote de café verde'}</h2>
      <form class="form" id="fLote" novalidate data-modo="${modo}">
        <div class="fila2"><label class="campo">Fecha<input class="in" type="date" id="l-fecha" value="${l.fecha || hoy()}" max="${hoy()}"></label><label class="campo">Proveedor<input class="in" id="l-prov" maxlength="60" value="${esc(l.proveedor || '')}"></label></div>
        <label class="campo">Referencia o factura (opcional)<input class="in" id="l-ref" maxlength="40" value="${esc(l.referencia || '')}"></label>
        ${modo === 'comprado' ? `
          <div class="fila2">${fLote('l-kg', 'Kilogramos comprados', l.kg, 'kg')}${fLote('l-precio', 'Precio por kg', l.precioKg, '$')}</div>
          <div class="fila2">${fLote('l-transp', 'Transporte de la compra', l.transporte, '$')}${fLote('l-otros', 'Otros costos de la compra', l.otros, '$')}</div>` : `
          <div class="fila2">${fLote('l-verde', 'Kg de café verde comprados', l.kgVerde, 'kg')}${fLote('l-precio', 'Precio del verde por kg', l.precioKgVerde, '$')}</div>
          <div class="alerta">ℹ️ <span>Escribe los pesos reales. Si todavía no tienes el peso tostado, puedes poner una pérdida estimada (el lote quedará marcado como estimado).</span></div>
          <div class="fila2">${fLote('l-tostado', 'Peso real después del tostado', l.pesoTostado, 'kg')}${fLote('l-perdida', 'Pérdida estimada (si no hay peso)', l.perdidaPct, '%')}</div>
          ${fLote('l-molido', 'Peso real después de moler (si hubo pérdida)', l.pesoMolido, 'kg', 'Opcional. Define los kg utilizables.')}
          <div class="fila2">${fLote('l-transp', 'Transporte', l.transporte, '$')}${fLote('l-mano', 'Mano de obra', l.manoObra, '$')}</div>
          <div class="fila2">${fLote('l-energia', 'Energía o combustible', l.energia, '$')}${fLote('l-empaque', 'Empaque a granel', l.empaque, '$')}</div>
          <div class="fila2">${fLote('l-mant', 'Mantenimiento de maquinaria', l.mantenimiento, '$')}${fLote('l-depre', 'Depreciación de maquinaria', l.depreciacion, '$', 'Costo contable configurable')}</div>
          ${fLote('l-otros', 'Otros costos de producción', l.otros, '$')}
          <div class="nota">Cada gasto se cuenta una sola vez, aquí en el lote. No lo repitas en «Otros costos».</div>`}
        <div id="l-prev" class="card" style="background:var(--dorado-bg)"></div>
        <label class="campo">Observaciones<textarea class="in" id="l-obs" rows="2" maxlength="300">${esc(l.observaciones || '')}</textarea></label>
        ${modo === 'comprado' ? `<label class="check"><input type="checkbox" id="l-usar" ${editarId ? '' : 'checked'}><span>Usar este precio como el precio vigente del café por kg</span></label>` : ''}
        ${editarId ? '' : '<label class="check"><input type="checkbox" id="l-inv" checked><span>Sumar estos kg al inventario de café</span></label>'}
        <div class="error" id="l-err" role="alert"></div>
        <div class="acciones"><button type="button" class="btn" data-a="cerrar">Cancelar</button><button class="btn pri" type="submit">Guardar</button></div></form>`;
    modal(html, (m) => { previoLote(m); $('#fLote', m).addEventListener('submit', (e) => { e.preventDefault(); guardarLote(m, editarId); }); });
  }
  function datosLote(m) {
    const f = $('#fLote', m), modo = f.dataset.modo, n = (id) => { const e = $('#' + id, m); return e ? leer(e) : null; };
    const base = { modo, fecha: $('#l-fecha', m).value, proveedor: $('#l-prov', m).value.trim(), referencia: $('#l-ref', m).value.trim(), observaciones: $('#l-obs', m).value.trim() };
    if (modo === 'comprado') return Object.assign(base, { kg: n('l-kg'), precioKg: n('l-precio'), transporte: n('l-transp') || 0, otros: n('l-otros') || 0 });
    return Object.assign(base, { kgVerde: n('l-verde'), precioKgVerde: n('l-precio'), pesoTostado: n('l-tostado'), perdidaPct: n('l-perdida'), pesoMolido: n('l-molido'), transporte: n('l-transp') || 0, manoObra: n('l-mano') || 0, energia: n('l-energia') || 0, empaque: n('l-empaque') || 0, mantenimiento: n('l-mant') || 0, depreciacion: n('l-depre') || 0, otros: n('l-otros') || 0 });
  }
  const calcLote = (d) => (d.modo === 'comprado' ? MC.calcLoteComprado(d) : MC.calcLoteProcesado(d));
  function previoLote(m) {
    const d = datosLote(m), r = calcLote(d), el = $('#l-prev', m);
    if (!r.ok) { el.innerHTML = pend(r.motivo); return; }
    el.innerHTML = `<div class="grid g2" style="gap:8px"><div><div class="nota">Costo total del lote</div><b>${MC.fmtCOP(r.costoTotal)}</b></div><div><div class="nota">Costo por kg utilizable</div><b>${MC.fmtCOP(r.costoKg)}</b></div>
      <div><div class="nota">Costo por gramo</div><b>${MC.fmtCOP(r.costoGramo, 2)}</b></div><div><div class="nota">Kg utilizables</div><b>${MC.fmtKg(r.kgUtilizables)}</b></div>
      ${r.rendimientoPct != null ? `<div><div class="nota">Rendimiento de tostión</div><b>${MC.fmtPct(r.rendimientoPct)}</b></div><div><div class="nota">Pérdida de peso</div><b>${MC.fmtPct(r.perdidaPct)}</b></div>` : ''}</div>${r.estimado ? '<div class="nota">Estimado con el % de pérdida: reemplázalo por el peso real cuando lo tengas.</div>' : ''}`;
  }
  App.entradas.previoLote = (el) => previoLote(el.closest('.modal'));
  async function guardarLote(m, editarId) {
    if (App.ocupado) return; const err = $('#l-err', m), d = datosLote(m);
    const nums = Object.keys(d).filter((k) => typeof d[k] === 'number' && Number.isNaN(d[k]));
    if (nums.length) { err.textContent = 'Revisa los números: alguno no es válido.'; return; }
    if (!MC.esFecha(d.fecha)) { err.textContent = 'Elige una fecha válida.'; return; }
    if (d.fecha > hoy()) { err.textContent = 'La fecha no puede ser futura.'; return; }
    const r = calcLote(d); if (!r.ok) { err.textContent = r.motivo; return; }
    const rec = Object.assign({}, d, { costoTotal: r.costoTotal, costoKg: r.costoKg, kgUtilizables: r.kgUtilizables, rendimientoPct: r.rendimientoPct != null ? r.rendimientoPct : null, estimado: !!r.estimado, creado: Date.now() });
    const usar = $('#l-usar', m) && $('#l-usar', m).checked, sumarInv = $('#l-inv', m) && $('#l-inv', m).checked;
    App.ocupado = true;
    try {
      await DB.transaccion(['lotesCafe', 'inventarioMov'], async (a) => {
        if (editarId) { rec.id = editarId; rec.creado = (S.lotesCafe.find((x) => x.id === editarId) || {}).creado || rec.creado; }
        const id = await a.put('lotesCafe', rec);
        const mov = S.inventarioMov.find((x) => x.refTipo === 'lote' && x.refId === id);
        if (editarId && mov) await a.put('inventarioMov', Object.assign({}, mov, { fecha: rec.fecha, cantidad: r.kgUtilizables }));
        else if (sumarInv) await a.put('inventarioMov', { fecha: rec.fecha, item: 'cafe', clave: String(id), cantidad: r.kgUtilizables, motivo: 'compra', refTipo: 'lote', refId: id, nota: rec.modo === 'comprado' ? 'Compra de café' : 'Lote de café procesado', creado: Date.now() });
      });
      await App.recargar();
      if (usar && d.modo === 'comprado' && d.precioKg !== S.costos.cafe.comprado.precioKg) await App.cambiarCostos((c) => { c.cafe.comprado.precioKg = d.precioKg; c.cafe.comprado.actualizado = d.fecha; c.cafe.comprado.referencia = false; }, { proveedor: d.proveedor, motivo: 'Compra del ' + MC.fechaCorta(d.fecha) });
      cerrar(m); toast('Guardado ✔', 'ok'); App.renderConScroll();
    } catch (e) { err.textContent = 'No se pudo guardar: ' + e.message; }
    App.ocupado = false;
  }
  App.acciones.nuevoLote = (b) => abrirLote(b.dataset.m);
  App.acciones.editarLote = (b) => abrirLote(null, +b.dataset.id);
  App.acciones.borrarLote = async (b) => {
    const id = +b.dataset.id, usos = S.produccion.filter((p) => p.loteId === id).length;
    if (usos) { toast(`Este lote se usó en ${usos} producción(es); no se puede eliminar.`, 'err'); return; }
    if (!(await confirmar({ titulo: 'Eliminar lote', texto: '¿Eliminar este registro? También se quita su entrada del inventario.', ok: 'Eliminar', peligro: true }))) return;
    await DB.transaccion(['lotesCafe', 'inventarioMov'], async (a) => { await a.del('lotesCafe', id); for (const m of S.inventarioMov.filter((x) => x.refTipo === 'lote' && x.refId === id)) await a.del('inventarioMov', m.id); });
    await App.recargar(); toast('Eliminado', 'ok'); App.renderConScroll();
  };

  // ---- Bolsas
  function pestañaBolsas() {
    const b = S.costos.bolsas;
    const tarjetas = Object.keys(b.refs).map((k) => {
      const r = b.refs[k];
      return `<div class="card form"><div class="titulo"><h3>${esc(r.nombre)}</h3><span class="chip">${esc(r.usadaEn)}</span></div>
        ${campoSel('Método para calcular el costo', 'bolsa.metodo.' + k, r.metodo, [['referencia', 'Costo de referencia por unidad'], ['real', 'Costo real por unidad (de un lote pagado)'], ['teorico', 'Teórico por peso de la bolsa vacía']])}
        <div class="fila2">${campoNum('Costo de referencia por unidad', 'bolsa.ref.' + k, r.costoReferencia, { ayuda: 'Valor que observaste; no es definitivo.' })}${campoNum('Costo real por unidad', 'bolsa.real.' + k, r.costoReal, { ayuda: 'Lote pagado ÷ bolsas recibidas', ph: 'Pendiente' })}</div>
        ${campoNum('Peso real de una bolsa vacía', 'bolsa.peso.' + k, r.pesoG, { u: 'g', ayuda: 'Pésala o pídelo al proveedor. No es el gramaje del café.', ph: 'Pendiente' })}
        ${vivo('bolsa', k)}</div>`;
    }).join('');
    const compras = S.compras.filter((c) => c.tipo === 'bolsas').sort((a, c) => (a.fecha < c.fecha ? 1 : -1));
    return `<div class="card form"><h3>Bolsas</h3>
      ${campoNum('Precio por kg de bolsas', 'bolsas.precioKg', b.precioKg, { u: 'COP/kg', ayuda: 'Valor inicial: $12.500 por kg. Cámbialo cuando cambie tu proveedor.' })}
      ${vivo('act', 'bolsas')}
      <div class="alerta">ℹ️ <span>Los $40,34 / $36 / $58 son valores de <b>referencia</b> que observaste. El sistema no los deriva de los $12.500/kg: tú decides qué método usar y puedes comparar el costo teórico con el real.</span></div>
      <button class="btn" data-a="nuevaCompra" data-t="bolsas">＋ Registrar compra de bolsas</button></div>
      ${tarjetas}
      <div class="card"><h3>Compras de bolsas</h3>${listaCompras(compras)}</div>`;
  }

  // ---- Etiquetas
  function pestañaEtiquetas() {
    const e = S.costos.etiquetas;
    const filas = S.productos.map((p) => `<div class="card form" style="padding:12px"><div class="titulo"><h3>Etiqueta de ${esc(p.nombre)}</h3>${p.activo ? '' : '<span class="chip a">Inactivo</span>'}</div>
      <div class="fila2">${campoNum('Etiquetas por metro', 'etiq.rend.' + p.id, p.etiquetasPorMetro, { u: 'u/m', ayuda: 'Editable: cambia con el tamaño o la impresión.' })}${campoNum('Costo real por etiqueta (opcional)', 'etiq.real.' + p.id, p.etiquetaCostoReal, { ph: 'Pendiente' })}</div>
      ${vivo('etiqueta', p.id)}</div>`).join('');
    const compras = S.compras.filter((c) => c.tipo === 'etiquetas').sort((a, c) => (a.fecha < c.fecha ? 1 : -1));
    return `<div class="card form"><h3>Etiquetas</h3>
      ${campoNum('Precio por metro de etiquetas', 'etiq.metro', e.precioMetro, { u: 'COP/m', ayuda: 'Valor inicial: $24.000 el metro.' })}
      <div class="nota">${esc(ultimaAct(/^etiq_metro/, e.actualizado))}</div>
      ${campoSel('Qué costo usar', 'etiq.metodo', e.metodo, [['teorico', 'Teórico: precio por metro ÷ etiquetas por metro'], ['real', 'Real: el costo por etiqueta que escribí']])}
      <code class="formula">Costo por etiqueta = precio por metro ÷ etiquetas por metro</code>
      <button class="btn" data-a="nuevaCompra" data-t="etiquetas">＋ Registrar compra de etiquetas</button></div>
      ${filas}
      <div class="card"><h3>Compras de etiquetas</h3>${listaCompras(compras)}</div>`;
  }

  // ---- Compras de bolsas / etiquetas
  function listaCompras(lista) {
    if (!lista.length) return '<div class="vacio">Sin compras registradas.</div>';
    return lista.map((c) => `<div class="item"><div class="cuerpo"><b>${c.tipo === 'bolsas' ? esc(S.costos.bolsas.refs[c.bolsaRef] ? S.costos.bolsas.refs[c.bolsaRef].nombre : 'Bolsas') : 'Etiquetas ' + esc((S.productos.find((p) => p.id === c.productoId) || {}).nombre || '')}</b>${c.referencia ? ` <span class="chip">${esc(c.referencia)}</span>` : ''}
      <small>${esc(MC.fechaCorta(c.fecha))}${c.proveedor ? ' · ' + esc(c.proveedor) : ''}</small>
      <small>${c.tipo === 'bolsas' ? `${MC.fmtNumero(c.cantidad, 0)} bolsas${c.kg ? ` · ${MC.fmtKg(c.kg)}` : ''}` : `${MC.fmtNumero(c.metros, 2, true)} m · ${MC.fmtNumero(c.utiles, 0)} etiquetas útiles${c.desperdicioPct ? ` (desperdicio ${MC.fmtPct(c.desperdicioPct)})` : ''}`} · total ${MC.fmtCOP(c.costoTotal)}</small>
      <small><b>Costo real por unidad: ${cop(c.costoUnit)}</b>${c.pesoEstimadoG ? ` · peso ≈ ${MC.fmtNumero(c.pesoEstimadoG, 2, true)} g por bolsa` : ''}</small></div>
      <button class="btn sm" data-a="borrarCompra" data-id="${c.id}" aria-label="Eliminar">🗑️</button></div>`).join('');
  }
  App.listaCompras = listaCompras;
  function abrirCompra(tipo) {
    const esB = tipo === 'bolsas';
    modal(`<h2>Registrar compra de ${esB ? 'bolsas' : 'etiquetas'}</h2><form class="form" id="fCompra" novalidate data-t="${tipo}">
      <div class="fila2"><label class="campo">Fecha<input class="in" type="date" id="c-fecha" value="${hoy()}" max="${hoy()}"></label><label class="campo">Proveedor<input class="in" id="c-prov" maxlength="60"></label></div>
      <label class="campo">Referencia o factura (opcional)<input class="in" id="c-ref" maxlength="40"></label>
      ${esB ? `<label class="campo">Tipo de bolsa<select class="in" id="c-tipo">${Object.keys(S.costos.bolsas.refs).map((k) => `<option value="${k}">${esc(S.costos.bolsas.refs[k].nombre)} (${esc(S.costos.bolsas.refs[k].usadaEn)})</option>`).join('')}</select></label>
        <div class="fila2">${fLoteC('c-cant', 'Bolsas recibidas', 'u')}${fLoteC('c-total', 'Valor pagado por el lote', '$')}</div>
        ${fLoteC('c-kg', 'Kg del lote (opcional)', 'kg', 'Si lo escribes, se estima cuánto pesa cada bolsa vacía.')}` :
        `<label class="campo">Presentación<select class="in" id="c-prod">${S.productos.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('')}</select></label>
        <div class="fila2">${fLoteC('c-metros', 'Metros comprados', 'm')}${fLoteC('c-total', 'Valor pagado', '$')}</div>
        <div class="fila2">${fLoteC('c-rend', 'Etiquetas por metro', 'u/m', 'Vacío = usa el valor guardado')}${fLoteC('c-desp', 'Desperdicio estimado', '%')}</div>`}
      <div id="c-prev" class="card" style="background:var(--dorado-bg)"></div>
      <label class="check"><input type="checkbox" id="c-usar" checked><span>Usar este costo real por unidad en los cálculos${esB ? ' (cambia el método de esa bolsa a «real»)' : ' (se guarda como costo real de esa etiqueta)'}</span></label>
      <label class="check"><input type="checkbox" id="c-inv" checked><span>Sumar al inventario</span></label>
      <div class="error" id="c-err" role="alert"></div>
      <div class="acciones"><button type="button" class="btn" data-a="cerrar">Cancelar</button><button class="btn pri" type="submit">Guardar</button></div></form>`, (m) => {
      previoCompra(m); $('#fCompra', m).addEventListener('submit', (e) => { e.preventDefault(); guardarCompra(m); });
      $$('select', m).forEach((s) => s.addEventListener('change', () => previoCompra(m)));
    });
  }
  const fLoteC = (id, lbl, u, ayuda) => `<label class="campo">${lbl}${ayuda ? `<span class="ayuda">${ayuda}</span>` : ''}<div class="${u === '$' ? 'mon' : 'u'}" ${u !== '$' ? `data-u="${u}"` : ''}><input class="in" inputmode="decimal" id="${id}" data-i="previoCompra"></div></label>`;
  function datosCompra(m) {
    const t = $('#fCompra', m).dataset.t, n = (id) => { const e = $('#' + id, m); return e ? leer(e) : null; };
    const base = { tipo: t, fecha: $('#c-fecha', m).value, proveedor: $('#c-prov', m).value.trim(), referencia: $('#c-ref', m).value.trim(), costoTotal: n('c-total') };
    if (t === 'bolsas') return Object.assign(base, { bolsaRef: $('#c-tipo', m).value, cantidad: n('c-cant'), kg: n('c-kg') });
    const pid = +$('#c-prod', m).value, p = S.productos.find((x) => x.id === pid);
    return Object.assign(base, { productoId: pid, metros: n('c-metros'), rend: n('c-rend') || (p && p.etiquetasPorMetro) || null, desperdicioPct: n('c-desp') || 0 });
  }
  function calcCompra(d) {
    if (!MC.esNum(d.costoTotal) || d.costoTotal < 0) return { ok: false, motivo: 'Escribe el valor pagado.' };
    if (d.tipo === 'bolsas') {
      if (!(d.cantidad > 0)) return { ok: false, motivo: 'Escribe cuántas bolsas recibiste.' };
      const u = MC.costoBolsaReal(d.costoTotal, d.cantidad), peso = d.kg > 0 ? d.kg * 1000 / d.cantidad : null;
      return { ok: true, costoUnit: u, por100: u * 100, pesoEstimadoG: peso, texto: [['Costo real por bolsa', cop(u)], ['Costo de 100 bolsas', cop(u * 100)], peso != null ? ['Peso por bolsa vacía', MC.fmtNumero(peso, 2, true) + ' g'] : null, d.kg > 0 ? ['Bolsas por kg', MC.fmtNumero(d.cantidad / d.kg, 1)] : null] };
    }
    const r = MC.calcCompraEtiquetas({ metros: d.metros, rend: d.rend, desperdicioPct: d.desperdicioPct, costoTotal: d.costoTotal });
    if (!r.ok) return { ok: false, motivo: r.motivo };
    return { ok: true, costoUnit: r.costoUnit, utiles: r.utiles, por100: r.costoUnit * 100, texto: [['Etiquetas útiles', MC.fmtNumero(r.utiles, 0)], ['Costo real por etiqueta', cop(r.costoUnit)], ['Costo de 100 etiquetas', cop(r.costoUnit * 100)]] };
  }
  function previoCompra(m) {
    const r = calcCompra(datosCompra(m)), el = $('#c-prev', m);
    el.innerHTML = r.ok ? `<div class="grid g2" style="gap:8px">${r.texto.filter(Boolean).map(([a, b]) => `<div><div class="nota">${a}</div><b>${b}</b></div>`).join('')}</div>` : pend(r.motivo);
  }
  App.entradas.previoCompra = (el) => previoCompra(el.closest('.modal'));
  async function guardarCompra(m) {
    if (App.ocupado) return; const d = datosCompra(m), err = $('#c-err', m), r = calcCompra(d);
    if (Object.values(d).some((v) => typeof v === 'number' && Number.isNaN(v))) { err.textContent = 'Revisa los números: alguno no es válido.'; return; }
    if (!MC.esFecha(d.fecha) || d.fecha > hoy()) { err.textContent = 'Elige una fecha válida (no futura).'; return; }
    if (!r.ok) { err.textContent = r.motivo; return; }
    const usar = $('#c-usar', m).checked, inv = $('#c-inv', m).checked;
    const rec = Object.assign({}, d, { costoUnit: r.costoUnit, utiles: r.utiles || null, pesoEstimadoG: r.pesoEstimadoG || null, creado: Date.now() });
    App.ocupado = true;
    try {
      await DB.transaccion(['compras', 'inventarioMov'], async (a) => {
        const id = await a.put('compras', rec);
        if (inv) await a.put('inventarioMov', d.tipo === 'bolsas' ? { fecha: d.fecha, item: 'bolsa', clave: d.bolsaRef, cantidad: d.cantidad, motivo: 'compra', refTipo: 'compra', refId: id, nota: 'Compra de bolsas', creado: Date.now() } : { fecha: d.fecha, item: 'etiqueta', clave: String(d.productoId), cantidad: r.utiles, motivo: 'compra', refTipo: 'compra', refId: id, nota: 'Compra de etiquetas', creado: Date.now() });
      });
      await App.recargar();
      if (usar) await App.cambiarCostos((c, ps) => {
        if (d.tipo === 'bolsas') { const b = c.bolsas.refs[d.bolsaRef]; b.costoReal = r.costoUnit; b.metodo = 'real'; if (r.pesoEstimadoG) b.pesoG = Math.round(r.pesoEstimadoG * 100) / 100; }
        else { ps.find((p) => p.id === d.productoId).etiquetaCostoReal = r.costoUnit; if (d.rend && d.rend !== ps.find((p) => p.id === d.productoId).etiquetasPorMetro) ps.find((p) => p.id === d.productoId).etiquetasPorMetro = d.rend; }
      }, { proveedor: d.proveedor, motivo: 'Compra del ' + MC.fechaCorta(d.fecha) });
      cerrar(m); toast('Compra guardada ✔', 'ok'); App.renderConScroll();
    } catch (e) { err.textContent = 'No se pudo guardar: ' + e.message; }
    App.ocupado = false;
  }
  App.acciones.nuevaCompra = (b) => abrirCompra(b.dataset.t);
  App.acciones.borrarCompra = async (b) => {
    const id = +b.dataset.id;
    if (!(await confirmar({ titulo: 'Eliminar compra', texto: '¿Eliminar este registro? También se quita su entrada del inventario. Los costos ya aplicados a ventas anteriores no cambian.', ok: 'Eliminar', peligro: true }))) return;
    await DB.transaccion(['compras', 'inventarioMov'], async (a) => { await a.del('compras', id); for (const m of S.inventarioMov.filter((x) => x.refTipo === 'compra' && x.refId === id)) await a.del('inventarioMov', m.id); });
    await App.recargar(); toast('Eliminado', 'ok'); App.renderConScroll();
  };

  // ---- Otros costos
  function pestañaOtros() {
    const lista = S.costos.otros || [];
    return `<div class="card form"><div class="titulo"><h3>Otros costos</h3><button class="btn sm pri" data-a="nuevoOtro">＋ Agregar costo</button></div>
      <div class="sub">Mano de obra, transporte, energía, combustible, mantenimiento, depreciación, empaque secundario…</div>
      ${lista.length ? lista.map((o) => `<div class="item"><div class="cuerpo"><b>${esc(o.nombre)}</b> <span class="chip ${o.activo ? 'v' : ''}">${o.activo ? 'Activo' : 'Inactivo'}</span>
        <small>${esc(o.concepto)} · ${esc(MC.TIPOS_OTROS[o.tipo])}${o.tipo === 'lote' ? ` · ${MC.fmtNumero(o.unidadesPorLote || 0, 0)} unid./lote` : ''}</small>
        <small>Se aplica a: ${o.productos === 'todos' ? 'todas las presentaciones' : (o.productos || []).map((id) => (S.productos.find((p) => p.id === id) || {}).nombre).filter(Boolean).join(', ')}</small></div>
        <div style="text-align:right"><div class="monto">${MC.fmtCOP(o.valor, { dec: 2 })}</div><div style="display:flex;gap:6px;margin-top:6px"><button class="btn sm" data-a="editarOtro" data-id="${o.id}" aria-label="Editar">✏️</button><button class="btn sm" data-a="borrarOtro" data-id="${o.id}" aria-label="Eliminar">🗑️</button></div></div></div>`).join('') : '<div class="vacio">Aún no hay otros costos. No se suponen valores: agrega solo los que de verdad tengas.</div>'}</div>
      <div class="card"><h3>Efecto en el costo por unidad</h3><div style="margin-top:8px">${vivo('otros')}</div></div>
      <details class="card"><summary>¿Cómo se reparte cada tipo?</summary><div class="nota" style="margin-top:8px">
        <b>Por unidad:</b> se suma tal cual a cada unidad.<br><b>Por kilogramo:</b> se multiplica por los kg de café de la presentación.<br><b>Por lote:</b> valor ÷ unidades que salen del lote.<br><b>Mensual / gasto operativo:</b> no entra al costo del producto; se descuenta en el resultado del período (los mensuales se prorratean por días). Así un mismo concepto no se cuenta dos veces.</div></details>`;
  }
  function abrirOtro(id) {
    const o = id ? (S.costos.otros || []).find((x) => x.id === id) : { concepto: 'Mano de obra', nombre: '', tipo: 'unidad', valor: null, unidadesPorLote: null, productos: 'todos', activo: true, desde: hoy() };
    const sel = o.productos === 'todos' ? 'todos' : 'algunos';
    modal(`<h2>${id ? 'Editar' : 'Agregar'} costo</h2><form class="form" id="fOtro" novalidate>
      <label class="campo">Concepto<select class="in" id="o-concepto">${MC.CONCEPTOS_OTROS.map((c) => `<option ${o.concepto === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="campo">Nombre<input class="in" id="o-nombre" maxlength="60" value="${esc(o.nombre)}" placeholder="Ej. Caja de cartón"></label>
      <label class="campo">Cómo se mide<select class="in" id="o-tipo">${Object.keys(MC.TIPOS_OTROS).map((k) => `<option value="${k}" ${o.tipo === k ? 'selected' : ''}>${MC.TIPOS_OTROS[k]}</option>`).join('')}</select></label>
      <label class="campo">Valor<div class="mon"><input class="in" id="o-valor" inputmode="decimal" value="${numStr(o.valor)}"></div></label>
      <label class="campo" id="o-lote" ${o.tipo === 'lote' ? '' : 'hidden'}>Unidades que salen por lote<input class="in" id="o-upl" inputmode="numeric" value="${numStr(o.unidadesPorLote)}"></label>
      <label class="campo" id="o-desde" ${o.tipo === 'mensual' ? '' : 'hidden'}>Aplica desde<input class="in" type="date" id="o-fecha" value="${o.desde || hoy()}"></label>
      <label class="campo" id="o-aplica">Se aplica a<select class="in" id="o-prods"><option value="todos" ${sel === 'todos' ? 'selected' : ''}>Todas las presentaciones</option><option value="algunos" ${sel === 'algunos' ? 'selected' : ''}>Solo algunas</option></select></label>
      <div id="o-lista" ${sel === 'algunos' ? '' : 'hidden'}>${S.productos.map((p) => `<label class="check" style="padding:6px 0"><input type="checkbox" value="${p.id}" ${Array.isArray(o.productos) && o.productos.includes(p.id) ? 'checked' : ''}><span>${esc(p.nombre)}</span></label>`).join('')}</div>
      <label class="check"><input type="checkbox" id="o-activo" ${o.activo ? 'checked' : ''}><span>Activo (se incluye en los cálculos)</span></label>
      <div class="error" id="o-err" role="alert"></div>
      <div class="acciones"><button type="button" class="btn" data-a="cerrar">Cancelar</button><button class="btn pri" type="submit">Guardar</button></div></form>`, (m) => {
      const upd = () => { const t = $('#o-tipo', m).value; $('#o-lote', m).hidden = t !== 'lote'; $('#o-desde', m).hidden = t !== 'mensual'; $('#o-aplica', m).hidden = ['mensual', 'gasto'].includes(t); $('#o-lista', m).hidden = $('#o-prods', m).value !== 'algunos' || ['mensual', 'gasto'].includes(t); };
      $('#o-tipo', m).addEventListener('change', upd); $('#o-prods', m).addEventListener('change', upd); upd();
      $('#fOtro', m).addEventListener('submit', async (e) => {
        e.preventDefault(); const err = $('#o-err', m), valor = leer($('#o-valor', m)), upl = leer($('#o-upl', m)), tipo = $('#o-tipo', m).value;
        const nombre = $('#o-nombre', m).value.trim();
        if (!nombre) { err.textContent = 'Escribe un nombre.'; return; }
        if (valor == null || Number.isNaN(valor) || valor < 0) { err.textContent = 'Escribe un valor válido (no negativo).'; return; }
        if (tipo === 'lote' && !(upl > 0)) { err.textContent = 'Indica cuántas unidades salen por lote.'; return; }
        const prods = $('#o-prods', m).value === 'todos' ? 'todos' : $$('#o-lista input:checked', m).map((c) => +c.value);
        if (Array.isArray(prods) && !prods.length && !['mensual', 'gasto'].includes(tipo)) { err.textContent = 'Elige al menos una presentación.'; return; }
        const nuevo = { id: id || Date.now(), concepto: $('#o-concepto', m).value, nombre, tipo, valor, unidadesPorLote: tipo === 'lote' ? upl : null, productos: prods, activo: $('#o-activo', m).checked, desde: $('#o-fecha', m).value || hoy() };
        await App.cambiarCostos((c) => { c.otros = c.otros || []; const i = c.otros.findIndex((x) => x.id === nuevo.id); if (i >= 0) c.otros[i] = nuevo; else c.otros.push(nuevo); });
        cerrar(m); toast('Guardado ✔', 'ok'); App.renderConScroll();
      });
    });
  }
  App.acciones.nuevoOtro = () => abrirOtro();
  App.acciones.editarOtro = (b) => abrirOtro(+b.dataset.id);
  App.acciones.borrarOtro = async (b) => {
    if (!(await confirmar({ titulo: 'Eliminar costo', texto: '¿Eliminar este costo? Las ventas ya registradas conservan el costo que tenían. Si prefieres, desactívalo en lugar de eliminarlo.', ok: 'Eliminar', peligro: true }))) return;
    await App.cambiarCostos((c) => { c.otros = c.otros.filter((o) => o.id !== +b.dataset.id); }); toast('Eliminado', 'ok'); App.renderConScroll();
  };

  // ---- Historial de cambios
  const esDinero = (k) => /^(cafe_kg|cafe_proc_manual|bolsas_kg|bolsa_ref|bolsa_real|etiq_metro|etiq_real|otro_|precio_)/.test(k) && !/^(cant_)/.test(k);
  const fmtHist = (k, v) => (v == null ? '<span class="pend">—</span>' : typeof v === 'number' ? (esDinero(k) ? MC.fmtCOP(v, { dec: 4 }).replace(/(,\d*?)0+$/, '$1').replace(/,$/, '') : MC.fmtNumero(v, 4, true)) : esc({ comprado: 'Café comprado', procesado: 'Café procesado', referencia: 'Referencia', real: 'Real', teorico: 'Teórico', ultimo_lote: 'Último lote', promedio_ponderado: 'Promedio ponderado', manual: 'Manual' }[v] || v));
  function pestañaHistorial() {
    const todos = S.historialCostos.map((h) => Object.assign({ tipo: 'Costo' }, h)).concat(S.historialPrecios.map((h) => Object.assign({ tipo: 'Precio' }, h))).sort((a, b) => b.creado - a.creado);
    return `<div class="card"><h3>Historial de modificaciones</h3><div class="sub">Cada cambio de costo o precio queda registrado con su valor anterior y nuevo. Las ventas ya hechas conservan el costo que tenían.</div>
      ${todos.length ? `<div class="tabla-w" style="margin-top:10px"><table><thead><tr><th>Fecha</th><th>Qué cambió</th><th class="n">Anterior</th><th class="n">Nuevo</th><th>Proveedor / motivo</th></tr></thead><tbody>${todos.slice(0, 300).map((h) => `<tr><td>${esc(MC.fechaCorta(h.fecha))}</td><td>${esc(h.etiqueta)}<br><span class="chip">${h.tipo}</span></td><td class="n">${fmtHist(h.concepto, h.anterior)}</td><td class="n"><b>${fmtHist(h.concepto, h.nuevo)}</b></td><td>${esc([h.proveedor, h.motivo].filter(Boolean).join(' · ')) || '<span class="pend">—</span>'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="vacio">Todavía no has cambiado ningún costo. Cuando lo hagas, aparecerá aquí.</div>'}</div>`;
  }
  App.historialFilas = () => S.historialCostos.map((h) => Object.assign({ tipo: 'Costo' }, h)).concat(S.historialPrecios.map((h) => Object.assign({ tipo: 'Precio' }, h))).sort((a, b) => b.creado - a.creado);
  App.fmtHistTexto = (k, v) => (v == null ? '' : typeof v === 'number' ? v : String(v));

  // ================================================================ Vista Costos
  const TABS = [['tabla', 'Tabla'], ['cafe', 'Café'], ['bolsas', 'Bolsas'], ['etiquetas', 'Etiquetas'], ['otros', 'Otros'], ['historial', 'Historial']];
  App.vistas.costos = () => {
    const t = S.ui.costosTab;
    const cuerpo = { tabla: pestañaTabla, cafe: pestañaCafe, bolsas: pestañaBolsas, etiquetas: pestañaEtiquetas, otros: pestañaOtros, historial: pestañaHistorial }[t]();
    return `<section class="vista"><div class="titulo"><h2>Centro de costos</h2></div>
      <div class="sticky-tabs"><div class="seg no-print">${TABS.map(([k, n]) => `<button class="${t === k ? 'on' : ''}" data-a="tabCostos" data-t="${k}">${n}</button>`).join('')}</div></div>
      ${['cafe', 'bolsas', 'etiquetas', 'otros'].includes(t) ? notaMotivo() : ''}${cuerpo}
      <div class="nota">Todos los valores son tuyos: los iniciales son solo referencias y puedes cambiarlos cuando quieras. Nada se calcula con números ocultos.</div></section>`;
  };
  App.acciones.tabCostos = (b) => { S.ui.costosTab = b.dataset.t; App.render(); };

  // ================================================================ Productos y precios
  function tarjetaProducto(p) {
    return `<div class="card form" style="${p.activo ? '' : 'opacity:.8'}"><div class="titulo"><h3>${esc(p.nombre)}</h3><span class="chip ${p.activo ? 'v' : 'a'}">${p.activo ? 'Activo' : 'Inactivo'}</span></div>
      <div class="fila2">${campoTxt('Nombre', `prod.${p.id}.nombre`, p.nombre)}${campoNum('Gramos netos de café', `prod.${p.id}.gramos`, p.gramos, { u: 'g', ayuda: 'No incluye la bolsa.' })}</div>
      ${campoNum('Precio de venta al tendero', `prod.${p.id}.precioTienda`, p.precioTienda, { ayuda: 'Con este precio se calculan tus ingresos y la ganancia.', ph: 'Pendiente' })}
      <div class="fila2">${campoNum('Precio especial por cantidad', `prod.${p.id}.precioEspecial`, p.precioEspecial, { ph: 'Opcional' })}${campoNum('Desde (unidades)', `prod.${p.id}.cantEspecial`, p.cantEspecial, { u: 'u', ph: 'Opcional' })}</div>
      ${campoNum('Precio sugerido al consumidor', `prod.${p.id}.precioPublico`, p.precioPublico, { ayuda: 'Solo informativo; no se usa para tus ingresos.', ph: 'Opcional' })}
      ${campoSel('Bolsa que usa', `prod.${p.id}.bolsaRef`, p.bolsaRef, Object.keys(S.costos.bolsas.refs).map((k) => [k, `${S.costos.bolsas.refs[k].nombre} (${S.costos.bolsas.refs[k].usadaEn})`]))}
      ${p.activo ? vivo('prod', p.id) : ''}
      <button class="btn sm" data-a="activarProd" data-id="${p.id}" data-v="${p.activo ? 0 : 1}">${p.activo ? 'Desactivar presentación' : 'Reactivar presentación'}</button></div>`;
  }
  App.vistas.productos = () => `<section class="vista"><div class="titulo"><h2>Productos y precios</h2><button class="btn sm pri" data-a="nuevoProd">＋ Agregar producto</button></div>
    <div class="alerta">ℹ️ <span>Los precios iniciales están vacíos: escríbelos tú. El <b>precio al tendero</b> es el que se usa para tus ingresos; el precio al consumidor es solo una referencia.</span></div>
    ${S.productos.map(tarjetaProducto).join('')}</section>`;
  App.acciones.activarProd = async (b) => {
    const id = +b.dataset.id, a = b.dataset.v === '1';
    await App.cambiarCostos((c, ps) => { ps.find((p) => p.id === id).activo = a; });
    toast(a ? 'Presentación reactivada ✔' : 'Presentación desactivada ✔', 'ok'); App.renderConScroll();
  };
  App.acciones.nuevoProd = () => modal(`<h2>Agregar producto</h2><form class="form" id="fProd" novalidate>
    <label class="campo">Nombre<input class="in" id="p-nombre" maxlength="40" placeholder="Ej. 500 g"></label>
    <label class="campo">Gramos netos de café<div class="u" data-u="g"><input class="in" id="p-gramos" inputmode="numeric"></div></label>
    <label class="campo">Bolsa que usa<select class="in" id="p-bolsa">${Object.keys(S.costos.bolsas.refs).map((k) => `<option value="${k}">${esc(S.costos.bolsas.refs[k].nombre)} (${esc(S.costos.bolsas.refs[k].usadaEn)})</option>`).join('')}</select></label>
    <label class="campo">Etiquetas por metro (opcional ahora)<input class="in" id="p-rend" inputmode="numeric"></label>
    <label class="campo">Precio de venta al tendero (opcional ahora)<div class="mon"><input class="in" id="p-precio" inputmode="decimal"></div></label>
    <div class="error" id="p-err" role="alert"></div>
    <div class="acciones"><button type="button" class="btn" data-a="cerrar">Cancelar</button><button class="btn pri" type="submit">Agregar</button></div></form>`, (m) => {
    $('#fProd', m).addEventListener('submit', async (e) => {
      e.preventDefault(); const err = $('#p-err', m), nombre = $('#p-nombre', m).value.trim(), g = leer($('#p-gramos', m)), rend = leer($('#p-rend', m)), precio = leer($('#p-precio', m));
      if (!nombre) { err.textContent = 'Escribe el nombre.'; return; }
      if (!(g > 0)) { err.textContent = 'Escribe los gramos netos (más de cero).'; return; }
      if ([rend, precio].some((v) => v != null && (Number.isNaN(v) || v < 0))) { err.textContent = 'Revisa los números.'; return; }
      if (S.productos.some((p) => p.nombre.toLowerCase() === nombre.toLowerCase())) { err.textContent = 'Ya existe un producto con ese nombre.'; return; }
      await DB.transaccion(['productos'], (a) => a.put('productos', { nombre, gramos: g, bolsaRef: $('#p-bolsa', m).value, etiquetasPorMetro: rend, etiquetaCostoReal: null, precioTienda: precio, precioEspecial: null, cantEspecial: null, precioPublico: null, activo: true }));
      await App.recargar(); await App.cambiarCostos(() => {}); cerrar(m); toast('Producto agregado ✔', 'ok'); App.renderConScroll();
    });
  });
})();
