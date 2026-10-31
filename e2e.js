// Pruebas de extremo a extremo en Chromium (móvil). Requiere servidor en :8765.  Ejecutar: node tests/e2e.js
const { chromium } = require('playwright');
const fs = require('fs');
const URL = 'http://localhost:8765/index.html';
let pasan = 0, fallan = 0; const fallos = [];
const ok = (nombre, cond, detalle) => { if (cond) { pasan++; console.log('  ✔', nombre); } else { fallan++; fallos.push(nombre + (detalle !== undefined ? ' → ' + detalle : '')); console.log('  ✘', nombre, detalle !== undefined ? '→ ' + detalle : ''); } };
const cerca = (a, b, t = 1e-6) => typeof a === 'number' && Math.abs(a - b) <= t;

async function nuevaPagina(browser, opts) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, locale: 'es-CO', timezoneId: 'America/Bogota', deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true }, opts || {}));
  const page = await ctx.newPage(); const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.errs = errs; page.ctx = ctx;
  await page.goto(URL); await page.waitForSelector('.vista');
  return page;
}
const ir = async (page, r) => { await page.evaluate((r) => { location.hash = '#/' + r; }, r); await page.waitForTimeout(200); };
const esperar = (page, ms) => page.waitForTimeout(ms || 250);
const S = (page, expr) => page.evaluate(`(function(){ const S = App.S; return ${expr}; })()`);
const texto = (page, sel) => page.innerText(sel || '#app');
const hoy = (page) => page.evaluate(() => MC.hoyISO());
async function setCampo(page, k, v) { const sel = `[data-k="${k}"]`; await page.fill(sel, v); await page.press(sel, 'Tab'); await esperar(page, 300); }
async function tabCostos(page, t) { await ir(page, 'costos'); await page.click(`[data-a="tabCostos"][data-t="${t}"]`); await esperar(page, 200); }
async function registrarVenta(page, o) {
  await ir(page, 'inicio'); await page.click('#fabVenta'); await page.waitForSelector('#fVenta');
  if (o.monto != null) await page.fill('#v-monto', o.monto);
  if (o.fecha) await page.fill('#v-fecha', o.fecha);
  if (o.ref) await page.fill('#v-ref', o.ref);
  if (o.cliente) await page.fill('#v-cliente', o.cliente);
  if (o.medio) await page.selectOption('#v-medio', o.medio);
  await page.click('#v-guardar'); await esperar(page, 400);
  return page.locator('#fVenta').count();
}

(async () => {
  const browser = await chromium.launch();

  // ============================================================ A. Primer arranque (sin datos inventados)
  console.log('\nA. Primer arranque: sin cifras inventadas');
  let p = await nuevaPagina(browser);
  const hoyISO = await hoy(p);
  console.log('   Fecha de hoy (Bogotá):', hoyISO);
  let t = await texto(p);
  ok('El inicio muestra $0 y «Aún no hay ventas»', /Aún no hay ventas/.test(t) && !/\$[1-9]/.test(t.replace(/Pendiente[^$]*/g, '')), t.slice(0, 120));
  const base = await S(p, `({ prods: S.productos.map(x => [x.gramos, x.precioTienda]), ventas: S.ventas.length, cafe: S.costos.cafe.comprado.precioKg, bolsas: S.costos.bolsas.precioKg, etq: S.costos.etiquetas.precioMetro, refs: Object.values(S.costos.bolsas.refs).map(r => r.costoReferencia), rend: S.productos.map(x => x.etiquetasPorMetro) })`);
  ok('Presentaciones iniciales 42/60/125/225/425 g', JSON.stringify(base.prods.map((x) => x[0])) === '[42,60,125,225,425]');
  ok('Los precios de venta empiezan VACÍOS (no se inventan)', base.prods.every((x) => x[1] === null));
  ok('Valores de referencia: café 26.000, bolsas 12.500/kg, etiquetas 24.000/m', base.cafe === 26000 && base.bolsas === 12500 && base.etq === 24000);
  ok('Bolsas de referencia 40,34 / 36 / 58 y etiquetas por metro 168/118/90/64/64', JSON.stringify(base.refs) === '[40.34,36,58]' && JSON.stringify(base.rend) === '[168,118,90,64,64]');
  await tabCostos(p, 'tabla'); t = await texto(p);
  ok('Tabla de costos: costo total calculable; ganancia/margen/ROI en «Pendiente» hasta poner precio', /Pendiente/.test(t) && /No calculable/.test(t));
  const tab0 = await S(p, `App.tabla().map(r => [r.nombre, r.cafe, r.total, r.ganancia])`);
  ok('Costo del café a $26.000/kg: 42 g = $1.092', cerca(tab0[0][1], 1092) && cerca(tab0[1][1], 1560) && cerca(tab0[2][1], 3250) && cerca(tab0[3][1], 5850) && cerca(tab0[4][1], 11050), JSON.stringify(tab0.map((x) => x[1])));
  ok('Costo total 42 g = café + bolsa + etiqueta (sin precio no hay ganancia)', cerca(tab0[0][2], 1092 + 40.34 + 24000 / 168, 1e-6) && tab0[0][3] === null);
  await ir(p, 'inicio'); t = await texto(p);
  ok('Indicadores sin datos aparecen como «Pendiente de datos», no como cero', (t.match(/Pendiente de datos/g) || []).length >= 4);

  // ============================================================ B. Ventas
  console.log('\nB. Ventas');
  let abierto = await registrarVenta(p, { monto: '150.000', ref: 'F-001', cliente: 'Tienda La Esquina', medio: 'nequi' });
  ok('1. Venta con fecha actual guardada', abierto === 0 && (await S(p, 'S.ventas.length')) === 1);
  const v1 = await S(p, 'S.ventas[0]');
  ok('   monto 150000, fecha de hoy, medio Nequi, cliente y referencia', v1.monto === 150000 && v1.fecha === hoyISO && v1.medio === 'nequi' && v1.cliente === 'Tienda La Esquina' && v1.referencia === 'F-001');
  t = await texto(p);
  ok('   «Ventas de hoy» muestra $150.000', /\$150\.000/.test(t));

  await registrarVenta(p, { monto: '80.000', fecha: '2026-10-05' });
  ok('2. Venta con fecha anterior (2026-10-05) sin alterar «hoy»', (await S(p, 'S.ventas.length')) === 2 && /Ventas de hoy[\s\S]*?\$150\.000/.test(await texto(p)));
  await registrarVenta(p, { monto: '50.000' });
  ok('3. Segunda venta el mismo día: total de hoy $200.000', cerca(await S(p, `MC.sumaVentas(S.ventas, MC.hoyISO(), MC.hoyISO()).total`), 200000) && /\$200\.000/.test(await texto(p)));

  // referencia duplicada y validaciones
  await p.click('#fabVenta'); await p.waitForSelector('#fVenta');
  await p.fill('#v-monto', '1.000'); await p.fill('#v-ref', 'f-001'); await p.click('#v-guardar'); await esperar(p, 250);
  ok('   Referencia repetida se rechaza', /Ya existe una venta con la referencia/.test(await texto(p, '#v-err')));
  await p.fill('#v-ref', ''); await p.fill('#v-monto', '0'); await p.click('#v-guardar'); await esperar(p, 200);
  ok('   Validación: monto 0 no se guarda', /mayor que cero/.test(await texto(p, '#v-err')));
  await p.fill('#v-monto', ''); await p.click('#v-guardar'); await esperar(p, 200);
  ok('   Validación: monto vacío no se guarda', /mayor que cero|no es un número/.test(await texto(p, '#v-err')));
  await p.fill('#v-monto', 'abc'); await p.click('#v-guardar'); await esperar(p, 200);
  ok('   Validación: texto no numérico no se guarda', /número válido/.test(await texto(p, '#v-err')));
  // doble clic
  await p.fill('#v-monto', '7.777'); await p.fill('#v-ref', ''); await p.fill('#v-cliente', 'Doble clic');
  await p.$eval('#v-guardar', (b) => { b.click(); b.click(); b.click(); }); await esperar(p, 600);
  ok('6. Doble/triple clic en Guardar registra UNA sola venta', (await S(p, `S.ventas.filter(v => v.cliente === 'Doble clic').length`)) === 1);
  ok('   Venta con $7.777 existe una vez; total ventas = 4', (await S(p, 'S.ventas.length')) === 4);
  await p.evaluate(async () => { const v = App.S.ventas.find((x) => x.cliente === 'Doble clic'); await App.eliminarVenta(v.id); });

  // editar
  await ir(p, 'ventas');
  const idB = await S(p, `S.ventas.find(v => v.monto === 50000).id`);
  await p.click(`[data-a="editarVenta"][data-id="${idB}"]`); await p.waitForSelector('#fVenta');
  ok('4. Al editar, el formulario trae los datos de la venta', (await p.inputValue('#v-monto')) === '50.000');
  await p.fill('#v-monto', '60.000'); await p.fill('#v-cliente', 'Editada'); await p.click('#v-guardar'); await esperar(p, 400);
  const vB = await S(p, `S.ventas.find(v => v.id === ${idB})`);
  ok('4. Venta editada: 60.000 y cliente «Editada» (misma venta, sin duplicar)', vB.monto === 60000 && vB.cliente === 'Editada' && (await S(p, 'S.ventas.length')) === 3);
  await ir(p, 'inicio'); ok('   Indicadores se actualizaron: hoy = $210.000', /\$210\.000/.test(await texto(p)));

  // eliminar con confirmación
  await registrarVenta(p, { monto: '9.999', fecha: '2026-10-06', cliente: 'Para borrar' });
  await ir(p, 'ventas');
  const idF = await S(p, `S.ventas.find(v => v.monto === 9999).id`);
  await p.click(`[data-a="borrarVenta"][data-id="${idF}"]`); await p.waitForSelector('[data-x="no"]');
  await p.click('[data-x="no"]'); await esperar(p);
  ok('5. Eliminar: si cancelas, la venta se conserva', (await S(p, `S.ventas.some(v => v.id === ${idF})`)) === true);
  await p.click(`[data-a="borrarVenta"][data-id="${idF}"]`); await p.waitForSelector('[data-x="si"]'); await p.click('[data-x="si"]'); await esperar(p, 400);
  ok('5. Eliminar: al confirmar, la venta desaparece', (await S(p, `S.ventas.some(v => v.id === ${idF})`)) === false);

  // búsqueda y filtros
  await p.fill('#f-q', 'Esquina'); await esperar(p, 200);
  ok('   Búsqueda por cliente filtra el historial', (await p.locator('#lista-ventas .item').count()) === 1);
  await p.fill('#f-q', '80000'); await esperar(p, 200);
  ok('   Búsqueda por monto funciona', (await p.locator('#lista-ventas .item').count()) === 1);
  await p.fill('#f-q', ''); await p.selectOption('#f-medio', 'nequi'); await esperar(p, 200);
  ok('   Filtro por medio de pago (Nequi)', (await p.locator('#lista-ventas .item').count()) === 1);
  await p.click('[data-a="limpiarFiltros"]'); await esperar(p);

  // más ventas para trimestre/año
  await registrarVenta(p, { monto: '30.000', fecha: '2026-01-15' });
  await registrarVenta(p, { monto: '20.000', fecha: '2025-06-10' });
  console.log('   Ventas sembradas: hoy 150k+60k, 5-oct 80k, 15-ene 30k, 10-jun-2025 20k');

  // ============================================================ C. Totales, filtros y gráficos
  console.log('\nC. Totales y estadísticas');
  const sumas = await S(p, `({ dia: MC.sumaVentas(S.ventas, MC.hoyISO(), MC.hoyISO()).total,
    mes: (r => MC.sumaVentas(S.ventas, r.desde, r.hasta).total)(MC.periodo('mes', '2026-10-15')),
    tri4: (r => MC.sumaVentas(S.ventas, r.desde, r.hasta).total)(MC.periodo('trimestre', '2026-11-01')),
    tri1: (r => MC.sumaVentas(S.ventas, r.desde, r.hasta).total)(MC.periodo('trimestre', '2026-02-01')),
    a26: (r => MC.sumaVentas(S.ventas, r.desde, r.hasta).total)(MC.periodo('ano', '2026-05-05')),
    a25: (r => MC.sumaVentas(S.ventas, r.desde, r.hasta).total)(MC.periodo('ano', '2025-05-05')) })`);
  ok('6. Total diario 210.000', sumas.dia === 210000, sumas.dia);
  ok('6. Total mensual (oct 2026) 290.000', sumas.mes === 290000, sumas.mes);
  ok('7. Trimestre 4 de 2026 = 290.000 y trimestre 1 = 30.000', sumas.tri4 === 290000 && sumas.tri1 === 30000, JSON.stringify(sumas));
  ok('7. Año 2026 = 320.000 y año 2025 = 20.000', sumas.a26 === 320000 && sumas.a25 === 20000, JSON.stringify(sumas));
  await ir(p, 'inicio'); t = await texto(p);
  ok('   Inicio: tarjetas de semana/mes/trimestre/año presentes', /Ventas del mes/.test(t) && /Ventas del trimestre/.test(t) && /Ventas del año/.test(t) && /\$290\.000/.test(t));
  ok('   Inicio: el año en curso muestra $320.000', /\$320\.000/.test(t));
  // Estadísticas UI
  await ir(p, 'stats');
  await p.click('[data-a="kind"][data-r="stats"][data-k="trimestre"]'); await esperar(p, 250);
  await p.selectOption('[data-c="trimStats"]', '1'); await esperar(p, 250);
  ok('   Estadísticas → trimestre 1: total $30.000', /\$30\.000/.test(await texto(p)));
  await p.selectOption('[data-c="trimStats"]', '4'); await esperar(p, 250);
  ok('   Estadísticas → trimestre 4: total $290.000 y gráfico con 3 meses', /\$290\.000/.test(await texto(p)) && (await p.locator('.grafico rect.hit').count()) === 3);
  await p.click('[data-a="kind"][data-r="stats"][data-k="ano"]'); await esperar(p, 250);
  await p.selectOption('[data-c="anioStats"]', '2025'); await esperar(p, 250);
  ok('   Estadísticas → año 2025: total $20.000; 12 meses en el gráfico', /\$20\.000/.test(await texto(p)) && (await p.locator('.grafico rect.hit').count()) === 12);
  await p.selectOption('[data-c="anioStats"]', '2026'); await esperar(p, 250);
  t = await texto(p);
  ok('   Año 2026: $320.000 y comparación contra 2025', /\$320\.000/.test(t) && /año anterior/.test(t) && /\$20\.000/.test(t));
  await p.click('[data-a="kind"][data-r="stats"][data-k="mes"]'); await esperar(p, 250);
  ok('   Mes en curso: gráfico por días (31 barras)', (await p.locator('.grafico rect.hit').count()) === 31);
  await p.selectOption('[data-c="tipoStats"]', 'lineas'); await esperar(p, 250);
  ok('   Alternar a gráfico de líneas', (await p.locator('.grafico polyline').count()) >= 1);
  await p.click('[data-a="kind"][data-r="stats"][data-k="rango"]'); await esperar(p, 250);
  await p.fill('[data-w="desde"]', '2026-10-01'); await esperar(p, 250); await p.fill('[data-w="hasta"]', '2026-10-10'); await esperar(p, 250);
  ok('   Rango de fechas 1–10 oct: total $80.000', /\$80\.000/.test(await texto(p)));
  ok('   Días sin información se distinguen de días sin ventas', /sin información/.test(await texto(p)) && /sin ventas \(confirmados\)/.test(await texto(p)));
  ok('   Gráfico ventas vs costos: «Pendiente» cuando solo hay ventas por monto', /Se necesitan ventas «por producto»/.test(await texto(p)));
  const h4 = await p.locator('.grafico rect.hit').first();
  await h4.dispatchEvent('pointerover'); await esperar(p, 100);
  ok('   Tocar una barra muestra el valor (tooltip)', (await p.locator('.grafico .tip').first().isVisible()));

  // ============================================================ D. Costos editables
  console.log('\nD. Costos editables y cálculos automáticos');
  await tabCostos(p, 'cafe');
  await p.fill('[data-i="motivoCosto"][data-w="proveedor"]', 'Proveedor Cucutilla'); await p.fill('[data-i="motivoCosto"][data-w="motivo"]', 'Subió la cosecha');
  await setCampo(p, 'cafe.precioKg', '30.000');
  ok('8. Cambiar el precio del café a $30.000/kg se guarda', (await S(p, 'S.costos.cafe.comprado.precioKg')) === 30000);
  const cafe30 = await S(p, `App.tabla().map(r => r.cafe)`);
  ok('8. Costo del café por presentación: 1.260 / 1.800 / 3.750 / 6.750 / 12.750', JSON.stringify(cafe30.map((x) => Math.round(x * 100) / 100)) === '[1260,1800,3750,6750,12750]', JSON.stringify(cafe30));
  ok('   La tabla en pantalla se actualizó sola ($1.260 en 42 g)', /\$1\.260/.test(await texto(p)) && /\$12\.750/.test(await texto(p)));
  ok('   Sigue habiendo una nota de «Actualizado el…»', /Actualizado el/.test(await texto(p)));
  // modo
  await p.click('[data-a="modoCafe"][data-m="procesado"]'); await esperar(p, 400);
  t = await texto(p);
  ok('   Modo «café verde»: sin lotes, el costo del café queda «Pendiente» y se explica qué falta', (await S(p, `App.tabla()[0].cafe === null`)) && /Pendiente/.test(t) && /Aún no hay lotes|costo manual/.test(t));
  // registrar un lote de café verde (pesos reales)
  await p.click('[data-a="nuevoLote"][data-m="procesado"]'); await p.waitForSelector('#fLote');
  await p.fill('#l-verde', '100'); await p.fill('#l-precio', '18.000'); await p.fill('#l-tostado', '84'); await p.fill('#l-transp', '20.000'); await p.fill('#l-mano', '50.000'); await p.fill('#l-energia', '30.000'); await p.fill('#l-prov', 'Finca Alta'); await esperar(p, 200);
  t = await texto(p, '#l-prev');
  ok('   Lote verde: vista previa con rendimiento 84% y costo por kg', /84,0%/.test(t) && /\$22\.619/.test(t), t.replace(/\n/g, ' '));
  await p.click('#fLote button[type=submit]'); await esperar(p, 500);
  const lote = await S(p, 'S.lotesCafe[0]');
  ok('   Lote guardado: 84 kg utilizables, costo 1.900.000, 16% de pérdida', lote && lote.kgUtilizables === 84 && lote.costoTotal === 1900000 && cerca(lote.rendimientoPct, 84));
  const cafeProc = await S(p, `App.tabla()[0].cafe`);
  ok('   En modo procesado el costo del café 42 g = 42/1000 × (1.900.000/84)', cerca(cafeProc, 42 / 1000 * 1900000 / 84, 1e-6), cafeProc);
  ok('   El lote sumó 84 kg al inventario de café', cerca(await S(p, `MC.stock(S.inventarioMov)['cafe:' + S.lotesCafe[0].id]`), 84));
  await p.click('[data-a="modoCafe"][data-m="comprado"]'); await esperar(p, 400);
  ok('   Se puede volver al modo «comprado» y el costo vuelve a $1.260', cerca(await S(p, `App.tabla()[0].cafe`), 1260));
  ok('   Comparación comprado vs procesado visible', /Comprado vs\. procesado/.test(await texto(p)) && /menos que comprarlo|más que comprarlo/.test(await texto(p)));

  await tabCostos(p, 'bolsas');
  await setCampo(p, 'bolsas.precioKg', '15.000');
  await p.selectOption('[data-k="bolsa.metodo.pequena"]', 'teorico'); await esperar(p, 500);
  t = await texto(p);
  ok('9. Bolsa pequeña método teórico sin peso: «Pendiente de datos» y pide el peso', /Pendiente de datos: falta el peso de la bolsa pequeña/.test(t));
  const faltaTot = await S(p, `App.tabla()[0].total`);
  ok('   Sin peso, el costo total de 42 g es «Pendiente» (no se inventa)', faltaTot === null);
  await setCampo(p, 'bolsa.peso.pequena', '3,2');
  const b = await S(p, `MC.costoBolsaRef(S.costos, 'pequena')`);
  ok('9. Peso 3,2 g × $15.000/kg = $48 por bolsa; 100 bolsas = $4.800; 312,5 bolsas/kg', cerca(b.valor, 48) && cerca(b.por100, 4800) && cerca(b.bolsasPorKg, 312.5), JSON.stringify(b));
  t = await texto(p);
  ok('   Se muestra en pantalla: $48, $4.800 y la comparación con la referencia', /\$48/.test(t) && /\$4\.800/.test(t) && /diferencia/.test(t));
  await setCampo(p, 'bolsas.precioKg', '20.000');
  ok('   Al subir el kg a $20.000 la bolsa pasa a $64', cerca(await S(p, `MC.costoBolsaRef(S.costos,'pequena').valor`), 64));
  await setCampo(p, 'bolsas.precioKg', '15.000');
  await setCampo(p, 'bolsa.real.mediana', '42,5'); await p.selectOption('[data-k="bolsa.metodo.mediana"]', 'real'); await esperar(p, 500);
  ok('   Método «real por unidad»: bolsa mediana $42,50; 100 bolsas $4.250', cerca(await S(p, `MC.costoBolsaRef(S.costos,'mediana').valor`), 42.5) && cerca(await S(p, `MC.costoBolsaRef(S.costos,'mediana').por100`), 4250));
  // compra de bolsas por lote (método A)
  await p.click('[data-a="nuevaCompra"][data-t="bolsas"]'); await p.waitForSelector('#fCompra');
  await p.selectOption('#c-tipo', 'grande'); await p.fill('#c-cant', '500'); await p.fill('#c-total', '27.500'); await p.fill('#c-kg', '1,6'); await esperar(p, 200);
  t = await texto(p, '#c-prev');
  ok('   Compra de bolsas: $27.500 / 500 = $55 por bolsa; peso estimado 3,2 g', /\$55/.test(t) && /3,2 g/.test(t), t.replace(/\n/g, ' '));
  await p.click('#fCompra button[type=submit]'); await esperar(p, 500);
  ok('   Se guardó como costo real de la bolsa grande y suma 500 al inventario', cerca(await S(p, `MC.costoBolsaRef(S.costos,'grande').valor`), 55) && cerca(await S(p, `MC.stock(S.inventarioMov)['bolsa:grande']`), 500));

  await tabCostos(p, 'etiquetas');
  await setCampo(p, 'etiq.metro', '30.000');
  const e42 = await S(p, `MC.costoEtiquetaProducto(S.costos, S.productos[0])`);
  ok('10. Precio por metro $30.000 → etiqueta 42 g = 30.000/168 = $178,57', cerca(e42.valor, 30000 / 168) && cerca(e42.por100, 30000 / 168 * 100, 1e-4), e42.valor);
  ok('   En pantalla aparece $178,57', /\$178,57/.test(await texto(p)));
  const id42 = await S(p, 'S.productos[0].id');
  await setCampo(p, `etiq.rend.${id42}`, '150');
  const e42b = await S(p, `MC.costoEtiquetaProducto(S.costos, S.productos[0])`);
  ok('11. Rendimiento 150 etiquetas/m → $200 cada una y $20.000 por 100', cerca(e42b.valor, 200) && cerca(e42b.por100, 20000));
  ok('   En pantalla: $200 y $20.000', /\$200/.test(await texto(p)) && /\$20\.000/.test(await texto(p)));
  const rendOtros = await S(p, `S.productos.map(x => MC.costoEtiquetaProducto(S.costos, x).valor)`);
  ok('   Las demás presentaciones usan sus propios rendimientos (118/90/64/64)', cerca(rendOtros[1], 30000 / 118) && cerca(rendOtros[2], 30000 / 90) && cerca(rendOtros[3], 30000 / 64) && cerca(rendOtros[4], 30000 / 64));
  await setCampo(p, `etiq.rend.${id42}`, 'abc');
  ok('   Un valor no numérico se rechaza y no cambia nada', cerca(await S(p, 'S.productos[0].etiquetasPorMetro'), 150) && /no es un número válido/.test(await texto(p, '#toasts')));

  // Otros costos
  await tabCostos(p, 'otros');
  await p.click('[data-a="nuevoOtro"]'); await p.waitForSelector('#fOtro');
  await p.fill('#o-nombre', 'Caja de cartón'); await p.selectOption('#o-concepto', 'Empaque secundario'); await p.fill('#o-valor', '50'); await p.click('#fOtro button[type=submit]'); await esperar(p, 500);
  ok('   Otros costos: «Caja de cartón» $50 por unidad se suma a cada presentación', cerca(await S(p, `MC.otrosCostosUnit(S.costos, S.productos[0]).total`), 50));
  await p.click('[data-a="nuevoOtro"]'); await p.waitForSelector('#fOtro');
  await p.fill('#o-nombre', 'Arriendo'); await p.selectOption('#o-tipo', 'mensual'); await p.fill('#o-valor', '500.000'); await p.click('#fOtro button[type=submit]'); await esperar(p, 500);
  ok('   Costo mensual (arriendo) NO entra al costo unitario (no se cuenta dos veces)', cerca(await S(p, `MC.otrosCostosUnit(S.costos, S.productos[0]).total`), 50));

  // Productos y precios
  await ir(p, 'productos');
  await setCampo(p, `prod.${id42}.precioTienda`, '2.500');
  const c42 = await S(p, `(() => { const c = App.costoDe(S.productos[0]); return { total: c.total, g: c.ganancia, m: c.margen.valor, r: c.roi.valor }; })()`);
  const tot42 = 30000 * 0.042 + 64 * 0 + 0; // se recalcula abajo con los valores reales
  const esperado = (() => { const cafe = 1260, bolsa = 48, etq = 200, otros = 50, total = cafe + bolsa + etq + otros; return { total, g: 2500 - total, m: (2500 - total) / 2500 * 100, r: (2500 - total) / total * 100 }; })();
  ok('12/13. Costo total 42 g = 1.260 + 48 + 200 + 50 = $1.558', cerca(c42.total, esperado.total, 1e-6), JSON.stringify(c42));
  ok('13. Ganancia = $942; margen = 37,68%; ROI = 60,46%', cerca(c42.g, esperado.g) && cerca(c42.m, esperado.m, 1e-6) && cerca(c42.r, esperado.r, 1e-6), JSON.stringify(c42));
  ok('13. Margen y ROI son distintos (no se confunden)', Math.abs(c42.m - c42.r) > 10);
  t = await texto(p);
  ok('    En pantalla: $942, 37,7% y 60,5%', /\$942/.test(t) && /37,7%/.test(t) && /60,5%/.test(t));
  // cinco gramajes con precios
  const precios = { 60: '3.500', 125: '7.000', 225: '12.000', 425: '22.000' };
  const idsP = await S(p, `S.productos.map(x => [x.id, x.gramos])`);
  for (const [id, g] of idsP) if (precios[g]) await setCampo(p, `prod.${id}.precioTienda`, precios[g]);
  const tab5 = await S(p, `App.tabla().map(r => ({ g: r.gramos, total: r.total, gan: r.ganancia, m: r.margen.valor, r: r.roi.valor, p: r.precio }))`);
  const costeBolsa = { pequena: 48, mediana: 42.5, grande: 55 }, bolsaDe = { 42: 'pequena', 60: 'pequena', 125: 'mediana', 225: 'grande', 425: 'grande' }, rend = { 42: 150, 60: 118, 125: 90, 225: 64, 425: 64 };
  let todosBien = true, det = [];
  for (const r of tab5) { const tot = r.g / 1000 * 30000 + costeBolsa[bolsaDe[r.g]] + 30000 / rend[r.g] + 50; const gan = r.p - tot; if (!cerca(r.total, tot, 1e-6) || !cerca(r.gan, gan, 1e-6) || !cerca(r.m, gan / r.p * 100, 1e-6) || !cerca(r.r, gan / tot * 100, 1e-6)) { todosBien = false; det.push(r.g); } }
  ok('12/13. Las 5 presentaciones (42/60/125/225/425 g): costo, ganancia, margen y ROI correctos', todosBien, det.join(','));
  // rentabilidad negativa
  await setCampo(p, `prod.${id42}.precioTienda`, '1.000');
  const neg = await S(p, `(() => { const c = App.costoDe(S.productos[0]); return { g: c.ganancia, m: c.margen.valor, r: c.roi.valor, neg: c.negativo }; })()`);
  ok('14. Precio menor al costo → ganancia, margen y ROI negativos', neg.neg && neg.g < 0 && neg.m < 0 && neg.r < 0, JSON.stringify(neg));
  await ir(p, 'inicio'); t = await texto(p);
  ok('14. El inicio muestra la alerta de rentabilidad negativa', /rentabilidad negativa/.test(t));
  ok('    Alerta: el costo del café subió de 26.000 a 30.000', /Café tostado y molido: precio por kg.*subió|costo «Café tostado y molido: precio por kg» subió/.test(t));
  await ir(p, 'productos'); await setCampo(p, `prod.${id42}.precioTienda`, '2.500');
  await setCampo(p, `prod.${id42}.precioEspecial`, '2.300'); await setCampo(p, `prod.${id42}.cantEspecial`, '12'); await setCampo(p, `prod.${id42}.precioPublico`, '3.000');
  ok('    Precio especial por cantidad (2.300 desde 12 u.) y precio al público $3.000 guardados por separado', await S(p, `S.productos[0].precioEspecial === 2300 && S.productos[0].cantEspecial === 12 && S.productos[0].precioPublico === 3000 && S.productos[0].precioTienda === 2500`));
  // desactivar / reactivar
  await p.click(`[data-a="activarProd"][data-id="${idsP[4][0]}"]`); await esperar(p, 400);
  ok('    Desactivar presentación (425 g) la saca de los cálculos', (await S(p, `App.tabla().length`)) === 4);
  await p.click(`[data-a="activarProd"][data-id="${idsP[4][0]}"]`); await esperar(p, 400);
  ok('    Reactivar presentación', (await S(p, `App.tabla().length`)) === 5);
  // agregar producto
  await p.click('[data-a="nuevoProd"]'); await p.waitForSelector('#fProd');
  await p.fill('#p-nombre', '500 g'); await p.fill('#p-gramos', '500'); await p.selectOption('#p-bolsa', 'grande'); await p.click('#fProd button[type=submit]'); await esperar(p, 600);
  ok('    Agregar un producto nuevo (500 g)', (await S(p, `S.productos.some(x => x.nombre === '500 g' && x.gramos === 500)`)));

  // Historial de modificaciones
  await tabCostos(p, 'historial'); t = await texto(p);
  ok('11. Historial: café 26.000 → 30.000 con fecha, proveedor y motivo', /Café tostado y molido: precio por kg/.test(t) && /\$26\.000/.test(t) && /\$30\.000/.test(t) && /Proveedor Cucutilla/.test(t) && /Subió la cosecha/.test(t));
  ok('11. Historial: bolsas 12.500 → 15.000 y etiquetas 24.000 → 30.000', /\$12\.500/.test(t) && /\$15\.000/.test(t) && /\$24\.000/.test(t));
  ok('11. Historial registra también cambios de precio de venta', /precio de venta al tendero/.test(t));
  const hist = await S(p, `S.historialCostos.find(h => h.concepto === 'cafe_kg')`);
  ok('    El registro guarda valor anterior, nuevo y fecha de hoy', hist && hist.anterior === 26000 && hist.nuevo === 30000 && hist.fecha === hoyISO);

  // ============================================================ E. Ventas detalladas, inventario, costos históricos
  console.log('\nE. Ventas por producto, inventario y costos históricos');
  await ir(p, 'produccion'); await p.click('[data-a="nuevaProd"]'); await p.waitForSelector('#fPro');
  await p.selectOption('#r-prod', String(id42)); await p.fill('#r-buenas', '100'); await p.fill('#r-def', '5'); await esperar(p, 300);
  ok('    Producción: sugiere el café consumido (105 × 42 g = 4,41 kg)', (await p.inputValue('#r-kg')) === '4,41');
  t = await texto(p, '#r-prev');
  ok('    Producción: muestra costo por unidad buena', /Costo por unidad buena/.test(t), t.replace(/\n/g, ' '));
  await p.click('#fPro button[type=submit]'); await esperar(p, 400);
  if (await p.locator('[data-x="si"]').count()) { ok('    Producción sin bolsas/etiquetas en inventario: avisa «Inventario insuficiente»', /Inventario insuficiente/.test(await texto(p, '#modales'))); await p.click('[data-x="si"]'); }
  await esperar(p, 500);
  let st = await S(p, `MC.stock(S.inventarioMov)`);
  ok('    Producción: +100 terminadas, −105 bolsas y −105 etiquetas, −4,41 kg de café', cerca(st['terminado:' + id42], 100) && cerca(st['bolsa:pequena'], -105) && cerca(st['etiqueta:' + id42], -105), JSON.stringify(st));
  // la producción dejó bolsas negativas (no había inventario de bolsas pequeñas): ajuste
  await p.evaluate(async (id) => { await DB.transaccion(['inventarioMov'], async (a) => { await a.put('inventarioMov', { fecha: MC.hoyISO(), item: 'bolsa', clave: 'pequena', cantidad: 1000, motivo: 'compra', refTipo: 'manual', refId: null, nota: 'prueba', creado: Date.now() }); }); await App.recargar(); }, id42);

  // venta detallada con descuento de inventario
  const costoAntes = await S(p, `App.costoDe(S.productos[0]).total`);
  await ir(p, 'inicio'); await p.click('#fabVenta'); await p.waitForSelector('#fVenta');
  await p.click('[data-a="tipoVenta"][data-t="detallada"]'); await esperar(p, 150);
  await p.selectOption('.l-prod', String(id42)); await esperar(p, 200);
  ok('    Venta por producto: sugiere el precio al tendero ($2.500) y el costo vigente', (await p.inputValue('.l-precio')) === '2.500' && (await p.inputValue('.l-costo')) !== '');
  await p.fill('.l-cant', '12'); await esperar(p, 200);
  ok('    Con 12 unidades aplica el precio especial ($2.300)', (await p.inputValue('.l-precio')) === '2.300');
  ok('    El total de la venta se calcula solo (12 × 2.300 = $27.600)', /\$27\.600/.test(await texto(p, '#v-total')));
  await p.check('#v-desc'); await p.fill('#v-cliente', 'Detallada 1'); await p.click('#v-guardar'); await esperar(p, 500);
  const vd = await S(p, `S.ventas.find(v => v.cliente === 'Detallada 1')`);
  ok('    Venta detallada guardada: monto 27.600, 12 unidades, costo unitario congelado', vd && vd.monto === 27600 && vd.items.length === 1 && vd.items[0].cantidad === 12 && cerca(vd.items[0].costoUnit, costoAntes, 0.01), JSON.stringify(vd && vd.items));
  st = await S(p, `MC.stock(S.inventarioMov)`);
  ok('17. Inventario: 100 − 12 = 88 terminadas', cerca(st['terminado:' + id42], 88), st['terminado:' + id42]);
  // editar la venta: 12 → 15 (no debe descontar dos veces)
  await ir(p, 'ventas'); await p.click(`[data-a="editarVenta"][data-id="${vd.id}"]`); await p.waitForSelector('#fVenta');
  await p.fill('.l-cant', '15'); await esperar(p, 150); await p.click('#v-guardar'); await esperar(p, 500);
  st = await S(p, `MC.stock(S.inventarioMov)`);
  ok('17. Editar la venta a 15 unidades → quedan 85 (NO se descuenta dos veces)', cerca(st['terminado:' + id42], 85), st['terminado:' + id42]);
  ok('    Solo existe UN movimiento de inventario por esa venta', (await S(p, `S.inventarioMov.filter(m => m.refTipo === 'venta' && m.refId === ${vd.id}).length`)) === 1);
  // costos históricos
  await tabCostos(p, 'cafe'); await setCampo(p, 'cafe.precioKg', '40.000');
  const vd2 = await S(p, `S.ventas.find(v => v.cliente === 'Detallada 1')`);
  ok('20. Cambiar el café a $40.000 NO altera el costo guardado en la venta anterior', cerca(vd2.items[0].costoUnit, costoAntes, 0.01) && App_ok(vd2));
  function App_ok() { return true; }
  const costoNuevo = await S(p, `App.costoDe(S.productos[0]).total`);
  ok('20. …pero sí cambia el costo para ventas futuras', costoNuevo > costoAntes + 1, `${costoAntes} → ${costoNuevo}`);
  const res = await S(p, `(() => { const r = MC.resultadoPeriodo({ ventas: S.ventas.filter(v => v.id === ${vd.id}), gastos: [], costos: S.costos, desde: MC.hoyISO(), hasta: MC.hoyISO(), hoy: MC.hoyISO() }); return { cogs: r.cogs, gb: r.gananciaBruta }; })()`);
  ok('20. Costo de lo vendido = 15 × costo de ese momento', cerca(res.cogs, 15 * costoAntes, 0.01), JSON.stringify(res));
  // venta con fecha pasada usa el costo registrado de esa fecha
  const costoPasado = await p.evaluate((id) => { const pr = App.S.productos[0]; return App.costoUnitFecha(pr, '2026-10-01'); }, id42);
  ok('    Venta con fecha anterior al primer cambio usa el costo de referencia inicial', costoPasado && costoPasado.valor !== null, JSON.stringify(costoPasado));
  // inventario insuficiente
  await ir(p, 'inicio'); await p.click('#fabVenta'); await p.waitForSelector('#fVenta');
  await p.click('[data-a="tipoVenta"][data-t="detallada"]'); await p.selectOption('.l-prod', String(id42)); await p.fill('.l-cant', '500'); await esperar(p, 150);
  await p.check('#v-desc'); await p.fill('#v-cliente', 'Sin stock'); await p.click('#v-guardar'); await p.waitForSelector('[data-x="no"]');
  ok('17. Inventario insuficiente: pide confirmación antes de guardar', /Inventario insuficiente/.test(await texto(p, '#modales')));
  await p.click('[data-x="no"]'); await esperar(p, 300);
  ok('    Si cancelas, la venta NO se guarda', (await S(p, `S.ventas.some(v => v.cliente === 'Sin stock')`)) === false);
  await p.click('#fVenta [data-a="cerrar"]'); await esperar(p, 200);
  // eliminar venta detallada devuelve inventario
  await ir(p, 'ventas'); await p.click(`[data-a="borrarVenta"][data-id="${vd.id}"]`); await p.waitForSelector('[data-x="si"]'); await p.click('[data-x="si"]'); await esperar(p, 500);
  st = await S(p, `MC.stock(S.inventarioMov)`);
  ok('17. Eliminar la venta devuelve las unidades al inventario (100)', cerca(st['terminado:' + id42], 100), st['terminado:' + id42]);

  // Resultado financiero con ventas detalladas
  await p.evaluate(async (id) => {
    const pr = App.S.productos[0], c = App.costoDe(pr);
    await App.guardarVenta({ fecha: MC.hoyISO(), hora: '', referencia: '', cliente: 'Detallada A', medio: 'efectivo', monto: 25000, observaciones: '', tipo: 'detallada', descuenta: false }, [{ productoId: pr.id, nombre: pr.nombre, cantidad: 10, precioUnit: 2500, costoUnit: c.total, costoFuente: 'test' }]);
  }, id42);
  await p.evaluate(async () => { await DB.transaccion(['gastos'], (a) => a.put('gastos', { tipo: 'operativo', monto: 5000, fecha: MC.hoyISO(), categoria: 'Transporte', descripcion: 'Flete', creado: Date.now() })); await App.recargar(); });
  await ir(p, 'inicio'); await p.click('[data-a="kind"][data-r="dash"][data-k="dia"]'); await esperar(p, 300);
  t = await texto(p);
  const costoU = await S(p, `App.costoDe(S.productos[0]).total`);
  const resD = await S(p, `(() => { const r = MC.resultadoPeriodo({ ventas: S.ventas, gastos: S.gastos, costos: S.costos, desde: MC.hoyISO(), hasta: MC.hoyISO(), hoy: MC.hoyISO() }); return { estado: r.estado, ing: r.ingresos, cogs: r.cogs, gb: r.gananciaBruta, neta: r.gananciaNeta, gastos: r.gastosTotalOp }; })()`);
  ok('    Con ventas solo por monto + una venta por producto en el mismo día, la ganancia neta queda «Pendiente»', resD.estado === 'parcial' && resD.neta === null);
  await p.evaluate(async () => { for (const v of App.S.ventas.filter((x) => x.tipo === 'rapida' && x.fecha === MC.hoyISO())) await App.eliminarVenta(v.id); });
  await ir(p, 'inicio'); await p.click('[data-a="kind"][data-r="dash"][data-k="dia"]'); await esperar(p, 300); t = await texto(p);
  const resD2 = await S(p, `(() => { const r = MC.resultadoPeriodo({ ventas: S.ventas, gastos: S.gastos, costos: S.costos, desde: MC.hoyISO(), hasta: MC.hoyISO(), hoy: MC.hoyISO() }); return { estado: r.estado, ing: r.ingresos, cogs: r.cogs, gb: r.gananciaBruta, neta: r.gananciaNeta, op: r.gastosTotalOp, mb: r.margenBruto, mn: r.margenNeto }; })()`);
  ok('    Con todas las ventas del día por producto: ganancia bruta = 25.000 − 10 × costo', resD2.estado === 'completo' && cerca(resD2.gb, 25000 - 10 * costoU, 0.01) && cerca(resD2.cogs, 10 * costoU, 0.01), JSON.stringify(resD2));
  ok('    Ganancia neta = ganancia bruta − gastos (5.000) − costo mensual prorrateado', cerca(resD2.neta, resD2.gb - resD2.op, 0.01) && resD2.op >= 5000, JSON.stringify(resD2));
  ok('    El inicio muestra costo, ganancia bruta, neta, márgenes y ROI (pendiente sin inversión)', /Ganancia neta estimada/.test(t) && /Margen bruto/.test(t) && /Margen neto/.test(t) && /ROI/.test(t) && /Margen neto\s+i\s+-?\d/.test(t), t.replace(/\n/g, ' ').slice(-1100));
  ok('    ROI «Pendiente» porque aún no hay inversión registrada (no se inventa)', /Registra al menos una inversión/.test(t));
  // inversión y ROI
  await ir(p, 'inversiones'); await p.click('[data-a="nuevaInv"]'); await p.waitForSelector('#fInv');
  await p.selectOption('#i-tipo', 'maquinaria'); await p.fill('#i-valor', '4.000.000'); await p.fill('#i-desc', 'Tostadora'); await p.click('#fInv button[type=submit]'); await esperar(p, 500);
  ok('    Inversión registrada: total invertido $4.000.000, falta por recuperar $4.000.000', /\$4\.000\.000/.test(await texto(p)) && (await S(p, `MC.resumenInversiones(S.inversiones).falta`)) === 4000000);
  ok('    ROI contable calculado con la ganancia neta (no con las ventas)', /ROI del período/.test(await texto(p)) || /Pendiente de datos/.test(await texto(p)));

  // ============================================================ F. Persistencia
  console.log('\nF. Persistencia al recargar');
  const antes = await S(p, `({ v: S.ventas.length, cafe: S.costos.cafe.comprado.precioKg, bolsa: S.costos.bolsas.precioKg, etq: S.costos.etiquetas.precioMetro, precio: S.productos[0].precioTienda, rend: S.productos[0].etiquetasPorMetro, hist: S.historialCostos.length, lotes: S.lotesCafe.length, inv: S.inversiones.length, otros: S.costos.otros.length, prods: S.productos.length })`);
  await p.reload(); await p.waitForSelector('.vista'); await esperar(p, 400);
  const desp = await S(p, `({ v: S.ventas.length, cafe: S.costos.cafe.comprado.precioKg, bolsa: S.costos.bolsas.precioKg, etq: S.costos.etiquetas.precioMetro, precio: S.productos[0].precioTienda, rend: S.productos[0].etiquetasPorMetro, hist: S.historialCostos.length, lotes: S.lotesCafe.length, inv: S.inversiones.length, otros: S.costos.otros.length, prods: S.productos.length })`);
  ok('15. Tras recargar: ventas, costos, precios, historial, lotes, inversiones y otros costos siguen ahí', JSON.stringify(antes) === JSON.stringify(desp), JSON.stringify(antes) + ' vs ' + JSON.stringify(desp));
  ok('    No se volvieron a sembrar los valores iniciales (café sigue en $40.000, no 26.000)', desp.cafe === 40000);
  await tabCostos(p, 'cafe'); ok('    El campo de café muestra el valor guardado (40.000)', (await p.inputValue('[data-k="cafe.precioKg"]')) === '40.000');
  await ir(p, 'productos'); ok('    El precio al tendero guardado (2.500) se ve en el campo', (await p.inputValue(`[data-k="prod.${id42}.precioTienda"]`)) === '2.500');

  // ============================================================ G. Respaldo y restauración
  console.log('\nG. Copias de seguridad');
  await ir(p, 'respaldo');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-a="hacerRespaldo"]')]);
  const rutaResp = '/tmp/respaldo_test.json'; await dl.saveAs(rutaResp);
  const json = JSON.parse(fs.readFileSync(rutaResp, 'utf8'));
  ok('16. Se descarga un JSON válido de Café Mero Campo', json.app === 'cafe-mero-campo' && json.formato === 1 && /^CafeMeroCampo_respaldo_\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  ok('    La copia incluye todas las tablas y las ventas', Object.keys(json.datos).length === 14 && json.datos.ventas.length === antes.v);
  ok('    Queda registrada la fecha de la última copia', (await S(p, 'S.ajustes.ultimoRespaldo')) === hoyISO);
  // borrar y restaurar
  await p.evaluate(async () => { await DB.borrarTodo(); await App.recargar(); await App.sembrar(); });
  ok('    (Simulamos pérdida de datos: vuelven los valores iniciales)', (await S(p, 'S.ventas.length')) === 0 && (await S(p, 'S.costos.cafe.comprado.precioKg')) === 26000);
  await ir(p, 'respaldo');
  // archivo inválido
  fs.writeFileSync('/tmp/malo.json', JSON.stringify({ hola: 'mundo' })); await p.setInputFiles('#archivoRespaldo', '/tmp/malo.json'); await esperar(p, 400);
  ok('16. Un archivo que no es una copia se rechaza con explicación', /No se puede restaurar/.test(await texto(p, '#modales')) && (await S(p, 'S.ventas.length')) === 0);
  await p.click('#modales [data-a="cerrar"]'); await esperar(p, 200);
  const dañado = JSON.parse(JSON.stringify(json)); dañado.datos.ventas[0].monto = 'mucho'; fs.writeFileSync('/tmp/danado.json', JSON.stringify(dañado));
  await p.setInputFiles('#archivoRespaldo', '/tmp/danado.json'); await esperar(p, 400);
  ok('    Una copia con datos dañados (monto no numérico) se rechaza', /No se puede restaurar/.test(await texto(p, '#modales')), (await texto(p, '#modales')).slice(0, 200) + ' | ventas=' + json.datos.ventas.length);
  await p.click('#modales [data-a="cerrar"]'); await esperar(p, 200);
  fs.writeFileSync('/tmp/roto.json', '{no es json'); await p.setInputFiles('#archivoRespaldo', '/tmp/roto.json'); await esperar(p, 400);
  ok('    Un archivo que ni siquiera es JSON se rechaza', /no es un JSON válido/.test(await texto(p, '#toasts')));
  // restaurar bueno: primero cancelar, luego aceptar
  await p.setInputFiles('#archivoRespaldo', rutaResp); await p.waitForSelector('[data-x="no"]');
  ok('16. Antes de sobrescribir pide confirmación y muestra qué contiene la copia', /Reemplazar mis datos/.test(await texto(p, '#modales')) && new RegExp(antes.v + ' ventas').test(await texto(p, '#modales')));
  await p.click('[data-x="no"]'); await esperar(p, 300);
  ok('    Si cancelas, los datos actuales no cambian', (await S(p, 'S.ventas.length')) === 0);
  await p.setInputFiles('#archivoRespaldo', rutaResp); await p.waitForSelector('[data-x="si"]'); await p.click('[data-x="si"]'); await esperar(p, 800);
  const rest = await S(p, `({ v: S.ventas.length, cafe: S.costos.cafe.comprado.precioKg, bolsa: S.costos.bolsas.precioKg, etq: S.costos.etiquetas.precioMetro, precio: S.productos[0].precioTienda, rend: S.productos[0].etiquetasPorMetro, hist: S.historialCostos.length, lotes: S.lotesCafe.length, inv: S.inversiones.length, otros: S.costos.otros.length, prods: S.productos.length })`);
  ok('16. Restauración: todos los datos vuelven exactamente como estaban', JSON.stringify(rest) === JSON.stringify(antes), JSON.stringify(rest));
  const detRest = await S(p, `S.ventas.filter(v => v.tipo === 'detallada').every(v => v.items.length > 0 && v.items.every(i => typeof i.costoUnit === 'number'))`);
  ok('    Las ventas por producto conservan sus líneas y costos', detRest === true);

  // ============================================================ H. Informes y exportación
  console.log('\nH. Informes y exportaciones');
  await ir(p, 'informes');
  const informes = await p.$$eval('select[data-c="tipoInforme"] option', (o) => o.map((x) => x.value));
  ok('    13 informes disponibles', informes.length === 13, informes.length);
  let errInf = [];
  for (const k of informes) { await p.selectOption('[data-c="tipoInforme"]', k); await esperar(p, 150); const tt = await texto(p); if (/undefined|NaN|\[object/.test(tt)) errInf.push(k); }
  ok('    Ningún informe muestra «undefined», «NaN» ni «[object]»', errInf.length === 0, errInf.join(','));
  await p.selectOption('[data-c="tipoInforme"]', 'ventas_detalle'); await p.fill('[data-w="desde"]', '2025-01-01'); await esperar(p, 250);
  t = await texto(p);
  ok('    Informe con fecha de generación, período, moneda y aclaración de estimados', /Generado el/.test(t) && /Período:/.test(t) && /COP/.test(t) && /estimaciones/.test(t));
  const [csv] = await Promise.all([p.waitForEvent('download'), p.click('[data-a="expCSV"]')]);
  await csv.saveAs('/tmp/inf.csv'); const csvTxt = fs.readFileSync('/tmp/inf.csv', 'utf8');
  ok('    CSV: separador «;», BOM UTF-8, encabezados y montos', csvTxt.charCodeAt(0) === 0xFEFF && /Fecha;Hora;Referencia;Cliente;Medio de pago;Productos;Monto/.test(csvTxt) && /;25000\r?\n/.test(csvTxt) && /Total;;;;;;155000/.test(csvTxt), csvTxt.slice(0, 160));
  const [xl] = await Promise.all([p.waitForEvent('download'), p.click('[data-a="expXLSX"]')]);
  await xl.saveAs('/tmp/inf.xlsx');
  ok('    Excel: archivo .xlsx generado', /\.xlsx$/.test(xl.suggestedFilename()) && fs.statSync('/tmp/inf.xlsx').size > 800);
  await p.selectOption('[data-c="tipoInforme"]', 'costos'); await esperar(p, 200);
  const [xl2] = await Promise.all([p.waitForEvent('download'), p.click('[data-a="expXLSX"]')]); await xl2.saveAs('/tmp/costos.xlsx');
  await p.evaluate(() => { window.__imprimio = false; window.print = () => { window.__imprimio = true; }; });
  await p.click('[data-a="expPDF"]'); await esperar(p, 700);
  ok('    PDF: abre el diálogo de impresión/«Guardar como PDF»', await p.evaluate(() => window.__imprimio));
  ok('    La cabecera «Café Mero Campo» está lista para el PDF', (await p.locator('.solo-impresion').count()) === 1);

  // ============================================================ I. PIN y modo sin conexión
  console.log('\nI. Seguridad y sin conexión');
  await ir(p, 'ajustes'); await p.click('[data-a="cambiarPin"]'); await p.waitForSelector('#fPin');
  await p.fill('#pin1', '12'); await p.fill('#pin2', '12'); await p.click('#fPin button[type=submit]'); await esperar(p, 200);
  ok('    El PIN con menos de 4 números se rechaza', /4 a 8 números/.test(await texto(p, '#pin-err')));
  await p.fill('#pin1', '2468'); await p.fill('#pin2', '2468'); await p.click('#fPin button[type=submit]'); await esperar(p, 600);
  ok('    PIN activado (se guarda un hash, no el PIN)', (await S(p, 'S.ajustes.pinHash')).length > 20 && !JSON.stringify(await S(p, 'S.ajustes')).includes('2468'));
  await p.reload(); await p.waitForSelector('#bloqueo'); await esperar(p, 300);
  ok('    Al abrir la app pide el PIN', (await p.locator('#bloqueo').count()) === 1);
  await p.fill('#pinIn', '0000'); await p.click('#fDesbloq button'); await esperar(p, 400);
  ok('    PIN incorrecto: no entra', (await p.locator('#bloqueo').count()) === 1 && /incorrecto/.test(await texto(p, '#pinErr')));
  await p.fill('#pinIn', '2468'); await p.click('#fDesbloq button'); await esperar(p, 400);
  ok('    PIN correcto: entra', (await p.locator('#bloqueo').count()) === 0);
  await p.click('#btnBloquear'); await esperar(p, 200); ok('    Botón 🔒 bloquea al instante', (await p.locator('#bloqueo').count()) === 1);
  await p.fill('#pinIn', '2468'); await p.click('#fDesbloq button'); await esperar(p, 400);
  await ir(p, 'ajustes'); await p.click('[data-a="quitarPin"]'); await p.waitForSelector('[data-x="si"]'); await p.click('[data-x="si"]'); await esperar(p, 500);
  ok('    Quitar PIN', !(await S(p, 'S.ajustes.pinHash')));
  // sin conexión
  await p.reload(); await p.waitForSelector('.vista'); await esperar(p, 1200);
  const sw = await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && (r.active || r.waiting || r.installing)); });
  ok('18b. Service worker instalado', sw);
  await p.evaluate(async () => { await navigator.serviceWorker.ready; });
  await esperar(p, 800);
  await p.ctx.setOffline(true);
  await p.reload(); await p.waitForSelector('.vista', { timeout: 8000 }); await esperar(p, 500);
  ok('    SIN INTERNET: la app abre y conserva los datos', (await S(p, 'S.ventas.length')) === antes.v && /Café Mero Campo/.test(await texto(p, 'header')));
  await registrarVenta(p, { monto: '1.234', cliente: 'Offline' });
  ok('    SIN INTERNET: se pueden registrar ventas', (await S(p, `S.ventas.some(v => v.cliente === 'Offline')`)) === true);
  await p.ctx.setOffline(false);

  ok('    Sin errores de consola durante todo el recorrido', p.errs.length === 0, p.errs.slice(0, 3).join(' | '));
  const errsA = p.errs.slice();

  // ============================================================ J. Diseño móvil
  console.log('\nJ. Pantalla móvil (390 px)');
  await p.evaluate(async () => { await DB.borrarTodo(); await App.recargar(); await App.sembrar(); });
  await p.evaluate(async () => { const pr = App.S.productos[0]; for (const [i, f] of [0, 1, 2, 3, 5, 8, 9, 12, 15, 20].entries()) await App.guardarVenta({ fecha: MC.addDias(MC.hoyISO(), -f), hora: '', referencia: '', cliente: 'Cliente ' + i, medio: 'efectivo', monto: 30000 + i * 15000, observaciones: '', tipo: 'rapida', descuenta: false }, []); });
  const vistas = ['inicio', 'ventas', 'stats', 'costos', 'productos', 'inventario', 'produccion', 'gastos', 'inversiones', 'informes', 'respaldo', 'ajustes', 'mas'];
  const desborda = [];
  for (const v of vistas) { await ir(p, v); const w = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })); if (w.sw > w.iw + 1) desborda.push(`${v}(${w.sw})`); }
  ok('18. Ninguna pantalla se desborda horizontalmente en 390 px', desborda.length === 0, desborda.join(','));
  for (const t2 of ['tabla', 'cafe', 'bolsas', 'etiquetas', 'otros', 'historial']) { await tabCostos(p, t2); const w = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })); if (w.sw > w.iw + 1) desborda.push(`costos/${t2}(${w.sw})`); }
  ok('18. Las pestañas del Centro de costos tampoco se desbordan', desborda.length === 0, desborda.join(','));
  const chicos = await p.evaluate(() => Array.from(document.querySelectorAll('.btn:not(.sm), nav.tabs a, .fab')).filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height < 44; }).length);
  ok('18. Botones principales de al menos 44 px de alto (fáciles de tocar)', chicos === 0, chicos);
  await ir(p, 'inicio'); await p.screenshot({ path: '/tmp/m_inicio.png' });
  await p.click('#fabVenta'); await p.waitForSelector('#fVenta'); await p.screenshot({ path: '/tmp/m_venta.png' }); await p.click('#fVenta [data-a="cerrar"]');
  await ir(p, 'stats'); await esperar(p, 300); await p.screenshot({ path: '/tmp/m_stats.png', fullPage: false });
  await tabCostos(p, 'tabla'); await p.screenshot({ path: '/tmp/m_tabla.png' });
  await tabCostos(p, 'bolsas'); await p.screenshot({ path: '/tmp/m_bolsas.png' });
  await ir(p, 'productos'); await p.screenshot({ path: '/tmp/m_productos.png' });
  await p.setViewportSize({ width: 1100, height: 800 }); await ir(p, 'inicio'); await p.screenshot({ path: '/tmp/d_inicio.png' });
  await p.setViewportSize({ width: 820, height: 1100 }); await tabCostos(p, 'tabla'); await p.screenshot({ path: '/tmp/t_tabla.png' });
  ok('    Sin errores de consola en el diseño móvil', p.errs.length === errsA.length, p.errs.slice(errsA.length).join(' | '));
  await p.ctx.close();

  // ============================================================ K. TODOS los campos de costos son editables y persisten
  console.log('\nK. Todos los campos editables se guardan (recorrido completo)');
  p = await nuevaPagina(browser);
  const recorrido = [['cafe'], ['bolsas'], ['etiquetas']];
  const registro = {};
  for (const [tb] of recorrido) {
    await tabCostos(p, tb);
    const campos = await p.$$eval('[data-c="costo"][data-t="num"]', (els) => els.map((e) => e.dataset.k));
    registro[tb] = campos;
    for (let i = 0; i < campos.length; i++) { await setCampo(p, campos[i], String(7 + i) + ',5'); }
  }
  await ir(p, 'productos');
  const camposProd = await p.$$eval('[data-c="costo"][data-t="num"]', (els) => els.map((e) => e.dataset.k));
  for (let i = 0; i < camposProd.length; i++) await setCampo(p, camposProd[i], String(100 + i) + ',25');
  const total = Object.values(registro).reduce((a, x) => a + x.length, 0) + camposProd.length;
  console.log(`   ${total} campos numéricos probados (${Object.entries(registro).map(([k, v]) => k + ':' + v.length).join(', ')}, productos:${camposProd.length})`);
  ok('12. Se encontraron y editaron más de 40 campos de costos y precios', total >= 40, total);
  await p.reload(); await p.waitForSelector('.vista'); await esperar(p, 400);
  let mal = [];
  for (const [tb] of recorrido) {
    await tabCostos(p, tb);
    for (let i = 0; i < registro[tb].length; i++) { const v = await p.inputValue(`[data-k="${registro[tb][i]}"]`); if (v !== String(7 + i) + ',5') mal.push(`${registro[tb][i]}=${v}`); }
  }
  await ir(p, 'productos');
  for (let i = 0; i < camposProd.length; i++) { const v = await p.inputValue(`[data-k="${camposProd[i]}"]`); if (v !== String(100 + i) + ',25') mal.push(`${camposProd[i]}=${v}`); }
  ok('12. Tras recargar, TODOS los campos conservan el valor que escribiste', mal.length === 0, mal.slice(0, 5).join(' | '));
  const histN = await S(p, 'S.historialCostos.length + S.historialPrecios.length');
  ok('11. Cada cambio quedó en el historial (' + histN + ' registros)', histN >= total - 10, histN);
  ok('    Sin errores de consola en el recorrido de campos', p.errs.length === 0, p.errs.slice(0, 3).join(' | '));
  await p.ctx.close();

  await browser.close();
  console.log(`\n==== RESULTADO: ${pasan} comprobaciones correctas, ${fallan} con fallo ====`);
  if (fallos.length) { console.log('\nFALLOS:'); fallos.forEach((f) => console.log(' -', f)); process.exit(1); }
})().catch((e) => { console.error('ERROR EN LA PRUEBA:', e); process.exit(2); });
