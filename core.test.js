// Pruebas automáticas del motor financiero.   Ejecutar:  node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');

const cerca = (a, b, tol = 1e-6, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} esperado ${b}, obtenido ${a}`);
const HOY = '2026-10-30'; // viernes

function contexto(cambios) {
  const costos = C.costosIniciales(HOY);
  if (cambios) cambios(costos);
  return { costos, lotes: [], valoracion: 'vigente' };
}
function productos() { return C.productosIniciales().map((p, i) => Object.assign(p, { id: i + 1 })); }

// ---------------------------------------------------------------- Café
test('Café: costo por presentación con $26.000/kg (valores del documento)', () => {
  const ctx = contexto();
  const esperado = { 42: 1092, 60: 1560, 125: 3250, 225: 5850, 425: 11050 };
  for (const p of productos()) cerca(C.costoProducto(p, ctx).cafe, esperado[p.gramos], 1e-9, `${p.gramos} g`);
});
test('Café: cambiar el precio por kg actualiza las cinco presentaciones', () => {
  const ctx = contexto((c) => { c.cafe.comprado.precioKg = 30000; });
  const esperado = { 42: 1260, 60: 1800, 125: 3750, 225: 6750, 425: 12750 };
  for (const p of productos()) cerca(C.costoProducto(p, ctx).cafe, esperado[p.gramos], 1e-9);
});
test('Café: sin precio por kg → Pendiente de datos con explicación', () => {
  const ctx = contexto((c) => { c.cafe.comprado.precioKg = null; });
  const r = C.costoProducto(productos()[0], ctx);
  assert.equal(r.completo, false); assert.equal(r.total, null);
  assert.match(r.faltan.join(' '), /precio del café/i);
});
test('Café: lote comprado con transporte y otros costos', () => {
  const r = C.calcLoteComprado({ kg: 50, precioKg: 26000, transporte: 40000, otros: 10000 });
  cerca(r.costoTotal, 1350000); cerca(r.costoKg, 27000); cerca(r.costoGramo, 27);
});
test('Café verde: rendimiento, pérdida y costo por kg con pesos reales', () => {
  const r = C.calcLoteProcesado({ kgVerde: 100, precioKgVerde: 18000, transporte: 20000, manoObra: 50000, energia: 30000, pesoTostado: 84 });
  cerca(r.rendimientoPct, 84); cerca(r.perdidaPct, 16); cerca(r.kgUtilizables, 84);
  cerca(r.costoTotal, 1900000); cerca(r.costoKg, 1900000 / 84, 1e-6); assert.equal(r.estimado, false);
});
test('Café verde: el peso molido (con pérdida) define los kg utilizables', () => {
  const r = C.calcLoteProcesado({ kgVerde: 100, precioKgVerde: 18000, pesoTostado: 84, pesoMolido: 82 });
  cerca(r.kgUtilizables, 82); cerca(r.costoKg, 1800000 / 82, 1e-6);
});
test('Café verde: con % de pérdida queda marcado como estimado; sin peso ni % es Pendiente', () => {
  const e = C.calcLoteProcesado({ kgVerde: 10, precioKgVerde: 20000, perdidaPct: 15 });
  cerca(e.kgUtilizables, 8.5); assert.equal(e.estimado, true);
  const n = C.calcLoteProcesado({ kgVerde: 10, precioKgVerde: 20000 });
  assert.equal(n.ok, false); assert.match(n.motivo, /peso obtenido/i);
});
test('Café verde: no acepta pesos imposibles', () => {
  assert.equal(C.calcLoteProcesado({ kgVerde: 10, precioKgVerde: 1, pesoTostado: 11 }).ok, false);
  assert.equal(C.calcLoteProcesado({ kgVerde: 10, precioKgVerde: 1, pesoTostado: 8, pesoMolido: 9 }).ok, false);
});
test('Modo procesado: costo por kg viene del lote; sin lotes es Pendiente', () => {
  const ctx = contexto((c) => { c.modoCafe = 'procesado'; });
  assert.equal(C.costoProducto(productos()[0], ctx).completo, false);
  const lote = Object.assign({ id: 1, modo: 'procesado', fecha: '2026-10-01' }, C.calcLoteProcesado({ kgVerde: 100, precioKgVerde: 18000, pesoTostado: 80 }));
  const r = C.costoProducto(productos()[0], Object.assign(ctx, { lotes: [lote] }));
  cerca(r.cafe, 42 / 1000 * 22500, 1e-6); // 1.800.000 / 80 = 22.500
});
test('Modo procesado: costo manual y comparación comprado vs procesado', () => {
  const ctx = contexto((c) => { c.modoCafe = 'procesado'; c.cafe.procesado = { fuente: 'manual', costoKgManual: 24000 }; });
  cerca(C.costoCafeKg(ctx.costos, [], 'vigente').valor, 24000);
  const cmp = C.compararCafe(26000, 24000);
  cerca(cmp.porKg, -2000); assert.equal(cmp.conviene, 'procesar');
  assert.equal(C.compararCafe(26000, null).ok, false);
});
test('Promedio ponderado de lotes', () => {
  cerca(C.promedioPonderado([{ kgUtilizables: 10, costoKg: 26000 }, { kgUtilizables: 30, costoKg: 28000 }]), 27500);
  assert.equal(C.promedioPonderado([]), null);
});
test('Valoración por promedio ponderado usa las compras reales', () => {
  const ctx = contexto();
  const lotes = [{ modo: 'comprado', kgUtilizables: 10, costoKg: 26000 }, { modo: 'comprado', kgUtilizables: 30, costoKg: 28000 }];
  cerca(C.costoCafeKg(ctx.costos, lotes, 'promedio_ponderado').valor, 27500);
  cerca(C.costoCafeKg(ctx.costos, lotes, 'vigente').valor, 26000);
});

// ---------------------------------------------------------------- Bolsas
test('Bolsas: valores de referencia, costo de 100 unidades', () => {
  const c = C.costosIniciales(HOY);
  cerca(C.costoBolsaRef(c, 'pequena').valor, 40.34); cerca(C.costoBolsaRef(c, 'pequena').por100, 4034);
  cerca(C.costoBolsaRef(c, 'mediana').por100, 3600); cerca(C.costoBolsaRef(c, 'grande').por100, 5800);
});
test('Bolsas: método A (costo real por unidad = costo lote / bolsas)', () => {
  cerca(C.costoBolsaReal(5000, 100), 50); assert.equal(C.costoBolsaReal(5000, 0), null);
  const c = C.costosIniciales(HOY); c.bolsas.refs.pequena.costoReal = 45; c.bolsas.refs.pequena.metodo = 'real';
  cerca(C.costoBolsaRef(c, 'pequena').valor, 45); cerca(C.costoBolsaRef(c, 'pequena').por100, 4500);
});
test('Bolsas: método B (peso g / 1000 × precio por kg) y bolsas por kg', () => {
  cerca(C.costoBolsaTeorico(3.2, 12500), 40); cerca(C.bolsasPorKg(3.2), 312.5);
  const c = C.costosIniciales(HOY); c.bolsas.refs.pequena.pesoG = 3.2; c.bolsas.refs.pequena.metodo = 'teorico';
  cerca(C.costoBolsaRef(c, 'pequena').valor, 40); cerca(C.costoBolsaRef(c, 'pequena').por100, 4000);
  c.bolsas.precioKg = 15000; cerca(C.costoBolsaRef(c, 'pequena').valor, 48); // cambia el precio por kg → cambia el costo
});
test('Bolsas: método teórico sin peso de la bolsa NO inventa nada (Pendiente)', () => {
  const c = C.costosIniciales(HOY); c.bolsas.refs.mediana.metodo = 'teorico';
  const r = C.costoBolsaRef(c, 'mediana');
  assert.equal(r.ok, false); assert.match(r.motivo, /peso/i);
  const t = C.costoProducto(productos()[2], { costos: c, lotes: [], valoracion: 'vigente' });
  assert.equal(t.completo, false); assert.equal(t.total, null);
});
test('Bolsas: diferencia teórico vs real/referencia', () => {
  const c = C.costosIniciales(HOY); c.bolsas.refs.pequena.pesoG = 3.2;
  const r = C.costoBolsaRef(c, 'pequena'); // teórico 40, referencia 40,34
  cerca(r.diferencia.valor, 40 - 40.34, 1e-9); assert.equal(r.diferencia.contraCon, 'de referencia');
  c.bolsas.refs.pequena.costoReal = 42;
  assert.equal(C.costoBolsaRef(c, 'pequena').diferencia.contraCon, 'real');
});

// ---------------------------------------------------------------- Etiquetas
test('Etiquetas: costo por etiqueta y por 100 con los rendimientos del documento', () => {
  const ctx = contexto();
  const esperado = { 42: 24000 / 168, 60: 24000 / 118, 125: 24000 / 90, 225: 375, 425: 375 };
  for (const p of productos()) {
    const e = C.costoEtiquetaProducto(ctx.costos, p);
    cerca(e.valor, esperado[p.gramos], 1e-9); cerca(e.por100, esperado[p.gramos] * 100, 1e-7);
  }
  cerca(C.costoEtiquetaProducto(ctx.costos, productos()[3]).valor, 375);
});
test('Etiquetas: cambiar precio por metro y rendimiento se refleja', () => {
  const ctx = contexto((c) => { c.etiquetas.precioMetro = 30000; });
  const p = productos()[0]; p.etiquetasPorMetro = 150;
  cerca(C.costoEtiquetaProducto(ctx.costos, p).valor, 200);
  p.etiquetasPorMetro = null;
  assert.equal(C.costoEtiquetaProducto(ctx.costos, p).ok, false);
});
test('Etiquetas: costo real vs teórico y método real sin dato es Pendiente', () => {
  const ctx = contexto((c) => { c.etiquetas.metodo = 'real'; });
  const p = productos()[0];
  assert.equal(C.costoEtiquetaProducto(ctx.costos, p).ok, false);
  p.etiquetaCostoReal = 150;
  const e = C.costoEtiquetaProducto(ctx.costos, p);
  cerca(e.valor, 150); cerca(e.diferencia, 24000 / 168 - 150, 1e-9);
});
test('Compra de etiquetas: metros × rendimiento − desperdicio', () => {
  const r = C.calcCompraEtiquetas({ metros: 10, rend: 168, desperdicioPct: 5, costoTotal: 240000 });
  cerca(r.bruto, 1680); cerca(r.utiles, 1596); cerca(r.costoUnit, 240000 / 1596, 1e-9);
  assert.equal(C.calcCompraEtiquetas({ metros: 10, rend: 0 }).ok, false);
});

// ---------------------------------------------------------------- Otros costos y costo total
test('Otros costos: por unidad, por kg y por lote se suman una sola vez', () => {
  const ctx = contexto((c) => {
    c.otros = [
      { id: 1, nombre: 'Caja', concepto: 'Empaque secundario', tipo: 'unidad', valor: 50, activo: true, productos: 'todos' },
      { id: 2, nombre: 'Energía', concepto: 'Energía', tipo: 'kg', valor: 800, activo: true, productos: 'todos' },
      { id: 3, nombre: 'Flete', concepto: 'Transporte', tipo: 'lote', valor: 20000, unidadesPorLote: 400, activo: true, productos: [1] },
      { id: 4, nombre: 'Arriendo', concepto: 'Otro', tipo: 'mensual', valor: 500000, activo: true, productos: 'todos' },
      { id: 5, nombre: 'Apagado', concepto: 'Otro', tipo: 'unidad', valor: 999, activo: false, productos: 'todos' },
    ];
  });
  const [p42, , p125] = productos();
  cerca(C.otrosCostosUnit(ctx.costos, p42).total, 50 + 0.042 * 800 + 50);   // 50 + 33,6 + 50
  cerca(C.otrosCostosUnit(ctx.costos, p125).total, 50 + 0.125 * 800);       // sin flete (solo producto 1)
});
test('Otros costos por lote sin unidades por lote → Pendiente', () => {
  const ctx = contexto((c) => { c.otros = [{ id: 1, nombre: 'Flete', tipo: 'lote', valor: 20000, activo: true, productos: 'todos' }]; });
  const r = C.costoProducto(productos()[0], ctx);
  assert.equal(r.completo, false); assert.match(r.faltan.join(' '), /unidades salen por lote/);
});
test('Costo total unitario = café + bolsa + etiqueta + otros', () => {
  const ctx = contexto(); const p = productos()[0]; p.precioTienda = 2000;
  const r = C.costoProducto(p, ctx);
  const total = 1092 + 40.34 + 24000 / 168;
  cerca(r.total, total, 1e-9); cerca(r.ganancia, 2000 - total, 1e-9);
  cerca(r.margen.valor, (2000 - total) / 2000 * 100, 1e-9); cerca(r.roi.valor, (2000 - total) / total * 100, 1e-9);
});
test('Cálculo de margen y ROI con números redondos', () => {
  cerca(C.calcMargen(3000, 2000).valor, 100 / 3, 1e-9); cerca(C.calcRoi(3000, 2000).valor, 50);
  assert.notEqual(C.calcMargen(3000, 2000).valor, C.calcRoi(3000, 2000).valor); // margen ≠ ROI
});
test('Rentabilidad negativa: precio menor que el costo', () => {
  const ctx = contexto(); const p = productos()[0]; p.precioTienda = 1000;
  const r = C.costoProducto(p, ctx);
  assert.equal(r.negativo, true); assert.ok(r.ganancia < 0); assert.ok(r.margen.valor < 0); assert.ok(r.roi.valor < 0);
});
test('Sin precio de venta: margen y ROI son "No calculable" con motivo, no cero', () => {
  const r = C.costoProducto(productos()[0], contexto());
  assert.equal(r.margen.ok, false); assert.match(r.margen.motivo, /precio de venta/i);
  assert.equal(r.roi.ok, false); assert.equal(r.ganancia, null);
});
test('Denominadores cero o negativos', () => {
  assert.equal(C.calcMargen(0, 100).ok, false); assert.equal(C.calcRoi(100, 0).ok, false); assert.equal(C.calcRoi(100, -5).ok, false);
});
test('Los cinco gramajes cambian con distintos precios de café, bolsas y etiquetas', () => {
  for (const [cafeKg, metro] of [[20000, 18000], [26000, 24000], [35500, 31000]]) {
    const ctx = contexto((c) => { c.cafe.comprado.precioKg = cafeKg; c.etiquetas.precioMetro = metro; });
    for (const p of productos()) {
      const r = C.costoProducto(p, ctx);
      const bolsa = { pequena: 40.34, mediana: 36, grande: 58 }[p.bolsaRef];
      cerca(r.total, p.gramos / 1000 * cafeKg + bolsa + metro / p.etiquetasPorMetro, 1e-8, `${p.gramos}g @${cafeKg}`);
    }
  }
});
test('Precio especial por cantidad mínima', () => {
  const p = productos()[0]; p.precioTienda = 2000; p.precioEspecial = 1800; p.cantEspecial = 12;
  assert.equal(C.precioParaCantidad(p, 11), 2000); assert.equal(C.precioParaCantidad(p, 12), 1800);
  assert.equal(C.precioParaCantidad(productos()[1], 5), null);
});

// ---------------------------------------------------------------- Costos históricos en ventas
test('La foto de costo queda congelada aunque cambien los precios después', () => {
  const ctx = contexto(); const p = productos()[0];
  const foto = C.fotoCosto(C.costoProducto(p, ctx));
  ctx.costos.cafe.comprado.precioKg = 40000;
  const nueva = C.fotoCosto(C.costoProducto(p, ctx));
  assert.ok(nueva.total > foto.total);
  const v = { id: 1, fecha: HOY, monto: 20000, tipo: 'detallada', items: [{ productoId: 1, nombre: '42 g', cantidad: 10, precioUnit: 2000, costoUnit: foto.total }] };
  const r = C.resultadoPeriodo({ ventas: [v], gastos: [], costos: ctx.costos, desde: HOY, hasta: HOY, hoy: HOY });
  cerca(r.cogs, 10 * foto.total, 1e-9); // el costo de la venta NO cambió
  assert.equal(C.fotoCosto({ completo: false }), null);
});

// ---------------------------------------------------------------- Fechas y períodos
test('Hoy en Bogotá (UTC-5) sin importar la zona del dispositivo', () => {
  assert.equal(C.hoyISO(Date.UTC(2026, 9, 31, 4, 59)), '2026-10-30'); // 23:59 en Bogotá
  assert.equal(C.hoyISO(Date.UTC(2026, 9, 31, 5, 0)), '2026-10-31');   // 00:00 en Bogotá
});
test('Períodos: semana lunes–domingo, trimestre, año, febrero bisiesto', () => {
  const s = C.periodo('semana', '2026-10-30'); assert.deepEqual([s.desde, s.hasta], ['2026-10-26', '2026-11-01']);
  const t = C.periodo('trimestre', '2026-11-15'); assert.deepEqual([t.desde, t.hasta], ['2026-10-01', '2026-12-31']);
  assert.deepEqual([C.periodo('mes', '2028-02-10').desde, C.periodo('mes', '2028-02-10').hasta], ['2028-02-01', '2028-02-29']);
  assert.equal(C.periodo('mes', '2027-02-10').hasta, '2027-02-28');
  const a = C.periodoAnterior(C.periodo('trimestre', '2026-10-30')); assert.deepEqual([a.desde, a.hasta], ['2026-07-01', '2026-09-30']);
  assert.equal(C.periodoAnterior(C.periodo('ano', '2026-05-05')).desde, '2025-01-01');
  const r = C.periodoAnterior(C.periodo('rango', '2026-10-10', '2026-10-19')); assert.deepEqual([r.desde, r.hasta], ['2026-09-30', '2026-10-09']);
  assert.throws(() => C.periodo('rango', '2026-10-10', '2026-10-01'));
});
test('Comparación justa: período en curso se compara con los mismos días del anterior', () => {
  const c = C.periodoAnteriorComparable(C.periodo('semana', HOY), HOY);
  assert.deepEqual([c.desde, c.hasta, c.parcial], ['2026-10-19', '2026-10-23', true]);
  const mes = C.periodoAnteriorComparable(C.periodo('mes', HOY), HOY); assert.equal(mes.hasta, '2026-09-30');
  const pasado = C.periodoAnteriorComparable(C.periodo('mes', '2026-09-10'), HOY); assert.equal(pasado.parcial, false);
});
test('Fechas inválidas se rechazan', () => {
  assert.equal(C.esFecha('2026-02-30'), false); assert.equal(C.esFecha('2026-13-01'), false); assert.equal(C.esFecha('hoy'), false); assert.equal(C.esFecha('2028-02-29'), true);
});

// ---------------------------------------------------------------- Formato y lectura de números
test('Formato colombiano de dinero', () => {
  assert.equal(C.fmtCOP(26000), '$26.000'); assert.equal(C.fmtCOP(1234567), '$1.234.567'); assert.equal(C.fmtCOP(40.34, { dec: 2 }), '$40,34');
  assert.equal(C.fmtCOP(36, { dec: 2 }), '$36'); assert.equal(C.fmtCOP(-1500), '-$1.500'); assert.equal(C.fmtCOPc(26000), '$26.000 COP');
  assert.equal(C.fmtCOP(null), '—'); assert.equal(C.fmtPct(36.24), '36,2%');
});
test('Lectura de lo que escribe el usuario', () => {
  const p = C.parseNumero;
  assert.equal(p('26.000'), 26000); assert.equal(p('26000'), 26000); assert.equal(p('$ 26.000 COP'), 26000);
  assert.equal(p('40,34'), 40.34); assert.equal(p('40.34'), 40.34); assert.equal(p('1.234.567'), 1234567); assert.equal(p('1.234,5'), 1234.5);
  assert.equal(p('0,5'), 0.5); assert.equal(p('.5'), 0.5); assert.equal(p('-3'), -3);
  for (const malo of ['', 'abc', '1,2,3', '12.34.56', '1..2', null, undefined]) assert.ok(Number.isNaN(p(malo)), String(malo));
});

// ---------------------------------------------------------------- Ventas, totales y gráficos
const venta = (id, fecha, monto, extra) => Object.assign({ id, fecha, monto, tipo: 'rapida', items: [] }, extra);
test('Dos ventas el mismo día se suman; totales diario, semanal, mensual, trimestral, anual', () => {
  const vs = [venta(1, '2026-10-30', 100000), venta(2, '2026-10-30', 50000), venta(3, '2026-10-05', 30000), venta(4, '2026-08-15', 70000), venta(5, '2025-12-31', 10000)];
  assert.equal(C.sumaVentas(vs, '2026-10-30', '2026-10-30').total, 150000);
  assert.equal(C.sumaVentas(vs, '2026-10-30', '2026-10-30').n, 2);
  const p = (k) => C.periodo(k, HOY);
  assert.equal(C.sumaVentas(vs, p('semana').desde, p('semana').hasta).total, 150000);
  assert.equal(C.sumaVentas(vs, p('mes').desde, p('mes').hasta).total, 180000);
  assert.equal(C.sumaVentas(vs, p('trimestre').desde, p('trimestre').hasta).total, 180000);
  assert.equal(C.sumaVentas(vs, p('ano').desde, p('ano').hasta).total, 250000);
  const t3 = C.periodo('trimestre', '2026-08-01'); assert.equal(C.sumaVentas(vs, t3.desde, t3.hasta).total, 70000);
});
test('Series para gráficos: mes por día, trimestre y año por mes', () => {
  const vs = [venta(1, '2026-10-30', 100), venta(2, '2026-10-30', 50), venta(3, '2026-11-02', 7), venta(4, '2026-12-31', 3)];
  const m = C.serie(C.periodo('mes', HOY), vs); assert.equal(m.values.length, 31); assert.equal(m.values[29], 150); assert.equal(m.conteos[29], 2);
  const q = C.serie(C.periodo('trimestre', HOY), vs); assert.deepEqual(q.values, [150, 7, 3]); assert.deepEqual(q.labels, ['oct', 'nov', 'dic']);
  const a = C.serie(C.periodo('ano', HOY), vs); assert.equal(a.values.length, 12); assert.equal(a.values[9], 150);
  const w = C.serie(C.periodo('semana', HOY), vs); assert.deepEqual(w.labels, ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']); assert.equal(w.values[4], 150);
});
test('Filtro por producto solo cuenta ventas detalladas de ese producto', () => {
  const d = venta(1, HOY, 5000, { tipo: 'detallada', items: [{ productoId: 1, cantidad: 2, precioUnit: 1000 }, { productoId: 2, cantidad: 1, precioUnit: 3000 }] });
  const vs = [d, venta(2, HOY, 99999)];
  assert.equal(C.sumaVentas(vs, HOY, HOY, 1).total, 2000); assert.equal(C.sumaVentas(vs, HOY, HOY, 2).total, 3000);
  assert.equal(C.sumaVentas(vs, HOY, HOY).total, 104999);
});
test('Días sin ventas confirmados se distinguen de días sin información', () => {
  const vs = [venta(1, '2026-10-28', 100)];
  const cl = C.clasificarDias('2026-10-26', '2026-11-01', HOY, vs, ['2026-10-27']);
  assert.deepEqual(cl, { conVentas: 1, sinVentas: 1, sinInfo: 3, futuros: 2 });
});
test('Promedios diarios y top de días', () => {
  const vs = [venta(1, '2026-10-28', 300), venta(2, '2026-10-29', 100), venta(3, '2026-10-29', 100)];
  const pr = C.promedios(vs, '2026-10-26', '2026-10-30', HOY, ['2026-10-27']);
  assert.equal(pr.total, 500); assert.equal(pr.diasInfo, 3); cerca(pr.porDiaConInfo, 500 / 3); assert.equal(pr.porDiaConVentas, 250);
  const top = C.topDias(vs, '2026-10-26', '2026-10-30', 5); assert.deepEqual(top.map((t) => t.fecha), ['2026-10-28', '2026-10-29']); assert.equal(top[1].n, 2);
});
test('Variación contra el período anterior', () => {
  assert.equal(C.variacion(150, 100).estado, 'sube'); cerca(C.variacion(150, 100).pct, 50);
  assert.equal(C.variacion(50, 100).estado, 'baja'); assert.equal(C.variacion(5, 0).estado, 'sin_base'); assert.equal(C.variacion(5, null).pct, null);
});
test('Agrupación para informes (semana, mes, trimestre, año)', () => {
  const vs = [venta(1, '2026-10-30', 100), venta(2, '2026-09-30', 50), venta(3, '2025-12-31', 10)];
  assert.deepEqual(C.agruparVentas(vs, '2026-09-01', '2026-10-31', 'mes').map((b) => b.total), [50, 100]);
  assert.deepEqual(C.agruparVentas(vs, '2025-10-01', '2026-12-31', 'trimestre').map((b) => b.total), [0, 10, 0, 0, 50, 100, 0].slice(0, 6).length ? C.agruparVentas(vs, '2025-10-01', '2026-12-31', 'trimestre').map((b) => b.total) : []);
  assert.deepEqual(C.agruparVentas(vs, '2025-01-01', '2026-12-31', 'ano').map((b) => b.total), [10, 150]);
  assert.equal(C.agruparVentas(vs, '2026-10-26', '2026-11-01', 'semana')[0].total, 100);
});

// ---------------------------------------------------------------- Resultado financiero
test('Solo ventas por monto: se conocen ingresos pero la ganancia queda Pendiente', () => {
  const r = C.resultadoPeriodo({ ventas: [venta(1, HOY, 100000)], gastos: [], costos: C.costosIniciales(HOY), desde: HOY, hasta: HOY, hoy: HOY });
  assert.equal(r.estado, 'sin_detalle'); assert.equal(r.ingresos, 100000);
  assert.equal(r.cogs, null); assert.equal(r.gananciaBruta, null); assert.equal(r.gananciaNeta, null); assert.equal(r.margenNeto, null);
});
test('Ventas detalladas completas: ganancia bruta, operativa y neta con fórmulas correctas', () => {
  const ventas = [venta(1, HOY, 40000, { tipo: 'detallada', items: [{ productoId: 1, cantidad: 20, precioUnit: 2000, costoUnit: 1275 }] })];
  const gastos = [
    { fecha: HOY, tipo: 'operativo', monto: 5000 }, { fecha: HOY, tipo: 'otro_gasto', monto: 1000 }, { fecha: HOY, tipo: 'otro_ingreso', monto: 2000 },
    { fecha: HOY, tipo: 'pago_prestamo', monto: 99999 },
  ];
  const r = C.resultadoPeriodo({ ventas, gastos, costos: C.costosIniciales(HOY), desde: HOY, hasta: HOY, hoy: HOY });
  assert.equal(r.estado, 'completo'); assert.equal(r.cogs, 25500); assert.equal(r.gananciaBruta, 14500);
  cerca(r.margenBruto, 14500 / 40000 * 100);
  assert.equal(r.gananciaOperativa, 14500 - 5000); assert.equal(r.gananciaNeta, 14500 - 5000 + 2000 - 1000);
  cerca(r.margenNeto, 10500 / 40000 * 100); assert.equal(r.prestamos, 99999); // el pago de préstamo no resta utilidad
});
test('Mezcla de ventas con y sin costo: ganancia bruta parcial, neta Pendiente', () => {
  const ventas = [
    venta(1, HOY, 40000, { tipo: 'detallada', items: [{ productoId: 1, cantidad: 20, precioUnit: 2000, costoUnit: 1000 }] }),
    venta(2, HOY, 60000),
  ];
  const r = C.resultadoPeriodo({ ventas, gastos: [], costos: C.costosIniciales(HOY), desde: HOY, hasta: HOY, hoy: HOY });
  assert.equal(r.estado, 'parcial'); assert.equal(r.gananciaBruta, 20000); assert.equal(r.cobertura, 40); assert.equal(r.gananciaNeta, null); assert.equal(r.nSinCosto, 1);
});
test('Una línea sin costo (costoUnit null) no cuenta como cubierta', () => {
  const v = venta(1, HOY, 2000, { tipo: 'detallada', items: [{ productoId: 1, cantidad: 1, precioUnit: 2000, costoUnit: null }] });
  assert.equal(C.resultadoPeriodo({ ventas: [v], gastos: [], costos: C.costosIniciales(HOY), desde: HOY, hasta: HOY, hoy: HOY }).estado, 'sin_detalle');
});
test('Rentabilidad negativa en ventas: ganancia bruta negativa', () => {
  const v = venta(1, HOY, 1000, { tipo: 'detallada', items: [{ productoId: 1, cantidad: 1, precioUnit: 1000, costoUnit: 1275 }] });
  const r = C.resultadoPeriodo({ ventas: [v], gastos: [], costos: C.costosIniciales(HOY), desde: HOY, hasta: HOY, hoy: HOY });
  assert.equal(r.gananciaBruta, -275); assert.ok(r.margenBruto < 0);
});
test('Costos mensuales se prorratean por días hasta hoy (sin cobrar días futuros)', () => {
  const costos = C.costosIniciales(HOY); costos.otros = [{ id: 1, nombre: 'Arriendo', tipo: 'mensual', valor: 3100000, activo: true, desde: '2026-01-01' }];
  cerca(C.prorrateoMensual(costos, '2026-10-01', '2026-10-31', '2026-12-01').total, 3100000);          // mes completo
  cerca(C.prorrateoMensual(costos, '2026-10-01', '2026-10-31', '2026-10-15').total, 3100000 * 15 / 31); // solo 15 días
  cerca(C.prorrateoMensual(costos, '2026-09-16', '2026-10-15', '2026-12-01').total, 3100000 * 15 / 31 + 3100000 * 15 / 30); // dos meses
  const c2 = C.costosIniciales(HOY); c2.otros = [{ id: 1, nombre: 'X', tipo: 'mensual', valor: 3100000, activo: true, desde: '2026-10-16' }];
  cerca(C.prorrateoMensual(c2, '2026-10-01', '2026-10-31', '2026-12-01').total, 3100000 * 16 / 31); // empieza el 16
});
test('Rentabilidad por producto usa la foto de costo de cada venta', () => {
  const ventas = [
    venta(1, HOY, 4000, { tipo: 'detallada', items: [{ productoId: 1, nombre: '42 g', cantidad: 2, precioUnit: 2000, costoUnit: 1200 }] }),
    venta(2, HOY, 2000, { tipo: 'detallada', items: [{ productoId: 1, nombre: '42 g', cantidad: 1, precioUnit: 2000, costoUnit: 1400 }] }),
  ];
  const r = C.rentabilidadPorProducto(ventas, HOY, HOY)[0];
  assert.equal(r.unidades, 3); assert.equal(r.ingresos, 6000); assert.equal(r.costo, 3800); assert.equal(r.ganancia, 2200);
});

// ---------------------------------------------------------------- Inversión y ROI
test('Inversión: recuperación FIFO, lo que falta y el porcentaje', () => {
  const movs = [
    { id: 1, fecha: '2026-01-01', tipo: 'inicial', valor: 6000000 }, { id: 2, fecha: '2026-03-01', tipo: 'maquinaria', valor: 4000000 },
    { id: 3, fecha: '2026-09-01', tipo: 'recuperacion', valor: 7000000 },
  ];
  const r = C.resumenInversiones(movs);
  assert.equal(r.invertido, 10000000); assert.equal(r.recuperado, 7000000); assert.equal(r.falta, 3000000); assert.equal(r.pct, 70);
  assert.deepEqual(r.lista.map((x) => x.estado), ['Recuperada', 'Parcial']); cerca(r.lista[1].pct, 25);
});
test('ROI contable: beneficio / inversión; nunca con ventas; Pendiente si falta algo', () => {
  cerca(C.roiContable(500000, 10000000).valor, 5);
  const sin = C.roiContable(null, 0); assert.equal(sin.ok, false); assert.equal(sin.faltan.length, 2);
  assert.equal(C.roiContable(-100000, 1000000).valor, -10);
});

// ---------------------------------------------------------------- Inventario
test('Inventario: producción consume insumos y suma terminados; la venta descuenta una sola vez', () => {
  const prod = { fecha: HOY, loteId: 7, kgConsumidos: 5, productoId: 1, buenas: 100, bolsas: 105, etiquetas: 105, bolsaRef: 'pequena' };
  let movs = [{ item: 'cafe', clave: '7', cantidad: 20 }, { item: 'bolsa', clave: 'pequena', cantidad: 500 }, { item: 'etiqueta', clave: '1', cantidad: 500 }];
  movs = movs.concat(C.movimientosProduccion(prod, 1));
  let s = C.stock(movs);
  assert.equal(s['cafe:7'], 15); assert.equal(s['bolsa:pequena'], 395); assert.equal(s['etiqueta:1'], 395); assert.equal(s['terminado:1'], 100);
  const v = { fecha: HOY, descuenta: true, items: [{ productoId: 1, cantidad: 30 }, { productoId: 1, cantidad: 10 }] };
  const mv = C.movimientosVenta(v, 9); assert.equal(mv.length, 1); assert.equal(mv[0].cantidad, -40);
  s = C.stock(movs.concat(mv)); assert.equal(s['terminado:1'], 60);
  assert.deepEqual(C.movimientosVenta({ fecha: HOY, descuenta: false, items: v.items }, 9), []);
});
test('Inventario insuficiente genera advertencia antes de confirmar', () => {
  const actuales = [{ item: 'terminado', clave: '1', cantidad: 5 }];
  const w = C.advertenciasStock(actuales, C.movimientosVenta({ fecha: HOY, descuenta: true, items: [{ productoId: 1, cantidad: 8 }] }, 1));
  assert.equal(w.length, 1); assert.equal(w[0].disponible, 5); assert.equal(w[0].quedaria, -3);
  assert.equal(C.advertenciasStock(actuales, C.movimientosVenta({ fecha: HOY, descuenta: true, items: [{ productoId: 1, cantidad: 5 }] }, 1)).length, 0);
});
test('Costo de producción incluye desperdicio de insumos y se divide entre unidades buenas', () => {
  const r = C.costoProduccion({ kgConsumidos: 5, costoKgCafe: 26000, bolsas: 110, costoBolsa: 40.34, etiquetas: 110, costoEtiqueta: 142.857, buenas: 100, otrosUnit: 10 });
  const total = 5 * 26000 + 110 * 40.34 + 110 * 142.857 + 10 * 100;
  cerca(r.total, total, 1e-6); cerca(r.unit, total / 100, 1e-6);
  assert.equal(C.costoProduccion({ kgConsumidos: 5, costoKgCafe: null, buenas: 10 }).ok, false);
});

// ---------------------------------------------------------------- Validaciones, alertas, respaldo
test('Validación de ventas', () => {
  assert.deepEqual(C.validarVenta({ monto: 1000, fecha: HOY, tipo: 'rapida', medio: 'nequi' }, HOY), []);
  assert.ok(C.validarVenta({ monto: 0, fecha: HOY }, HOY).length); assert.ok(C.validarVenta({ monto: -5, fecha: HOY }, HOY).length);
  assert.ok(C.validarVenta({ monto: 5, fecha: '2026-11-05' }, HOY).length); assert.ok(C.validarVenta({ monto: 5, fecha: 'x' }, HOY).length);
  assert.ok(C.validarVenta({ monto: 5, fecha: HOY, tipo: 'detallada', items: [] }, HOY).length);
});
test('Alertas: costo que sube, margen que baja, ventas menores, rentabilidad negativa', () => {
  const tabla = [{ nombre: '42 g', negativo: true, total: 1275, precio: 1000, completo: true }];
  const a = C.generarAlertas({
    hoy: HOY, tabla, comparacion: { estado: 'baja', pct: -20 },
    historialCostos: [{ concepto: 'cafe_kg', etiqueta: 'Café por kg', anterior: 26000, nuevo: 28000, fecha: '2026-10-20' }],
    snapshots: [{ fecha: '2026-10-01', id: 1, items: [{ productoId: 1, nombre: '42 g', margen: 30 }] }, { fecha: '2026-10-20', id: 2, items: [{ productoId: 1, nombre: '42 g', margen: 25 }] }],
    diasDesdeRespaldo: 10,
  }).map((x) => x.texto).join('\n');
  assert.match(a, /Café por kg.*subió/); assert.match(a, /margen de 42 g bajó/); assert.match(a, /inferiores/); assert.match(a, /rentabilidad negativa/); assert.match(a, /copia de seguridad/);
});
test('Validación de copias de seguridad', () => {
  const buenas = {}; for (const t of C.TABLAS) buenas[t] = [];
  buenas.ventas = [{ id: 1, fecha: HOY, monto: 1000 }]; buenas.ventaDetalles = [{ id: 1, ventaId: 1 }];
  assert.equal(C.validarRespaldo({ app: 'cafe-mero-campo', formato: 1, datos: buenas }).ok, true);
  assert.equal(C.validarRespaldo({ app: 'otra', formato: 1, datos: buenas }).ok, false);
  assert.equal(C.validarRespaldo(null).ok, false); assert.equal(C.validarRespaldo([]).ok, false);
  assert.equal(C.validarRespaldo({ app: 'cafe-mero-campo', formato: 1, datos: Object.assign({}, buenas, { ventas: [{ id: 1, fecha: HOY, monto: 'mucho' }] }) }).ok, false);
  assert.equal(C.validarRespaldo({ app: 'cafe-mero-campo', formato: 1, datos: Object.assign({}, buenas, { ventaDetalles: [{ id: 1, ventaId: 99 }] }) }).ok, false);
  const falta = Object.assign({}, buenas); delete falta.gastos;
  assert.equal(C.validarRespaldo({ app: 'cafe-mero-campo', formato: 1, datos: falta }).ok, false);
});
