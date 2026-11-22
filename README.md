# 🎁 Amigo Invisible

App web para organizar un sorteo de amigo invisible. Funciona entera en el navegador: sin servidor, sin registro y sin base de datos.

## Funciones

- Datos del evento: nombre, presupuesto y fecha.
- Lista de participantes (mínimo 3).
- **Exclusiones**: parejas que no pueden regalarse entre sí.
- Sorteo aleatorio en el que nadie se regala a sí mismo y se respetan las exclusiones (si no hay solución posible, lo avisa).
- **Enlaces secretos** para cada participante: se copian o se envían por WhatsApp; cada enlace solo muestra a quién le toca regalar.
- **Modo «pasar el móvil»** para revelar el resultado persona a persona en un solo dispositivo.
- Los datos se guardan en el navegador (`localStorage`) para no perderlos al recargar.

> Los enlaces llevan el resultado ofuscado dentro de la URL para evitar spoilers accidentales; no es cifrado fuerte.

## Uso local

Abre `index.html` en el navegador. No necesita instalación.

## Publicar con GitHub Pages

1. En el repositorio, ve a **Settings → Pages**.
2. En **Source** elige *Deploy from a branch*, rama `main` y carpeta `/ (root)`.
3. Guarda. En un par de minutos estará en `https://jlproyectos.github.io/amigo-invisible/`.

## Archivos

| Archivo | Contenido |
| --- | --- |
| `index.html` | Estructura de la página |
| `styles.css` | Estilos (modo claro y oscuro) |
| `app.js` | Lógica del sorteo, enlaces y almacenamiento |
