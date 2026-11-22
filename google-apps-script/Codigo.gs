/**
 * Amigo Invisible: envío de correos con Google Apps Script.
 *
 * Instálalo en la cuenta de Gmail desde la que quieras que salgan los correos
 * (por ejemplo, una cuenta creada solo para el amigo invisible).
 * Instrucciones completas en el README del repositorio.
 */

// ⚠️ Cambia esta clave por una tuya y escribe la misma en la app.
// Sin ella, cualquiera que conozca la URL del script podría enviar correos.
const CLAVE_SECRETA = 'CAMBIA-ESTA-CLAVE';

// Nombre que verán los participantes como remitente.
const NOMBRE_REMITENTE = 'Amigo Invisible';

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (CLAVE_SECRETA === 'CAMBIA-ESTA-CLAVE') return responder({ ok: false, error: 'Cambia la CLAVE_SECRETA en el script y vuelve a implementarlo.' });
    if (d.key !== CLAVE_SECRETA) return responder({ ok: false, error: 'La clave no coincide con la del script.' });

    // Prueba de conexión desde la app: no envía nada.
    if (d.test) return responder({ ok: true, quota: MailApp.getRemainingDailyQuota() });

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.to || '')) return responder({ ok: false, error: 'Correo no válido' });
    if (!d.giver || !d.receiver) return responder({ ok: false, error: 'Faltan datos' });

    const opciones = { name: NOMBRE_REMITENTE, htmlBody: cuerpoHtml(d) };
    const foto = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(d.photo || '');
    if (foto) {
      opciones.inlineImages = { foto: Utilities.newBlob(Utilities.base64Decode(foto[2]), foto[1], 'foto') };
    }

    const asunto = '🎁 Tu amigo invisible' + (d.event ? ' · ' + texto(d.event) : '');
    MailApp.sendEmail(d.to, asunto, cuerpoTexto(d), opciones);
    return responder({ ok: true, quota: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return responder({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet() {
  return ContentService.createTextOutput('El script de Amigo Invisible está funcionando.');
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Limita la longitud y quita saltos de línea de los textos que llegan de la app.
function texto(v) {
  return String(v || '').replace(/[\r\n]+/g, ' ').slice(0, 200);
}

function esc(v) {
  return texto(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function detalles(d) {
  const filas = [];
  if (d.theme) filas.push(['Temática', d.theme]);
  if (d.budget) filas.push(['Presupuesto', d.budget]);
  if (d.date) filas.push(['Entrega', d.date]);
  return filas;
}

function cuerpoTexto(d) {
  return 'Hola ' + texto(d.giver) + ',\n\n' +
    'En el amigo invisible' + (d.event ? ' "' + texto(d.event) + '"' : '') + ' te toca regalar a: ' + texto(d.receiver) + '\n\n' +
    detalles(d).map(function (f) { return f[0] + ': ' + texto(f[1]); }).join('\n') +
    '\n\n¡Que no se entere nadie! 🤫';
}

function cuerpoHtml(d) {
  const enlace = /^https:\/\/[^\s"<>&]{1,2000}$/.test(d.link || '') ? d.link : '';
  const foto = d.photo
    ? '<img src="cid:foto" alt="" width="160" height="160" style="border-radius:50%;border:4px solid #c8102e;display:block;margin:16px auto;">'
    : '';
  const filas = detalles(d).map(function (f) {
    return '<tr><td style="color:#7d716a;padding:4px 12px 4px 0;">' + esc(f[0]) + '</td><td style="font-weight:600;">' + esc(f[1]) + '</td></tr>';
  }).join('');
  return '' +
    '<div style="font-family:Arial,sans-serif;background:#fbf6f0;padding:24px;">' +
    '<div style="max-width:480px;margin:auto;background:#fff;border-radius:16px;padding:28px;text-align:center;border:1px solid #eadfd5;">' +
    '<div style="font-size:48px;">🎁</div>' +
    (d.event ? '<p style="color:#7d716a;margin:4px 0;">' + esc(d.event) + '</p>' : '') +
    '<h2 style="margin:8px 0;color:#2a2320;">Hola, ' + esc(d.giver) + '</h2>' +
    '<p style="color:#2a2320;">Te toca regalar a…</p>' +
    foto +
    '<div style="font-size:32px;font-weight:800;color:#c8102e;margin:8px 0 16px;">' + esc(d.receiver) + '</div>' +
    (filas ? '<table style="margin:0 auto 16px;text-align:left;font-size:15px;">' + filas + '</table>' : '') +
    (enlace ? '<p><a href="' + enlace + '" style="color:#146b3a;">Ver mi amigo invisible en la web</a></p>' : '') +
    '<p style="color:#7d716a;font-size:14px;">¡Que no se entere nadie! 🤫</p>' +
    '</div></div>';
}
