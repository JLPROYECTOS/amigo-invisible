(() => {
  'use strict';

  const STORAGE_KEY = 'amigo-invisible-v1';
  const $ = (id) => document.getElementById(id);
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // ---------- Estado ----------
  const empty = () => ({
    event: 'Amigo Invisible', theme: 'Relax', budget: 'Entre 20 € y 30 €', date: '2026-12-25',
    people: [], exclusions: [], pairs: null,
    scriptUrl: '', scriptKey: '', sent: {},
  });
  let state = Object.assign(empty(), load() || {});
  // Migración: antes los participantes eran solo nombres.
  state.people = state.people.map((p) => (typeof p === 'string' ? { name: p, email: '', photo: '' } : p));

  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch { $('error').textContent = 'No se ha podido guardar (¿demasiadas fotos?). Prueba con fotos más pequeñas.'; }
  }
  const names = () => state.people.map((p) => p.name);
  const person = (name) => state.people.find((p) => p.name === name);

  // ---------- Codificación de enlaces secretos ----------
  // Ofusca el contenido para que el nombre no se lea a simple vista en la URL.
  // No es cifrado fuerte: solo evita "spoilers" accidentales.
  const KEY = 'regalo-sorpresa';
  function encode(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let bin = '';
    bytes.forEach((b, i) => { bin += String.fromCharCode(b ^ KEY.charCodeAt(i % KEY.length)); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decode(str) {
    const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(bin, (c, i) => c.charCodeAt(0) ^ KEY.charCodeAt(i % KEY.length));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  // ---------- Sorteo ----------
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function isExcluded(a, b) {
    return state.exclusions.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  }

  // Asigna a cada persona un receptor distinto de sí misma, respetando exclusiones.
  // Backtracking con orden aleatorio: siempre encuentra solución si existe.
  function draw(people) {
    const givers = shuffle(people);
    const used = new Set();
    const result = {};
    function solve(i) {
      if (i === givers.length) return true;
      const g = givers[i];
      for (const r of shuffle(people)) {
        if (r === g || used.has(r) || isExcluded(g, r)) continue;
        used.add(r); result[g] = r;
        if (solve(i + 1)) return true;
        used.delete(r); delete result[g];
      }
      return false;
    }
    return solve(0) ? result : null;
  }

  // ---------- Fotos ----------
  // Recorta la imagen en cuadrado y la reduce para que ocupe poco (~20 KB).
  function resizePhoto(file, size = 240) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(img.width, img.height);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        canvas.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        URL.revokeObjectURL(img.src);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  let photoTarget = null;
  $('photoInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !photoTarget) return;
    try {
      person(photoTarget).photo = await resizePhoto(file);
      save(); render();
    } catch {
      $('error').textContent = 'No se ha podido leer esa imagen.';
    }
  });

  // ---------- Render organizador ----------
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    children.forEach((c) => node.append(c));
    return node;
  }

  function avatar(p) {
    const btn = el('button', {
      className: `avatar${p.photo ? ' has-photo' : ''}`, type: 'button',
      title: p.photo ? `Cambiar la foto de ${p.name}` : `Añadir foto de ${p.name}`,
    });
    if (p.photo) btn.append(el('img', { src: p.photo, alt: p.name }));
    else btn.textContent = '📷';
    btn.addEventListener('click', () => { photoTarget = p.name; $('photoInput').click(); });
    return btn;
  }

  function render() {
    $('eventName').value = state.event;
    $('budget').value = state.budget;
    $('theme').value = state.theme;
    $('date').value = state.date;
    $('scriptUrl').value = state.scriptUrl;
    $('scriptKey').value = state.scriptKey;

    $('people').replaceChildren(...state.people.map((p) => {
      const email = el('input', { type: 'email', value: p.email, placeholder: 'Añade su correo', title: `Correo de ${p.name}` });
      email.addEventListener('change', () => {
        p.email = email.value.trim();
        email.classList.toggle('invalid', !!p.email && !EMAIL_RE.test(p.email));
        delete state.sent[p.name];
        save(); renderResults();
      });
      const del = el('button', { className: 'icon-btn', type: 'button', title: `Quitar a ${p.name}`, textContent: '✕' });
      del.addEventListener('click', () => removePerson(p.name));
      const noPhone = el('input', { type: 'checkbox', checked: !!p.noPhone });
      noPhone.addEventListener('change', () => { p.noPhone = noPhone.checked; save(); renderResults(); });
      const noPhoneLabel = el('label', { className: 'check', title: 'Podrá verlo en el móvil de otra persona sin bloquearlo' }, noPhone, 'Sin móvil');
      const info = el('div', { className: 'info' }, el('strong', { textContent: p.name }), email, noPhoneLabel);
      return el('li', {}, el('div', { className: 'person' }, avatar(p), info), del);
    }));
    const n = state.people.length;
    const noEmail = state.people.filter((p) => !p.email).length;
    $('peopleHint').textContent = n < 3
      ? `Añade al menos 3 participantes (${n} de 3).`
      : `${n} participantes${noEmail ? ` · ${noEmail} sin correo` : ''}.`;

    const options = names().map((p) => el('option', { value: p, textContent: p }));
    $('exA').replaceChildren(...options.map((o) => o.cloneNode(true)));
    $('exB').replaceChildren(...options.map((o) => o.cloneNode(true)));
    if (n > 1) $('exB').selectedIndex = 1;

    $('exclusions').replaceChildren(...state.exclusions.map(([a, b], i) => {
      const del = el('button', { className: 'icon-btn', type: 'button', title: 'Quitar exclusión', textContent: '✕' });
      del.addEventListener('click', () => { state.exclusions.splice(i, 1); invalidate(); });
      return el('li', {}, `${a} ↔ ${b}`, del);
    }));

    renderResults();
  }

  function linkFor(giver) {
    const payload = { g: giver, r: state.pairs[giver], e: state.event, t: state.theme, b: state.budget, d: state.date };
    const base = location.href.split('#')[0];
    return `${base}#s=${encode(payload)}`;
  }

  // Un único enlace con todo el sorteo: cada persona elige su nombre al abrirlo.
  function groupLink() {
    if (!state.drawId) { state.drawId = Math.random().toString(36).slice(2, 10); save(); }
    const n = names();
    const payload = {
      id: state.drawId, n, r: n.map((g) => n.indexOf(state.pairs[g])),
      x: state.people.map((p, i) => (p.noPhone ? i : -1)).filter((i) => i >= 0),
      e: state.event, t: state.theme, b: state.budget, d: state.date,
    };
    return `${location.href.split('#')[0]}#g=${encode(payload)}`;
  }

  function renderResults() {
    const box = $('results');
    if (!state.pairs) { box.hidden = true; return; }
    box.hidden = false;
    const gUrl = groupLink();
    const gMsg = `🎁 ¡Ya está hecho el sorteo del amigo invisible${state.event ? ` "${state.event}"` : ''}! `
      + `Abrid este enlace, tocad vuestro nombre y veréis a quién le regaláis (¡sin trampas!): ${gUrl}`;
    $('groupWa').href = `https://wa.me/?text=${encodeURIComponent(gMsg)}`;
    $('groupCopy').onclick = async () => {
      try { await navigator.clipboard.writeText(gMsg); $('groupCopy').textContent = '¡Copiado!'; }
      catch { prompt('Copia este mensaje:', gMsg); }
      setTimeout(() => { $('groupCopy').textContent = 'Copiar enlace'; }, 1500);
    };
    $('links').replaceChildren(...state.people.map(({ name, email }) => {
      const url = linkFor(name);
      const copy = el('button', { className: 'btn small secondary', type: 'button', textContent: 'Copiar enlace' });
      copy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(url); copy.textContent = '¡Copiado!'; }
        catch { prompt('Copia este enlace:', url); }
        setTimeout(() => { copy.textContent = 'Copiar enlace'; }, 1500);
      });
      const msg = `Hola ${name}, aquí tienes tu amigo invisible${state.event ? ` de "${state.event}"` : ''} 🎁: ${url}`;
      const wa = el('a', {
        className: 'btn small', href: `https://wa.me/?text=${encodeURIComponent(msg)}`,
        target: '_blank', rel: 'noopener', textContent: 'WhatsApp',
      });
      const sent = state.sent[name];
      const status = el('span', {
        className: `status${sent ? ' ok' : ''}`,
        textContent: !email ? 'Sin correo' : sent ? `✓ Correo enviado a ${email}` : email,
      });
      status.dataset.name = name;
      return el('li', {}, el('span', { className: 'name', textContent: name }), copy, wa, status);
    }));
  }

  function setStatus(name, text, cls = '') {
    const s = document.querySelector(`.status[data-name="${CSS.escape(name)}"]`);
    if (s) { s.textContent = text; s.className = `status ${cls}`; }
  }

  // ---------- Acciones ----------
  function invalidate() {
    state.pairs = null;
    state.sent = {};
    $('error').textContent = '';
    $('sendSummary').textContent = '';
    save(); render();
  }

  function addPerson(name, email) {
    name = name.trim().replace(/\s+/g, ' ');
    email = email.trim();
    if (!name) return false;
    if (state.people.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      $('error').textContent = `"${name}" ya está en la lista.`;
      return false;
    }
    if (email && !EMAIL_RE.test(email)) {
      $('error').textContent = `El correo "${email}" no parece válido.`;
      return false;
    }
    state.people.push({ name, email, photo: '' });
    invalidate();
    return true;
  }

  function removePerson(name) {
    state.people = state.people.filter((p) => p.name !== name);
    state.exclusions = state.exclusions.filter(([a, b]) => a !== name && b !== name);
    invalidate();
  }

  $('addForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (addPerson($('newName').value, $('newEmail').value)) {
      $('newName').value = '';
      $('newEmail').value = '';
    }
    $('newName').focus();
  });

  $('addEx').addEventListener('click', () => {
    const a = $('exA').value, b = $('exB').value;
    if (!a || !b) return;
    if (a === b) { $('error').textContent = 'Elige dos personas distintas.'; return; }
    if (isExcluded(a, b)) { $('error').textContent = 'Esa exclusión ya existe.'; return; }
    state.exclusions.push([a, b]);
    invalidate();
  });

  [['eventName', 'event'], ['theme', 'theme'], ['budget', 'budget'], ['date', 'date'], ['scriptUrl', 'scriptUrl'], ['scriptKey', 'scriptKey']]
    .forEach(([id, key]) => {
      $(id).addEventListener('input', (e) => { state[key] = e.target.value.trim(); save(); if (state.pairs && !key.startsWith('script')) renderResults(); });
    });

  $('drawBtn').addEventListener('click', () => {
    $('error').textContent = '';
    if (state.people.length < 3) { $('error').textContent = 'Necesitas al menos 3 participantes.'; return; }
    if (state.pairs && Object.keys(state.sent).length &&
        !confirm('Ya se enviaron correos de este sorteo. Si lo repites, tendrás que enviarlos otra vez. ¿Seguir?')) return;
    const pairs = draw(names());
    if (!pairs) {
      $('error').textContent = 'Con estas exclusiones no hay ningún sorteo posible. Quita alguna e inténtalo de nuevo.';
      return;
    }
    state.pairs = pairs;
    state.drawId = '';
    state.sent = {};
    $('sendSummary').textContent = '';
    save(); renderResults();
    $('results').scrollIntoView({ behavior: 'smooth' });
  });

  $('resetBtn').addEventListener('click', () => {
    if (!confirm('¿Borrar participantes, fotos, exclusiones y sorteo? (Se mantiene la configuración del correo)')) return;
    const { scriptUrl, scriptKey } = state;
    state = Object.assign(empty(), { scriptUrl, scriptKey });
    invalidate();
  });

  // ---------- Envío de correos (Google Apps Script) ----------
  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(`${iso}T12:00:00`);
    return isNaN(d) ? iso : d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  async function callScript(payload) {
    // text/plain evita la petición previa CORS, que Apps Script no admite.
    const res = await fetch(state.scriptUrl, { method: 'POST', body: JSON.stringify({ key: state.scriptKey, ...payload }) });
    return res.json();
  }

  function mailConfigOk() {
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(state.scriptUrl) || !state.scriptKey) {
      $('mailConfig').open = true;
      $('mailConfig').scrollIntoView({ behavior: 'smooth' });
      $('testStatus').textContent = 'Falta la URL del script (debe terminar en /exec) o la clave.';
      $('testStatus').className = 'hint fail';
      return false;
    }
    return true;
  }

  $('testMail').addEventListener('click', async () => {
    if (!mailConfigOk()) return;
    $('testStatus').textContent = 'Probando…';
    $('testStatus').className = 'hint';
    try {
      const r = await callScript({ test: true });
      $('testStatus').textContent = r.ok
        ? `✓ Conectado. Te quedan ${r.quota} correos hoy.`
        : `✕ ${r.error}`;
      $('testStatus').className = `hint ${r.ok ? 'ok' : 'fail'}`;
    } catch {
      $('testStatus').textContent = '✕ No se pudo conectar. Revisa la URL y que el script esté publicado para «Cualquier usuario».';
      $('testStatus').className = 'hint fail';
    }
  });

  $('sendAll').addEventListener('click', async () => {
    if (!state.pairs || !mailConfigOk()) return;
    const pending = state.people.filter((p) => p.email && !state.sent[p.name]);
    const missing = state.people.filter((p) => !p.email).map((p) => p.name);
    if (!pending.length) {
      $('sendSummary').textContent = missing.length
        ? `No hay correos pendientes. Sin correo: ${missing.join(', ')}.`
        : 'Todos los correos ya se han enviado.';
      return;
    }
    if (!confirm(`Se enviarán ${pending.length} correo(s).${missing.length ? `\nSin correo (no recibirán nada): ${missing.join(', ')}.` : ''}\n¿Enviar?`)) return;

    const btn = $('sendAll');
    btn.disabled = true;
    let ok = 0, fail = 0;
    for (const p of pending) {
      setStatus(p.name, 'Enviando…');
      const receiver = person(state.pairs[p.name]);
      try {
        const r = await callScript({
          to: p.email,
          giver: p.name,
          receiver: receiver.name,
          photo: receiver.photo || '',
          event: state.event,
          theme: state.theme,
          budget: state.budget,
          date: formatDate(state.date),
          link: linkFor(p.name),
        });
        if (!r.ok) throw new Error(r.error);
        state.sent[p.name] = true;
        save();
        setStatus(p.name, `✓ Correo enviado a ${p.email}`, 'ok');
        ok++;
      } catch (err) {
        setStatus(p.name, `✕ No se pudo enviar: ${err.message || 'error de conexión'}`, 'fail');
        fail++;
      }
    }
    btn.disabled = false;
    $('sendSummary').textContent = `${ok} enviado(s)${fail ? `, ${fail} con error (pulsa otra vez para reintentar)` : ''}.`
      + (missing.length ? ` Sin correo: ${missing.join(', ')}.` : '');
  });

  // ---------- Modo "pasar el móvil" ----------
  let passIndex = 0;
  function showPass() {
    const { name } = state.people[passIndex];
    $('passTitle').textContent = `Turno de ${name}`;
    $('passText').textContent = `Pasa el dispositivo a ${name}. Nadie más debe mirar.`;
    $('passBox').hidden = true;
    $('passShow').hidden = false;
    $('passNext').hidden = true;
  }
  $('revealBtn').addEventListener('click', () => {
    passIndex = 0;
    $('organizer').hidden = true; $('passMode').hidden = false;
    showPass();
  });
  $('passShow').addEventListener('click', () => {
    const { name } = state.people[passIndex];
    const receiver = person(state.pairs[name]);
    $('passText').textContent = `${name}, le regalas a:`;
    $('passName').textContent = receiver.name;
    $('passPhoto').hidden = !receiver.photo;
    if (receiver.photo) $('passPhoto').src = receiver.photo;
    $('passBox').hidden = false;
    $('passShow').hidden = true;
    $('passNext').hidden = false;
    $('passNext').textContent = passIndex < state.people.length - 1 ? 'Ocultar y pasar' : 'Terminar';
  });
  $('passNext').addEventListener('click', () => {
    passIndex++;
    if (passIndex >= state.people.length) { exitPass(); return; }
    showPass();
  });
  function exitPass() { $('passMode').hidden = true; $('organizer').hidden = false; $('passPhoto').src = ''; }
  $('passExit').addEventListener('click', exitPass);

  // ---------- Vista de enlace secreto ----------
  function showOnly(id) {
    ['organizer', 'passMode', 'secret', 'group'].forEach((s) => { $(s).hidden = s !== id; });
  }

  function badLink() {
    showOnly('organizer'); render();
    $('error').textContent = 'El enlace no es válido.';
  }

  // Enlace de grupo. Cada móvil queda "bloqueado" para su dueño (me), pero puede
  // prestarse a las personas marcadas como "sin móvil" sin bloquearse para ellas.
  function showGroup(data) {
    const lockKey = `amigo-grupo-${data.id}`;
    const noPhone = (data.x || []).map((i) => data.n[i]).filter(Boolean);
    let lock = { me: '', lent: [] };
    try {
      const raw = localStorage.getItem(lockKey);
      if (raw) lock = Object.assign(lock, JSON.parse(raw));
    } catch { /* sin almacenamiento o formato antiguo */ }
    const saveLock = () => { try { localStorage.setItem(lockKey, JSON.stringify(lock)); } catch { /* sin almacenamiento */ } };
    if (lock.me && !data.n.includes(lock.me)) lock.me = '';

    const secretFor = (name) => {
      const i = data.n.indexOf(name);
      return { g: name, r: data.n[data.r[i]], e: data.e, t: data.t, b: data.b, d: data.d };
    };
    const lendable = () => noPhone.filter((n) => n !== lock.me);

    function lendButton() {
      if (!lendable().length) return [];
      const b = el('button', { className: 'btn ghost', type: 'button', textContent: '📱 Prestar el móvil a alguien sin móvil' });
      b.addEventListener('click', () => pick(lendable(), 'lend'));
      return [b];
    }

    function showMine() {
      showSecret(secretFor(lock.me), lendButton());
    }

    function showLent(name) {
      const done = el('button', { className: 'btn big secondary', type: 'button', textContent: 'Ocultar y devolver el móvil' });
      done.addEventListener('click', () => {
        if (lock.me) { showMine(); return; }
        pick(data.n, 'self');
      });
      showSecret(secretFor(name), [done]);
    }

    // mode: 'self' = elegir quién soy; 'lend' = elegir a quién presto el móvil.
    function pick(list, mode) {
      showOnly('group');
      $('groupEvent').textContent = data.e || 'Amigo Invisible';
      $('groupPick').hidden = false;
      $('groupConfirm').hidden = true;
      $('groupPick').querySelector('h2').textContent = mode === 'lend' ? '¿A quién le prestas el móvil?' : '¿Quién eres?';
      $('groupPick').querySelector('.hint').textContent = mode === 'lend'
        ? 'Dale el móvil y que toque su nombre. Tú no mires 🙈'
        : noPhone.length
          ? `Toca tu nombre. Solo podrás ver el tuyo desde este móvil. Si no tienes móvil (${noPhone.join(', ')}), pide uno prestado.`
          : 'Toca tu nombre. ¡Sin trampas! Solo podrás ver el tuyo desde este móvil.';
      const buttons = list.map((name) => {
        const b = el('button', { className: 'btn', type: 'button', textContent: name });
        b.addEventListener('click', () => confirmPick(name, mode, list));
        return b;
      });
      if (mode === 'lend') {
        const back = el('button', { className: 'btn ghost', type: 'button', textContent: '← Volver' });
        back.addEventListener('click', showMine);
        buttons.push(back);
      }
      $('groupNames').replaceChildren(...buttons);
    }

    function confirmPick(name, mode, list) {
      const borrowed = mode === 'lend' || noPhone.includes(name);
      $('groupConfirmName').textContent = name;
      $('groupConfirm').querySelector('.hint').textContent = borrowed
        ? 'Este móvil seguirá siendo de su dueño: solo verás el tuyo y luego lo ocultas.'
        : 'Después ya no podrás elegir otro nombre en este móvil.';
      $('groupPick').hidden = true;
      $('groupConfirm').hidden = false;
      $('groupYes').onclick = () => {
        if (borrowed) {
          if (!lock.lent.includes(name)) lock.lent.push(name);
          saveLock();
          showLent(name);
        } else {
          lock.me = name;
          saveLock();
          showMine();
        }
      };
      $('groupNo').onclick = () => pick(list, mode);
    }

    if (lock.me) showMine();
    else pick(data.n, 'self');
  }

  function route() {
    const m = location.hash.match(/^#([sg])=([\w-]+)$/);
    if (!m) { showOnly('organizer'); render(); return; }
    let data;
    try { data = decode(m[2]); } catch { data = null; }
    if (m[1] === 'g') {
      if (!data || !data.id || !Array.isArray(data.n) || !Array.isArray(data.r) || data.n.length !== data.r.length) { badLink(); return; }
      showGroup(data);
      return;
    }
    if (!data || !data.g || !data.r) { badLink(); return; }
    showSecret(data);
  }

  function showSecret(data, extra = []) {
    showOnly('secret');
    $('secretExtra').replaceChildren(...extra);
    $('secretEvent').textContent = data.e || 'Amigo Invisible';
    $('secretGiver').textContent = data.g;
    $('secretBox').hidden = true;
    $('giftBtn').hidden = false;
    const info = [];
    if (data.t) info.push(`Temática: ${data.t}`);
    if (data.b) info.push(`Presupuesto: ${data.b}`);
    if (data.d) info.push(`Fecha: ${formatDate(data.d)}`);
    $('secretInfo').textContent = '';
    $('giftBtn').onclick = () => {
      $('giftBtn').hidden = true;
      $('secretBox').textContent = `🎉 ${data.r} 🎉`;
      $('secretBox').hidden = false;
      $('secretInfo').textContent = info.join(' · ');
    };
  }

  window.addEventListener('hashchange', route);
  route();
})();
