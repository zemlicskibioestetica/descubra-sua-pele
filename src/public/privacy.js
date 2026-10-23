(function () {
  const form = document.getElementById('privacy-form');
  if (!form) return;
  window.DSP.fillCountries(form.querySelector('[data-countries]'), 'BR').catch(() => {});
  const msg = form.querySelector('.form-msg');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; msg.className = 'form-msg'; msg.textContent = 'Enviando…';
    try {
      const r = await window.DSP.api('/api/privacy-requests', { method: 'POST', body: Object.fromEntries(fd) });
      msg.className = 'form-msg ok'; msg.textContent = r.message; form.reset();
    } catch (e) {
      msg.textContent = e.message;
    } finally { btn.disabled = false; }
  });
})();
