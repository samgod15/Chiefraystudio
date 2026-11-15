/* Logo motion and fade on scroll.
   - Viewfinder intro when the page opens: framing guides, letters drop in, the
     shutter blinks, the slash is there.
   - Autofocus every 7 seconds (and when the logo is tapped): the word blurs, the
     brackets hunt, then it snaps sharp and the brackets lock in orange.
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
  const smooth = (u) => (u < 0 ? 0 : u > 1 ? 1 : u * u * (3 - 2 * u));
  const curve = (pts) => (t) => {
    for (let k = 1; k < pts.length; k++) {
      if (t <= pts[k][0]) {
        const [a, va] = pts[k - 1], [b, vb] = pts[k];
        return va + (vb - va) * smooth((t - a) / (b - a));
      }
    }
    return pts[pts.length - 1][1];
  };
  const drive = (D, f, apply) => new Promise((done) => {
    const start = performance.now();
    (function step(now) {
      const t = Math.min(D, now - start);
      apply(f(t));
      if (t < D) requestAnimationFrame(step); else done();
    })(start);
  });
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
  async function autofocus() {
    const D = 2300;
    const filter = mk('filter', { id: 'af-blur', x: '-20%', y: '-40%', width: '140%', height: '180%' }, defs);
    const blur = mk('feGaussianBlur', { stdDeviation: 0 }, filter);
    lts.setAttribute('filter', 'url(#af-blur)');
    const af = centred(mk('path', { class: 'af', d: corners() }));
    // The slash turns in clicks, like a focus ring.
    tl(sg, D, [[0, { transform: 'none' }], [320, { transform: 'rotate(-14deg)', easing: 'steps(3, end)' }],
      [700, { transform: 'rotate(9deg)', easing: 'steps(2, end)' }], [950, { transform: 'rotate(-6deg)', easing: 'steps(2, end)' }],
      [1250, { transform: 'rotate(4deg)', easing: 'steps(2, end)' }], [1420, { transform: 'rotate(-2deg)', easing: 'cubic-bezier(.3,0,.2,1.5)' }],
      [1560, { transform: 'none' }], [D, { transform: 'none' }]]);
    L.forEach((l) => {
      l.style.transformOrigin = '50% 50%';
      tl(l, D, [[0, { transform: 'none' }], [320, { transform: 'scale(1.03)' }], [1250, { transform: 'scale(1.01)' }],
        [1560, { transform: 'scale(.985)', easing: 'cubic-bezier(.2,1.6,.4,1)' }], [1850, { transform: 'none' }], [D, { transform: 'none' }]]);
    });
    tl(af, D, [[0, { opacity: 0, transform: 'scale(1.12)' }], [250, { opacity: 0.9, transform: 'scale(1.04)' }], [500, { opacity: 0.35 }],
      [700, { opacity: 0.9 }], [950, { opacity: 0.35 }], [1250, { opacity: 0.9 }],
      [1560, { opacity: 1, transform: 'scale(1)', stroke: accent(), strokeWidth: '3px' }], [1700, { opacity: 1, stroke: accent(), strokeWidth: '3px' }],
      [D, { opacity: 0, transform: 'scale(.98)', stroke: accent() }]]);
    flash(1560);
    // Focus hunts: out, nearly in, out a little, then locks sharp.
    await drive(D, curve([[0, 0], [320, 7], [700, 1.2], [950, 3.6], [1250, 0.6], [1420, 1.6], [1560, 0], [D, 0]]),
      (v) => blur.setAttribute('stdDeviation', v.toFixed(2)));
    lts.removeAttribute('filter'); filter.remove(); af.remove(); resetOrigins();
  }

  /* ------------------------------------------------ timing */
  let busy = false, timer = 0, logoOnScreen = true;
  const run = async (fn) => {
    if (busy) return;
    busy = true;
    try { await fn(); } finally { busy = false; }
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(tick, 7000); };
  async function tick() {
    // Only when someone can see it: tab open, logo on screen, no photo open.
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
  // Things ease in as they come up from the bottom of the screen and ease out as they
  // leave at the top (under the bar), both ways. Only opacity and a small lift, so
  // nothing changes size or position for the layout.
  const SEL = '.hero .wordmark, .hero .tagline, .hero .paths, #gallery .tile, #gallery .video, ' +
    '.about h2, .about-body > *, .contact h2, .contact-body > *, .site-footer';
  const tracked = new Set();
  const collect = () => {
    for (const el of document.querySelectorAll(SEL)) tracked.add(el);
    for (const el of tracked) if (!el.isConnected) tracked.delete(el);
  };
  let queued = false;
  function update() {
    queued = false;
    if (root.classList.contains('lb-open')) return;
    const vh = window.innerHeight, zone = Math.min(220, vh * 0.26), top = 64;
    for (const el of tracked) {
      if (el.classList.contains('is-entering')) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom < -40 || r.top > vh + 40) { el.style.opacity = '0'; continue; }
      // Anything on screen when the page first loads starts fully visible.
      const inB = r.top + window.scrollY < vh ? 1 : Math.max(0, Math.min(1, (vh - r.top) / zone));
      const room = Math.max(1, Math.min(zone, r.bottom + window.scrollY - top));
      const inT = Math.max(0, Math.min(1, (r.bottom - top) / room));
      const o = Math.min(smooth(inB), smooth(inT));
      const y = (1 - smooth(inB)) * 34 - (1 - smooth(inT)) * 22;
      el.style.opacity = o.toFixed(3);
      el.style.transform = y ? `translateY(${y.toFixed(1)}px)` : '';
    }
  }
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  const gallery = document.getElementById('gallery');
  if (gallery) {
    new MutationObserver(() => { collect(); queue(); }).observe(gallery, { childList: true });
    gallery.addEventListener('animationend', queue);
  }
  window.addEventListener('load', () => { collect(); queue(); });
  collect();
})();
