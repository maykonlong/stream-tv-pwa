/* Stream TV — PWA de TV com navegação por controle remoto (teclado / D-pad / gamepad) */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

const store = {
  key: 'stv.progress.v1',
  all() { try { return JSON.parse(localStorage.getItem(this.key) || '{}'); } catch { return {}; } },
  get(id) { return this.all()[id] || null; },
  set(id, data) { const a = this.all(); a[id] = { ...(a[id] || {}), ...data, at: Date.now() }; localStorage.setItem(this.key, JSON.stringify(a)); },
  list() { return Object.entries(this.all()).map(([id, v]) => ({ id, ...v })).sort((x, y) => y.at - x.at); }
};

const list = {
  key: 'stv.list.v1',
  all() { try { return JSON.parse(localStorage.getItem(this.key) || '[]'); } catch { return []; } },
  has(id) { return this.all().includes(id); },
  toggle(id) { const a = this.all(); const i = a.indexOf(id); i >= 0 ? a.splice(i, 1) : a.push(id); localStorage.setItem(this.key, JSON.stringify(a)); return i < 0; }
};

const state = { catalog: null, playing: null, lastScope: null };

/* ---------------- util ---------------- */
const fmt = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sec).padStart(2, '0');
};
const hue = (str) => { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const artStyle = (item) => {
  const h = hue(item.id + item.title);
  const h2 = (h + 42) % 360;
  return `background:
    radial-gradient(120% 120% at 15% 0%, hsla(${h},70%,58%,.55), transparent 62%),
    radial-gradient(100% 100% at 100% 100%, hsla(${h2},72%,46%,.55), transparent 60%),
    linear-gradient(160deg, hsl(${h},40%,16%), hsl(${h2},42%,9%));`;
};
const toast = (msg) => {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
};

/* ---------------- render ---------------- */
function cardEl(item, opts = {}) {
  const c = el('div', 'card focusable' + (opts.wide ? ' wide' : ''));
  c.dataset.id = item.id;
  c.tabIndex = 0;
  c.innerHTML = `
    <div class="card-art" style="${artStyle(item)}"><span>${escapeHtml(item.title)}</span></div>
    ${item.badge ? `<div class="card-badge">${escapeHtml(item.badge)}</div>` : ''}
    <div class="card-label">${escapeHtml(item.title)}</div>
    ${item.progress != null ? `<div class="progress"><i style="width:${Math.min(100, Math.max(2, item.progress))}%"></i></div>` : ''}`;
  c.addEventListener('click', () => { nav.set(c); openDetail(item); });
  c.addEventListener('mouseenter', () => nav.set(c, { silent: true }));
  return c;
}

function rowEl(row) {
  const r = el('section', 'row');
  r.dataset.row = row.id;
  r.innerHTML = `<div class="row-head"><h2 class="row-title">${escapeHtml(row.title)}</h2><span class="row-more">Ver tudo ›</span></div>`;
  const track = el('div', 'track');
  if (!row.items.length) track.appendChild(el('div', 'empty', 'Nada por aqui ainda.'));
  row.items.forEach((it) => track.appendChild(cardEl(it, { wide: row.type === 'wide' })));
  r.appendChild(track);
  track.addEventListener('focusin', () => r.classList.add('row-active'));
  track.addEventListener('focusout', () => r.classList.remove('row-active'));
  return r;
}

function render() {
  const cat = state.catalog;
  const rail = $('#rail');
  rail.innerHTML = `<div class="rail-brand">${escapeHtml(cat.title)}</div>`;
  const icons = {
    home: '<path d="M12 3 2 11h3v10h5v-6h4v6h5V11h3z"/>',
    film: '<path d="M4 3h3v2h2V3h2v2h2V3h2v2h2V3h1v18h-3v-2h-2v2h-2v-2H9v2H7v-2H4zM6 9v2h2V9zm4 0v2h2V9zm4 0v2h2V9zM6 13v2h2v-2zm4 0v2h2v-2zm4 0v2h2v-2z"/>',
    tv: '<path d="M21 6h-7.6l3.3-3.3-1.4-1.4L12 4.6 8.7 1.3 7.3 2.7 10.6 6H3v14h18zM5 18V8h14v10z"/>',
    doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm-1 7V3.5L18.5 9z"/>',
    heart: '<path d="M12 21s-8-4.9-8-10.4A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8 3.6C20 16.1 12 21 12 21z"/>'
  };
  const railItems = [
    { id: 'home', icon: 'home', label: 'Início', target: 'top' },
    { id: 'trending', icon: 'film', label: 'Filmes', target: 'trending' },
    { id: 'series', icon: 'tv', label: 'Séries', target: 'series' },
    { id: 'docs', icon: 'doc', label: 'Docs', target: 'docs' },
    { id: 'mylist', icon: 'heart', label: 'Minha lista', target: 'mylist' }
  ];
  railItems.forEach((it) => {
    const b = el('div', 'rail-item focusable' + (it.id === 'home' ? ' active' : ''));
    b.tabIndex = 0; b.title = it.label; b.dataset.rail = it.id;
    b.innerHTML = `<svg viewBox="0 0 24 24">${icons[it.icon]}</svg>`;
    b.addEventListener('click', () => railGo(it));
    rail.appendChild(b);
    b.addEventListener('focus', () => { rail.classList.add('focused'); $$('.rail-item', rail).forEach(x => x.classList.toggle('active', x === b)); });
  });
  rail.addEventListener('focusout', (e) => { if (!rail.contains(e.relatedTarget)) rail.classList.remove('focused'); });

  const main = $('#main');
  main.innerHTML = '';

  const hero = cat.hero;
  const h = el('header', 'hero');
  h.style.backgroundImage = hero.backdrop ? `url("${hero.backdrop}")` : '';
  if (!hero.backdrop) h.style.cssText += artStyle(hero);
  h.innerHTML = `
    <div class="hero-inner">
      <div class="hero-kicker"><b>${escapeHtml(cat.title)}</b> · Original</div>
      <h1 class="hero-title">${escapeHtml(hero.title)}</h1>
      <div class="hero-meta">
        <span>${escapeHtml(hero.year || '')}</span>
        <span class="pill">${escapeHtml(hero.rating || 'L')}</span>
        <span>${(hero.tags || []).map(escapeHtml).join(' · ')}</span>
      </div>
      <p class="hero-desc">${escapeHtml(hero.description || '')}</p>
      <div class="hero-actions">
        <button class="btn primary focusable" data-act="play">
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg> Assistir
        </button>
        <button class="btn focusable" data-act="info">
          <svg viewBox="0 0 24 24"><path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/></svg> Mais informações
        </button>
      </div>
    </div>`;
  $('[data-act="play"]', h).addEventListener('click', () => openPlayer(hero, hero));
  $('[data-act="info"]', h).addEventListener('click', () => openDetail(hero));
  main.appendChild(h);

  // continue watching
  const cont = store.list().filter((p) => p.d > 0 && p.t > 5 && p.t < p.d * 0.96);
  if (cont.length) {
    const items = cont.map((p) => ({ ...p, title: p.title, progress: (p.t / p.d) * 100, badge: 'CONTINUAR' }));
    main.appendChild(rowEl({ id: 'continue', title: 'Continuar assistindo', type: 'wide', items }));
  }

  cat.rows.forEach((row) => main.appendChild(rowEl(row)));

  const listItems = list.all().map(findItem).filter(Boolean);
  if (listItems.length) main.appendChild(rowEl({ id: 'mylist', title: 'Minha lista', type: 'poster', items: listItems }));

  main.addEventListener('scroll', () => {
    const y = main.scrollTop;
    $('#rail').classList.toggle('dim', y > 60);
    $('.hero')?.classList.toggle('shrink', y > 60);
  }, { passive: true });
}

function railGo(it) {
  if (it.target === 'top') { $('#main').scrollTo({ top: 0, behavior: 'smooth' }); const p = $('[data-act="play"]'); if (p) nav.set(p); return; }
  const row = $(`.row[data-row="${it.target}"]`);
  if (!row) { toast('Nada por aqui ainda'); return; }
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const first = $('.card', row);
  if (first) nav.set(first);
}

function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* ---------------- focus engine ---------------- */
const nav = {
  current: null,
  scope() { const ms = $$('.modal'); return ms.length ? ms[ms.length - 1] : document.getElementById('app'); },
  items() {
    return $$('.focusable', this.scope()).filter((e) => {
      if (!e.offsetParent && e.offsetWidth === 0) return false;
      const r = e.getBoundingClientRect();
      return r.width > 1 && r.height > 1 && r.bottom > 0 && r.top < innerHeight;
    });
  },
  set(e, opts = {}) {
    if (!e) return;
    const prev = this.current;
    if (prev && prev !== e) prev.classList.remove('focused');
    if (prev && prev !== e) prev.setAttribute('aria-selected', 'false');
    this.current = e;
    e.classList.add('focused');
    e.setAttribute('aria-selected', 'true');
    try { e.focus({ preventScroll: true }); } catch { }
    if (!opts.silent) this.reveal(e);
  },
  reveal(e) {
    const track = e.closest('.track');
    if (track) {
      const target = e.offsetLeft - track.clientWidth / 2 + e.offsetWidth / 2;
      const max = track.scrollWidth - track.clientWidth;
      track.scrollTo({ left: Math.max(0, Math.min(max, target)), behavior: 'smooth' });
    }
    const main = $('#main');
    if (main && main.contains(e)) {
      const r = e.getBoundingClientRect();
      const row = e.closest('.row') || e;
      const rr = row.getBoundingClientRect();
      const pad = 70;
      if (rr.top < pad) main.scrollBy({ top: rr.top - pad, behavior: 'smooth' });
      else if (rr.bottom > innerHeight - pad) main.scrollBy({ top: rr.bottom - innerHeight + pad, behavior: 'smooth' });
    }
  },
  first() { const its = this.items(); return its[0] || null; },
  move(dir) {
    const cur = this.current && this.items().includes(this.current) ? this.current : this.first();
    if (!cur) return;
    let cands = this.items().filter((e) => e !== cur);
    const inRail = cur.closest('#rail');
    if (inRail) {
      if (dir === 'left') return;                                   // borda esquerda da TV
      if (dir === 'right') cands = cands.filter((e) => !e.closest('#rail')); // sai do menu para o conteúdo
      else cands = cands.filter((e) => e.closest('#rail'));          // cima/baixo ficam no menu
    }
    if (!cands.length) return;
    const cr = cur.getBoundingClientRect();
    const cx = cr.left + cr.width / 2, cy = cr.top + cr.height / 2;
    const dirs = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
    const [dx, dy] = dirs[dir];
    let best = null, bestScore = Infinity;
    for (const c of cands) {
      const r = c.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const px = x - cx, py = y - cy;
      const primary = px * dx + py * dy;
      if (primary < 3) continue;
      const secondary = Math.abs(dx ? py : px);
      const overlap = dx
        ? (Math.min(cr.bottom, r.bottom) - Math.max(cr.top, r.top))
        : (Math.min(cr.right, r.right) - Math.max(cr.left, r.left));
      let score = primary + secondary * 2.4;
      if (overlap <= 0) score += Math.abs(overlap) * 3 + 120;
      if (c.closest('.track') === cur.closest('.track') && dx) score -= 40; // prefer same row
      if (score < bestScore) { bestScore = score; best = c; }
    }
    // wrap inside the current row when at the edge
    if (!best) {
      const track = cur.closest('.track');
      if (track && dx) {
        const inRow = $$('.focusable', track).filter((e) => this.items().includes(e));
        if (inRow.length) best = dx > 0 ? inRow[0] : inRow[inRow.length - 1];
      }
    }
    if (best) this.set(best);
  },
  refocus() {
    const its = this.items();
    if (this.current && its.includes(this.current)) { this.reveal(this.current); return; }
    const first = its.find((e) => e.dataset.autofocus !== undefined) || its.find((e) => e.classList.contains('btn')) || its[0];
    if (first) this.set(first);
  }
};

/* ---------------- modal stack ---------------- */
const modals = [];
function pushModal(node, onClose) {
  node.classList.add('modal');
  $('#modal-root').appendChild(node);
  modals.push({ node, onClose, prev: nav.current });
  nav.current = null;
  requestAnimationFrame(() => nav.refocus());
}
function popModal() {
  const m = modals.pop();
  if (!m) return false;
  m.node.classList.add('fade-out');
  setTimeout(() => m.node.remove(), 160);
  m.onClose && m.onClose();
  nav.current = null;
  if (modals.length) requestAnimationFrame(() => nav.refocus());
  else { const p = m.prev; if (p && p.isConnected) setTimeout(() => nav.set(p, { silent: true }), 30); }
  return true;
}

/* ---------------- detail sheet ---------------- */
function findItem(id) {
  const cat = state.catalog;
  if (cat.hero && cat.hero.id === id) return cat.hero;
  for (const r of cat.rows) { const f = r.items.find((i) => i.id === id); if (f) return f; }
  return null;
}

function openDetail(item) {
  const hero = state.catalog.hero;
  const m = el('div');
  const eps = item.episodes || [];
  const p = store.get(item.id);
  const resume = p ? p.t : 0;
  m.innerHTML = `
    <div class="sheet">
      <div class="sheet-hero" style="${item.backdrop ? `background-image:url('${item.backdrop}')` : artStyle(item)}"></div>
      <div class="sheet-body">
        <h2 class="sheet-title">${escapeHtml(item.title)}</h2>
        <div class="sheet-meta">
          <span>${escapeHtml(item.meta || item.year || '')}</span>
          ${item.rating ? `<span class="pill">${escapeHtml(item.rating)}</span>` : ''}
          ${eps.length && !item.meta ? `<span>${eps.length} episódio(s)</span>` : ''}
        </div>
        <p class="sheet-desc">${escapeHtml(item.description || hero.description || '')}</p>
        <div class="sheet-actions">
          <button class="btn primary focusable" data-a="play">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            ${resume > 5 ? 'Continuar ' + fmt(resume) : 'Assistir'}
          </button>
          ${resume > 5 ? '<button class="btn focusable" data-a="restart">Do início</button>' : ''}
          <button class="btn focusable" data-a="list">${list.has(item.id) ? '✓ Na minha lista' : '+ Minha lista'}</button>
        </div>
        ${eps.length ? `<div class="eps">${eps.map((e, i) => `
          <div class="ep focusable" data-ep="${i}">
            <div class="ep-num">${i + 1}</div>
            <div><div class="ep-t">${escapeHtml(e.title)}</div><div class="ep-s">${escapeHtml(e.meta || '~15 min')}</div></div>
            <div class="ep-play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
          </div>`).join('')}</div>` : ''}
      </div>
    </div>`;
  $('[data-a="play"]', m).addEventListener('click', () => { popModal(); setTimeout(() => openPlayer(item, eps.length ? eps[0] : item, { resume }), 120); });
  const rs = $('[data-a="restart"]', m);
  if (rs) rs.addEventListener('click', () => { popModal(); setTimeout(() => openPlayer(item, eps.length ? eps[0] : item, { resume: 0 }), 120); });
  const lb = $('[data-a="list"]', m);
  lb.addEventListener('click', () => { const on = list.toggle(item.id); lb.textContent = on ? '✓ Na minha lista' : '+ Minha lista'; toast(on ? 'Adicionado à sua lista' : 'Removido da sua lista'); });
  $$('.ep', m).forEach((node) => {
    node.addEventListener('click', () => {
      const idx = +node.dataset.ep;
      const ep = eps[idx];
      popModal();
      setTimeout(() => openPlayer(item, { ...ep, color: item.color, title: item.title + ' · ' + ep.title }, { nextIdx: idx }), 120);
    });
  });
  m.addEventListener('mousedown', (e) => { if (e.target === m) popModal(); });
  pushModal(m);
}

/* ---------------- player ---------------- */
const player = { video: null, hls: null, ui: null, hideT: null, item: null, ctx: {} };

function openPlayer(item, playable, ctx = {}) {
  const m = el('div', 'modal player');
  const title = playable.title || item.title;
  const sub = playable !== item ? item.title : (item.meta || '');
  m.innerHTML = `
    <video id="pv" playsinline preload="metadata" crossorigin="anonymous"></video>
    <div class="player-ui show">
      <div class="player-top">
        <div class="player-title">${escapeHtml(title)}<small>${escapeHtml(sub)}</small></div>
        <div class="pill-hd">HD · ${escapeHtml(state.catalog.title)}</div>
      </div>
      <div class="player-bottom">
        <div class="timeline"><i id="pfill" style="width:0%"></i><b id="pdot" style="left:0%"></b></div>
        <div class="tinfo"><span id="pcur">0:00</span><span id="pdur">0:00</span></div>
        <div class="pcontrols">
          <button class="pbtn focusable" data-p="rew" title="Voltar 10s"><svg viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/></svg></button>
          <button class="pbtn big focusable" data-p="play" data-autofocus title="Play/Pause"><svg id="picon" viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg></button>
          <button class="pbtn focusable" data-p="ff" title="Avançar 10s"><svg viewBox="0 0 24 24"><path d="M12 5V1l5 5-5 5V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z"/></svg></button>
          ${ctx.nextIdx != null && item.episodes && item.episodes[ctx.nextIdx + 1] ? '<button class="pbtn focusable" data-p="next" title="Próximo episódio"><svg viewBox="0 0 24 24"><path d="M4 5v14l9-7zM15 5h3v14h-3z"/></svg></button>' : ''}
          <button class="pbtn focusable" data-p="mute" title="Mudo"><svg id="pvol" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9zM16 8a5 5 0 0 1 0 8v-2a3 3 0 0 0 0-4z"/></svg></button>
          <div class="spacer"></div>
          <div class="pclock" id="pclock">─</div>
          <button class="pbtn focusable" data-p="close" title="Voltar"><svg viewBox="0 0 24 24"><path d="M9 4 2 12l7 8v-5h13v-6H9z"/></svg></button>
        </div>
      </div>
    </div>`;
  document.body.style.cursor = 'none';
  pushModal(m, () => {
    try { player.hls && player.hls.destroy(); } catch { }
    const v = player.video;
    if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
    player.video = null; player.hls = null; player.ui = null; player.item = null;
    clearTimeout(player.hideT);
  });

  const v = $('#pv', m);
  player.video = v; player.ui = $('.player-ui', m); player.item = item; player.ctx = ctx;

  const url = playable.video || item.video;
  if (url && /\.m3u8(\?|$)/.test(url) && window.Hls && Hls.isSupported()) {
    const hls = new Hls({ maxBufferLength: 30 });
    hls.loadSource(url); hls.attachMedia(v);
    player.hls = hls;
    hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) toast('Falha no stream HLS'); });
  } else { v.src = url; }

  const seekTo = Number(ctx.resume || 0);
  v.addEventListener('loadedmetadata', () => { if (seekTo > 1) v.currentTime = seekTo; $('#pdur', m).textContent = fmt(v.duration); });
  v.play().catch(() => toast('Aperte OK para dar play'));

  const upd = () => {
    const d = v.duration || 0, t = v.currentTime || 0;
    const pct = d ? (t / d) * 100 : 0;
    $('#pfill', m).style.width = pct + '%';
    $('#pdot', m).style.left = pct + '%';
    $('#pcur', m).textContent = fmt(t);
    $('#pdur', m).textContent = fmt(d);
    const ic = $('#picon', m);
    if (ic) ic.innerHTML = v.paused
      ? '<path d="M8 5v14l11-7z"/>'
      : '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>';
  };
  v.addEventListener('timeupdate', upd);
  v.addEventListener('play', () => { upd(); scheduleHide(); });
  v.addEventListener('pause', () => { upd(); showUi(); });
  v.addEventListener('ended', () => {
    const next = ctx.nextIdx != null && item.episodes && item.episodes[ctx.nextIdx + 1];
    saveProgress(item, playable, 0, 0, true);
    if (next) { popModal(); setTimeout(() => openPlayer(item, { ...next, title: item.title + ' · ' + next.title }, { nextIdx: ctx.nextIdx + 1 }), 200); }
  });
  setInterval(() => { if (player.video === v) saveProgress(item, playable, v.currentTime, v.duration); }, 5000);

  $$('[data-p]', m).forEach((b) => b.addEventListener('click', () => act(b.dataset.p)));
  $$('[data-p]', m).forEach((b) => b.addEventListener('mouseenter', () => nav.set(b, { silent: true })));
  m.addEventListener('click', (e) => { if (e.target === m) { player.video.paused ? player.video.play() : player.video.pause(); } });
  showUi();
}

function saveProgress(item, playable, t, d, done) {
  if (!item || !d || d < 5) return;
  const key = playable.id || item.id;
  store.set(key, { t: Math.floor(t), d: Math.floor(d), title: item.title, video: playable.video || item.video, color: item.color, done: !!done || t > d * 0.96 });
}

function act(a) {
  const v = player.video;
  if (!v) return;
  if (a === 'play') { v.paused ? v.play().catch(() => toast('Não deu play')) : v.pause(); showUi(); }
  if (a === 'rew') { v.currentTime = Math.max(0, v.currentTime - 10); showUi(); }
  if (a === 'ff') { v.currentTime = Math.min(v.duration || 1e9, v.currentTime + 10); showUi(); }
  if (a === 'mute') { v.muted = !v.muted; toast(v.muted ? 'Mudo' : 'Som ligado'); showUi(); }
  if (a === 'close') popModal();
  if (a === 'next') {
    const i = player.item, idx = player.ctx.nextIdx;
    const nxt = i.episodes && i.episodes[idx + 1];
    if (nxt) { popModal(); setTimeout(() => openPlayer(i, { ...nxt, title: i.title + ' · ' + nxt.title }, { nextIdx: idx + 1 }), 160); }
  }
}

function showUi() {
  player.ui && player.ui.classList.add('show');
  if (player.video) $('#pclock') && ($('#pclock').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
  scheduleHide();
}
function scheduleHide() {
  clearTimeout(player.hideT);
  player.hideT = setTimeout(() => {
    if (!player.ui || !player.video) return;
    if (player.video.paused) return;
    if (player.ui.contains(document.activeElement) && document.activeElement.matches('.pbtn')) return;
    player.ui.classList.remove('show');
  }, 4200);
}

/* ---------------- input ---------------- */
const MAP = {
  up: [38, 33], down: [40, 34], left: [37], right: [39],
  ok: [13, 32], back: [8, 27, 461, 10009, 4], pp: [179, 415, 19],
  ff: [417, 228], rew: [412, 227], stop: [178]
};

function handleKey(e) {
  const k = e.keyCode;
  const dir = ['up', 'down', 'left', 'right'].find((d) => MAP[d].includes(k));
  const isOk = MAP.ok.includes(k);
  const isBack = MAP.back.includes(k);
  if (!dir && !isOk && !isBack && ![...MAP.pp, ...MAP.ff, ...MAP.rew, ...MAP.stop].includes(k)) return;
  if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  e.preventDefault();

  // player scope: media keys always work; nav only when UI visible
  if (player.video) {
    if (MAP.pp.includes(k)) { act('play'); return; }
    if (MAP.ff.includes(k)) { act('ff'); return; }
    if (MAP.rew.includes(k)) { act('rew'); return; }
    if (!player.ui.classList.contains('show')) {
      showUi(); nav.set($('[data-p="play"]', player.ui)); return;
    }
  }

  if (isBack) { if (!popModal()) { toast('Fim da navegação'); } return; }
  if (isOk) {
    const cur = nav.current;
    if (cur) { cur.click(); }
    else { const f = nav.first(); if (f) { nav.set(f); } }
    return;
  }
  nav.move(dir);
}

window.addEventListener('keydown', handleKey, { capture: true });
window.addEventListener('keydown', (e) => {
  if (player.video && player.ui.classList.contains('show') && !e.repeat) scheduleHide();
}, { passive: true });

/* gamepad: d-pad buttons 12-15, A=0, B=1, axes */
const gpState = { last: {}, t: 0 };
function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p) continue;
    const b = (i) => p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5);
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    const hit = {
      up: b(12) || ay < -0.6, down: b(13) || ay > 0.6,
      left: b(14) || ax < -0.6, right: b(15) || ax > 0.6,
      ok: b(0) || b(9), back: b(1)
    };
    const now = performance.now();
    for (const key of Object.keys(hit)) {
      if (hit[key] && !gpState.last[key] && now - gpState.t > 90) {
        gpState.t = now;
        handleKey({ keyCode: key === 'ok' ? 13 : key === 'back' ? 27 : { up: 38, down: 40, left: 37, right: 39 }[key], preventDefault() { }, target: document.body });
      }
      gpState.last[key] = hit[key];
    }
  }
  requestAnimationFrame(pollGamepad);
}

/* mouse: reveal cursor, hover = focus */
window.addEventListener('mousemove', () => { document.body.style.cursor = 'default'; }, { once: true });
window.addEventListener('mousedown', () => { if (!player.video) document.body.style.cursor = 'default'; });

/* ---------------- boot ---------------- */
async function boot() {
  try {
    const res = await fetch('catalog.json', { cache: 'no-cache' });
    state.catalog = await res.json();
  } catch (err) {
    document.getElementById('main').innerHTML = '<div style="padding:8vw;color:#aaa;font-family:sans-serif">Não foi possível carregar catalog.json</div>';
    return;
  }
  render();
  requestAnimationFrame(() => {
    const p = $('[data-act="play"]');
    nav.set(p);
    requestAnimationFrame(pollGamepad);
  });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }
  // fullscreen on first remote/key interaction (TVs often need a gesture)
  const fs = () => { document.documentElement.requestFullscreen?.().catch(() => { }); window.removeEventListener('keydown', fs); };
  window.addEventListener('keydown', fs, { once: true });
}

boot();
