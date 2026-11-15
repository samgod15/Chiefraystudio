/* Dark / light mode. The page follows the device setting until the visitor taps the
   switch; their choice is remembered on that device. The small script in each page's
   <head> applies a remembered choice before the page paints, so there's no flash. */
(() => {
  const root = document.documentElement;
  const KEY = 'chiefray-theme';
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)');
  const meta = document.querySelector('meta[name="theme-color"]');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const mode = () => root.dataset.theme || (prefersLight.matches ? 'light' : 'dark');

  function sync() {
    const current = mode();
    root.dataset.mode = current;
    if (meta) meta.content = current === 'light' ? '#f7ece8' : '#292a29';
    for (const button of document.querySelectorAll('.theme-toggle')) {
      button.setAttribute('aria-label', current === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
    }
  }

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.theme-toggle')) return;
    const next = mode() === 'light' ? 'dark' : 'light';
    if (!reduceMotion.matches) {
      root.classList.add('theme-fade');
      setTimeout(() => root.classList.remove('theme-fade'), 400);
    }
    root.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch (e) { /* storage blocked: still switches */ }
    sync();
  });

  if (prefersLight.addEventListener) prefersLight.addEventListener('change', sync);
  sync();
})();
