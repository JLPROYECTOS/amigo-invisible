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
  // Parejas que no pueden regalarse entre sí: [[idA, idB], ...]
  const exclusiones = JSON.parse(PROPS.getProperty('exclusiones') || '[]')
    .filter((p) => filas.some((f) => f.id === p[0]) && filas.some((f) => f.id === p[1]));
  const guardarExclusiones = (lista) => PROPS.setProperty('exclusiones', JSON.stringify(lista));

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
      const r = filas.find((f) => f.id === descifrar(yo.regala_a, yo.id));
      if (!r) return error('No se encuentra el resultado. Avisa a quien organiza.');
      return { ok: true, nombre: r.nombre, foto: r.foto, evento };
    }
  }

  // ----- Acciones del panel de organización -----
  if (CLAVE_ADMIN === 'CAMBIA-ESTA-CLAVE') return error('Cambia CLAVE_ADMIN en el script y vuelve a implementarlo.');
  if (d.key !== CLAVE_ADMIN) return error('Clave incorrecta.');

  switch (d.action) {
    case 'admin':
      // Nunca se devuelve a quién le toca a cada uno: ni quien organiza lo ve.
      return {
        ok: true, estado, evento, exclusiones,
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

    case 'excluir': {
      if (estado === 'sorteado') return error('El sorteo ya está hecho.');
      const a = String(d.a || ''), b = String(d.b || '');
      if (!filas.some((f) => f.id === a) || !filas.some((f) => f.id === b)) return error('Persona no encontrada.');
      if (a === b) return error('Elige dos personas distintas.');
      if (exclusiones.some((p) => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a))) return error('Esa pareja ya está añadida.');
      exclusiones.push([a, b]);
      guardarExclusiones(exclusiones);
      return { ok: true };
    }

    case 'quitarExclusion': {
      if (estado === 'sorteado') return error('El sorteo ya está hecho.');
      guardarExclusiones(exclusiones.filter((p) => !((p[0] === d.a && p[1] === d.b) || (p[0] === d.b && p[1] === d.a))));
      return { ok: true };
    }

    case 'sortear': {
      if (estado === 'abierto') return error('Primero cierra la inscripción («Ya estamos todos»).');
      if (estado === 'sorteado') return error('El sorteo ya está hecho.');
      if (filas.length < 3) return error('Hacen falta al menos 3 personas.');
      const regala = sortear(filas.map((f) => f.id), exclusiones);
      if (!regala) return error('Con estas parejas excluidas no hay ningún sorteo posible. Quita alguna.');
      const h = hoja();
      // Se guarda cifrado: abriendo la hoja no se puede saber a quién le toca cada uno.
      filas.forEach((f) => { h.getRange(f.fila, 8).setValue(cifrar(regala[f.id], f.id)); });
      PROPS.setProperty('estado', 'sorteado');
      return { ok: true, total: filas.length };
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
      guardarExclusiones(exclusiones.filter((p) => p[0] !== f.id && p[1] !== f.id));
      return { ok: true };
    }

    case 'reiniciar': {
      const h = hoja();
      if (h.getLastRow() > 1) h.deleteRows(2, h.getLastRow() - 1);
      PROPS.setProperty('estado', 'abierto');
      guardarExclusiones([]);
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

// ----- Sorteo -----
// Asigna a cada persona otra distinta, respetando las parejas excluidas.
// Backtracking con orden aleatorio: si existe solución, la encuentra.
function sortear(ids, exclusiones) {
  const prohibido = (a, b) => a === b || exclusiones.some((p) => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a));
  const mezclar = (arr) => {
    const x = arr.slice();
    for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = x[i]; x[i] = x[j]; x[j] = t; }
    return x;
  };
  const dadores = mezclar(ids);
  const usado = {};
  const res = {};
  function paso(i) {
    if (i === dadores.length) return true;
    const g = dadores[i];
    const opciones = mezclar(ids);
    for (let k = 0; k < opciones.length; k++) {
      const r = opciones[k];
      if (usado[r] || prohibido(g, r)) continue;
      usado[r] = true; res[g] = r;
      if (paso(i + 1)) return true;
      delete usado[r]; delete res[g];
    }
    return false;
  }
  return paso(0) ? res : null;
}

// ----- Cifrado del resultado -----
// Clave aleatoria guardada en las propiedades del script (no en la hoja).
function secreto() {
  let s = PROPS.getProperty('secreto');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); PROPS.setProperty('secreto', s); }
  return s;
}

function xorBytes(bytes, clave) {
  return bytes.map((b, i) => b ^ clave.charCodeAt(i % clave.length));
}

function cifrar(texto, sal) {
  const bytes = Utilities.newBlob(String(texto)).getBytes();
  return Utilities.base64Encode(xorBytes(bytes, secreto() + sal));
}

function descifrar(cifrado, sal) {
  if (!cifrado) return '';
  try {
    const bytes = xorBytes(Utilities.base64Decode(String(cifrado)), secreto() + sal);
    return Utilities.newBlob(bytes).getDataAsString();
  } catch (_) {
    return '';
  }
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
