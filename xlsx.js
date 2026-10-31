/* Generador mínimo de archivos Excel (.xlsx) y CSV, sin librerías externas (funciona sin conexión). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.XLSX_MC = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const enc = new TextEncoder();
  let TABLA = null;
  function crc32(buf) {
    if (!TABLA) { TABLA = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; TABLA[n] = c >>> 0; } }
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = TABLA[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function zip(archivos) { // sin compresión ("stored")
    const partes = [], central = []; let offset = 0;
    const u16 = (n) => [n & 255, (n >>> 8) & 255], u32 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
    for (const a of archivos) {
      const nombre = enc.encode(a.nombre), datos = typeof a.datos === 'string' ? enc.encode(a.datos) : a.datos, crc = crc32(datos);
      const cab = Uint8Array.from([0x50, 0x4B, 3, 4, 20, 0, 0, 8, 0, 0, 0, 0, 0x21, 0, ...u32(crc), ...u32(datos.length), ...u32(datos.length), ...u16(nombre.length), 0, 0]);
      partes.push(cab, nombre, datos);
      central.push(Uint8Array.from([0x50, 0x4B, 1, 2, 20, 0, 20, 0, 0, 8, 0, 0, 0, 0, 0x21, 0, ...u32(crc), ...u32(datos.length), ...u32(datos.length), ...u16(nombre.length), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u32(offset)]), nombre);
      offset += cab.length + nombre.length + datos.length;
    }
    let tamCentral = 0; for (const c of central) tamCentral += c.length;
    const fin = Uint8Array.from([0x50, 0x4B, 5, 6, 0, 0, 0, 0, ...u16(archivos.length), ...u16(archivos.length), ...u32(tamCentral), ...u32(offset), 0, 0]);
    const todo = partes.concat(central, [fin]); let total = 0; for (const p of todo) total += p.length;
    const out = new Uint8Array(total); let o = 0; for (const p of todo) { out.set(p, o); o += p.length; }
    return out;
  }
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  function col(n) { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  /** hojas: [{nombre, columnas:[..], filas:[[..]], notas:[..]}]. Los números se guardan como números reales. */
  function libro(hojas) {
    const nombres = hojas.map((h, i) => (String(h.nombre || 'Hoja' + (i + 1)).replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 31)) || 'Hoja');
    const sheetXml = hojas.map((h) => {
      const filas = [];
      (h.notas || []).forEach((n) => filas.push([n]));
      if (h.notas && h.notas.length) filas.push([]);
      const encabezadoFila = filas.length + 1;
      filas.push(h.columnas || []);
      (h.filas || []).forEach((f) => filas.push(f));
      const rows = filas.map((f, r) => `<row r="${r + 1}">` + f.map((v, c) => {
        if (v === null || v === undefined || v === '') return '';
        const ref = col(c) + (r + 1);
        const estilo = r + 1 === encabezadoFila ? ' s="1"' : '';
        if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${estilo}><v>${v}</v></c>`;
        return `<c r="${ref}" t="inlineStr"${estilo}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
      }).join('') + '</row>').join('');
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><cols><col min="1" max="1" width="30" customWidth="1"/><col min="2" max="12" width="18" customWidth="1"/></cols><sheetData>${rows}</sheetData></worksheet>`;
    });
    const archivos = [
      { nombre: '[Content_Types].xml', datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
      { nombre: '_rels/.rels', datos: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { nombre: 'xl/workbook.xml', datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nombres.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
      { nombre: 'xl/_rels/workbook.xml.rels', datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { nombre: 'xl/styles.xml', datos: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' },
    ];
    sheetXml.forEach((x, i) => archivos.push({ nombre: `xl/worksheets/sheet${i + 1}.xml`, datos: x }));
    return zip(archivos);
  }
  /** CSV para Excel en español: separador ; , decimales con coma, BOM UTF-8. */
  function csv(columnas, filas, notas) {
    const celda = (v) => {
      if (v === null || v === undefined) return '';
      let s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
      if (/^[=+\-@]/.test(s) && typeof v !== 'number') s = "'" + s; // evita fórmulas inyectadas
      return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lineas = [];
    (notas || []).forEach((n) => lineas.push(celda(n)));
    if (notas && notas.length) lineas.push('');
    lineas.push(columnas.map(celda).join(';'));
    filas.forEach((f) => lineas.push(f.map(celda).join(';')));
    return '﻿' + lineas.join('\r\n');
  }
  return { libro, csv, zip, crc32 };
});
