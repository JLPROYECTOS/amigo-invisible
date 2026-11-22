(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const EVENT_ID = (params.get('e') || '').replace(/[^\w-]/g, '');
  const API = EVENT_ID ? `https://script.google.com/macros/s/${EVENT_ID}/exec` : '';
  const IS_ADMIN = location.hash === '#admin';

  // ---------- Utilidades ----------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
  };

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    children.forEach((c) => node.append(c));
    return node;
  }

  function show(view) {
    document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== `v-${view}`; });
    window.scrollTo(0, 0);
  }

  function fail(msg) {
    $('errorText').textContent = msg;
    show('error');
  }

  // Identificador de este móvil (se guarda en el navegador).
  function deviceId() {
    let id = store.get('amigo-device');
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`).replace(/[^\w]/g, '');
      store.set('amigo-device', id);
    }
    return id;
  }

  // Descripción legible del terminal: «iPhone · Safari», «Android SM-A515F · Chrome»…
  function terminal() {
    const ua = navigator.userAgent;
    let dev = 'Otro';
    if (/iPhone/.test(ua)) dev = 'iPhone';
    else if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) dev = 'iPad';
    else if (/Android/.test(ua)) {
      const model = (ua.match(/Android [\d.]+; ([^;)]+)/) || [])[1];
      dev = `Android${model && model !== 'K' ? ` ${model.trim()}` : ''}`;
    } else if (/Windows/.test(ua)) dev = 'Ordenador Windows';
    else if (/Mac OS X/.test(ua)) dev = 'Mac';
    else if (/Linux/.test(ua)) dev = 'Linux';
    let br = 'Navegador';
    if (/WhatsApp/i.test(ua)) br = 'WhatsApp';
    else if (/SamsungBrowser/.test(ua)) br = 'Samsung Internet';
    else if (/EdgA?\/|Edg\//.test(ua)) br = 'Edge';
    else if (/CriOS|Chrome\//.test(ua)) br = 'Chrome';
    else if (/FxiOS|Firefox\//.test(ua)) br = 'Firefox';
    else if (/Safari\//.test(ua)) br = 'Safari';
    return `${dev} · ${br}`;
  }

  async function api(action, data = {}) {
    // text/plain evita la petición previa CORS, que Google Apps Script no admite.
    const res = await fetch(API, { method: 'POST', body: JSON.stringify({ action, device: deviceId(), ...data }) });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Error desconocido');
    return json;
  }

  function eventLine(ev) {
    if (!ev) return;
    const bits = [ev.tematica && `Temática: ${ev.tematica}`, ev.presupuesto, ev.fecha && `Entrega: ${ev.fecha}`].filter(Boolean);
    $('eventLine').textContent = [ev.nombre, bits.join(' · ')].filter(Boolean).join(' — ');
    if (ev.nombre && ev.nombre !== 'Amigo Invisible') document.title = `${ev.nombre} · Amigo Invisible`;
  }

  // Recorta en cuadrado y reduce la foto hasta que quepa en una celda de la hoja.
  function resizePhoto(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(img.width, img.height);
        const canvas = document.createElement('canvas');
        let size = 260, q = 0.8, out = '';
        do {
          canvas.width = canvas.height = size;
          canvas.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
          out = canvas.toDataURL('image/jpeg', q);
          q -= 0.1; if (q < 0.45) { size -= 40; q = 0.7; }
        } while (out.length > 45000 && size > 80);
        URL.revokeObjectURL(img.src);
        resolve(out);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  function avatarImg(src, cls = 'avatar') {
    return src ? el('img', { className: cls, src, alt: '' }) : el('span', { className: cls, textContent: '🙂' });
  }

  // ---------- Flujo de participante ----------
  let status = null;
  let pollTimer = null;

  async function load() {
    clearTimeout(pollTimer);
    try {
      status = await api('estado');
    } catch (e) {
      fail(`No se ha podido conectar con el sorteo. ${e.message}`);
      return;
    }
    eventLine(status.evento);
    const mine = status.mios;

    if (status.estado === 'abierto') {
      if (!mine.length) { openRegister(false); return; }
      renderMine($('waitMine'), mine);
      $('waitCount').textContent = `Hay ${status.total} persona${status.total === 1 ? '' : 's'} apuntada${status.total === 1 ? '' : 's'}.`;
      show('waiting');
      pollTimer = setTimeout(load, 20000);
    } else if (status.estado === 'cerrado') {
      if (!mine.length) { show('notreg'); return; }
      renderMine($('closedMine'), mine);
      show('closed');
      pollTimer = setTimeout(load, 15000);
    } else {
      if (!mine.length) { show('notreg'); return; }
      showWho(mine);
    }
  }

  function renderMine(box, mine) {
    box.replaceChildren(...mine.map((p) => el('div', { className: 'mine-item' }, avatarImg(p.foto), el('span', { textContent: p.nombre }))));
  }

  // --- Registro ---
  let regPhoto = '';
  let regBorrowed = false;

  function openRegister(borrowed) {
    regBorrowed = borrowed;
    regPhoto = '';
    $('regForm').reset();
    $('regError').textContent = '';
    $('regPhotoPreview').replaceChildren('📷', el('small', { textContent: 'Toca para elegir foto' }));
    $('regTitle').textContent = borrowed ? 'Apuntar a alguien sin móvil' : '¡Apúntate!';
    $('regHint').textContent = borrowed
      ? 'Escribe su nombre y sube una foto suya. Luego verá su resultado en este móvil.'
      : 'Escribe tu nombre y sube una foto tuya. Es la foto que verá quien te tenga que regalar.';
    $('regName').placeholder = borrowed ? 'Su nombre' : 'Tu nombre';
    $('regSubmit').textContent = borrowed ? 'Apuntar' : 'Apuntarme';
    $('regCancel').hidden = !borrowed;
    show('register');
  }

  $('regPhoto').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      regPhoto = await resizePhoto(file);
      $('regPhotoPreview').replaceChildren(el('img', { src: regPhoto, alt: '' }));
      $('regError').textContent = '';
    } catch {
      $('regError').textContent = 'No se ha podido leer esa imagen. Prueba con otra.';
    }
  });

  $('regForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = $('regName').value.trim().replace(/\s+/g, ' ');
    if (!nombre) { $('regError').textContent = 'Escribe el nombre.'; return; }
    if (!regPhoto) { $('regError').textContent = 'Falta la foto: toca el círculo para elegirla.'; return; }
    const label = $('regSubmit').textContent;
    $('regSubmit').disabled = true;
    $('regSubmit').textContent = 'Enviando…';
    $('regError').textContent = '';
    try {
      await api('registrar', { nombre, foto: regPhoto, terminal: terminal(), prestado: regBorrowed });
      await load();
    } catch (err) {
      $('regError').textContent = err.message;
    } finally {
      $('regSubmit').disabled = false;
      $('regSubmit').textContent = label;
    }
  });

  $('regCancel').addEventListener('click', load);
  $('addBorrowed').addEventListener('click', () => { clearTimeout(pollTimer); openRegister(true); });

  // --- ¿Quién eres? ---
  function showWho(mine) {
    if (mine.length === 1) {
      $('whoList').replaceChildren(whoButton(mine[0], `Soy ${mine[0].nombre}`));
    } else {
      $('whoList').replaceChildren(...mine.map((p) => whoButton(p, p.nombre)));
    }
    show('who');
  }

  function whoButton(p, label) {
    const b = el('button', { className: 'who-btn', type: 'button' }, avatarImg(p.foto), el('span', { textContent: label }));
    b.addEventListener('click', () => openGift(p));
    return b;
  }

  // --- El regalo ---
  const SHAKES_NEEDED = 4;
  let result = null;
  let shakes = 0;
  let motionSeen = false;
  let fallbackTimer = null;
  let lastShake = 0;
  let last = null;

  function onMotion(e) {
    const a = e.accelerationIncludingGravity || e.acceleration;
    if (!a || a.x == null) return;
    motionSeen = true;
    if (last) {
      const delta = Math.abs(a.x - last.x) + Math.abs(a.y - last.y) + Math.abs(a.z - last.z);
      const now = Date.now();
      if (delta > 22 && now - lastShake > 280) {
        lastShake = now;
        registerShake();
      }
    }
    last = { x: a.x, y: a.y, z: a.z };
  }

  function registerShake() {
    if (shakes >= SHAKES_NEEDED) return;
    shakes++;
    const g = $('gift');
    g.classList.remove('jolt'); void g.offsetWidth; g.classList.add('jolt');
    g.style.setProperty('--grow', 1 + shakes * 0.08);
    $('shakeBar').firstElementChild.style.width = `${(shakes / SHAKES_NEEDED) * 100}%`;
    if (navigator.vibrate) navigator.vibrate(60);
    if (shakes >= SHAKES_NEEDED) openPresent();
  }

  function startMotion() {
    window.addEventListener('devicemotion', onMotion);
    clearTimeout(fallbackTimer);
    // Si en unos segundos no llega ningún dato del sensor (ordenador, permiso denegado…), se ofrece abrir tocando.
    fallbackTimer = setTimeout(() => {
      if (!motionSeen) {
        $('giftHint').textContent = 'No detecto el movimiento del móvil. Toca el regalo varias veces para abrirlo.';
        $('tapOpen').hidden = true;
        $('gift').dataset.tap = '1';
      }
    }, 4000);
  }

  function stopMotion() {
    window.removeEventListener('devicemotion', onMotion);
    clearTimeout(fallbackTimer);
  }

  async function openGift(p) {
    result = null; shakes = 0; motionSeen = false; last = null;
    $('giftHello').textContent = `${p.nombre}, tu regalo 🎁`;
    $('giftStage').hidden = false;
    $('reveal').hidden = true;
    $('giftBack').hidden = true;
    $('gift').dataset.tap = '';
    $('gift').style.setProperty('--grow', 1);
    $('gift').className = 'gift';
    $('shakeBar').firstElementChild.style.width = '0';
    $('giftHint').textContent = 'Cargando…';
    $('motionBtn').hidden = true;
    $('tapOpen').hidden = true;
    show('gift');

    try {
      result = await api('resultado', { id: p.id });
    } catch (err) {
      fail(err.message);
      return;
    }
    $('giftHint').textContent = '¡Agita el móvil para abrir el regalo!';

    // iPhone pide permiso para usar el sensor de movimiento, y solo tras un toque.
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      $('giftHint').textContent = 'Toca «Empezar» y después agita el móvil.';
      $('motionBtn').hidden = false;
    } else {
      startMotion();
    }
  }

  $('motionBtn').addEventListener('click', async () => {
    $('motionBtn').hidden = true;
    try {
      const r = await DeviceMotionEvent.requestPermission();
      if (r === 'granted') {
        $('giftHint').textContent = '¡Agita el móvil para abrir el regalo!';
        startMotion();
        return;
      }
    } catch { /* sin permiso */ }
    $('giftHint').textContent = 'Sin permiso para el movimiento. Toca el regalo varias veces para abrirlo.';
    $('gift').dataset.tap = '1';
  });

  $('gift').addEventListener('click', () => {
    if ($('gift').dataset.tap === '1' && result) registerShake();
  });

  function openPresent() {
    stopMotion();
    const g = $('gift');
    g.classList.add('burst');
    setTimeout(() => {
      $('giftStage').hidden = true;
      $('revealPhoto').src = result.foto;
      $('revealName').textContent = result.nombre;
      const ev = result.evento || {};
      $('revealInfo').textContent = [ev.tematica && `Temática: ${ev.tematica}`, ev.presupuesto && `Presupuesto: ${ev.presupuesto}`, ev.fecha && `Entrega: ${ev.fecha}`]
        .filter(Boolean).join(' · ');
      $('reveal').hidden = false;
      $('giftBack').hidden = false;
      confetti();
      if (navigator.vibrate) navigator.vibrate([80, 60, 160]);
    }, 450);
  }

  $('giftBack').addEventListener('click', () => {
    $('revealPhoto').src = '';
    result = null;
    showWho(status.mios);
  });

  function confetti() {
    const box = $('confetti');
    const items = ['🫒', '🫒', '🫒', '🌿', '✨', '💛', '🎉'];
    box.replaceChildren(...Array.from({ length: 40 }, () => {
      const s = el('span', { textContent: items[Math.floor(Math.random() * items.length)] });
      s.style.left = `${Math.random() * 100}%`;
      s.style.animationDelay = `${Math.random() * 0.6}s`;
      s.style.animationDuration = `${2 + Math.random() * 1.5}s`;
      s.style.fontSize = `${16 + Math.random() * 20}px`;
      return s;
    }));
    setTimeout(() => box.replaceChildren(), 4000);
  }

  // ---------- Panel de organización ----------
  const ADMIN_KEY_STORE = `amigo-admin-${EVENT_ID}`;
  let adminKey = '';
  let adminTimer = null;

  function groupLink() {
    return `${location.origin}${location.pathname}?e=${EVENT_ID}`;
  }

  async function adminCall(action, data = {}) {
    return api(action, { key: adminKey, ...data });
  }

  async function adminLoad() {
    clearTimeout(adminTimer);
    let d;
    try {
      d = await adminCall('admin');
    } catch (err) {
      if (/clave/i.test(err.message)) {
        $('adminPanel').hidden = true; $('adminLogin').hidden = false;
        $('adminLoginError').textContent = err.message;
        return;
      }
      $('adminMsg').textContent = `Error: ${err.message}`;
      return;
    }
    store.set(ADMIN_KEY_STORE, adminKey);
    $('adminLogin').hidden = true;
    $('adminPanel').hidden = false;
    eventLine(d.evento);

    const labels = { abierto: '🟢 Inscripción abierta', cerrado: '🟡 Inscripción cerrada', sorteado: '🎉 Sorteo hecho' };
    $('adminState').textContent = labels[d.estado] || d.estado;
    $('adminCount').textContent = d.registros.length;
    $('adminSheet').href = d.hoja;

    const btn = (text, cls, fn, confirmText) => {
      const b = el('button', { className: `btn ${cls}`, type: 'button', textContent: text });
      b.addEventListener('click', async () => {
        if (confirmText && !confirm(confirmText)) return;
        b.disabled = true;
        $('adminMsg').textContent = '';
        try { await fn(); } catch (err) { $('adminMsg').textContent = `Error: ${err.message}`; }
        await adminLoad();
      });
      return b;
    };
    const actions = [];
    if (d.estado === 'abierto') {
      actions.push(btn('✅ Ya estamos todos', 'big', () => adminCall('cerrar'),
        `¿Cerrar la inscripción con ${d.registros.length} personas? Nadie más podrá apuntarse.`));
    } else if (d.estado === 'cerrado') {
      actions.push(btn('🎲 Sortear', 'big', async () => {
        const r = await adminCall('sortear');
        $('adminMsg').textContent = `¡Sorteo hecho entre ${r.total} personas! Avisa al grupo para que abran el enlace.`;
      }, '¿Hacer el sorteo ahora?'));
      actions.push(btn('Reabrir inscripción', 'ghost', () => adminCall('reabrir')));
    } else {
      actions.push(btn('Deshacer sorteo', 'ghost', () => adminCall('deshacer'),
        '¿Deshacer el sorteo? Si alguien ya ha visto su resultado, se perderá y habrá que volver a sortear.'));
    }
    actions.push(btn('Borrar todo', 'ghost danger', () => adminCall('reiniciar'),
      '¿Borrar TODOS los registros y empezar de cero? No se puede deshacer.'));
    $('adminActions').replaceChildren(...actions);

    // Color por móvil para ver de un vistazo quién se apuntó desde el mismo terminal.
    const palette = ['#c8102e', '#146b3a', '#1d4ed8', '#b45309', '#7c3aed', '#0e7490', '#be185d', '#4d7c0f'];
    const colors = {};
    d.registros.forEach((r) => { if (!(r.movil in colors)) colors[r.movil] = palette[Object.keys(colors).length % palette.length]; });
    const owner = {};
    d.registros.forEach((r) => { if (!r.prestado && !owner[r.movil]) owner[r.movil] = r.nombre; });

    $('adminList').replaceChildren(...d.registros.map((r) => {
      const when = new Date(r.fecha);
      const meta = [
        r.terminal,
        `Móvil ${r.movil}`,
        r.prestado && owner[r.movil] ? `prestado por ${owner[r.movil]}` : r.prestado ? 'móvil prestado' : '',
        isNaN(when) ? '' : when.toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
      ].filter(Boolean).join(' · ');
      const li = el('li', {}, avatarImg(r.foto),
        el('div', { className: 'info' }, el('strong', { textContent: r.nombre }), el('small', { textContent: meta })));
      li.style.borderLeftColor = colors[r.movil];
      if (d.estado !== 'sorteado') {
        const del = el('button', { className: 'icon-btn', type: 'button', title: `Quitar a ${r.nombre}`, textContent: '✕' });
        del.addEventListener('click', async () => {
          if (!confirm(`¿Quitar a ${r.nombre} del sorteo?`)) return;
          try { await adminCall('borrar', { id: r.id }); } catch (err) { $('adminMsg').textContent = `Error: ${err.message}`; }
          adminLoad();
        });
        li.append(del);
      }
      return li;
    }));

    const ev = d.evento || {};
    if (document.activeElement?.form !== $('eventForm')) {
      $('evName').value = ev.nombre || '';
      $('evTheme').value = ev.tematica || '';
      $('evBudget').value = ev.presupuesto || '';
      $('evDate').value = ev.fecha || '';
    }

    const link = groupLink();
    $('adminGroupLink').href = link;
    $('adminGroupLink').textContent = link;
    const msg = d.estado === 'sorteado'
      ? `🎉 ¡Ya está el sorteo del amigo invisible! Abrid el enlace desde el mismo móvil con el que os apuntasteis y agitadlo: ${link}`
      : `🎁 ¡Amigo invisible! Apuntaos con vuestro nombre y una foto en este enlace. Si alguien no tiene móvil, que lo apunte otra persona desde el suyo: ${link}`;
    $('adminWa').href = `https://wa.me/?text=${encodeURIComponent(msg)}`;

    adminTimer = setTimeout(adminLoad, 20000);
  }

  $('adminLogin').addEventListener('submit', (e) => {
    e.preventDefault();
    adminKey = $('adminKey').value.trim();
    $('adminLoginError').textContent = '';
    adminLoad();
  });

  $('eventForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await adminCall('evento', {
        evento: { nombre: $('evName').value, tematica: $('evTheme').value, presupuesto: $('evBudget').value, fecha: $('evDate').value },
      });
      $('adminMsg').textContent = 'Datos del evento guardados.';
    } catch (err) {
      $('adminMsg').textContent = `Error: ${err.message}`;
    }
    adminLoad();
  });

  // ---------- Página sin evento: ayuda para organizar ----------
  $('setupUrl').addEventListener('input', (e) => {
    const m = e.target.value.trim().match(/^https:\/\/script\.google\.com\/macros\/s\/([\w-]+)\/exec/);
    $('setupLinks').hidden = !m;
    if (!m) return;
    const base = `${location.origin}${location.pathname}?e=${m[1]}`;
    $('setupGroup').href = $('setupGroup').textContent = base;
    $('setupAdmin').href = $('setupAdmin').textContent = `${base}#admin`;
  });

  // ---------- Arranque ----------
  function start() {
    // Acceso oculto al panel: el corazón del pie de página.
    if (EVENT_ID) $('heart').href = IS_ADMIN ? `?e=${EVENT_ID}` : `?e=${EVENT_ID}#admin`;
    if (!EVENT_ID) { show('home'); return; }
    if (IS_ADMIN) {
      show('admin');
      adminKey = store.get(ADMIN_KEY_STORE) || '';
      if (adminKey) adminLoad();
      return;
    }
    show('loading');
    load();
  }

  window.addEventListener('hashchange', () => location.reload());
  document.addEventListener('visibilitychange', () => {
    // Al volver a la app, refresca el estado (por si ya se ha cerrado o sorteado).
    // Solo en las pantallas de espera, para no borrar un formulario a medias.
    const waiting = !$('v-waiting').hidden || !$('v-closed').hidden;
    if (document.visibilityState === 'visible' && EVENT_ID && !IS_ADMIN && waiting) load();
  });
  start();
})();
