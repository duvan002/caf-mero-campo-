const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CO', timezoneId: 'America/Bogota', deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.goto('http://localhost:8765/index.html');
  await page.waitForSelector('.vista', { timeout: 8000 });
  for (const r of ['inicio', 'ventas', 'stats', 'costos', 'mas', 'productos', 'inventario', 'produccion', 'gastos', 'inversiones', 'informes', 'respaldo', 'ajustes']) {
    await page.evaluate((r) => { location.hash = '#/' + r; }, r);
    await page.waitForTimeout(150);
    const n = await page.evaluate(() => document.querySelector('#app').innerText.length);
    console.log(r.padEnd(12), 'texto:', n);
  }
  await page.evaluate(() => { location.hash = '#/inicio'; });
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/tmp/s_inicio.png' });
  console.log('ERRORES:', errs.length ? errs.join('\n') : 'ninguno');
  await b.close();
})();
