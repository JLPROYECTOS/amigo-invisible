# 🎁 Amigo Invisible

App web para hacer el amigo invisible en familia: cada uno se apunta desde su móvil con nombre y foto, quien organiza cierra la inscripción y sortea, y cada participante agita el móvil para abrir su regalo y ver la foto de la persona a la que le regala.

👉 **https://jlproyectos.github.io/amigo-invisible/** (se abre con el enlace del evento: `?e=…`)

## Cómo funciona

1. **Inscripción:** se comparte el enlace en el grupo de WhatsApp. Cada persona escribe su nombre y sube una foto. Queda registrado desde qué móvil se apuntó (modelo y navegador, y un código por móvil). Desde un mismo móvil se puede apuntar también a quien no tenga móvil.
2. **Panel de organización:** es el mismo enlace terminado en `#admin` y pide una clave. Muestra la lista de inscritos con su foto, móvil y hora, los datos del evento y los botones **«Ya estamos todos»** y **«Sortear»**.
3. **Revelación:** cada persona abre el enlace en el móvil con el que se apuntó y elige quién es (si en ese móvil se apuntó a más de una persona). Aparece un regalo moviéndose; al agitar el móvil se abre y muestra la foto y el nombre de la persona a la que regala.

Protecciones:
- Un resultado solo se puede ver desde el móvil donde se apuntó esa persona.
- Con la inscripción cerrada nadie más puede apuntarse.
- Sortear, cerrar o borrar exige la clave del panel.
- El sorteo hace un único ciclo: nadie se regala a sí mismo.

## Dónde se guardan los datos

En una hoja de cálculo **«Amigo Invisible - datos»** en el Google Drive de quien organiza. La gestiona el script [`google-apps-script/Codigo.gs`](google-apps-script/Codigo.gs), publicado como aplicación web de Google Apps Script.

> El identificador de cada móvil se guarda en su navegador. Si alguien borra los datos del navegador, o abre el enlace en otro navegador distinto al que usó para apuntarse, no podrá ver su resultado: que lo abra siempre desde el mismo sitio (por ejemplo, desde WhatsApp).

## Instalar el script (solo quien organiza)

1. En https://script.google.com crea un proyecto nuevo, pega el contenido de `Codigo.gs` y cambia `CLAVE_ADMIN` por una clave tuya.
2. **Implementar → Nueva implementación → Aplicación web**, con **Ejecutar como: Yo** y **Quién tiene acceso: Cualquier usuario**. Autoriza los permisos.
3. Abre la web sin parámetros, despliega **«¿Organizas tú?»** y pega la URL que termina en `/exec`. Te dará el enlace para el grupo y el de tu panel.

Si cambias el script: **Implementar → Gestionar implementaciones → Editar → Nueva versión**. Así la URL no cambia.

## Archivos

| Archivo | Contenido |
| --- | --- |
| `index.html` | Pantallas: inscripción, espera, ¿quién eres?, regalo y panel |
| `styles.css` | Estilos y animaciones (modo claro y oscuro) |
| `app.js` | Lógica de la web: fotos, sensor de movimiento y llamadas al script |
| `google-apps-script/Codigo.gs` | Script de Google: base de datos en Drive y sorteo |
