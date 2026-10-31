/*
 * Café Mero Campo Business Manager — MOTOR DE CÁLCULO (lógica pura, sin navegador).
 * Se usa tanto en la app como en las pruebas automáticas de Node.
 *
 * Principios:
 *  - Nada se inventa: si falta un dato, el resultado es { ok:false, motivo:'...' } ("Pendiente de datos").
 *  - Los valores que dio el dueño son REFERENCIAS iniciales, siempre visibles y editables.
 *  - Cada venta detallada guarda una "foto" del costo del momento (no se recalcula después).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MC = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ====================================================== Constantes
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const DIAS_CORTOS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
  const MEDIOS = { efectivo: 'Efectivo', transferencia: 'Transferencia', nequi: 'Nequi', otro: 'Otro', sin_especificar: 'Sin especificar' };
  const PENDIENTE = 'Pendiente de datos';

  // ====================================================== Fechas (zona America/Bogota = UTC-5, sin horario de verano)
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  function bogota(nowMs) { return new Date((nowMs == null ? Date.now() : nowMs) - 5 * 3600000); }
  function hoyISO(nowMs) { const d = bogota(nowMs); return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
  function horaActual(nowMs) { const d = bogota(nowMs); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; }
  function parseISO(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10);
    const t = new Date(Date.UTC(y, m - 1, d));
    if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
    return { y, m, d };
  }
  const esFecha = (s) => parseISO(s) !== null;
  const ms = (s) => { const p = parseISO(s); return Date.UTC(p.y, p.m - 1, p.d); };
  const deMs = (t) => { const d = new Date(t); return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); };
  const addDias = (s, n) => deMs(ms(s) + n * 86400000);
  const difDias = (a, b) => Math.round((ms(b) - ms(a)) / 86400000);
  const diaSemana = (s) => (new Date(ms(s)).getUTCDay() + 6) % 7; // lunes = 0
  const inicioSemana = (s) => addDias(s, -diaSemana(s));
  const diasEnMes = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  function listarDias(desde, hasta) {
    const out = [];
    for (let d = desde; d <= hasta; d = addDias(d, 1)) out.push(d);
    return out;
  }
  function fechaCorta(s) { const p = parseISO(s); return p ? `${p.d} ${MESES_CORTOS[p.m - 1]} ${p.y}` : '—'; }
  function fechaLarga(s) {
    const p = parseISO(s); if (!p) return '—';
    return `${DIAS[diaSemana(s)]} ${p.d} de ${MESES[p.m - 1]} de ${p.y}`;
  }
  function fechaHoraBogota(nowMs) { const h = hoyISO(nowMs); return `${fechaCorta(h)}, ${horaActual(nowMs)} (hora de Colombia)`; }

  /** Período: kind = dia | semana | mes | trimestre | ano | rango */
  function periodo(kind, anchor, hasta) {
    const p = parseISO(anchor);
    if (!p) throw new Error('Fecha inválida');
    let desde, h, etiqueta;
    switch (kind) {
      case 'dia': desde = h = anchor; etiqueta = fechaCorta(anchor); break;
      case 'semana': desde = inicioSemana(anchor); h = addDias(desde, 6); etiqueta = `Semana ${fechaCorta(desde)} – ${fechaCorta(h)}`; break;
      case 'mes': desde = iso(p.y, p.m, 1); h = iso(p.y, p.m, diasEnMes(p.y, p.m)); etiqueta = `${MESES[p.m - 1][0].toUpperCase() + MESES[p.m - 1].slice(1)} de ${p.y}`; break;
      case 'trimestre': {
        const q = Math.floor((p.m - 1) / 3);
        desde = iso(p.y, q * 3 + 1, 1); h = iso(p.y, q * 3 + 3, diasEnMes(p.y, q * 3 + 3));
        etiqueta = `Trimestre ${q + 1} de ${p.y}`; break;
      }
      case 'ano': desde = iso(p.y, 1, 1); h = iso(p.y, 12, 31); etiqueta = `Año ${p.y}`; break;
      case 'rango':
        if (!esFecha(hasta) || hasta < anchor) throw new Error('Rango inválido');
        desde = anchor; h = hasta; etiqueta = `${fechaCorta(desde)} – ${fechaCorta(h)}`; break;
      default: throw new Error('Tipo de período desconocido');
    }
    return { kind, desde, hasta: h, etiqueta };
  }
  function periodoAnterior(pr) {
    switch (pr.kind) {
      case 'dia': return periodo('dia', addDias(pr.desde, -1));
      case 'semana': return periodo('semana', addDias(pr.desde, -7));
      case 'mes': case 'trimestre': case 'ano': return periodo(pr.kind, addDias(pr.desde, -1));
      default: {
        const len = difDias(pr.desde, pr.hasta) + 1;
        return periodo('rango', addDias(pr.desde, -len), addDias(pr.desde, -1));
      }
    }
  }
  function periodoSiguiente(pr) {
    if (pr.kind === 'rango') { const len = difDias(pr.desde, pr.hasta) + 1; return periodo('rango', addDias(pr.hasta, 1), addDias(pr.hasta, len)); }
    return periodo(pr.kind, addDias(pr.hasta, 1));
  }
  /** Período anterior "justo": si el actual no ha terminado, compara solo los mismos días transcurridos. */
  function periodoAnteriorComparable(pr, hoy) {
    const prev = periodoAnterior(pr);
    if (hoy >= pr.desde && hoy < pr.hasta) {
      const transcurridos = difDias(pr.desde, hoy) + 1;
      const hastaPrev = addDias(prev.desde, transcurridos - 1);
      return { desde: prev.desde, hasta: hastaPrev < prev.hasta ? hastaPrev : prev.hasta, dias: transcurridos, parcial: true, etiqueta: prev.etiqueta };
    }
    return { desde: prev.desde, hasta: prev.hasta, dias: difDias(prev.desde, prev.hasta) + 1, parcial: false, etiqueta: prev.etiqueta };
  }

  // ====================================================== Números y dinero (formato colombiano)
  function redondear(n, d) { const f = Math.pow(10, d == null ? 2 : d); return Math.round((n + Number.EPSILON) * f) / f; }
  function fmtNumero(n, dec, recortar) {
    if (!Number.isFinite(n)) return '—';
    dec = dec || 0;
    const s = Math.abs(n).toFixed(dec);
    let [i, f = ''] = s.split('.');
    i = i.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    if (recortar) f = f.replace(/0+$/, '');
    const neg = n < 0 && Number(s) !== 0;
    return (neg ? '-' : '') + (f ? i + ',' + f : i);
  }
  /** $26.000 · con dec:2 muestra centavos solo si no es un valor entero ($40,34 / $36) */
  function fmtCOP(n, o) {
    if (n == null || !Number.isFinite(n)) return '—';
    let dec = (o && o.dec) || 0;
    if (dec > 0 && Math.abs(n * Math.pow(10, dec) - Math.round(n * Math.pow(10, dec))) < 1e-9 * Math.pow(10, dec) && Math.abs(n - Math.round(n)) < 0.005) dec = 0;
    const t = fmtNumero(Math.abs(n), dec);
    return (n < 0 && Number(Math.abs(n).toFixed(dec)) !== 0 ? '-' : '') + '$' + t;
  }
  const fmtCOPc = (n, o) => (n == null || !Number.isFinite(n) ? '—' : fmtCOP(n, o) + ' COP');
  const fmtPct = (n, dec) => (n == null || !Number.isFinite(n) ? '—' : fmtNumero(n, dec == null ? 1 : dec) + '%');
  const fmtKg = (n) => (n == null || !Number.isFinite(n) ? '—' : fmtNumero(redondear(n, 3), 3, true) + ' kg');
  function fmtCompacto(n) {
    const a = Math.abs(n), s = n < 0 ? '-' : '';
    if (a >= 1e6) return s + fmtNumero(a / 1e6, a >= 1e7 ? 0 : 1, true) + ' M';
    if (a >= 1e3) return s + fmtNumero(a / 1e3, a >= 1e4 ? 0 : 1, true) + ' mil';
    return s + fmtNumero(a, 0);
  }
  /** Interpreta lo que escribe el usuario: "26.000", "26000", "40,34", "40.34", "$ 1.092". NaN si no es válido. */
  function parseNumero(s) {
    if (typeof s === 'number') return Number.isFinite(s) ? s : NaN;
    if (s == null) return NaN;
    let t = String(s).trim().replace(/[\s$]|COP/gi, '');
    if (t === '') return NaN;
    let neg = false;
    if (t[0] === '-' || t[0] === '−') { neg = true; t = t.slice(1); }
    if (!/^[0-9.,]+$/.test(t)) return NaN;
    const lc = t.lastIndexOf(','), ld = t.lastIndexOf('.');
    let ent, dec = '';
    if (lc >= 0) {
      ent = t.slice(0, lc).replace(/\./g, ''); dec = t.slice(lc + 1);
      if (/[.,]/.test(dec) || /,/.test(ent)) return NaN;
      if (t.slice(0, lc).indexOf('.') >= 0 && !/^\d{1,3}(\.\d{3})+$/.test(t.slice(0, lc))) return NaN;
    } else if (ld >= 0) {
      const despues = t.slice(ld + 1), puntos = (t.match(/\./g) || []).length;
      if (puntos === 1 && despues.length > 0 && despues.length <= 2) { ent = t.slice(0, ld); dec = despues; }
      else { if (!/^\d{1,3}(\.\d{3})+$/.test(t)) return NaN; ent = t.replace(/\./g, ''); }
    } else ent = t;
    if (ent === '') ent = '0';
    const n = parseFloat(ent + (dec ? '.' + dec : ''));
    return Number.isFinite(n) ? (neg ? -n : n) : NaN;
  }

  // ====================================================== Fórmulas básicas con motivo cuando no se pueden calcular
  const ok = (valor, extra) => Object.assign({ ok: true, valor }, extra || {});
  const no = (motivo) => ({ ok: false, valor: null, motivo });
  const esNum = (x) => typeof x === 'number' && Number.isFinite(x);

  /** Margen bruto % = (precio − costo) / precio × 100 */
  function calcMargen(precio, costo) {
    if (!esNum(costo)) return no('No se puede calcular el costo total (ver los datos que faltan).');
    if (!esNum(precio)) return no('Falta el precio de venta al tendero.');
    if (precio <= 0) return no('El precio de venta es cero o negativo: el margen no es calculable.');
    return ok((precio - costo) / precio * 100);
  }
  /** ROI unitario % = (precio − costo) / costo × 100 */
  function calcRoi(precio, costo) {
    if (!esNum(costo)) return no('No se puede calcular el costo total (ver los datos que faltan).');
    if (!esNum(precio)) return no('Falta el precio de venta al tendero.');
    if (costo <= 0) return no('El costo total es cero o negativo: el ROI no es calculable.');
    return ok((precio - costo) / costo * 100);
  }
  function variacion(actual, anterior) {
    if (!esNum(anterior) || anterior === 0) return { estado: 'sin_base', abs: null, pct: null };
    const abs = actual - anterior, pct = abs / anterior * 100;
    return { estado: abs > 0 ? 'sube' : abs < 0 ? 'baja' : 'igual', abs, pct };
  }

  // ====================================================== Configuración inicial (REFERENCIAS, editables)
  function costosIniciales(hoy) {
    return {
      modoCafe: 'comprado', // 'comprado' (actividad actual) | 'procesado' (café verde + maquinaria propia)
      cafe: {
        comprado: { precioKg: 26000, actualizado: hoy, referencia: true },
        procesado: { fuente: 'ultimo_lote', costoKgManual: null },
      },
      bolsas: {
        precioKg: 12500, actualizado: hoy,
        refs: {
          pequena: { nombre: 'Bolsa pequeña', usadaEn: '42 g y 60 g', costoReferencia: 40.34, costoReal: null, pesoG: null, metodo: 'referencia' },
          mediana: { nombre: 'Bolsa mediana', usadaEn: '125 g', costoReferencia: 36, costoReal: null, pesoG: null, metodo: 'referencia' },
          grande: { nombre: 'Bolsa grande', usadaEn: '225 g y 425 g', costoReferencia: 58, costoReal: null, pesoG: null, metodo: 'referencia' },
        },
      },
      etiquetas: { precioMetro: 24000, actualizado: hoy, metodo: 'teorico' }, // 'teorico' | 'real'
      otros: [], // { id, concepto, nombre, tipo: unidad|kg|lote|mensual|gasto, valor, unidadesPorLote, productos:'todos'|[ids], activo, desde }
    };
  }
  function productosIniciales() {
    const mk = (g, bolsaRef, rend) => ({
      nombre: `${g} g`, gramos: g, bolsaRef, etiquetasPorMetro: rend, etiquetaCostoReal: null,
      precioTienda: null, precioEspecial: null, cantEspecial: null, precioPublico: null, activo: true,
    });
    return [mk(42, 'pequena', 168), mk(60, 'pequena', 118), mk(125, 'mediana', 90), mk(225, 'grande', 64), mk(425, 'grande', 64)];
  }
  const CONCEPTOS_OTROS = ['Mano de obra', 'Transporte', 'Energía', 'Combustible', 'Mantenimiento', 'Depreciación de maquinaria', 'Empaque secundario', 'Otro'];
  const TIPOS_OTROS = {
    unidad: 'Costo por unidad', kg: 'Costo por kilogramo', lote: 'Costo por lote',
    mensual: 'Costo mensual', gasto: 'Gasto operativo (plantilla)',
  };

  // ====================================================== Café
  function promedioPonderado(lotes) {
    let kg = 0, c = 0;
    for (const l of lotes) if (l.kgUtilizables > 0 && esNum(l.costoKg)) { kg += l.kgUtilizables; c += l.kgUtilizables * l.costoKg; }
    return kg > 0 ? c / kg : null;
  }
  const porFecha = (a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.id || 0) - (b.id || 0));

  /** Costo por kg de café utilizable según el modo elegido (nada oculto: siempre dice de dónde sale). */
  function costoCafeKg(costos, lotes, valoracion) {
    lotes = lotes || [];
    const modo = costos.modoCafe;
    if (modo === 'comprado') {
      const v = costos.cafe.comprado.precioKg;
      if (!(v > 0)) return no('Falta el precio del café tostado y molido por kilogramo (Costos → Café).');
      const lp = lotes.filter((l) => l.modo === 'comprado');
      if (valoracion === 'promedio_ponderado') {
        const pp = promedioPonderado(lp);
        if (pp != null) return ok(pp, { fuente: 'Promedio ponderado de compras de café tostado y molido', modo });
      }
      return ok(v, { fuente: 'Precio vigente del café tostado y molido comprado', modo });
    }
    const proc = costos.cafe.procesado;
    const lp = lotes.filter((l) => l.modo === 'procesado' && l.kgUtilizables > 0 && esNum(l.costoKg)).sort(porFecha);
    if (proc.fuente === 'manual') {
      if (!(proc.costoKgManual > 0)) return no('Falta el costo por kg del café procesado: escribe un costo manual o registra un lote (Costos → Café).');
      return ok(proc.costoKgManual, { fuente: 'Costo manual del café procesado', modo });
    }
    if (!lp.length) return no('Aún no hay lotes de café verde procesado: registra una compra de café verde (con pesos reales) o escribe un costo manual.');
    if (proc.fuente === 'promedio_ponderado' || valoracion === 'promedio_ponderado')
      return ok(promedioPonderado(lp), { fuente: 'Promedio ponderado de los lotes procesados', modo });
    const u = lp[lp.length - 1];
    return ok(u.costoKg, { fuente: `Último lote procesado (${u.referencia || fechaCorta(u.fecha)})`, modo });
  }

  /** Lote de café ya tostado y molido comprado a un proveedor. */
  function calcLoteComprado(l) {
    const kg = l.kg, precio = l.precioKg;
    if (!(kg > 0)) return no('Falta la cantidad comprada en kg.');
    if (!(precio >= 0) || !esNum(precio)) return no('Falta el precio por kg.');
    const extra = (l.transporte || 0) + (l.otros || 0);
    const costoMaterial = kg * precio, costoTotal = costoMaterial + extra, costoKg = costoTotal / kg;
    return ok(costoTotal, { costoMaterial, costoTotal, costoKg, costoGramo: costoKg / 1000, kgUtilizables: kg });
  }
  /** Lote de café verde para tostar y moler con maquinaria propia. Usa pesos REALES; si no hay, usa % de pérdida marcado como estimado. */
  function calcLoteProcesado(l) {
    const errores = [];
    const verde = l.kgVerde;
    if (!(verde > 0)) return no('Falta los kg de café verde comprados.');
    if (!(l.precioKgVerde >= 0) || !esNum(l.precioKgVerde)) return no('Falta el precio por kg del café verde.');
    let tostado = null, estimado = false;
    if (esNum(l.pesoTostado) && l.pesoTostado > 0) tostado = l.pesoTostado;
    else if (esNum(l.perdidaPct) && l.perdidaPct >= 0 && l.perdidaPct < 100) { tostado = verde * (1 - l.perdidaPct / 100); estimado = true; }
    if (tostado == null) return no('Falta el peso obtenido después del tostado (o el % de pérdida estimado).');
    if (tostado > verde) return no('El peso tostado no puede ser mayor que el peso del café verde.');
    let util = tostado;
    if (esNum(l.pesoMolido) && l.pesoMolido > 0) {
      if (l.pesoMolido > tostado) return no('El peso molido no puede ser mayor que el peso tostado.');
      util = l.pesoMolido;
    }
    const costos = {
      materia: verde * l.precioKgVerde, transporte: l.transporte || 0, manoObra: l.manoObra || 0, energia: l.energia || 0,
      empaque: l.empaque || 0, mantenimiento: l.mantenimiento || 0, depreciacion: l.depreciacion || 0, otros: l.otros || 0,
    };
    const costoTotal = Object.values(costos).reduce((a, b) => a + b, 0);
    const rendimientoPct = tostado / verde * 100;
    return ok(costoTotal, {
      rendimientoPct, perdidaPct: 100 - rendimientoPct, kgTostados: tostado, kgUtilizables: util, estimado,
      costoTotal, costoKg: costoTotal / util, costoGramo: costoTotal / util / 1000, desglose: costos, errores,
    });
  }
  function compararCafe(costoKgComprado, costoKgProcesado) {
    if (!esNum(costoKgComprado) || !esNum(costoKgProcesado)) return no('Necesitas el costo por kg de las dos formas (comprado y procesado).');
    const dif = costoKgProcesado - costoKgComprado;
    return ok(dif, { porKg: dif, pct: costoKgComprado > 0 ? dif / costoKgComprado * 100 : null, conviene: dif < 0 ? 'procesar' : dif > 0 ? 'comprar' : 'igual' });
  }

  // ====================================================== Bolsas
  const bolsasPorKg = (pesoG) => (pesoG > 0 ? 1000 / pesoG : null);
  /** Método B: peso de la bolsa vacía (g) / 1000 × precio por kg del material */
  const costoBolsaTeorico = (pesoG, precioKg) => (pesoG > 0 && precioKg >= 0 && esNum(precioKg) ? (pesoG / 1000) * precioKg : null);
  /** Método A: costo total del lote / bolsas recibidas */
  const costoBolsaReal = (costoLote, n) => (costoLote >= 0 && n > 0 ? costoLote / n : null);

  function costoBolsaRef(costos, clave) {
    const r = costos.bolsas.refs[clave];
    if (!r) return Object.assign(no('Este producto no tiene un tipo de bolsa asignado.'), { calculable: false });
    const teorico = costoBolsaTeorico(r.pesoG, costos.bolsas.precioKg);
    const real = r.costoReal > 0 ? r.costoReal : null;
    const referencia = esNum(r.costoReferencia) && r.costoReferencia >= 0 && r.costoReferencia !== null ? r.costoReferencia : null;
    let valor = null, motivo = null;
    if (r.metodo === 'real') { valor = real; if (valor == null) motivo = `Pendiente de datos: escribe el costo real por unidad de la ${r.nombre.toLowerCase()} (Costos → Bolsas).`; }
    else if (r.metodo === 'teorico') { valor = teorico; if (valor == null) motivo = `Pendiente de datos: falta el peso de la ${r.nombre.toLowerCase()} vacía (g) o el precio por kg del material.`; }
    else { valor = referencia; if (valor == null) motivo = `Pendiente de datos: falta el costo de referencia por unidad de la ${r.nombre.toLowerCase()}.`; }
    const contraste = real != null ? { valor: real, nombre: 'real' } : referencia != null ? { valor: referencia, nombre: 'de referencia' } : null;
    return {
      ok: valor != null, calculable: valor != null, valor, motivo, metodo: r.metodo, nombre: r.nombre,
      por100: valor != null ? valor * 100 : null, teorico, real, referencia, pesoG: r.pesoG || null, precioKg: costos.bolsas.precioKg,
      bolsasPorKg: bolsasPorKg(r.pesoG),
      diferencia: teorico != null && contraste ? { valor: teorico - contraste.valor, contraCon: contraste.nombre } : null,
    };
  }

  // ====================================================== Etiquetas
  const costoEtiquetaTeorico = (precioMetro, rend) => (rend > 0 && precioMetro >= 0 && esNum(precioMetro) ? precioMetro / rend : null);
  function costoEtiquetaProducto(costos, prod) {
    const teorico = costoEtiquetaTeorico(costos.etiquetas.precioMetro, prod.etiquetasPorMetro);
    const real = prod.etiquetaCostoReal > 0 ? prod.etiquetaCostoReal : null;
    const metodo = costos.etiquetas.metodo;
    let valor = null, motivo = null;
    if (metodo === 'real') { valor = real; if (valor == null) motivo = `Pendiente de datos: escribe el costo real por etiqueta de ${prod.nombre} o cambia a costo teórico (Costos → Etiquetas).`; }
    else { valor = teorico; if (valor == null) motivo = `Pendiente de datos: falta el precio por metro o las etiquetas por metro de ${prod.nombre} (Costos → Etiquetas).`; }
    return {
      ok: valor != null, calculable: valor != null, valor, motivo, metodo, teorico, real,
      por100: valor != null ? valor * 100 : null, precioMetro: costos.etiquetas.precioMetro, rend: prod.etiquetasPorMetro || null,
      diferencia: teorico != null && real != null ? teorico - real : null,
    };
  }
  /** Compra de etiquetas: metros × rendimiento × (1 − desperdicio) = etiquetas útiles. */
  function calcCompraEtiquetas(c) {
    if (!(c.metros > 0)) return no('Falta los metros comprados.');
    if (!(c.rend > 0)) return no('Faltan las etiquetas por metro de esta presentación.');
    const desp = esNum(c.desperdicioPct) ? c.desperdicioPct : 0;
    if (desp < 0 || desp >= 100) return no('El desperdicio debe estar entre 0 y 99,9%.');
    const bruto = c.metros * c.rend, utiles = bruto * (1 - desp / 100);
    return ok(utiles, { bruto, utiles, costoUnit: c.costoTotal >= 0 && esNum(c.costoTotal) ? c.costoTotal / utiles : null });
  }

  // ====================================================== Otros costos
  const otroAplica = (o, prod) => !o.productos || o.productos === 'todos' || (Array.isArray(o.productos) && o.productos.includes(prod.id));
  function otrosCostosUnit(costos, prod) {
    const items = [], issues = [];
    let total = 0;
    for (const o of costos.otros || []) {
      if (!o.activo || !['unidad', 'kg', 'lote'].includes(o.tipo) || !otroAplica(o, prod)) continue;
      if (!(o.valor >= 0)) continue;
      let v = null;
      if (o.tipo === 'unidad') v = o.valor;
      else if (o.tipo === 'kg') v = (prod.gramos / 1000) * o.valor;
      else if (o.tipo === 'lote') {
        if (o.unidadesPorLote > 0) v = o.valor / o.unidadesPorLote;
        else issues.push(`Pendiente de datos: indica cuántas unidades salen por lote en «${o.nombre}».`);
      }
      if (v != null) { items.push({ id: o.id, nombre: o.nombre, tipo: o.tipo, valor: v }); total += v; }
    }
    return { total, items, issues };
  }
  /** Costos mensuales configurados, prorrateados por días hasta hoy (evita cobrar un mes que no ha terminado). */
  function prorrateoMensual(costos, desde, hasta, hoy) {
    const fin = hoy && hoy < hasta ? hoy : hasta;
    let total = 0; const detalle = [];
    if (fin < desde) return { total: 0, detalle };
    for (const o of costos.otros || []) {
      if (!o.activo || o.tipo !== 'mensual' || !(o.valor > 0)) continue;
      const ini = o.desde && o.desde > desde ? o.desde : desde;
      if (fin < ini) continue;
      let sub = 0;
      for (let d = ini; d <= fin;) {
        const p = parseISO(d), finMes = iso(p.y, p.m, diasEnMes(p.y, p.m)), tope = finMes < fin ? finMes : fin;
        sub += o.valor * ((difDias(d, tope) + 1) / diasEnMes(p.y, p.m));
        d = addDias(tope, 1);
      }
      total += sub; detalle.push({ id: o.id, nombre: o.nombre, valor: sub });
    }
    return { total, detalle };
  }

  // ====================================================== Costo y rentabilidad por presentación
  function costoProducto(prod, ctx) {
    const { costos, lotes, valoracion } = ctx;
    const faltan = [];
    const cafeKg = costoCafeKg(costos, lotes, valoracion);
    const cafe = cafeKg.ok ? (prod.gramos / 1000) * cafeKg.valor : null;
    if (!cafeKg.ok) faltan.push(cafeKg.motivo);
    const bolsa = costoBolsaRef(costos, prod.bolsaRef);
    if (!bolsa.ok) faltan.push(bolsa.motivo);
    const etiqueta = costoEtiquetaProducto(costos, prod);
    if (!etiqueta.ok) faltan.push(etiqueta.motivo);
    const otros = otrosCostosUnit(costos, prod);
    faltan.push(...otros.issues);
    const completo = cafe != null && bolsa.ok && etiqueta.ok && otros.issues.length === 0;
    const total = completo ? cafe + bolsa.valor + etiqueta.valor + otros.total : null;
    const precio = prod.precioTienda > 0 ? prod.precioTienda : null;
    const ganancia = completo && precio != null ? precio - total : null;
    const margen = calcMargen(precio, total), roi = calcRoi(precio, total);
    if (completo && precio == null) faltan.push('Pendiente de datos: escribe el precio de venta al tendero de ' + prod.nombre + ' (Productos).');
    return {
      productoId: prod.id, nombre: prod.nombre, gramos: prod.gramos, completo, faltan,
      cafe, cafeKg, bolsa, etiqueta, otros, total, precio, ganancia, margen, roi,
      precioPublico: prod.precioPublico > 0 ? prod.precioPublico : null,
      precioEspecial: prod.precioEspecial > 0 ? prod.precioEspecial : null, cantEspecial: prod.cantEspecial || null,
      negativo: ganancia != null && ganancia < 0,
    };
  }
  function tablaCostos(productos, ctx) { return productos.map((p) => costoProducto(p, ctx)); }
  /** Foto de costo para guardar en una venta: queda congelada aunque después cambien los precios. */
  function fotoCosto(c) {
    if (!c || !c.completo) return null;
    return { cafe: c.cafe, bolsa: c.bolsa.valor, etiqueta: c.etiqueta.valor, otros: c.otros.total, total: c.total };
  }
  /** Precio unitario sugerido para una línea de venta: precio especial si se llega a la cantidad mínima. */
  function precioParaCantidad(prod, cantidad) {
    if (prod.precioEspecial > 0 && prod.cantEspecial > 0 && cantidad >= prod.cantEspecial) return prod.precioEspecial;
    return prod.precioTienda > 0 ? prod.precioTienda : null;
  }

  // ====================================================== Producción
  function costoProduccion(p) {
    if (!(p.buenas > 0)) return no('Indica cuántas unidades buenas se elaboraron.');
    if (!(p.kgConsumidos >= 0)) return no('Indica el café consumido en kg.');
    if (!esNum(p.costoKgCafe)) return no('El lote de café no tiene costo por kg.');
    if (!esNum(p.costoBolsa) || !esNum(p.costoEtiqueta)) return no('Faltan el costo de la bolsa o de la etiqueta.');
    const cafe = p.kgConsumidos * p.costoKgCafe, bolsas = (p.bolsas || 0) * p.costoBolsa, etiquetas = (p.etiquetas || 0) * p.costoEtiqueta;
    const otros = (p.otrosUnit || 0) * p.buenas, total = cafe + bolsas + etiquetas + otros;
    return ok(total / p.buenas, { total, unit: total / p.buenas, cafe, bolsas, etiquetas, otros });
  }

  // ====================================================== Inventario
  const claveInv = (item, clave) => `${item}:${clave}`;
  function stock(movs) {
    const m = {};
    for (const x of movs) { const k = claveInv(x.item, x.clave); m[k] = redondear((m[k] || 0) + x.cantidad, 6); }
    return m;
  }
  function movimientosVenta(venta, ventaId) {
    if (!venta.descuenta) return [];
    const por = {};
    for (const it of venta.items || []) por[it.productoId] = (por[it.productoId] || 0) + it.cantidad;
    return Object.keys(por).map((pid) => ({
      fecha: venta.fecha, item: 'terminado', clave: String(pid), cantidad: -por[pid], motivo: 'venta', refTipo: 'venta', refId: ventaId,
    }));
  }
  function movimientosProduccion(p, prodId) {
    const b = { fecha: p.fecha, motivo: 'produccion', refTipo: 'produccion', refId: prodId };
    const out = [
      Object.assign({ item: 'cafe', clave: String(p.loteId), cantidad: -p.kgConsumidos }, b),
      Object.assign({ item: 'terminado', clave: String(p.productoId), cantidad: p.buenas }, b),
    ];
    if (p.bolsas > 0) out.push(Object.assign({ item: 'bolsa', clave: p.bolsaRef, cantidad: -p.bolsas }, b));
    if (p.etiquetas > 0) out.push(Object.assign({ item: 'etiqueta', clave: String(p.productoId), cantidad: -p.etiquetas }, b));
    return out;
  }
  /** Devuelve las existencias que quedarían negativas si se aplican los movimientos nuevos. */
  function advertenciasStock(movsActuales, movsNuevos) {
    const antes = stock(movsActuales), despues = stock(movsActuales.concat(movsNuevos)), out = [];
    const tocados = new Set(movsNuevos.map((x) => claveInv(x.item, x.clave)));
    for (const k of tocados) if ((despues[k] || 0) < -1e-9) out.push({ clave: k, disponible: antes[k] || 0, quedaria: despues[k] });
    return out;
  }

  // ====================================================== Ventas: series, resultados, clasificación de días
  function valorVenta(v, productoId) {
    if (!productoId) return v.monto;
    return (v.items || []).filter((i) => i.productoId === productoId).reduce((a, i) => a + i.cantidad * i.precioUnit, 0);
  }
  const enRango = (arr, desde, hasta, campo) => arr.filter((x) => x[campo || 'fecha'] >= desde && x[campo || 'fecha'] <= hasta);
  function totalesPorDia(ventas, productoId) {
    const m = {};
    for (const v of ventas) {
      const val = valorVenta(v, productoId);
      if (productoId && !(val > 0)) continue;
      const e = m[v.fecha] || (m[v.fecha] = { total: 0, n: 0 });
      e.total += val; e.n += 1;
    }
    return m;
  }
  const sumaVentas = (ventas, desde, hasta, productoId) => {
    let t = 0, n = 0;
    for (const v of ventas) if (v.fecha >= desde && v.fecha <= hasta) { const x = valorVenta(v, productoId); if (productoId && !(x > 0)) continue; t += x; n++; }
    return { total: t, n };
  };
  /** Serie para gráficos: por día (día/semana/mes/rango) o por mes (trimestre/año). */
  function serie(pr, ventas, productoId) {
    const porDia = totalesPorDia(ventas, productoId);
    const labels = [], fechas = [], values = [], conteos = [];
    if (pr.kind === 'trimestre' || pr.kind === 'ano') {
      const a = parseISO(pr.desde), b = parseISO(pr.hasta);
      for (let m = a.m; m <= b.m; m++) {
        const d1 = iso(a.y, m, 1), d2 = iso(a.y, m, diasEnMes(a.y, m));
        let t = 0, n = 0;
        for (const d in porDia) if (d >= d1 && d <= d2) { t += porDia[d].total; n += porDia[d].n; }
        labels.push(MESES_CORTOS[m - 1]); fechas.push(d1); values.push(t); conteos.push(n);
      }
    } else {
      for (const d of listarDias(pr.desde, pr.hasta)) {
        const e = porDia[d];
        labels.push(pr.kind === 'semana' ? DIAS_CORTOS[diaSemana(d)] : String(parseISO(d).d));
        fechas.push(d); values.push(e ? e.total : 0); conteos.push(e ? e.n : 0);
      }
    }
    return { labels, fechas, values, conteos };
  }
  function clasificarDias(desde, hasta, hoy, ventas, diasCero) {
    const con = new Set(ventas.map((v) => v.fecha)), cero = new Set(diasCero || []);
    let conVentas = 0, sinVentas = 0, sinInfo = 0, futuros = 0;
    for (const d of listarDias(desde, hasta)) {
      if (d > hoy) futuros++;
      else if (con.has(d)) conVentas++;
      else if (cero.has(d)) sinVentas++;
      else sinInfo++;
    }
    return { conVentas, sinVentas, sinInfo, futuros };
  }
  function topDias(ventas, desde, hasta, n, productoId) {
    const por = totalesPorDia(enRango(ventas, desde, hasta), productoId);
    return Object.keys(por).map((f) => ({ fecha: f, total: por[f].total, n: por[f].n })).sort((a, b) => b.total - a.total).slice(0, n || 5);
  }
  function promedios(ventas, desde, hasta, hoy, diasCero) {
    const cl = clasificarDias(desde, hasta, hoy, enRango(ventas, desde, hasta), diasCero);
    const total = sumaVentas(ventas, desde, hasta).total;
    const diasInfo = cl.conVentas + cl.sinVentas;
    return {
      total, diasInfo, diasConVentas: cl.conVentas,
      porDiaConInfo: diasInfo > 0 ? total / diasInfo : null,
      porDiaConVentas: cl.conVentas > 0 ? total / cl.conVentas : null,
    };
  }

  /** Estado de resultados del período (nivel 3). Solo se calcula utilidad cuando TODAS las ventas tienen costo conocido. */
  function resultadoPeriodo(o) {
    const { ventas, gastos, costos, desde, hasta, hoy } = o;
    const vs = enRango(ventas, desde, hasta);
    const ingresos = vs.reduce((a, v) => a + v.monto, 0);
    const conCosto = vs.filter((v) => v.tipo === 'detallada' && v.items && v.items.length && v.items.every((i) => esNum(i.costoUnit)));
    const ingresosDet = conCosto.reduce((a, v) => a + v.monto, 0);
    const cogs = conCosto.reduce((a, v) => a + v.items.reduce((s, i) => s + i.cantidad * i.costoUnit, 0), 0);
    const sinCosto = vs.length - conCosto.length;
    const cobertura = ingresos > 0 ? ingresosDet / ingresos * 100 : null;
    const completo = vs.length > 0 && sinCosto === 0;
    const gs = enRango(gastos || [], desde, hasta);
    const suma = (t) => gs.filter((g) => g.tipo === t).reduce((a, g) => a + g.monto, 0);
    const gastosOp = suma('operativo'), otrosGastos = suma('otro_gasto'), otrosIngresos = suma('otro_ingreso'), prestamos = suma('pago_prestamo');
    const mens = prorrateoMensual(costos || { otros: [] }, desde, hasta, hoy);
    const gananciaBrutaDet = ingresosDet - cogs;
    const gananciaOperativa = completo ? gananciaBrutaDet - gastosOp - mens.total : null;
    const gananciaNeta = completo ? gananciaOperativa + otrosIngresos - otrosGastos : null;
    let estado = 'sin_ventas';
    if (vs.length) estado = conCosto.length === 0 ? 'sin_detalle' : completo ? 'completo' : 'parcial';
    return {
      estado, nVentas: vs.length, nSinCosto: sinCosto, ingresos, ingresosDet, ingresosSinCosto: ingresos - ingresosDet, cobertura, cogs: conCosto.length ? cogs : null,
      gananciaBruta: conCosto.length ? gananciaBrutaDet : null,
      margenBruto: ingresosDet > 0 ? gananciaBrutaDet / ingresosDet * 100 : null,
      gastosOp, costosMensuales: mens.total, detalleMensuales: mens.detalle, gastosTotalOp: gastosOp + mens.total, otrosGastos, otrosIngresos, prestamos,
      gananciaOperativa, gananciaNeta, margenNeto: completo && ingresos > 0 ? gananciaNeta / ingresos * 100 : null,
      completo,
    };
  }
  /** Rentabilidad por producto con ventas detalladas (usa la foto de costo guardada en cada línea). */
  function rentabilidadPorProducto(ventas, desde, hasta) {
    const m = {};
    for (const v of enRango(ventas, desde, hasta)) for (const i of v.items || []) {
      const e = m[i.productoId] || (m[i.productoId] = { productoId: i.productoId, nombre: i.nombre, unidades: 0, ingresos: 0, costo: 0, unidadesSinCosto: 0 });
      e.unidades += i.cantidad; e.ingresos += i.cantidad * i.precioUnit;
      if (esNum(i.costoUnit)) e.costo += i.cantidad * i.costoUnit; else e.unidadesSinCosto += i.cantidad;
    }
    return Object.values(m).map((e) => {
      const completo = e.unidadesSinCosto === 0;
      return Object.assign(e, { completo, ganancia: completo ? e.ingresos - e.costo : null, margen: completo && e.ingresos > 0 ? (e.ingresos - e.costo) / e.ingresos * 100 : null });
    }).sort((a, b) => b.ingresos - a.ingresos);
  }

  // ====================================================== Inversiones y ROI
  /** Reparte lo recuperado entre las inversiones en orden cronológico (FIFO). */
  function resumenInversiones(movs) {
    const aportes = movs.filter((m) => m.tipo !== 'recuperacion').sort(porFecha);
    const rec = movs.filter((m) => m.tipo === 'recuperacion');
    const invertido = aportes.reduce((a, m) => a + m.valor, 0);
    const recuperado = rec.reduce((a, m) => a + m.valor, 0);
    let resto = recuperado;
    const lista = aportes.map((m) => {
      const parte = Math.min(m.valor, resto); resto -= parte;
      const pct = m.valor > 0 ? parte / m.valor * 100 : 0;
      return Object.assign({}, m, { recuperadoParte: parte, estado: pct >= 99.999 ? 'Recuperada' : parte > 0 ? 'Parcial' : 'Pendiente', pct });
    });
    return { invertido, recuperado, falta: Math.max(0, invertido - recuperado), exceso: Math.max(0, recuperado - invertido), pct: invertido > 0 ? recuperado / invertido * 100 : null, lista };
  }
  /** ROI contable = beneficio neto atribuible / inversión total × 100 (nunca con ventas como beneficio). */
  function roiContable(beneficio, inversion) {
    const faltan = [];
    if (!(inversion > 0)) faltan.push('Registra al menos una inversión (Inversiones).');
    if (!esNum(beneficio)) faltan.push('Falta el beneficio neto del período: registra ventas detalladas con costo y gastos, o escribe el beneficio manualmente.');
    if (faltan.length) return { ok: false, valor: null, motivo: faltan.join(' '), faltan };
    return ok(beneficio / inversion * 100, { beneficio, inversion });
  }

  // ====================================================== Alertas del panel
  function generarAlertas(c) {
    const out = [];
    const add = (nivel, texto) => out.push({ nivel, texto });
    for (const h of c.historialCostos || []) {
      if (typeof h.nuevo !== 'number' || typeof h.anterior !== 'number' || !(h.nuevo > h.anterior) || !(h.anterior > 0)) continue;
      if (!/^(cafe_kg|cafe_proc|bolsas_kg|bolsa_ref|bolsa_real|etiq_metro|etiq_real|otro_)/.test(h.concepto)) continue;
      if (difDias(h.fecha, c.hoy) <= 45) add('warn', `El costo «${h.etiqueta}» subió de ${fmtCOP(h.anterior, { dec: 2 })} a ${fmtCOP(h.nuevo, { dec: 2 })} (${fechaCorta(h.fecha)}).`);
    }
    const snaps = (c.snapshots || []).slice().sort(porFecha);
    if (snaps.length >= 2) {
      const a = snaps[snaps.length - 2], b = snaps[snaps.length - 1];
      for (const nb of b.items) {
        const na = a.items.find((x) => x.productoId === nb.productoId);
        if (na && esNum(na.margen) && esNum(nb.margen) && na.margen - nb.margen >= 0.5)
          add('warn', `El margen de ${nb.nombre} bajó de ${fmtPct(na.margen)} a ${fmtPct(nb.margen)}.`);
      }
    }
    if (c.comparacion && c.comparacion.estado === 'baja') add('warn', `Las ventas son inferiores a las del período anterior (${fmtPct(Math.abs(c.comparacion.pct))} menos).`);
    for (const t of c.tabla || []) if (t.negativo) add('bad', `${t.nombre} tiene rentabilidad negativa: cuesta ${fmtCOP(t.total, { dec: 2 })} y se vende a ${fmtCOP(t.precio)}.`);
    const sinPrecio = (c.tabla || []).filter((t) => t.precio == null);
    if (sinPrecio.length) add('info', `Pendiente de datos: falta el precio de venta de ${sinPrecio.map((t) => t.nombre).join(', ')} (Productos).`);
    const sinCosto = (c.tabla || []).filter((t) => !t.completo);
    if (sinCosto.length) add('info', `Pendiente de datos: no se puede calcular el costo de ${sinCosto.map((t) => t.nombre).join(', ')}. Revisa el Centro de costos.`);
    if (c.resultado && c.resultado.estado === 'sin_detalle') add('info', 'Las ventas del período están registradas solo por monto: se conocen los ingresos, pero no la ganancia real. Registra ventas detalladas para conocerla.');
    if (c.resultado && c.resultado.estado === 'parcial') add('info', `${c.resultado.nSinCosto} venta(s) del período no tienen costo conocido; la ganancia neta queda pendiente.`);
    if (c.diasDesdeRespaldo == null) add('info', 'Aún no has creado una copia de seguridad. Hazlo desde Respaldo.');
    else if (c.diasDesdeRespaldo >= 7) add('warn', `Hace ${c.diasDesdeRespaldo} días que no creas una copia de seguridad.`);
    return out;
  }

  // ====================================================== Validaciones
  function validarVenta(v, hoy) {
    const e = [];
    if (!esNum(v.monto) || !(v.monto > 0)) e.push('El monto debe ser mayor que cero.');
    else if (v.monto > 1e12) e.push('El monto es demasiado grande.');
    if (!esFecha(v.fecha)) e.push('Elige una fecha válida.');
    else if (hoy && v.fecha > hoy) e.push('La fecha de la venta no puede ser futura.');
    if (v.hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v.hora)) e.push('La hora no es válida.');
    if (v.medio && !MEDIOS[v.medio]) e.push('Medio de pago no válido.');
    if (v.tipo === 'detallada') {
      if (!v.items || !v.items.length) e.push('Agrega al menos un producto.');
      else v.items.forEach((i, k) => {
        if (!(i.cantidad > 0)) e.push(`Línea ${k + 1}: la cantidad debe ser mayor que cero.`);
        if (!esNum(i.precioUnit) || i.precioUnit < 0) e.push(`Línea ${k + 1}: escribe el precio unitario.`);
      });
    }
    return e;
  }

  // ====================================================== Respaldo: validación del archivo
  const TABLAS = ['ventas', 'ventaDetalles', 'productos', 'historialPrecios', 'historialCostos', 'snapshots', 'compras', 'lotesCafe', 'produccion', 'inventarioMov', 'gastos', 'inversiones', 'diasSinVentas', 'config'];
  function validarRespaldo(obj) {
    const errores = [];
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errores: ['El archivo no tiene el formato de una copia de Café Mero Campo.'] };
    if (obj.app !== 'cafe-mero-campo') errores.push('El archivo no es una copia de Café Mero Campo.');
    if (obj.formato !== 1) errores.push('La versión del formato de la copia no es compatible.');
    if (!obj.datos || typeof obj.datos !== 'object') { errores.push('El archivo no contiene datos.'); return { ok: false, errores }; }
    const resumen = {};
    for (const t of TABLAS) {
      const d = obj.datos[t];
      if (d === undefined) { errores.push(`Falta la tabla «${t}».`); continue; }
      if (!Array.isArray(d)) { errores.push(`La tabla «${t}» no es válida.`); continue; }
      if (d.some((x) => x === null || typeof x !== 'object')) { errores.push(`La tabla «${t}» tiene registros dañados.`); continue; }
      resumen[t] = d.length;
    }
    const nums = (arr, campo, tabla) => { if (Array.isArray(arr)) arr.forEach((x) => { if (campo in x && !esNum(x[campo])) errores.push(`${tabla}: el valor «${campo}» no es numérico.`); }); };
    nums(obj.datos.ventas, 'monto', 'Ventas'); nums(obj.datos.gastos, 'monto', 'Gastos'); nums(obj.datos.inversiones, 'valor', 'Inversiones');
    if (Array.isArray(obj.datos.ventas)) {
      const ids = new Set();
      for (const v of obj.datos.ventas) {
        if (!esFecha(v.fecha)) { errores.push('Hay ventas con fecha inválida.'); break; }
        if (ids.has(v.id)) { errores.push('Hay ventas con identificador repetido.'); break; }
        ids.add(v.id);
      }
      if (Array.isArray(obj.datos.ventaDetalles) && obj.datos.ventaDetalles.some((d) => !ids.has(d.ventaId))) errores.push('Hay detalles de venta sin su venta.');
    }
    return { ok: errores.length === 0, errores: errores.slice(0, 8), resumen, creado: obj.creado || null };
  }

  // ====================================================== Agrupación para informes
  function agruparVentas(ventas, desde, hasta, nivel) {
    const buckets = [];
    const sumar = (d1, d2, etiqueta) => { const s = sumaVentas(ventas, d1 < desde ? desde : d1, d2 > hasta ? hasta : d2); buckets.push({ etiqueta, desde: d1 < desde ? desde : d1, hasta: d2 > hasta ? hasta : d2, total: s.total, n: s.n }); };
    if (nivel === 'dia') for (const d of listarDias(desde, hasta)) sumar(d, d, fechaCorta(d));
    else if (nivel === 'semana') for (let s = inicioSemana(desde); s <= hasta; s = addDias(s, 7)) sumar(s, addDias(s, 6), `Semana del ${fechaCorta(s < desde ? desde : s)}`);
    else if (nivel === 'mes') { const a = parseISO(desde), b = parseISO(hasta); for (let y = a.y, m = a.m; y < b.y || (y === b.y && m <= b.m); m++) { if (m > 12) { m = 1; y++; } sumar(iso(y, m, 1), iso(y, m, diasEnMes(y, m)), `${MESES[m - 1]} ${y}`); } }
    else if (nivel === 'trimestre') { const a = parseISO(desde), b = parseISO(hasta); for (let y = a.y, q = Math.floor((a.m - 1) / 3); y < b.y || (y === b.y && q <= Math.floor((b.m - 1) / 3)); q++) { if (q > 3) { q = 0; y++; } sumar(iso(y, q * 3 + 1, 1), iso(y, q * 3 + 3, diasEnMes(y, q * 3 + 3)), `T${q + 1} ${y}`); } }
    else if (nivel === 'ano') { const a = parseISO(desde), b = parseISO(hasta); for (let y = a.y; y <= b.y; y++) sumar(iso(y, 1, 1), iso(y, 12, 31), String(y)); }
    return buckets;
  }

  return {
    MESES, MESES_CORTOS, DIAS, DIAS_CORTOS, MEDIOS, PENDIENTE, TABLAS, CONCEPTOS_OTROS, TIPOS_OTROS,
    hoyISO, horaActual, parseISO, esFecha, addDias, difDias, diaSemana, inicioSemana, diasEnMes, listarDias, fechaCorta, fechaLarga, fechaHoraBogota,
    periodo, periodoAnterior, periodoSiguiente, periodoAnteriorComparable,
    redondear, fmtNumero, fmtCOP, fmtCOPc, fmtPct, fmtKg, fmtCompacto, parseNumero, esNum,
    calcMargen, calcRoi, variacion,
    costosIniciales, productosIniciales,
    promedioPonderado, costoCafeKg, calcLoteComprado, calcLoteProcesado, compararCafe,
    bolsasPorKg, costoBolsaTeorico, costoBolsaReal, costoBolsaRef,
    costoEtiquetaTeorico, costoEtiquetaProducto, calcCompraEtiquetas,
    otrosCostosUnit, prorrateoMensual, costoProducto, tablaCostos, fotoCosto, precioParaCantidad, costoProduccion,
    claveInv, stock, movimientosVenta, movimientosProduccion, advertenciasStock,
    valorVenta, enRango, totalesPorDia, sumaVentas, serie, clasificarDias, topDias, promedios, resultadoPeriodo, rentabilidadPorProducto,
    resumenInversiones, roiContable, generarAlertas, validarVenta, validarRespaldo, agruparVentas, porFecha,
  };
});
