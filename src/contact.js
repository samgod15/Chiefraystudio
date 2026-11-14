(() => {
  'use strict';

  const form = document.getElementById('inquiry');
  if (!form) return;
  const status = document.getElementById('cp-status');
  const sendButton = form.querySelector('.cp-send');
  const chips = document.getElementById('cp-chips');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const key = form.dataset.key || '';
  const myEmail = form.dataset.email || '';
  const replyTime = form.dataset.reply || 'soon';
  const siteName = form.dataset.site || 'your website';
  // The preview page sets this so the form can be tried without sending anything.
  const demo = Boolean(window.chiefRayDemo);

  /* ------------------------------------------------------------ travelling slash on the shoot types */

  function placeRay(animate) {
    const ray = chips.querySelector('.cat-ray');
    const checked = chips.querySelector('input:checked + .cat .sl');
    if (!ray) return;
    if (!checked) { ray.classList.remove('is-placed'); return; }
    const box = chips.getBoundingClientRect();
    const spot = checked.getBoundingClientRect();
    const instant = !animate || reduceMotion.matches || !ray.classList.contains('is-placed');
    if (instant) ray.style.transition = 'none';
    ray.style.transform = 'translate(' + (spot.left - box.left) + 'px, ' + (spot.top - box.top) + 'px)';
    ray.classList.add('is-placed');
    if (instant) { void ray.offsetWidth; ray.style.transition = ''; }
  }
  chips.addEventListener('change', () => { placeRay(true); check('type'); });
  new ResizeObserver(() => placeRay(false)).observe(chips);
  if (document.fonts) document.fonts.ready.then(() => placeRay(false));

  /* ------------------------------------------------------------ checking the fields */

  const rules = {
    name: () => form.elements.name.value.trim().length > 0,
    email: () => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.elements.email.value.trim()),
    type: () => Boolean(form.querySelector('input[name="shoot_type"]:checked')),
    message: () => form.elements.message.value.trim().length > 0,
  };
  const fields = {
    name: form.elements.name,
    email: form.elements.email,
    message: form.elements.message,
  };
  const touched = new Set();

  function check(which) {
    const ok = rules[which]();
    const error = document.getElementById('f-' + which + '-error');
    if (error) error.hidden = ok;
    const input = fields[which];
    if (input) {
      input.closest('.cp-field').classList.toggle('is-invalid', !ok);
      input.setAttribute('aria-invalid', String(!ok));
      if (!ok) input.setAttribute('aria-describedby', error.id);
      else input.removeAttribute('aria-describedby');
    }
    return ok;
  }

  // Errors appear once someone leaves a field, then clear as soon as it's fixed.
  for (const [which, input] of Object.entries(fields)) {
    input.addEventListener('blur', () => { if (input.value.trim()) { touched.add(which); check(which); } });
    input.addEventListener('input', () => { if (touched.has(which)) check(which); });
  }

  /* ------------------------------------------------------------ sending */

  function collect() {
    const data = Object.fromEntries(new FormData(form).entries());
    const type = data.shoot_type || 'General question';
    return {
      access_key: key,
      subject: 'New ' + siteName + ' inquiry from ' + data.name.trim() + ': ' + type,
      name: data.name.trim(),
      email: data.email.trim(),
      'Shoot type': type,
      Message: data.message.trim(),
      'Date or deadline': data.date || '',
      Location: data.location || '',
      Budget: data.budget || '',
      Phone: data.phone || '',
      'Found me via': data.found || '',
      botcheck: data.botcheck ? true : '',
    };
  }

  function showSent(name, email) {
    const panel = document.createElement('div');
    panel.className = 'cp-sent';
    panel.setAttribute('tabindex', '-1');
    panel.innerHTML =
      '<h2><svg class="cp-sent-slash" viewBox="0 0 40 100" aria-hidden="true"><line x1="6" y1="96" x2="34" y2="4" pathLength="1"/></svg>sent</h2>' +
      '<p></p><button type="button" class="cp-again">Send another message</button>';
    panel.querySelector('p').textContent =
      'Thanks, ' + name + '. I’ll reply ' + replyTime + ' at ' + email + '.';
    panel.querySelector('.cp-again').addEventListener('click', () => {
      form.reset();
      touched.clear();
      placeRay(false);
      panel.replaceWith(form);
      form.hidden = false;
      form.elements.name.focus();
    });
    form.hidden = true;
    form.after(panel);
    panel.focus({ preventScroll: true });
    const top = panel.getBoundingClientRect().top;
    if (top < 0 || top > innerHeight * 0.6) panel.scrollIntoView({ block: 'center', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  }

  function setSending(on) {
    sendButton.disabled = on;
    sendButton.setAttribute('aria-busy', String(on));
    sendButton.textContent = on ? 'Sending…' : 'Send message';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.textContent = '';
    status.classList.remove('is-error');
    ['name', 'email', 'type', 'message'].forEach((w) => touched.add(w));
    const results = ['name', 'email', 'type', 'message'].map((w) => [w, check(w)]);
    const firstBad = results.find(([, ok]) => !ok);
    if (firstBad) {
      const target = firstBad[0] === 'type' ? chips.querySelector('input') : fields[firstBad[0]];
      target.focus();
      status.textContent = 'A few fields need fixing before this can send.';
      status.classList.add('is-error');
      return;
    }

    const payload = collect();
    if (payload.botcheck) return; // a bot filled the hidden box: quietly do nothing

    if (demo) {
      setSending(true);
      await new Promise((r) => setTimeout(r, 900));
      setSending(false);
      showSent(payload.name, payload.email);
      return;
    }

    if (!key) {
      // Not connected to Web3Forms yet: hand the message to the visitor's email app instead.
      if (!myEmail) {
        status.textContent = 'This form isn’t set up yet. Please message me on Instagram instead.';
        status.classList.add('is-error');
        return;
      }
      const body = Object.entries(payload)
        .filter(([k, v]) => v && !['access_key', 'subject', 'botcheck'].includes(k))
        .map(([k, v]) => k + ': ' + v).join('\n');
      window.location.href = 'mailto:' + myEmail + '?subject=' + encodeURIComponent(payload.subject) + '&body=' + encodeURIComponent(body);
      return;
    }

    setSending(true);
    try {
      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 200 && result.success !== false) {
        setSending(false);
        showSent(payload.name, payload.email);
        return;
      }
      throw new Error(result.message || (result.body && result.body.message) || 'HTTP ' + response.status);
    } catch (error) {
      setSending(false);
      status.classList.add('is-error');
      status.textContent = myEmail
        ? 'Your message didn’t send. Check your connection and try again, or email me at ' + myEmail + '.'
        : 'Your message didn’t send. Check your connection and try again.';
    }
  });

  placeRay(false);
})();
