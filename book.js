/* =====================================================================
   BOOK ENGINE
   Reads the <article class="page"> blocks inside #book-pages in
   index.html and turns them into a 3D book, plus an edit mode.
   Settings live in window.BOOK in index.html.
   You usually don't need to edit this file.
   ===================================================================== */
(function () {
  'use strict';

  const C = Object.assign({ pageWidth: 850, pageHeight: 1100, fill: 1, tilt: 16, editButton: true }, window.BOOK || {});
  const ORIGINAL_HTML = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;   // for Export
  const KEY = 'book-edits:' + location.pathname;
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const source = document.getElementById('book-pages');
  if (!source) { console.warn('[book] No element with id="book-pages" found.'); return; }

  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const slug = t => t.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const parseArticle = html => { const t = el('template'); t.innerHTML = html.trim(); const a = t.content.firstElementChild; return a && a.tagName === 'ARTICLE' && t.content.childElementCount === 1 ? a : null; };

  /* ---------- per-page <style>: only affects its own page ---------- */
  const rawCSS = new WeakMap();
  function scopeStyles(article) {
    article.querySelectorAll('style').forEach(st => {
      if (rawCSS.has(st)) return;
      rawCSS.set(st, st.textContent);
      st.textContent = '@scope {\n' + st.textContent + '\n}';
    });
  }

  /* ---------- clean HTML of a page, as it should look in index.html ---------- */
  function serialize(article) {
    const clone = article.cloneNode(true);
    const origStyles = article.querySelectorAll('style');
    clone.querySelectorAll('style').forEach((st, i) => { if (origStyles[i] && rawCSS.has(origStyles[i])) st.textContent = rawCSS.get(origStyles[i]); });
    clone.querySelectorAll(':scope > .media').forEach(m => m.remove());
    clone.querySelectorAll('[contenteditable]').forEach(n => { n.removeAttribute('contenteditable'); n.removeAttribute('spellcheck'); });
    clone.querySelectorAll('.ed-sel').forEach(n => n.classList.remove('ed-sel'));
    clone.querySelectorAll('[class=""]').forEach(n => n.removeAttribute('class'));
    if (clone.getAttribute('style') === '') clone.removeAttribute('style');
    return clone.outerHTML;
  }

  /* ---------- 1. collect pages in reading order ---------- */
  const pages = [];     // { el, section, n, orig, auto }
  const sections = [];  // { id, title, count, first }
  [...source.children].forEach(node => {
    if (node.tagName === 'SECTION') {
      const title = node.dataset.title || '';
      const sec = { id: node.id || slug(title), title, count: 0, first: -1 };
      sections.push(sec);
      node.querySelectorAll(':scope > article').forEach(a => pages.push({ el: a, section: sec, n: ++sec.count }));
    } else if (node.tagName === 'ARTICLE') {
      pages.push({ el: node, section: null });
    }
  });
  pages.forEach(p => { p.el.classList.add('page'); p.orig = serialize(p.el); });
  const srcPages = pages.slice();   // pages that exist in index.html, in order

  // edits saved in this browser (only used if that page's code hasn't changed since)
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  if (saved && Array.isArray(saved.pages)) {
    srcPages.forEach((p, j) => {
      const s = saved.pages[j];
      if (!s || s.orig !== p.orig) return;
      const a = parseArticle(s.html);
      if (a) { a.classList.add('page'); p.el = a; }
    });
  }

  const blank = () => el('article', 'page');
  while (pages.length < 2) pages.push({ el: blank(), section: null, auto: true });
  if (pages.length % 2) pages.splice(pages.length - 1, 0, { el: blank(), section: null, auto: true });
  sections.forEach(s => { s.first = pages.findIndex(p => p.section === s); });

  const N = pages.length, L = N / 2;
  const stepOf = i => Math.ceil(i / 2);

  /* ---------- 2. images, spreads and videos from data- attributes ---------- */
  const media = (tag, src, cls, alt) => {
    const m = el(tag, 'media' + (cls ? ' ' + cls : ''));
    if (tag === 'img') { m.alt = alt || ''; m.decoding = 'async'; m.draggable = false; }
    else { m.muted = true; m.defaultMuted = true; m.loop = true; m.playsInline = true; m.preload = 'metadata';
      m.setAttribute('muted', ''); m.setAttribute('playsinline', ''); }
    m.src = src;
    return m;
  };
  function applyMedia() {
    pages.forEach(p => p.el.querySelectorAll(':scope > .media').forEach(m => m.remove()));
    pages.forEach((p, i) => {
      const d = p.el.dataset;
      if (d.image) p.el.prepend(media('img', d.image, '', d.alt));
      if (d.video) p.el.prepend(media('video', d.video));
      if (d.spread) {
        if (i % 2 === 1 && i + 1 < N) {
          p.el.prepend(media('img', d.spread, 'spread', d.alt));
          pages[i + 1].el.prepend(media('img', d.spread, 'spread spread-right'));
        } else console.warn('[book] data-spread only works on a left-hand page (even page number). Page ' + (i + 1) + ' is a right-hand page.');
      }
    });
  }

  /* ---------- 3. build the stage ---------- */
  const stage = el('div', 'book-stage');
  const wrap = el('div', 'book-wrap');
  const floor = el('div', 'book-floor');
  const book = el('div', 'book');
  const edgeR = el('div', 'edge side'), edgeRB = el('div', 'edge bottom'), edgeL = el('div', 'edge side'), edgeLB = el('div', 'edge bottom');
  book.append(edgeL, edgeLB, edgeR, edgeRB);
  wrap.append(floor, book);
  stage.append(wrap);

  const track = el('div', 'book-track');
  for (let s = 0; s <= L; s++) track.append(el('div'));

  const caption = el('div', 'book-caption',
    '<b class="cap-title"></b><span class="cap-pages"></span><span class="book-hint">Scroll or click a page to turn it</span><span class="sr-only" aria-live="polite"></span>');
  const capTitle = caption.querySelector('.cap-title');
  const capPages = caption.querySelector('.cap-pages');
  const live = caption.querySelector('.sr-only');
  const hint = caption.querySelector('.book-hint');
  document.body.append(stage, track, caption);

  const describe = (p, i) =>
    p.auto ? 'Blank page added (odd page count)' :
    p.section ? (p.section.title || p.section.id || 'Section') + ', ' + p.n + ' of ' + p.section.count :
    i === 0 ? 'Front cover' : i === N - 1 ? 'Back cover' : 'Page';

  function makeFace(i, side) {
    const p = pages[i];
    const f = el('div', 'face ' + side);
    f.append(p.el);
    f.insertAdjacentHTML('beforeend',
      '<span class="fx grain"></span><span class="fx curve"></span><span class="fx shade"></span><span class="fx gloss"></span>' +
      '<span class="guide" aria-hidden="true"><span class="margin"></span>' +
      '<span class="label"><b>' + (i + 1) + '</b>' + esc(describe(p, i)) + '</span>' +
      '<span class="size">' + C.pageWidth + ' × ' + C.pageHeight + ' px</span></span>');
    p.face = f;
    scopeStyles(p.el);
    return f;
  }
  const leaves = [];
  for (let k = 0; k < L; k++) {
    const leaf = el('div', 'leaf');
    leaf.append(makeFace(2 * k, 'front'), makeFace(2 * k + 1, 'back'));
    book.append(leaf);
    leaves.push(leaf);
  }
  applyMedia();

  /* ---------- 4. nav: one link per <section data-title> ---------- */
  const nav = document.querySelector('.nav');
  const navList = document.getElementById('nav-links');
  const menuBtn = document.querySelector('.menu-btn');
  const navLinks = [];
  if (navList) {
    const frag = document.createDocumentFragment();
    sections.forEach(s => {
      if (!s.title || s.first < 0) return;
      const li = el('li'), a = el('a');
      a.href = '#' + s.id;
      a.textContent = s.title;
      a.addEventListener('click', e => { e.preventDefault(); setHash(s.id); go(stepOf(s.first)); closeMenu(); });
      li.append(a);
      frag.append(li);
      navLinks.push({ a, s });
    });
    navList.prepend(frag);
  }
  document.querySelectorAll('[data-home]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); setHash(''); go(0); closeMenu(); }));
  if (menuBtn && nav) menuBtn.addEventListener('click', () => menuBtn.setAttribute('aria-expanded', String(nav.classList.toggle('open'))));
  function closeMenu() { if (nav) nav.classList.remove('open'); if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false'); }
  function setHash(id) { try { history.replaceState(null, '', id ? '#' + id : location.pathname + location.search); } catch (e) {} }

  /* ---------- 5. size: as big as the space under the nav allows ---------- */
  let pw = 0, ph = 0, stepH = 1, editing = false, dock = null;
  const ref = el('div', 'book-ref');   // invisible box the size of the open spread, used to measure
  book.append(ref);
  function setSize(w) {
    pw = Math.max(40, Math.floor(w));
    ph = Math.round(pw * C.pageHeight / C.pageWidth);
    root.style.setProperty('--pw', pw + 'px');
    root.style.setProperty('--ph', ph + 'px');
    root.style.setProperty('--s', (pw / C.pageWidth).toFixed(5));
  }
  function layout() {
    const navH = nav ? nav.getBoundingClientRect().height : 0;
    const bottom = editing && dock ? Math.max(dock.getBoundingClientRect().height, 124) + 20 : 40;
    const gap = 10;
    const top = navH + gap, bot = innerHeight - bottom;
    const side = Math.max(12, innerWidth * 0.02);
    root.style.setProperty('--W', C.pageWidth + 'px');
    root.style.setProperty('--H', C.pageHeight + 'px');
    root.style.setProperty('--stage-h', Math.max(100, innerHeight - navH) + 'px');
    // 1. rough size, 2. measure the tilted book on screen, 3. scale and move it so it
    // sits right under the nav bar and as wide as the screen allows
    setSize(Math.min((innerWidth - side * 2) / 2, (bot - top) * C.pageWidth / C.pageHeight));
    const keep = book.style.transform, lean = editing ? 0 : 1;
    wrap.style.transform = '';
    book.style.transform = 'rotateX(' + C.tilt * lean + 'deg) rotateY(' + (-C.tilt * 0.45 * lean) + 'deg)';
    let r = ref.getBoundingClientRect();
    const k = Math.min((bot - top) / r.height, (innerWidth - side * 2) / r.width);
    setSize(pw * k * C.fill);
    r = ref.getBoundingClientRect();
    wrap.style.transform = 'translateY(' + Math.round((top + bot) / 2 - (r.top + r.bottom) / 2) + 'px)';
    book.style.transform = keep;
    stepH = track.firstElementChild.getBoundingClientRect().height || innerHeight;
    lastKey = '';
  }

  /* ---------- 6. input ---------- */
  let target = 0, cur = 0, step = -1;
  const readScroll = () => { target = Math.max(0, Math.min(L, scrollY / stepH)); };
  function go(s, instant) {
    s = Math.max(0, Math.min(L, s));
    scrollTo({ top: s * stepH, behavior: instant || reduce ? 'auto' : 'smooth' });
  }
  addEventListener('scroll', () => { readScroll(); hideHint(); }, { passive: true });

  let pinned = null, pinTimer = 0;   // keep the same spread open when the window changes size
  addEventListener('resize', () => {
    if (pinned === null) pinned = Math.max(step, 0);
    const old = stepH;
    layout();
    if (Math.abs(stepH - old) > 1) { scrollTo(0, pinned * stepH); readScroll(); cur = target; }
    clearTimeout(pinTimer);
    pinTimer = setTimeout(() => { pinned = null; }, 250);
  });

  wrap.addEventListener('click', e => {
    if (editing) { onEditClick(e); return; }
    if (e.target.closest('a, button, input, textarea, select, label, summary, audio, video[controls], [contenteditable], [data-no-turn]')) return;
    if (window.getSelection && String(getSelection()).length) return;
    const r = wrap.getBoundingClientRect();
    const spine = r.left + r.width / 2 + shiftFrac(cur) * pw;
    go(Math.round(target) + (e.clientX >= spine ? 1 : -1));
    hideHint(true);
  });

  const typing = t => t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]');
  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(Math.round(target) + 1); hideHint(true); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(Math.round(target) - 1); }
    else if (e.key === 'g' || e.key === 'G') document.body.classList.toggle('show-guides');
    else if (e.key === 'e' || e.key === 'E') setEditing(!editing);
    else if (e.key === 'Escape') { closeMenu(); if (editing) select(null); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && editing && selItem) { e.preventDefault(); act('delete'); }
  });

  function jumpToHash(instant) {
    const h = decodeURIComponent(location.hash.slice(1));
    if (!h) return;
    let i = -1;
    const m = h.match(/^page-(\d+)$/);
    if (m) i = Math.min(N, Math.max(1, +m[1])) - 1;
    else { const s = sections.find(x => x.id === h); i = s ? s.first : pages.findIndex(p => p.el.id === h); }
    if (i < 0) return;
    go(stepOf(i), instant);
    if (instant) { readScroll(); cur = target; }
  }
  addEventListener('hashchange', () => jumpToHash(false));

  let mx = 0, my = 0;
  addEventListener('pointermove', e => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; });
  function hideHint(force) {
    if (!hint || hint.classList.contains('gone')) return;
    if (force || scrollY > 8) { hint.classList.add('gone'); setTimeout(() => hint.remove(), 650); }
  }

  /* ---------- 7. render loop ---------- */
  const ease = t => 1 - Math.pow(1 - t, 3);
  const shiftFrac = p => p < 1 ? -(1 - p) / 2 : p > L - 1 ? (p - (L - 1)) / 2 : 0;
  const thick = Math.min(2.2, 30 / L);
  const t0 = performance.now();
  let tx = 0, ty = 0, flat = 0, lastKey = '';

  function render(it) {
    const p = cur, sx = shiftFrac(p) * pw, lean = 1 - flat;
    const rx = (C.tilt + (1 - it) * 22 + tx) * lean;
    const ry = (-C.tilt * 0.45 + (1 - it) * -32 + ty) * lean;
    book.style.transform = 'translateX(' + sx + 'px) translateY(' + (1 - it) * 40 + 'px) rotateX(' + rx + 'deg) rotateY(' + ry + 'deg) rotateZ(' + (1 - it) * -6 + 'deg)';
    floor.style.transform = 'translateX(-50%) scaleX(' + (0.55 + 0.45 * Math.min(1, p, L - p)) + ')';
    leaves.forEach((leaf, k) => {
      const t = Math.max(0, Math.min(1, p - k));
      const lift = Math.sin(t * Math.PI);
      const z = (t < 0.5 ? L - k : k + 1) * thick + lift * 22;
      leaf.style.transform = 'translateZ(' + z + 'px) rotateY(' + (-180 * t) + 'deg)';
      leaf.style.setProperty('--sh', (lift * 0.55).toFixed(3));
      leaf.style.setProperty('--g', t.toFixed(3));
      leaf.style.setProperty('--go', (0.18 + lift * 0.5).toFixed(3));
    });
    // stacked paper edges
    const tr = Math.max(0, L - p) * thick, tl = Math.min(L, p) * thick;
    edgeR.style.cssText = 'left:' + 2 * pw + 'px;width:' + tr + 'px';
    edgeRB.style.cssText = 'left:' + pw + 'px;height:' + tr + 'px';
    edgeL.style.cssText = 'left:0;width:' + tl + 'px';
    edgeLB.style.cssText = 'left:0;height:' + tl + 'px';
  }

  function onStep() {
    const s = step, left = 2 * s - 1, right = 2 * s;
    const sec = (pages[right] && pages[right].section) || (pages[left] && pages[left].section) || null;
    const title = sec && sec.title ? sec.title : s === 0 ? 'Cover' : s === L ? 'Back cover' : '';
    const nums = s === 0 ? '1 / ' + N : s === L ? N + ' / ' + N : (left + 1) + '–' + (right + 1) + ' / ' + N;
    capTitle.textContent = title;
    capPages.textContent = nums;
    live.textContent = (title ? title + ', ' : '') + 'page ' + nums.replace(' / ', ' of ');
    navLinks.forEach(({ a, s: ns }) => a.setAttribute('aria-current', ns === sec ? 'true' : 'false'));
    pages.forEach((p, i) => {
      const vis = i === left || i === right;
      p.face.inert = !vis;
      p.el.querySelectorAll('video').forEach(v => { if (vis) { const pr = v.play(); if (pr) pr.catch(() => {}); } else v.pause(); });
    });
    if (editing) onEditStep();
  }

  function frame(now) {
    cur += (target - cur) * (reduce ? 1 : 0.12);
    if (Math.abs(target - cur) < 0.0005) cur = target;
    const it = reduce ? 1 : ease(Math.min(1, (now - t0) / 1600));
    flat += ((editing ? 1 : 0) - flat) * (reduce ? 1 : 0.12);
    if (Math.abs(flat - (editing ? 1 : 0)) < 0.001) flat = editing ? 1 : 0;
    if (!reduce && !editing) { tx += (my * -1.4 - tx) * 0.05; ty += (mx * 2.4 - ty) * 0.05; }
    const key = cur.toFixed(4) + '|' + it.toFixed(3) + '|' + tx.toFixed(2) + '|' + ty.toFixed(2) + '|' + flat.toFixed(3) + '|' + pw;
    if (key !== lastKey) { lastKey = key; render(it); }
    const s = Math.round(target);
    if (s !== step) { step = s; onStep(); }
    requestAnimationFrame(frame);
  }

  /* =====================================================================
     8. EDIT MODE  (press E, or the Edit button)
     Changes are kept in this browser. Export gives you a new index.html.
     ===================================================================== */
  let selPage = -1, selItem = null, saveTimer = 0, clearArmed = 0, filePurpose = '';

  const toggleBtn = el('button', 'ed-toggle', 'Edit');
  toggleBtn.type = 'button';
  toggleBtn.title = 'Edit pages (E)';
  toggleBtn.addEventListener('click', () => setEditing(true));
  if (C.editButton) document.body.append(toggleBtn);

  dock = el('div', 'ed-dock',
    '<div class="ed-row">' +
      '<button data-act="prev" aria-label="Previous spread">‹</button>' +
      '<button data-act="pickL"></button><button data-act="pickR"></button>' +
      '<button data-act="next" aria-label="Next spread">›</button>' +
      '<span class="ed-sep"></span>' +
      '<button data-act="text">Add text</button>' +
      '<button data-act="image">Add image</button>' +
      '<button data-act="pageimage">Page image</button>' +
      '<label>Background <input type="color" data-act="bg" value="#ffffff"></label>' +
      '<button data-act="code">Code</button>' +
      '<button data-act="clear">Clear page</button>' +
      '<span class="ed-sep"></span>' +
      '<button data-act="export">Export</button>' +
      '<button data-act="done" class="ed-primary">Done</button>' +
    '</div>' +
    '<div class="ed-row ed-item-row" hidden>' +
      '<label>Size <input type="range" data-act="size" min="8" max="400"></label>' +
      '<label class="ed-color-label">Colour <input type="color" data-act="color"></label>' +
      '<button data-act="front">Bring to front</button>' +
      '<button data-act="delete" class="ed-warn">Delete</button>' +
    '</div>' +
    '<div class="ed-msg" aria-live="polite"></div>');
  dock.hidden = true;
  const fileInput = el('input');
  fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.hidden = true;

  const codePanel = el('div', 'ed-panel',
    '<h2></h2><p>The HTML for this page. Write sizes in px for a ' + C.pageWidth + ' × ' + C.pageHeight + ' page. ' +
    'A &lt;style&gt; inside the page only affects this page.</p>' +
    '<textarea spellcheck="false" aria-label="Page HTML"></textarea>' +
    '<div class="ed-row"><button data-act="apply" class="ed-primary">Apply</button><button data-act="closecode">Close</button>' +
    '<span class="ed-msg ed-code-msg"></span></div>');
  codePanel.hidden = true;
  const codeArea = codePanel.querySelector('textarea');

  const exportPanel = el('div', 'ed-panel small',
    '<h2>Export</h2><p>Download a new index.html with every change, then replace your old index.html with it. ' +
    'Images added in edit mode are stored inside the file. For big photos, put the file in your images folder and use data-image="images/…" in Code instead.</p>' +
    '<div class="ed-row"><button data-act="download" class="ed-primary">Download index.html</button><button data-act="copy">Copy HTML</button>' +
    '<button data-act="reset" class="ed-warn">Discard all edits</button><button data-act="closeexport">Close</button></div>' +
    '<span class="ed-msg ed-export-msg"></span>');
  exportPanel.hidden = true;
  document.body.append(dock, fileInput, codePanel, exportPanel);

  const $ = s => dock.querySelector(s);
  const msg = (t, where) => { const m = where || $('.ed-msg'); m.textContent = t; clearTimeout(m._t); if (t) m._t = setTimeout(() => { m.textContent = ''; }, 4000); };

  function setEditing(on) {
    if (on === editing) return;
    editing = on;
    document.body.classList.toggle('editing', on);
    dock.hidden = !on;
    if (!on) { select(null); codePanel.hidden = true; exportPanel.hidden = true; if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }
    pages.forEach(p => p.el.querySelectorAll('.ed-text').forEach(t => { if (on) { t.contentEditable = 'true'; t.spellcheck = false; } else t.removeAttribute('contenteditable'); }));
    pages.forEach(p => p.face.classList.remove('ed-on'));
    layout();
    if (on) onEditStep(true);
  }

  function onEditStep(force) {
    const left = 2 * step - 1, right = 2 * step;
    if (force || (selPage !== left && selPage !== right)) selectPage(right < N ? right : left);
    const pl = $('[data-act=pickL]'), pr = $('[data-act=pickR]');
    pl.hidden = left < 0; pr.hidden = right >= N;
    pl.textContent = 'Page ' + (left + 1); pr.textContent = 'Page ' + (right + 1);
    pl.setAttribute('aria-pressed', String(selPage === left)); pr.setAttribute('aria-pressed', String(selPage === right));
  }

  function selectPage(i) {
    if (i < 0 || i >= N) return;
    if (i !== selPage) select(null);
    selPage = i;
    pages.forEach((p, j) => p.face.classList.toggle('ed-on', j === i));
    $('[data-act=pickL]').setAttribute('aria-pressed', String(i === 2 * step - 1));
    $('[data-act=pickR]').setAttribute('aria-pressed', String(i === 2 * step));
    const bg = pages[i].el.style.backgroundColor;
    $('[data-act=bg]').value = toHex(bg) || (pages[i].el.classList.contains('cover') ? '#1d1d1d' : '#ffffff');
    if (!codePanel.hidden) openCode();
  }

  function select(item) {
    if (selItem) selItem.classList.remove('ed-sel');
    selItem = item;
    const row = dock.querySelector('.ed-item-row');
    row.hidden = !item;
    if (!item) return;
    item.classList.add('ed-sel');
    const isText = item.classList.contains('ed-text');
    const size = $('[data-act=size]');
    size.max = isText ? 300 : C.pageWidth * 2;
    size.value = parseFloat(isText ? item.style.fontSize : item.style.width) || (isText ? 48 : 360);
    dock.querySelector('.ed-color-label').hidden = !isText;
    if (isText) $('[data-act=color]').value = toHex(item.style.color) || '#1a1a1a';
  }

  function onEditClick(e) {
    const f = e.target.closest('.face');
    if (f) { const i = pages.findIndex(p => p.face === f); if (i !== selPage) selectPage(i); onEditStep(); }
    if (!e.target.closest('.ed-item')) select(null);
  }

  // drag things added in edit mode
  wrap.addEventListener('pointerdown', e => {
    if (!editing) return;
    const item = e.target.closest('.ed-item');
    if (!item) return;
    const f = item.closest('.face'); const i = pages.findIndex(p => p.face === f);
    if (i !== selPage) selectPage(i);
    select(item);
    if (item.isContentEditable && document.activeElement === item) return;   // already typing: let the caret move
    e.preventDefault();
    const s = pw / C.pageWidth, sx = e.clientX, sy = e.clientY;
    const ox = parseFloat(item.style.left) || 0, oy = parseFloat(item.style.top) || 0;
    let moved = false;
    const mv = ev => {
      const dx = (ev.clientX - sx) / s, dy = (ev.clientY - sy) / s;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      item.style.left = Math.round(ox + dx) + 'px';
      item.style.top = Math.round(oy + dy) + 'px';
    };
    const up = () => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      if (moved) save();
      else if (item.isContentEditable) { item.focus(); const r = document.createRange(); r.selectNodeContents(item); r.collapse(false); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  wrap.addEventListener('input', e => { if (editing && e.target.closest('.ed-item')) save(); });

  dock.addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (b) act(b.dataset.act, b); });
  codePanel.addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (b) act(b.dataset.act, b); });
  exportPanel.addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (b) act(b.dataset.act, b); });
  $('[data-act=bg]').addEventListener('input', e => { pageEl().style.background = e.target.value; save(); });
  $('[data-act=size]').addEventListener('input', e => {
    if (!selItem) return;
    if (selItem.classList.contains('ed-text')) selItem.style.fontSize = e.target.value + 'px'; else selItem.style.width = e.target.value + 'px';
    save();
  });
  $('[data-act=color]').addEventListener('input', e => { if (selItem) { selItem.style.color = e.target.value; save(); } });
  codeArea.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); act('apply'); }
    if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); }
  });

  const pageEl = () => pages[selPage].el;

  function act(name, btn) {
    const page = selPage >= 0 ? pageEl() : null;
    switch (name) {
      case 'prev': go(Math.round(target) - 1); break;
      case 'next': go(Math.round(target) + 1); break;
      case 'pickL': selectPage(2 * step - 1); break;
      case 'pickR': selectPage(2 * step); break;
      case 'text': {
        const t = el('div', 'ed-item ed-text', 'Text');
        t.style.cssText = 'left:64px;top:64px;font-size:48px';
        t.contentEditable = 'true'; t.spellcheck = false;
        page.append(t); select(t); t.focus();
        const r = document.createRange(); r.selectNodeContents(t); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        save(); break;
      }
      case 'image': filePurpose = 'item'; fileInput.value = ''; fileInput.click(); break;
      case 'pageimage': filePurpose = 'page'; fileInput.value = ''; fileInput.click(); break;
      case 'code': openCode(); break;
      case 'apply': applyCode(); break;
      case 'closecode': codePanel.hidden = true; break;
      case 'clear':
        if (!clearArmed) { clearArmed = setTimeout(() => { clearArmed = 0; btn.textContent = 'Clear page'; }, 3000); btn.textContent = 'Click again to clear'; break; }
        clearTimeout(clearArmed); clearArmed = 0; btn.textContent = 'Clear page';
        replacePage(selPage, el('article', 'page' + (page.classList.contains('cover') ? ' cover' : '')));
        msg('Page ' + (selPage + 1) + ' cleared'); break;
      case 'size': break;
      case 'front': if (selItem) { selItem.parentNode.append(selItem); save(); } break;
      case 'delete': if (selItem) { selItem.remove(); select(null); save(); } break;
      case 'export': exportPanel.hidden = false; codePanel.hidden = true; break;
      case 'closeexport': exportPanel.hidden = true; break;
      case 'download': download(); break;
      case 'copy': copyHTML(); break;
      case 'reset':
        if (!btn.dataset.armed) { btn.dataset.armed = '1'; btn.textContent = 'Click again to discard'; setTimeout(() => { delete btn.dataset.armed; btn.textContent = 'Discard all edits'; }, 3000); break; }
        try { localStorage.removeItem(KEY); } catch (e) {}
        location.reload(); break;
      case 'done': setEditing(false); break;
    }
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file || selPage < 0) return;
    if (file.size > 3e6) msg('Large image: it may be too big to keep in the browser. Export soon, or use an images/ file path in Code.');
    const reader = new FileReader();
    reader.onload = () => {
      const page = pageEl();
      if (filePurpose === 'page') { page.dataset.image = reader.result; applyMedia(); }
      else {
        const img = el('img', 'ed-item');
        img.src = reader.result; img.alt = ''; img.draggable = false;
        img.style.cssText = 'left:64px;top:64px;width:360px';
        page.append(img); select(img);
      }
      save();
    };
    reader.readAsDataURL(file);
  });

  function openCode() {
    codePanel.hidden = false; exportPanel.hidden = true;
    codePanel.querySelector('h2').textContent = 'Page ' + (selPage + 1) + ' code';
    codeArea.value = pretty(serialize(pageEl()));
    msg('', codePanel.querySelector('.ed-code-msg'));
  }
  function applyCode() {
    const a = parseArticle(codeArea.value);
    if (!a) { msg('The code has to be one <article class="page"> … </article>.', codePanel.querySelector('.ed-code-msg')); return; }
    a.classList.add('page');
    replacePage(selPage, a);
    msg('Applied', codePanel.querySelector('.ed-code-msg'));
  }
  function replacePage(i, a) {
    const p = pages[i];
    p.el.replaceWith(a);
    p.el = a;
    scopeStyles(a);
    if (editing) a.querySelectorAll('.ed-text').forEach(t => { t.contentEditable = 'true'; t.spellcheck = false; });
    select(null);
    applyMedia();
    save();
  }
  // put each child of the article on its own line so it's easier to read
  const pretty = html => html.replace(/>(<(?!\/)(?:div|img|h\d|p|a|style|section|figure|ul|ol|span|video)\b)/g, '>\n  $1').replace(/(<\/article>)$/, '\n$1');

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const data = { v: 1, pages: srcPages.map(p => { const html = serialize(p.el); return html === p.orig ? null : { orig: p.orig, html }; }) };
      try { localStorage.setItem(KEY, JSON.stringify(data)); msg('Saved in this browser'); }
      catch (e) { msg('Too big to keep in the browser. Export now so nothing is lost.'); }
    }, 350);
  }

  function buildExport() {
    const doc = new DOMParser().parseFromString(ORIGINAL_HTML, 'text/html');
    const src = doc.getElementById('book-pages');
    const arts = [...src.querySelectorAll(':scope > article, :scope > section > article')];
    arts.forEach((a, j) => {
      if (!srcPages[j]) return;
      const t = doc.createElement('template');
      t.innerHTML = pretty(serialize(srcPages[j].el)).replace(/\n/g, '\n    ');
      a.replaceWith(t.content);
    });
    doc.querySelectorAll('[aria-current]').forEach(n => n.removeAttribute('aria-current'));
    return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML + '\n';
  }
  function download() {
    const m = exportPanel.querySelector('.ed-export-msg');
    try {
      const url = URL.createObjectURL(new Blob([buildExport()], { type: 'text/html' }));
      const a = el('a'); a.href = url; a.download = 'index.html'; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      msg('If nothing downloaded, use Copy HTML and paste it into index.html.', m);
    } catch (e) { msg('Download is blocked here. Use Copy HTML instead.', m); }
  }
  function copyHTML() {
    const m = exportPanel.querySelector('.ed-export-msg');
    const html = buildExport();
    const fallback = () => {
      codePanel.hidden = false; exportPanel.hidden = true;
      codePanel.querySelector('h2').textContent = 'Full index.html';
      codeArea.value = html; codeArea.focus(); codeArea.select();
      msg('Press ⌘C / Ctrl+C to copy.', codePanel.querySelector('.ed-code-msg'));
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(html).then(() => msg('Copied. Paste it into index.html.', m), fallback);
    else fallback();
  }
  function toHex(c) {
    const m = String(c || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return m ? '#' + [m[1], m[2], m[3]].map(n => (+n).toString(16).padStart(2, '0')).join('') : (/^#[0-9a-f]{6}$/i.test(c) ? c : '');
  }

  /* ---------- start ---------- */
  layout();
  readScroll();
  cur = target;
  jumpToHash(true);
  requestAnimationFrame(frame);
})();
