(() => {
  'use strict';

  const STORAGE_KEY = 'amigo-invisible-v1';
  const $ = (id) => document.getElementById(id);

  // ---------- Estado ----------
  let state = load() || { event: '', budget: '', date: '', people: [], exclusions: [], pairs: null };

  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* sin almacenamiento */ }
  }

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

  // ---------- Render organizador ----------
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    children.forEach((c) => node.append(c));
    return node;
  }

  function render() {
    $('eventName').value = state.event;
    $('budget').value = state.budget;
    $('date').value = state.date;

    const list = $('people');
    list.replaceChildren(...state.people.map((name) => {
      const del = el('button', { className: 'icon-btn', type: 'button', title: `Quitar a ${name}`, textContent: '✕' });
      del.addEventListener('click', () => removePerson(name));
      return el('li', {}, el('span', { textContent: name }), del);
    }));
    const n = state.people.length;
    $('peopleHint').textContent = n < 3
      ? `Añade al menos 3 participantes (${n} de 3).`
      : `${n} participantes.`;

    const options = state.people.map((p) => el('option', { value: p, textContent: p }));
    $('exA').replaceChildren(...options.map((o) => o.cloneNode(true)));
    $('exB').replaceChildren(...options.map((o) => o.cloneNode(true)));
    if (state.people.length > 1) $('exB').selectedIndex = 1;

    $('exclusions').replaceChildren(...state.exclusions.map(([a, b], i) => {
      const del = el('button', { className: 'icon-btn', type: 'button', title: 'Quitar exclusión', textContent: '✕' });
      del.addEventListener('click', () => { state.exclusions.splice(i, 1); invalidate(); });
      return el('li', {}, `${a} ↔ ${b}`, del);
    }));

    renderResults();
  }

  function linkFor(giver) {
    const payload = { g: giver, r: state.pairs[giver], e: state.event, b: state.budget, d: state.date };
    const base = location.href.split('#')[0];
    return `${base}#s=${encode(payload)}`;
  }

  function renderResults() {
    const box = $('results');
    if (!state.pairs) { box.hidden = true; return; }
    box.hidden = false;
    $('links').replaceChildren(...state.people.map((name) => {
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
      const actions = [copy, wa];
      if (navigator.share) {
        const share = el('button', { className: 'btn small ghost', type: 'button', textContent: 'Compartir' });
        share.addEventListener('click', () => navigator.share({ title: 'Amigo Invisible', text: msg }).catch(() => {}));
        actions.push(share);
      }
      return el('li', {}, el('span', { className: 'name', textContent: name }), ...actions);
    }));
  }

  // ---------- Acciones ----------
  function invalidate() {
    state.pairs = null;
    $('error').textContent = '';
    save(); render();
  }

  function addPerson(name) {
    name = name.trim().replace(/\s+/g, ' ');
    if (!name) return;
    if (state.people.some((p) => p.toLowerCase() === name.toLowerCase())) {
      $('error').textContent = `"${name}" ya está en la lista.`;
      return;
    }
    state.people.push(name);
    invalidate();
  }

  function removePerson(name) {
    state.people = state.people.filter((p) => p !== name);
    state.exclusions = state.exclusions.filter(([a, b]) => a !== name && b !== name);
    invalidate();
  }

  $('addForm').addEventListener('submit', (e) => {
    e.preventDefault();
    addPerson($('newName').value);
    $('newName').value = '';
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

  [['eventName', 'event'], ['budget', 'budget'], ['date', 'date']].forEach(([id, key]) => {
    $(id).addEventListener('input', (e) => { state[key] = e.target.value; save(); if (state.pairs) renderResults(); });
  });

  $('drawBtn').addEventListener('click', () => {
    $('error').textContent = '';
    if (state.people.length < 3) { $('error').textContent = 'Necesitas al menos 3 participantes.'; return; }
    const pairs = draw(state.people);
    if (!pairs) {
      $('error').textContent = 'Con estas exclusiones no hay ningún sorteo posible. Quita alguna e inténtalo de nuevo.';
      return;
    }
    state.pairs = pairs;
    save(); renderResults();
    $('results').scrollIntoView({ behavior: 'smooth' });
  });

  $('resetBtn').addEventListener('click', () => {
    if (!confirm('¿Borrar participantes, exclusiones y sorteo?')) return;
    state = { event: '', budget: '', date: '', people: [], exclusions: [], pairs: null };
    invalidate();
  });

  // ---------- Modo "pasar el móvil" ----------
  let passIndex = 0;
  function showPass() {
    const name = state.people[passIndex];
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
    const name = state.people[passIndex];
    $('passText').textContent = `${name}, le regalas a:`;
    $('passBox').textContent = state.pairs[name];
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
  function exitPass() { $('passMode').hidden = true; $('organizer').hidden = false; }
  $('passExit').addEventListener('click', exitPass);

  // ---------- Vista de enlace secreto ----------
  function formatDate(iso) {
    const d = new Date(`${iso}T12:00:00`);
    return isNaN(d) ? iso : d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function route() {
    const m = location.hash.match(/^#s=([\w-]+)$/);
    if (!m) { $('secret').hidden = true; $('organizer').hidden = false; render(); return; }
    let data;
    try { data = decode(m[1]); } catch { data = null; }
    if (!data || !data.g || !data.r) {
      $('secret').hidden = true; $('organizer').hidden = false; render();
      $('error').textContent = 'El enlace no es válido.';
      return;
    }
    $('organizer').hidden = true; $('passMode').hidden = true; $('secret').hidden = false;
    $('secretEvent').textContent = data.e || 'Amigo Invisible';
    $('secretGiver').textContent = data.g;
    $('secretBox').hidden = true;
    $('giftBtn').hidden = false;
    const info = [];
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
