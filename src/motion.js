/* Logo motion and fade on scroll.
   - Viewfinder intro when the page opens: framing guides, letters drop in, the
     shutter blinks, the slash is there.
   - Autofocus every 7 seconds (and when the logo is tapped): the word blurs, the
     brackets hunt, then it snaps sharp, the brackets lock in orange and the framed
     area blinks dark like the shutter firing.
   - Things fade and rise in as they come up the screen and fade out as they leave.
   All of it is off when "motion" is false in site.json or the visitor has asked
   their device to reduce motion. */
(() => {
  const root = document.documentElement;
  const stopWaiting = () => root.classList.remove('intro-wait');
  if (root.dataset.motion === 'off' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { stopWaiting(); return; }
  const svg = document.querySelector('.wordmark .logo');
  if (!svg || !svg.animate) { stopWaiting(); return; }

  const NS = 'http://www.w3.org/2000/svg';
  const wordmark = svg.parentElement;
  const lts = svg.querySelector('.lts');
  const L = [...svg.querySelectorAll('.lt')];
  const line = svg.querySelector('.slash');
  const sg = document.createElementNS(NS, 'g');
  sg.setAttribute('class', 'sl-g');
  line.before(sg);
  sg.append(line);
  let defs = svg.querySelector('defs');
  if (!defs) { defs = document.createElementNS(NS, 'defs'); svg.prepend(defs); }

  const accent = () => getComputedStyle(line).stroke;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const mk = (tag, attrs, parent = svg) => {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    parent.append(el);
    return el;
  };
  // Keyframes from [ms, props] pairs on a D-ms timeline.
  const tl = (el, D, steps, opts = {}) =>
    el.animate(steps.map(([t, p]) => ({ offset: t / D, ...p })), { duration: D, fill: 'none', ...opts });
  const flash = (at) => setTimeout(() => line.animate(
    [{ strokeWidth: '7.5px' }, { strokeWidth: '12px', stroke: '#fff1e8', offset: 0.2 }, { strokeWidth: '7.5px' }],
    { duration: 480, easing: 'ease-out' }), at);
  // The frame around the word, in the logo's own units.
  const B = { x0: -2, x1: 430, y0: -84, y1: 22, c: 16 };
  const corners = () =>
    `M${B.x0} ${B.y0 + B.c}V${B.y0}H${B.x0 + B.c} M${B.x1 - B.c} ${B.y0}H${B.x1}V${B.y0 + B.c} ` +
    `M${B.x1} ${B.y1 - B.c}V${B.y1}H${B.x1 - B.c} M${B.x0 + B.c} ${B.y1}H${B.x0}V${B.y1 - B.c}`;
  const centred = (el) => { el.style.transformBox = 'fill-box'; el.style.transformOrigin = '50% 50%'; return el; };
  const resetOrigins = () => L.forEach((l) => (l.style.transformOrigin = ''));

  /* ------------------------------------------------ intro: viewfinder */
  async function viewfinder() {
    const D = 2100;
    const w = B.x1 - B.x0, h = B.y1 - B.y0;
    const grid = centred(mk('path', { class: 'vf-grid', d:
      `M${B.x0 + w / 3} ${B.y0}V${B.y1} M${B.x0 + 2 * w / 3} ${B.y0}V${B.y1} ` +
      `M${B.x0} ${B.y0 + h / 3}H${B.x1} M${B.x0} ${B.y0 + 2 * h / 3}H${B.x1}` }));
    const af = centred(mk('path', { class: 'af', d: corners() }));
    tl(grid, D, [[0, { opacity: 0, transform: 'scale(1.06)' }], [350, { opacity: 0.55, transform: 'none' }],
      [1180, { opacity: 0.55 }], [1190, { opacity: 0 }], [D, { opacity: 0 }]]);
    tl(af, D, [[0, { opacity: 0, transform: 'scale(1.15)' }], [300, { opacity: 0.9, transform: 'scale(1.03)' }],
      [900, { opacity: 0.9, transform: 'scale(1)', stroke: accent() }], [1180, { opacity: 1, stroke: accent() }],
      [1190, { opacity: 0 }], [D, { opacity: 0 }]]);
    L.forEach((l, i) => {
      l.style.transformOrigin = '50% 100%';
      l.animate([{ opacity: 0, transform: 'translateY(-14px) scale(.92)' }, { opacity: 1, transform: 'translateY(2px)', offset: 0.6 },
        { opacity: 1, transform: 'none' }], { duration: 420, delay: 250 + i * 70, easing: 'cubic-bezier(.2,.7,.3,1.4)', fill: 'backwards' });
    });
    tl(sg, D, [[0, { opacity: 0 }], [1180, { opacity: 0 }], [1190, { opacity: 1 }], [D, { opacity: 1 }]]);
    stopWaiting();                         // the animations above now keep things hidden until their turn
    const blink = document.createElement('div');
    blink.className = 'shutter-blink';
    document.body.append(blink);
    blink.animate([{ opacity: 0 }, { opacity: 0, offset: 1100 / D }, { opacity: 0.92, offset: 1160 / D },
      { opacity: 0.92, offset: 1220 / D }, { opacity: 0, offset: 1420 / D }, { opacity: 0 }], { duration: D });
    setTimeout(() => wordmark.animate([{ transform: 'scale(1.025)' }, { transform: 'none' }],
      { duration: 600, easing: 'cubic-bezier(.2,.7,.2,1)' }), 1220);
    flash(1250);
    await wait(D + 40);
    grid.remove(); af.remove(); blink.remove(); resetOrigins();
  }

  /* ------------------------------------------------ loop: autofocus */
  // A blurred copy of the letters sits over the logo. Focus "hunting" fades between
  // the sharp letters and this copy, which the phone can do without redrawing the blur.
  const soft = svg.cloneNode(true);
  soft.querySelectorAll('title, defs, line, .sl-g').forEach((n) => n.remove());
  soft.removeAttribute('role');
  soft.removeAttribute('aria-labelledby');
  soft.setAttribute('aria-hidden', 'true');
  soft.setAttribute('class', 'logo logo-soft');
  wordmark.append(soft);
  const sizeSoft = () => { soft.style.filter = `blur(${(svg.clientWidth / 436 * 5.5).toFixed(1)}px)`; };
  sizeSoft();
  new ResizeObserver(sizeSoft).observe(svg);

  async function autofocus() {
    const D = 2300;
    // How far out of focus, 0 to 1: out, nearly in, out a little, then locks sharp.
    const hunt = [[0, 0], [320, 1], [700, 0.18], [950, 0.5], [1250, 0.1], [1420, 0.24], [1560, 0], [D, 0]];
    tl(soft, D, hunt.map(([t, v]) => [t, { opacity: v, transform: `scale(${1 + v * 0.03})`, easing: 'ease-in-out' }]));
    tl(lts, D, hunt.map(([t, v]) => [t, { opacity: 1 - v * 0.9, easing: 'ease-in-out' }]));
    const af = centred(mk('path', { class: 'af', d: corners() }));
    // The slash turns in clicks, like a focus ring.
    tl(sg, D, [[0, { transform: 'none' }], [320, { transform: 'rotate(-14deg)', easing: 'steps(3, end)' }],
      [700, { transform: 'rotate(9deg)', easing: 'steps(2, end)' }], [950, { transform: 'rotate(-6deg)', easing: 'steps(2, end)' }],
      [1250, { transform: 'rotate(4deg)', easing: 'steps(2, end)' }], [1420, { transform: 'rotate(-2deg)', easing: 'cubic-bezier(.3,0,.2,1.5)' }],
      [1560, { transform: 'none' }], [D, { transform: 'none' }]]);
    tl(af, D, [[0, { opacity: 0, transform: 'scale(1.12)' }], [250, { opacity: 0.9, transform: 'scale(1.04)' }], [500, { opacity: 0.35 }],
      [700, { opacity: 0.9 }], [950, { opacity: 0.35 }], [1250, { opacity: 0.9 }],
      [1560, { opacity: 1, transform: 'scale(1)', stroke: accent(), strokeWidth: '3px' }], [1700, { opacity: 1, stroke: accent(), strokeWidth: '3px' }],
      [D, { opacity: 0, transform: 'scale(.98)', stroke: accent() }]]);
    flash(1560);
    // Focus locked, so the shutter fires: the framed area blinks dark for a moment
    // (only inside the brackets), then the logo settles.
    const shot = mk('rect', { x: B.x0, y: B.y0, width: B.x1 - B.x0, height: B.y1 - B.y0, fill: '#0d0d0c', opacity: 0 });
    shot.animate([{ opacity: 0 }, { opacity: 0.9, offset: 0.25 }, { opacity: 0.9, offset: 0.45 }, { opacity: 0 }],
      { duration: 260, delay: 1620, easing: 'ease-out' }).finished.then(() => shot.remove());
    setTimeout(() => wordmark.animate([{ transform: 'scale(1.02)' }, { transform: 'none' }],
      { duration: 500, easing: 'cubic-bezier(.2,.7,.2,1)' }), 1780);
    await wait(D);
    af.remove();
  }

  /* ------------------------------------------------ timing */
  let busy = false, timer = 0, logoOnScreen = true;
  const run = async (fn) => {
    if (busy) return;
    busy = true;
    try { await fn(); } finally { busy = false; }
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(tick, 7000); };
  let lastScroll = 0;
  window.addEventListener('scroll', () => { lastScroll = performance.now(); }, { passive: true });
  async function tick() {
    // Only when someone can see it: tab open, logo on screen, no photo open, and not
    // in the middle of a scroll (wait for it to settle).
    if (performance.now() - lastScroll < 900) { clearTimeout(timer); timer = setTimeout(tick, 1200); return; }
    if (!document.hidden && logoOnScreen && !root.classList.contains('lb-open')) await run(autofocus);
    schedule();
  }
  new IntersectionObserver(([e]) => { logoOnScreen = e.isIntersecting; }).observe(svg);
  svg.addEventListener('click', () => { clearTimeout(timer); run(autofocus).then(schedule); });

  // The intro plays when the page opens at the top, not on a link straight to a photo.
  const deepLink = /^#\/[^/]+\/.+/.test(location.hash);
  if (window.scrollY < 120 && !deepLink) run(viewfinder).then(schedule);
  else { stopWaiting(); schedule(); }

  /* ------------------------------------------------ fade on scroll */
  // Things fade and rise in as they come up the screen and fade out as they leave
  // at the top, both ways. Where the browser supports scroll-driven animations
  // (Safari 26+, Chrome) the stylesheet does it all, tied to the scroll itself, so
  // it stays smooth. Older browsers get a short fade whenever something crosses
  // the edge of the screen.
  const scrollDriven = window.CSS && CSS.supports && CSS.supports('animation-timeline: view()');
  root.classList.add(scrollDriven ? 'fx-scroll' : 'fx-io');
  if (!scrollDriven && 'IntersectionObserver' in window) {
    const SEL = '.hero .wordmark, .hero .tagline, .hero .paths, #gallery .tile, #gallery .video, .story-card, ' +
      '.story-head > *, .story-more, .story-foot > *, .about h2, .about-body > *, .contact h2, .contact-body > *, .site-footer';
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const above = !e.isIntersecting && e.boundingClientRect.top < (e.rootBounds ? e.rootBounds.top : 0);
        e.target.classList.toggle('fx-above', above);
        e.target.classList.toggle('fx-below', !e.isIntersecting && !above);
      }
    }, { rootMargin: '-56px 0px -4% 0px' });
    const watched = new WeakSet();
    const watch = () => {
      for (const el of document.querySelectorAll(SEL)) {
        if (watched.has(el)) continue;
        watched.add(el);
        el.classList.add('fx-t');
        io.observe(el);
      }
    };
    const gallery = document.getElementById('gallery');
    if (gallery) new MutationObserver(watch).observe(gallery, { childList: true });
    window.addEventListener('load', watch);
    watch();
  }
})();
