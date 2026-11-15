(() => {
  'use strict';

  const data = JSON.parse(document.getElementById('site-data').textContent);
  const root = document.documentElement;
  const page = document.getElementById('page');
  const gallery = document.getElementById('gallery');
  const work = document.getElementById('work');
  const workBody = document.getElementById('work-body');
  const catbar = document.getElementById('catbar');
  const covers = document.getElementById('nav-covers');
  const mainNavs = {
    path: document.getElementById('nav-paths'),
    covers,
    index: document.getElementById('nav-side'),
  };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // History can be restricted when the page runs inside a sandboxed preview.
  const setHistory = (method, url, state = null) => {
    try { history[method](state, '', url); return true; } catch (e) { return false; }
  };

  /* ------------------------------------------------------------ views */

  // Stories: a shoot with its write-up. A story that names a category (a client shoot
  // under Business, say) shows there as a card; its photos then live inside the story
  // instead of in that category's grid. Every story photo links to its story from the
  // viewer ("behind the shot").
  const stories = (data.rolls || []).map((r) => ({ ...r, label: r.title, isStory: true }));
  const categories = data.categories.map((c) => {
    const own = stories.filter((st) => st.category === c.id);
    const inStory = new Set(own.map((st) => st.id));
    return { ...c, every: c.photos, stories: own, photos: c.photos.filter((p) => !inStory.has(p.r)) };
  }).filter((c) => c.photos.length || c.stories.length);
  const views = [];
  if (categories.length > 1) {
    const all = interleave(categories.map((c) => c.every));
    // Give the "all" card a photo no category card is already using.
    const used = new Set(categories.map((c) => c.cover));
    const pick = all.find((p) => !used.has(p.g)) || all[0];
    views.push({ id: 'all', label: 'All', photos: all, cover: pick.g, coverColor: pick.c });
  }
  categories.forEach((c) => views.push({
    id: c.id, label: c.label, photos: c.photos, stories: c.stories, cover: c.cover, coverColor: c.coverColor,
  }));
  const findView = (id) => views.find((v) => v.id === id) || stories.find((v) => v.id === id);
  if (data.videos.length) {
    views.push({
      id: 'video', label: 'Video', videos: data.videos,
      cover: 'https://i.ytimg.com/vi/' + data.videos[0].id + '/hqdefault.jpg', coverColor: '#1b1b1a',
    });
  }

  let current = null;

  function interleave(lists) {
    const out = [];
    const longest = Math.max(0, ...lists.map((l) => l.length));
    for (let i = 0; i < longest; i++) {
      for (const list of lists) if (i < list.length) out.push(list[i]);
    }
    return out;
  }

  function hashFor(view, photo) {
    if (!photo && view === views[0]) return location.pathname + location.search;
    return '#/' + view.id + (photo ? '/' + photo.id : '');
  }

  const countOf = (view) => (view.photos || view.videos).length
    + (view.stories || []).reduce((n, st) => n + st.photos.length, 0);
  const nameOf = (view) => view.label.toLowerCase();

  /* ------------------------------------------------------------ category navigation */

  // One link shape everywhere: "/street" with a count. The slash turns
  // Safelight on the active category, echoing the slash in the logo.
  function catLink(view) {
    const link = document.createElement('a');
    link.className = 'cat';
    link.href = '#/' + view.id;
    link.dataset.view = view.id;
    link.setAttribute('aria-label', view.label + ', ' + countOf(view) + (view.videos ? ' videos' : ' photos'));
    const slash = document.createElement('span');
    slash.className = 'sl';
    slash.setAttribute('aria-hidden', 'true');
    slash.textContent = '/';
    const name = document.createElement('span');
    name.textContent = nameOf(view);
    const count = document.createElement('span');
    count.className = 'n';
    count.setAttribute('aria-hidden', 'true');
    count.textContent = countOf(view);
    link.append(slash, name, count);
    return link;
  }

  function renderNavs() {
    if (views.length < 2) {
      root.classList.add('single-category');
      return;
    }
    for (const list of document.querySelectorAll('[data-nav-list]')) {
      // One orange slash per list travels to whichever category is active.
      const ray = document.createElement('span');
      ray.className = 'cat-ray';
      ray.setAttribute('aria-hidden', 'true');
      ray.textContent = '/';
      list.replaceChildren(...views.map(catLink), ray);
      list.classList.add('has-ray');
    }
    covers.style.setProperty('--n', views.length);
    covers.replaceChildren(...views.map((view) => {
      const card = catLink(view);
      card.classList.add('cover');
      card.style.backgroundColor = view.coverColor || '';
      const img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.src = view.cover;
      const label = document.createElement('span');
      label.className = 'cover-label';
      label.append(...card.childNodes);
      card.append(img, label);
      return card;
    }));
  }

  function markActive(view) {
    const navId = view.isStory ? view.category || '' : view.id;
    for (const link of document.querySelectorAll('a[data-view]')) {
      if (link.dataset.view === navId && !link.closest('.roll-head')) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
    // Keep the active category visible in the compact bar's scrolling row.
    const barLinks = catbar.querySelector('.catbar-links');
    const barActive = barLinks && barLinks.querySelector('[aria-current="true"]');
    if (barActive) {
      barLinks.scrollTo({ left: Math.max(0, barActive.offsetLeft - 24), behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    }
  }

  // Moves each list's orange slash onto the active category's slash.
  function positionRays(animate) {
    for (const list of document.querySelectorAll('.has-ray')) {
      if (!list.getClientRects().length) continue; // this layout isn't showing it
      const ray = list.querySelector('.cat-ray');
      const target = list.querySelector('.cat[aria-current="true"] .sl');
      if (!ray || !target) continue;
      const box = list.getBoundingClientRect();
      const spot = target.getBoundingClientRect();
      const x = spot.left - box.left - list.clientLeft + list.scrollLeft;
      const y = spot.top - box.top - list.clientTop + list.scrollTop;
      const instant = !animate || reduceMotion.matches || !ray.classList.contains('is-placed');
      if (instant) ray.style.transition = 'none';
      ray.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
      ray.classList.add('is-placed');
      if (instant) { void ray.offsetWidth; ray.style.transition = ''; }
    }
  }

  let switchToken = 0;
  function show(view, { animate = false } = {}) {
    const previous = current;
    current = view;
    markActive(view);
    positionRays(animate);
    // Moving right through the list slides photos left, and back again.
    const place = (v) => (v && v.isStory ? views.indexOf(findView(v.category)) + 0.5 : views.indexOf(v));
    const direction = previous ? Math.sign(place(view) - place(previous)) || 1 : 1;
    const token = ++switchToken;
    const render = () => {
      if (token !== switchToken) return;
      renderStoryHead(view);
      renderStoryCards(view, animate ? direction : 0);
      if (view.videos) renderVideos(view, animate ? direction : 0);
      else renderPhotos(view, animate ? direction : 0);
    };
    if (animate && !reduceMotion.matches && gallery.children.length) leaveGallery(direction).then(render);
    else render();
  }

  // The current photos slip out toward the side you're moving away from.
  function leaveGallery(direction) {
    const items = [...gallery.children];
    gallery.classList.add('is-switching');
    const moves = items.slice(0, 40).map((el, i) => el.animate(
      [{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(' + (-direction * 28) + 'px)' }],
      { duration: 190, delay: Math.min(i, 10) * 9, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
    ));
    items.slice(40).forEach((el) => { el.style.opacity = '0'; });
    return Promise.all(moves.map((m) => m.finished.catch(() => {})));
  }

  // After a switch the gallery's height glides to the new size instead of jumping.
  let settleTimer = 0;
  function settleGallery() {
    clearTimeout(settleTimer);
    gallery.classList.add('is-switching');
    settleTimer = setTimeout(() => gallery.classList.remove('is-switching'), 650);
  }

  function navStyle() {
    return mainNavs[root.dataset.nav] ? root.dataset.nav : 'path';
  }

  // The compact bar slides in once the main category nav has scrolled away,
  // and slides out again after the gallery ends.
  let barFrame = 0;
  function updateBar() {
    barFrame = 0;
    if (views.length < 2) return;
    const nav = mainNavs[navStyle()];
    const navBox = nav.getBoundingClientRect();
    const workBox = work.getBoundingClientRect();
    const show = navBox.bottom < 0 && workBox.bottom > 160;
    catbar.classList.toggle('is-shown', show);
    catbar.inert = !show;
  }
  const queueBar = () => { if (!barFrame) barFrame = requestAnimationFrame(updateBar); };
  window.addEventListener('scroll', queueBar, { passive: true });
  window.addEventListener('resize', queueBar);

  function scrollToGallery() {
    const offset = catbar.classList.contains('is-shown') || navStyle() === 'covers' ? catbar.offsetHeight + 12 : 12;
    const box = workBody.getBoundingClientRect();
    if (box.top >= offset && box.top < innerHeight * 0.55) return; // already in view
    glideTo(box.top + scrollY - offset);
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-view]');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const view = findView(link.dataset.view);
    if (!view) return;
    setHistory('pushState', hashFor(view));
    if (view !== current) show(view, { animate: true });
    if (link.closest('#nav-covers') || link.closest('#catbar') || link.closest('.story-card') || link.closest('.story-head')
      || work.getBoundingClientRect().top < 0) {
      scrollToGallery();
    }
  });

  function setNavStyle(style) {
    root.dataset.nav = mainNavs[style] ? style : 'path';
    lastWidth = 0;
    layout();
    positionRays(false);
    updateBar();
  }

  /* ------------------------------------------------------------ smooth scrolling */

  // Work, About, Contact and other in-page links glide to their section
  // with an ease-in-out curve instead of jumping.
  let scrollRun = 0;
  function glideTo(targetY) {
    const run = ++scrollRun;
    const maxY = document.documentElement.scrollHeight - innerHeight;
    targetY = Math.max(0, Math.min(maxY, targetY));
    const startY = scrollY;
    const distance = targetY - startY;
    if (reduceMotion.matches || Math.abs(distance) < 2) { window.scrollTo(0, targetY); return; }
    // On phones the browser's own smooth scroll runs alongside the touch scrolling
    // and stays smoother than stepping the page from a script.
    if (window.matchMedia('(pointer: coarse)').matches) { window.scrollTo({ top: targetY, behavior: 'smooth' }); return; }
    const duration = Math.min(1200, Math.max(650, Math.abs(distance) * 0.6));
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const stop = () => { scrollRun++; };
    window.addEventListener('wheel', stop, { once: true, passive: true });
    window.addEventListener('touchstart', stop, { once: true, passive: true });
    const begin = performance.now();
    const frame = (now) => {
      if (run !== scrollRun) return; // the visitor took over, or another glide started
      const t = Math.min(1, (now - begin) / duration);
      window.scrollTo(0, startY + distance * ease(t));
      if (t < 1) requestAnimationFrame(frame);
      else {
        window.removeEventListener('wheel', stop);
        window.removeEventListener('touchstart', stop);
      }
    };
    requestAnimationFrame(frame);
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    const id = decodeURIComponent(link.getAttribute('href').slice(1));
    if (!id || id.startsWith('/')) return; // category links are handled above
    let target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    // "Work" lands on the category words when they sit just above the photos.
    if (id === 'work' && navStyle() === 'path' && views.length > 1) target = mainNavs.path;
    const offset = id === 'top' ? 0 : catbar.offsetHeight + 20;
    glideTo(id === 'top' ? 0 : target.getBoundingClientRect().top + scrollY - offset);
    // Move keyboard focus along with the view, without a second jump.
    const focusTarget = document.getElementById(id);
    if (!focusTarget.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|TEXTAREA|SELECT)$/.test(focusTarget.tagName)) {
      focusTarget.setAttribute('tabindex', '-1');
    }
    focusTarget.focus({ preventScroll: true });
  });
  // Lets a preview page switch layouts without reloading.
  window.addEventListener('chiefray:nav', (event) => setNavStyle(event.detail));

  /* ------------------------------------------------------------ photo grid */

  // Marks a new photo or video to slide in from the side you're moving toward.
  function enter(el, index, direction) {
    el.classList.add('is-entering');
    el.style.setProperty('--d', Math.min(index, 14) * 26 + 'ms');
    el.style.setProperty('--dx', direction * 36 + 'px');
    el.addEventListener('animationend', () => el.classList.remove('is-entering'), { once: true });
  }

  function renderPhotos(view, direction) {
    const animate = Boolean(direction) && !reduceMotion.matches;
    gallery.className = 'gallery';
    gallery.replaceChildren();
    const frag = document.createDocumentFragment();
    view.photos.forEach((photo, index) => {
      const tile = document.createElement('a');
      tile.className = 'tile';
      tile.href = photo.f;
      tile.dataset.index = index;
      tile.dataset.id = photo.id;
      tile.style.backgroundColor = photo.c;
      if (animate) enter(tile, index, direction);
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = photo.alt;
      img.width = photo.w;
      img.height = photo.h;
      img.addEventListener('load', () => tile.classList.add('is-loaded'), { once: true });
      img.src = photo.g;
      tile.append(img);
      frag.append(tile);
    });
    gallery.append(frag);
    if (animate) settleGallery();
    lastWidth = 0;
    layout();
  }

  let lastWidth = 0;

  // Justified rows: every photo keeps its shape, every row fills the width.
  function layout() {
    if (!current || !current.photos) return;
    const width = gallery.clientWidth;
    if (!width) return;
    lastWidth = width;
    const gap = width < 720 ? 4 : 8;
    // Row height to aim for. On phones 240 puts two upright photos side by side.
    const target = width < 520 ? 240 : width < 900 ? 290 : width < 1500 ? 380 : 440;
    const tiles = gallery.children;
    const photos = current.photos;
    let top = 0;
    let row = [];
    let aspectSum = 0;

    const placeRow = (height, stretch) => {
      let left = 0;
      const h = Math.round(height);
      row.forEach((item, i) => {
        let w = Math.round(item.aspect * height);
        if (stretch && i === row.length - 1) w = width - left;
        const style = item.el.style;
        style.left = left + 'px';
        style.top = top + 'px';
        style.width = w + 'px';
        style.height = h + 'px';
        left += w + gap;
      });
      top += h + gap;
      row = [];
      aspectSum = 0;
    };

    for (let i = 0; i < photos.length; i++) {
      const aspect = photos[i].w / photos[i].h;
      row.push({ el: tiles[i], aspect });
      aspectSum += aspect;
      const free = width - gap * (row.length - 1);
      if (aspectSum * target >= free) placeRow(free / aspectSum, true);
    }
    if (row.length) placeRow(target, false);
    gallery.style.height = Math.max(0, top - gap) + 'px';
  }

  new ResizeObserver(() => {
    if (gallery.clientWidth !== lastWidth) layout();
  }).observe(gallery);

  gallery.addEventListener('click', (event) => {
    const tile = event.target.closest('a.tile');
    if (!tile || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openViewer(current, Number(tile.dataset.index), { opener: tile });
  });

  /* ------------------------------------------------------------ stories */

  // Cards for the category's stories sit above its photos; a story's own page
  // (title, details, write-up) sits above the story's photos.
  const storyRow = document.createElement('section');
  storyRow.className = 'story-row';
  storyRow.hidden = true;
  storyRow.setAttribute('aria-label', 'Stories');
  const storyHead = document.createElement('header');
  storyHead.className = 'story-head';
  storyHead.hidden = true;
  gallery.before(storyRow, storyHead);

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  const slashed = (cls, text) => {
    const node = el('span', cls);
    node.append(el('span', 'sl', '/'), text);
    return node;
  };

  function renderStoryHead(view) {
    if (!view.isStory) {
      storyHead.hidden = true;
      storyHead.replaceChildren();
      return;
    }
    const home = findView(view.category) || views[0];
    const back = el('a', 'cat story-back');
    back.href = '#/' + home.id;
    back.dataset.view = home.id;
    back.append(el('span', 'sl', '/'), home.label.toLowerCase());
    const title = el('h2', 'story-title', view.title);
    title.id = 'story-title';
    const meta = el('dl', 'story-meta');
    for (const [label, value] of [['client', view.client], ['place', view.place], ['date', view.date],
      ['shot on', (view.shot || []).join(', ')]]) {
      if (!value) continue;
      const row = el('div', 'lb-set');
      row.append(el('dt', null, label), el('dd', null, value));
      meta.append(row);
    }
    const story = el('div', 'story-text');
    for (const text of view.story || []) story.append(el('p', null, text));
    storyHead.replaceChildren(back, slashed('story-kicker', 'the story'), title,
      ...(meta.children.length ? [meta] : []), ...(story.children.length ? [story] : []));
    storyHead.setAttribute('aria-labelledby', 'story-title');
    storyHead.hidden = false;
  }

  function renderStoryCards(view, direction) {
    const list = view.isStory ? [] : view.stories || [];
    storyRow.hidden = !list.length;
    if (!list.length) { storyRow.replaceChildren(); return; }
    const animate = Boolean(direction) && !reduceMotion.matches;
    const grid = el('div', 'story-grid');
    grid.append(...list.map((st, index) => {
      const card = el('a', 'story-card');
      card.href = '#/' + st.id;
      card.dataset.view = st.id;
      if (animate) enter(card, index, direction);
      const frame = el('span', 'story-cover');
      frame.style.backgroundColor = st.coverColor || '';
      const img = el('img');
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.src = st.cover;
      frame.append(img, el('span', 'story-count', st.photos.length + ' photos'));
      const where = [st.place, st.date].filter(Boolean).join(', ');
      card.append(frame, slashed('story-kicker', st.client || 'story'), el('span', 'story-name', st.title),
        ...(where ? [el('span', 'story-where', where)] : []), el('span', 'story-open', 'Read the story'));
      return card;
    }));
    storyRow.replaceChildren(grid, ...(view.photos.length ? [slashed('story-more', 'more photos')] : []));
  }

  /* ------------------------------------------------------------ videos */

  function renderVideos(view, direction) {
    const animate = Boolean(direction) && !reduceMotion.matches;
    gallery.className = 'videos';
    gallery.style.height = '';
    gallery.replaceChildren();
    for (const [index, video] of view.videos.entries()) {
      const figure = document.createElement('figure');
      figure.className = 'video' + (video.vertical ? ' is-vertical' : '');
      if (animate) enter(figure, index, direction);
      const frame = document.createElement('div');
      frame.className = 'video-frame';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'video-play';
      button.setAttribute('aria-label', 'Play ' + (video.title || 'video'));
      const poster = document.createElement('img');
      poster.loading = 'lazy';
      poster.alt = '';
      poster.src = 'https://i.ytimg.com/vi/' + video.id + '/hqdefault.jpg';
      const play = document.createElement('span');
      play.className = 'play';
      play.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
      button.append(poster, play);
      button.addEventListener('click', () => {
        const iframe = document.createElement('iframe');
        iframe.src = 'https://www.youtube-nocookie.com/embed/' + video.id + '?autoplay=1&rel=0&playsinline=1';
        iframe.title = video.title || 'Video';
        iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
        iframe.allowFullscreen = true;
        button.replaceWith(iframe);
        iframe.focus();
      });
      frame.append(button);
      figure.append(frame);
      if (video.title) {
        const caption = document.createElement('figcaption');
        caption.textContent = video.title;
        figure.append(caption);
      }
      gallery.append(figure);
    }
  }

  /* ------------------------------------------------------------ viewer */

  const viewer = {
    el: document.getElementById('lightbox'),
    open: false,
    pushed: false,
    view: null,
    index: 0,
    opener: null,
    token: 0,
  };
  const vImg = viewer.el.querySelector('.lb-img');
  const vStage = viewer.el.querySelector('.lb-stage');
  const vCount = viewer.el.querySelector('.lb-count');
  const vTitle = viewer.el.querySelector('.lb-title');
  const vSettings = viewer.el.querySelector('.lb-settings');
  const vRoll = viewer.el.querySelector('.lb-roll');
  // "From the roll": close the photo and open the shoot it came from.
  vRoll.addEventListener('click', (event) => {
    event.preventDefault();
    const roll = findView(vRoll.dataset.roll);
    if (!roll) return;
    closeViewer();
    setHistory('pushState', hashFor(roll));
    show(roll, { animate: true });
    scrollToGallery();
  });
  const vClose = viewer.el.querySelector('.lb-close');
  const vPrev = viewer.el.querySelector('.lb-prev');
  const vNext = viewer.el.querySelector('.lb-next');

  function openViewer(view, index, { fromHistory = false, opener = null } = {}) {
    viewer.view = view;
    viewer.index = index;
    const photo = view.photos[index];
    if (!viewer.open) {
      viewer.open = true;
      viewer.opener = opener;
      viewer.el.hidden = false;
      page.inert = true;
      root.classList.add('lb-open');
      viewer.pushed = fromHistory ? false : setHistory('pushState', hashFor(view, photo), { viewer: true });
      requestAnimationFrame(() => viewer.el.classList.add('is-visible'));
      vClose.focus({ preventScroll: true });
    } else {
      setHistory('replaceState', hashFor(view, photo), history.state);
    }
    const single = view.photos.length < 2;
    vPrev.hidden = single;
    vNext.hidden = single;
    showPhoto();
  }

  function showPhoto() {
    const list = viewer.view.photos;
    const photo = list[viewer.index];
    vCount.textContent = list.length > 1 ? (viewer.index + 1) + ' of ' + list.length : '';
    vTitle.textContent = photo.t || '';
    vSettings.replaceChildren(...(photo.x || []).map((item) => {
      const [label, value] = Array.isArray(item) ? item : ['', item];
      const row = document.createElement('div');
      row.className = 'lb-set';
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      // "f/2.8" gets the logo's orange slash.
      const parts = String(value).split(/(f\/)/);
      for (const part of parts) {
        if (part === 'f/') {
          const sl = document.createElement('span');
          sl.className = 'sl';
          sl.textContent = '/';
          dd.append('f', sl);
        } else if (part) dd.append(part);
      }
      if (label) row.append(dt);
      row.append(dd);
      return row;
    }));
    const roll = photo.r && photo.r !== viewer.view.id ? findView(photo.r) : null;   // its story
    vRoll.hidden = !roll;
    if (roll) {
      vRoll.href = '#/' + roll.id;
      vRoll.dataset.roll = roll.id;
      vRoll.lastChild.textContent = roll.title;
    }
    vImg.alt = photo.alt;
    vImg.style.backgroundColor = photo.c;
    fitImage();

    const token = ++viewer.token;
    vImg.src = photo.g;
    const full = new Image();
    full.src = photo.f;
    full.decode().catch(() => {}).then(() => {
      if (token === viewer.token) vImg.src = photo.f;
    });
    for (const step of [1, -1]) {
      const next = list[(viewer.index + step + list.length) % list.length];
      if (next !== photo) new Image().src = next.f;
    }
  }

  function fitImage() {
    if (!viewer.open) return;
    const photo = viewer.view.photos[viewer.index];
    const box = vStage.getBoundingClientRect();
    const styles = getComputedStyle(vStage);
    const maxW = box.width - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);
    const maxH = box.height;
    const aspect = photo.w / photo.h;
    let w = Math.min(maxW, photo.w);
    let h = w / aspect;
    if (h > maxH) { h = maxH; w = h * aspect; }
    vImg.style.width = Math.floor(w) + 'px';
    vImg.style.height = Math.floor(h) + 'px';
  }

  function step(direction) {
    const list = viewer.view.photos;
    if (list.length < 2) return;
    openViewer(viewer.view, (viewer.index + direction + list.length) % list.length);
  }

  function requestClose() {
    if (viewer.pushed) {
      history.back(); // popstate closes the viewer, so the back button and this stay in sync
    } else {
      setHistory('replaceState', hashFor(viewer.view));
      closeViewer();
    }
  }

  function closeViewer() {
    if (!viewer.open) return;
    viewer.open = false;
    viewer.pushed = false;
    viewer.token++;
    viewer.el.classList.remove('is-visible');
    viewer.el.hidden = true;
    page.inert = false;
    root.classList.remove('lb-open');
    const photo = viewer.view.photos[viewer.index];
    const tile = viewer.view === current
      ? gallery.querySelector('[data-id="' + CSS.escape(photo.id) + '"]')
      : null;
    const target = tile || viewer.opener;
    if (target) {
      target.focus({ preventScroll: true });
      const rect = target.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > innerHeight) target.scrollIntoView({ block: 'center' });
    }
  }

  vClose.addEventListener('click', requestClose);
  vPrev.addEventListener('click', () => step(-1));
  vNext.addEventListener('click', () => step(1));
  vStage.addEventListener('click', (event) => {
    if (event.target === vStage) requestClose();
  });

  document.addEventListener('keydown', (event) => {
    if (!viewer.open) return;
    if (event.key === 'Escape') { event.preventDefault(); requestClose(); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
  });

  let touch = null;
  viewer.el.addEventListener('touchstart', (event) => {
    touch = event.touches.length === 1
      ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
      : null;
  }, { passive: true });
  viewer.el.addEventListener('touchend', (event) => {
    if (!touch || event.touches.length) { touch = null; return; }
    const end = event.changedTouches[0];
    const dx = end.clientX - touch.x;
    const dy = end.clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) step(dx < 0 ? 1 : -1);
    else if (dy > 90 && dy > Math.abs(dx) * 1.5) requestClose();
  }, { passive: true });

  window.addEventListener('resize', fitImage);

  /* ------------------------------------------------------------ routing */

  function route() {
    const hash = decodeURIComponent(location.hash);
    if (!hash.startsWith('#/')) {
      if (viewer.open) closeViewer();
      if (!current) show(views[0]);
      return;
    }
    const [viewId, photoId] = hash.slice(2).split('/');
    const view = findView(viewId) || views[0];
    if (view !== current) show(view, { animate: Boolean(current) });
    if (photoId && view.photos) {
      const index = view.photos.findIndex((p) => p.id === photoId);
      if (index >= 0) {
        if (!viewer.open || viewer.view !== view || viewer.index !== index) {
          openViewer(view, index, { fromHistory: true });
        }
        return;
      }
    }
    if (viewer.open) closeViewer();
  }

  window.addEventListener('popstate', route);
  window.addEventListener('hashchange', route);

  /* ------------------------------------------------------------ start */

  renderNavs();
  if (!views.length) {
    root.classList.add('single-category');
    gallery.innerHTML = '<p class="gallery-note">New work is on the way. Check back soon.</p>';
  } else {
    route();
  }
  updateBar();

  // Re-seat the travelling slashes whenever the category lists change size,
  // including once the logo font has loaded and the words get their real widths.
  const seat = () => positionRays(false);
  const listWatcher = new ResizeObserver(seat);
  document.querySelectorAll('.has-ray').forEach((list) => listWatcher.observe(list));
  if (document.fonts) document.fonts.ready.then(seat);
})();
