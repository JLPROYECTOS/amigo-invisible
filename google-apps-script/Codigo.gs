/**
 * Amigo Invisible: base de datos en Google Drive.
 *
 * Guarda los registros (nombre, foto, móvil) en una hoja de cálculo de tu Drive
 * llamada «Amigo Invisible - datos», que se crea sola la primera vez.
 * Se publica como «Aplicación web» (ver README).
 */

// Clave del panel de organización. Cámbiala por una tuya.
const CLAVE_ADMIN = 'CAMBIA-ESTA-CLAVE';

const CABECERA = ['id', 'nombre', 'foto', 'dispositivo', 'terminal', 'fecha', 'prestado', 'regala_a'];
const PROPS = PropertiesService.getScriptProperties();

function doGet() {
  return salida({ ok: true, app: 'amigo-invisible' });
}

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (_) { return salida(error('Petición no válida')); }
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
    return salida(manejar(d || {}));
  } catch (err) {
    return salida(error(String((err && err.message) || err)));
  } finally {
    lock.releaseLock();
  }
}

function manejar(d) {
  const estado = PROPS.getProperty('estado') || 'abierto'; // abierto | cerrado | sorteado
  const filas = leer();
  const evento = JSON.parse(PROPS.getProperty('evento') || '{}');

  switch (d.action) {
    case 'estado':
      return {
        ok: true, estado, evento, total: filas.length,
        mios: filas.filter((f) => f.dispositivo === d.device).map((f) => ({ id: f.id, nombre: f.nombre, foto: f.foto })),
      };

    case 'registrar': {
      if (estado !== 'abierto') return error('La inscripción ya está cerrada.');
      const nombre = limpiar(d.nombre, 40);
      const device = limpiar(d.device, 64);
      const foto = validarFoto(d.foto);
      if (!nombre) return error('Escribe tu nombre.');
      if (!foto) return error('Falta la foto o no es válida.');
      if (!device) return error('Falta el identificador del móvil.');
      if (filas.some((f) => f.nombre.toLowerCase() === nombre.toLowerCase())) {
        return error('Ya hay alguien registrado como "' + nombre + '". Añade tu apellido o una inicial.');
      }
      const yaTieneDueno = filas.some((f) => f.dispositivo === device && !f.prestado);
      const prestado = !!d.prestado || yaTieneDueno;
      const id = Utilities.getUuid().replace(/-/g, '').slice(0, 10);
      hoja().appendRow([id, celda(nombre), foto, device, celda(limpiar(d.terminal, 200)), new Date(), prestado ? 'sí' : '', '']);
      return { ok: true, id, nombre, prestado };
    }

    case 'resultado': {
      if (estado !== 'sorteado') return error('Todavía no se ha hecho el sorteo.');
      const yo = filas.find((f) => f.id === d.id && f.dispositivo === d.device);
      if (!yo) return error('Este móvil no registró a esa persona.');
      const r = filas.find((f) => f.id === yo.regala_a);
      if (!r) return error('No se encuentra el resultado. Avisa a quien organiza.');
      return { ok: true, nombre: r.nombre, foto: r.foto, evento };
    }
  }

  // ----- Acciones del panel de organización -----
  if (CLAVE_ADMIN === 'CAMBIA-ESTA-CLAVE') return error('Cambia CLAVE_ADMIN en el script y vuelve a implementarlo.');
  if (d.key !== CLAVE_ADMIN) return error('Clave incorrecta.');

  switch (d.action) {
    case 'admin':
      return {
        ok: true, estado, evento,
        hoja: hojaCalculo().getUrl(),
        registros: filas.map((f) => ({
          id: f.id, nombre: f.nombre, foto: f.foto, terminal: f.terminal,
          movil: codigoMovil(f.dispositivo), fecha: f.fecha, prestado: f.prestado,
        })),
      };

    case 'evento': {
      const ev = {
        nombre: limpiar(d.evento && d.evento.nombre, 60), tematica: limpiar(d.evento && d.evento.tematica, 40),
        presupuesto: limpiar(d.evento && d.evento.presupuesto, 30), fecha: limpiar(d.evento && d.evento.fecha, 40),
      };
      PROPS.setProperty('evento', JSON.stringify(ev));
      return { ok: true };
    }

    case 'cerrar':
      if (estado !== 'abierto') return error('La inscripción ya estaba cerrada.');
      PROPS.setProperty('estado', 'cerrado');
      return { ok: true };

    case 'reabrir':
      if (estado === 'sorteado') return error('Ya se ha sorteado. Para empezar de nuevo, deshaz el sorteo.');
      PROPS.setProperty('estado', 'abierto');
      return { ok: true };

    case 'sortear': {
      if (estado === 'abierto') return error('Primero cierra la inscripción («Ya estamos todos»).');
      if (estado === 'sorteado') return error('El sorteo ya está hecho.');
      if (filas.length < 3) return error('Hacen falta al menos 3 personas.');
      // Algoritmo de Sattolo: permutación en un único ciclo, nadie se regala a sí mismo.
      const ids = filas.map((f) => f.id);
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * i);
        const t = ids[i]; ids[i] = ids[j]; ids[j] = t;
      }
      const regala = {};
      ids.forEach((id, i) => { regala[id] = ids[(i + 1) % ids.length]; });
      const h = hoja();
      filas.forEach((f) => { h.getRange(f.fila, 8).setValue(regala[f.id]); });
      PROPS.setProperty('estado', 'sorteado');
      return { ok: true, total: ids.length };
    }

    case 'deshacer':
      if (estado !== 'sorteado') return error('No hay sorteo que deshacer.');
      filas.forEach((f) => { hoja().getRange(f.fila, 8).setValue(''); });
      PROPS.setProperty('estado', 'cerrado');
      return { ok: true };

    case 'borrar': {
      if (estado === 'sorteado') return error('No se puede borrar a nadie después del sorteo. Deshaz el sorteo primero.');
      const f = filas.find((x) => x.id === d.id);
      if (!f) return error('No existe ese registro.');
      hoja().deleteRow(f.fila);
      return { ok: true };
    }

    case 'reiniciar': {
      const h = hoja();
      if (h.getLastRow() > 1) h.deleteRows(2, h.getLastRow() - 1);
      PROPS.setProperty('estado', 'abierto');
      return { ok: true };
    }
  }
  return error('Acción desconocida.');
}

// ----- Hoja de cálculo -----
function hojaCalculo() {
  const id = PROPS.getProperty('hojaId');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (_) { /* se borró: crear otra */ }
  }
  const ss = SpreadsheetApp.create('Amigo Invisible - datos');
  const h = ss.getSheets()[0];
  h.setName('Registros');
  h.appendRow(CABECERA);
  h.setFrozenRows(1);
  PROPS.setProperty('hojaId', ss.getId());
  return ss;
}

function hoja() {
  return hojaCalculo().getSheetByName('Registros');
}

function leer() {
  const h = hoja();
  const n = h.getLastRow() - 1;
  if (n < 1) return [];
  return h.getRange(2, 1, n, CABECERA.length).getValues().map((r, i) => ({
    fila: i + 2,
    id: String(r[0]), nombre: String(r[1]), foto: String(r[2]), dispositivo: String(r[3]),
    terminal: String(r[4]), fecha: r[5] instanceof Date ? r[5].toISOString() : String(r[5]),
    prestado: r[6] === 'sí', regala_a: String(r[7]),
  }));
}

// ----- Utilidades -----
// Código corto y estable para identificar cada móvil en el panel (p. ej. «K3F9Q»).
function codigoMovil(s) {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return ('0000' + h.toString(36).toUpperCase()).slice(-5);
}

function limpiar(v, max) {
  return String(v || '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max);
}

// Evita que un texto se interprete como fórmula en la hoja.
function celda(v) {
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

function validarFoto(v) {
  v = String(v || '');
  return /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v) && v.length < 49000 ? v : '';
}

function error(msg) {
  return { ok: false, error: msg };
}

function salida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
