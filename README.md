# 🎁 Amigo Invisible

App web para organizar un sorteo de amigo invisible y enviar a cada participante, por correo, a quién le toca regalar.

👉 **https://jlproyectos.github.io/amigo-invisible/**

## Funciones

- Datos del evento: nombre, temática, presupuesto y fecha de entrega.
- Participantes con **nombre, correo y foto** (mínimo 3).
- **Exclusiones**: parejas que no pueden regalarse entre sí.
- Sorteo aleatorio en el que nadie se regala a sí mismo y se respetan las exclusiones.
- **Un solo enlace para el grupo de WhatsApp**: cada persona lo abre, toca su nombre y ve solo el suyo. El móvil recuerda a su dueño y no deja ver el de otro. Quien esté marcado como «Sin móvil» puede verlo en un móvil prestado sin bloquearlo.
- **Envío por correo** a cada participante con el nombre y la foto de la persona a la que le regala.
- **Enlaces secretos** para compartir por WhatsApp, y modo **«pasar el móvil»** para revelarlo en un solo dispositivo.

### Privacidad

- Participantes, correos y fotos se guardan **solo en el navegador** de quien organiza (`localStorage`). No se suben a GitHub.
- Las fotos se recortan y se reducen (240×240 px) antes de guardarse.
- Los enlaces secretos llevan el resultado ofuscado en la URL para evitar spoilers accidentales; no es cifrado fuerte.

## Enviar los correos con Google Apps Script

GitHub Pages no puede enviar correos, así que se usa un pequeño script gratuito de Google. Los correos salen de la cuenta de Gmail donde instales el script. **Si no quieres que salgan de tu correo personal, crea una cuenta de Gmail nueva solo para el amigo invisible** (por ejemplo, `amigoinvisible.familia@gmail.com`) y haz estos pasos con ella. Los participantes verán como remitente «Amigo Invisible».

1. Con la cuenta que enviará los correos, entra en **https://script.google.com** y pulsa **Nuevo proyecto**.
2. Borra lo que haya y pega el contenido de [`google-apps-script/Codigo.gs`](google-apps-script/Codigo.gs).
3. Cambia `CAMBIA-ESTA-CLAVE` por una clave tuya (por ejemplo, `turron-2026-xyz`) y guarda (💾).
4. Pulsa **Implementar → Nueva implementación**. En el engranaje elige **Aplicación web** y configura:
   - **Ejecutar como:** Yo
   - **Quién tiene acceso:** Cualquier usuario
5. Pulsa **Implementar** y autoriza los permisos. Google avisará de que la app no está verificada: pulsa **Configuración avanzada → Ir a … (no seguro)**. Es normal, porque el script es tuyo.
6. Copia la **URL de la aplicación web** (termina en `/exec`).
7. En la web del amigo invisible, abre **✉️ Configurar el envío de correos**, pega la URL y la clave, y pulsa **Probar conexión**.

Gmail permite unos 100 correos al día con una cuenta gratuita.

> Si cambias el script, vuelve a **Implementar → Gestionar implementaciones → Editar → Nueva versión** para que se apliquen los cambios.

## Archivos

| Archivo | Contenido |
| --- | --- |
| `index.html` | Estructura de la página |
| `styles.css` | Estilos (modo claro y oscuro) |
| `app.js` | Sorteo, fotos, envío de correos y almacenamiento |
| `google-apps-script/Codigo.gs` | Script de Google que envía los correos |
