/* Base de datos local (IndexedDB). Todo se guarda en el dispositivo; funciona sin conexión.
 * Una tabla por entidad: ventas, ventaDetalles, productos, historialPrecios, historialCostos, snapshots,
 * compras, lotesCafe, produccion, inventarioMov, gastos, inversiones, diasSinVentas, config.
 * Las operaciones que tocan varias tablas se hacen en UNA transacción (o se guarda todo, o nada). */
(function () {
  'use strict';
  const NOMBRE = 'cafe-mero-campo', VERSION = 1;
  const TABLAS = ['ventas', 'ventaDetalles', 'productos', 'historialPrecios', 'historialCostos', 'snapshots', 'compras', 'lotesCafe', 'produccion', 'inventarioMov', 'gastos', 'inversiones', 'diasSinVentas', 'config'];
  let db = null;

  function abrir() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(NOMBRE, VERSION);
      r.onupgradeneeded = () => {
        const d = r.result;
        for (const t of TABLAS) {
          if (d.objectStoreNames.contains(t)) continue;
          if (t === 'config') d.createObjectStore(t, { keyPath: 'id' });
          else d.createObjectStore(t, { keyPath: 'id', autoIncrement: true });
        }
      };
      r.onsuccess = () => { db = r.result; res(db); };
      r.onerror = () => rej(r.error || new Error('No se pudo abrir la base de datos'));
      r.onblocked = () => rej(new Error('La base de datos está bloqueada por otra pestaña'));
    });
  }
  const reqP = (rq) => new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });

  async function todo(t) { return reqP(db.transaction(t).objectStore(t).getAll()); }
  async function cargarTodo() {
    const out = {};
    const tx = db.transaction(TABLAS);
    await Promise.all(TABLAS.map(async (t) => { out[t] = await reqP(tx.objectStore(t).getAll()); }));
    return out;
  }

  /** Ejecuta varias escrituras en una sola transacción.
   *  fn recibe { put(tabla,obj)->Promise<id>, del(tabla,id), clear(tabla) }. Si algo falla, no se guarda NADA. */
  function transaccion(tablas, fn) {
    return new Promise((res, rej) => {
      let tx;
      try { tx = db.transaction(tablas, 'readwrite'); } catch (e) { return rej(e); }
      let resultado, fallo = null;
      tx.oncomplete = () => res(resultado);
      tx.onabort = () => rej(fallo || tx.error || new Error('Transacción cancelada'));
      tx.onerror = () => { fallo = tx.error; };
      const api = {
        put: (t, o) => reqP(tx.objectStore(t).put(o)),
        del: (t, id) => reqP(tx.objectStore(t).delete(id)),
        clear: (t) => reqP(tx.objectStore(t).clear()),
      };
      Promise.resolve().then(() => fn(api)).then((r) => { resultado = r; }).catch((e) => { fallo = e; try { tx.abort(); } catch (_) { /* ya cerrada */ } });
    });
  }

  /** Reemplaza TODOS los datos con los de una copia de seguridad (una sola transacción). */
  async function reemplazarTodo(datos) {
    return transaccion(TABLAS, async (a) => {
      for (const t of TABLAS) {
        await a.clear(t);
        for (const o of datos[t] || []) await a.put(t, o);
      }
    });
  }
  async function borrarTodo() { return transaccion(TABLAS, async (a) => { for (const t of TABLAS) await a.clear(t); }); }
  async function pedirPersistencia() {
    try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (_) { /* sin soporte */ }
    return false;
  }

  window.DB = { abrir, todo, cargarTodo, transaccion, reemplazarTodo, borrarTodo, pedirPersistencia, TABLAS };
})();
