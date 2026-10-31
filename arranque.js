/* Arranque: abre la base de datos, siembra los valores de REFERENCIA la primera vez, bloqueo con PIN y modo sin conexión. */
(function () {
  'use strict';
  const MC = window.MC, DB = window.DB, App = window.App, S = App.S;
  const { $, toast } = App;

  /** Primera ejecución: guarda las presentaciones y los valores de referencia que dio el dueño (todos editables). */
  App.sembrar = async function () {
    const hoy = MC.hoyISO();
    const costos = MC.costosIniciales(hoy), productos = MC.productosIniciales();
    await DB.transaccion(['config', 'productos', 'snapshots'], async (a) => {
      await a.put('config', { id: 'costos', valor: costos });
      await a.put('config', { id: 'ajustes', valor: { valoracion: 'vigente', creado: hoy } });
      const ids = [];
      for (const p of productos) ids.push(await a.put('productos', p));
      const ctx = { costos, lotes: [], valoracion: 'vigente' };
      const items = productos.map((p, i) => { const c = MC.costoProducto(Object.assign({}, p, { id: ids[i] }), ctx); return { productoId: ids[i], nombre: p.nombre, total: c.total, precio: c.precio, margen: c.margen.ok ? c.margen.valor : null, completo: c.completo }; });
      await a.put('snapshots', { fecha: hoy, creado: Date.now(), items });
    });
    await App.recargar();
  };

  // ---------------- Bloqueo con PIN
  let bloqueado = false;
  App.actualizarBloqueo = () => { $('#btnBloquear').hidden = !S.ajustes.pinHash; };
  function pantallaBloqueo() {
    if (!S.ajustes.pinHash) return;
    bloqueado = true;
    const p = document.createElement('div'); p.className = 'pantalla-bloqueo'; p.id = 'bloqueo';
    p.innerHTML = `<div style="font-size:3rem">🔒</div><h2 style="font-family:Georgia,serif">Café Mero Campo</h2><div style="color:#e8d9b0">Escribe tu PIN</div>
      <form id="fDesbloq" novalidate><input class="in" id="pinIn" type="password" inputmode="numeric" maxlength="8" autocomplete="off" aria-label="PIN"><div id="pinErr" class="error" style="color:#ffb4ab;margin-top:8px" role="alert"></div><button class="btn oro" type="submit" style="margin-top:10px">Entrar</button></form>`;
    document.body.appendChild(p); $('#pinIn').focus();
    let fallos = 0;
    $('#fDesbloq').addEventListener('submit', async (e) => {
      e.preventDefault(); const h = await App.hashPin($('#pinIn').value, S.ajustes.pinSal);
      if (h === S.ajustes.pinHash) { p.remove(); bloqueado = false; } else { fallos++; $('#pinErr').textContent = fallos >= 5 ? 'PIN incorrecto. Espera unos segundos…' : 'PIN incorrecto.'; $('#pinIn').value = ''; if (fallos >= 5) { $('#pinIn').disabled = true; setTimeout(() => { $('#pinIn').disabled = false; $('#pinIn').focus(); }, 8000); } }
    });
  }
  $('#btnBloquear').addEventListener('click', () => { if (!bloqueado) pantallaBloqueo(); });

  async function iniciar() {
    try {
      if (!window.indexedDB) throw new Error('Este navegador no permite guardar datos locales (¿modo privado?).');
      await DB.abrir(); await App.recargar();
      if (!S.costos || !S.productos.length) await App.sembrar();
      S.persistente = await DB.pedirPersistencia();
      App.actualizarBloqueo();
      App.render();
      if (S.ajustes.pinHash) pantallaBloqueo();
    } catch (e) {
      console.error(e);
      $('#app').innerHTML = `<div class="card"><h2>No se pudo abrir la base de datos</h2><p>${App.esc(e.message || e)}</p><p class="nota">Cierra otras pestañas de la aplicación y vuelve a intentarlo. Si estás en navegación privada, ábrela en una ventana normal.</p></div>`;
    }
  }
  window.addEventListener('error', (e) => { console.error(e.error || e.message); });
  window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); toast('Ocurrió un error: ' + (e.reason && e.reason.message ? e.reason.message : e.reason), 'err'); });
  if (!location.hash) location.hash = '#/inicio';
  iniciar();

  // ---------------- Sin conexión (service worker)
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e)));
  }
})();
