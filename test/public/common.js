// Utilidades compartilhadas pelas páginas públicas.
(function () {
  // Logo: se o arquivo ainda não foi enviado, mostra o nome/monograma no lugar
  document.querySelectorAll('img[data-fallback]').forEach((img) => {
    const miss = () => img.classList.add('missing');
    if (img.complete && img.naturalWidth === 0) miss();
    img.addEventListener('error', miss);
  });

  window.DSP = {
    async api(path, opts = {}) {
      let res;
      try {
        res = await fetch(path, { headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
      } catch {
        const err = new Error('Sem conexão com a internet. Verifique sua conexão e tente novamente.');
        err.network = true; throw err;
      }
      if (res.status === 204) return null;
      let data = null;
      try { data = await res.json(); } catch { /* sem corpo */ }
      if (!res.ok) {
        const err = new Error((data && data.error) || 'Algo deu errado. Tente novamente em instantes.');
        err.status = res.status; err.data = data; throw err;
      }
      return data;
    },
    store: {
      get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } },
      set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* armazenamento indisponível */ } },
      del(k) { try { sessionStorage.removeItem(k); } catch { /* */ } },
    },
    esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    async fillCountries(select, selected) {
      const list = await window.DSP.api('/api/countries');
      select.innerHTML = '<option value="">Selecione o país</option>' + list.map((c) => `<option value="${c.iso}" data-code="${c.code}">${window.DSP.esc(c.name)} (+${c.code})</option>`).join('');
      if (selected) select.value = selected;
      return list;
    },
  };
})();
