(function () {
  const { api, esc, store } = window.DSP;
  const root = document.getElementById('result');
  const dlg = document.getElementById('dlg');
  const token = decodeURIComponent(location.pathname.split('/').pop());
  const anonId = store.get('dsp_anon');
  const origin = store.get('dsp_source') || { source: 'direto' };
  const track = (type) => anonId && api('/api/events', { method: 'POST', body: { anonId, type, source: origin.source, campaign: origin.campaign } }).catch(() => {});

  const list = (arr) => `<ul class="list">${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  const steps = (arr) => `<div class="routine">${arr.map((s) => `
    <article class="routine-step"><h3>${esc(s.title)}</h3><dl>
      <dt>O que fazer</dt><dd>${esc(s.what)}</dd>
      <dt>Finalidade</dt><dd>${esc(s.purpose)}</dd>
      <dt>Características do produto</dt><dd>${esc(s.lookFor)}</dd>
      ${s.actives && s.actives.length ? `<dt>Ativos que podem ser considerados</dt><dd>${esc(s.actives.join(', '))}</dd>` : ''}
      <dt>Cuidados</dt><dd>${esc(s.cautions)}</dd>
    </dl></article>`).join('')}</div>`;

  function render(d) {
    const r = d.result;
    const paragraphs = String(d.explanation).split(/\n+/).map((p) => `<p>${esc(p)}</p>`).join('');
    root.innerHTML = `
      <section class="card result-hero">
        <p class="eyebrow">Seu perfil de pele</p>
        <h1 class="visually-hidden">SEU PERFIL DE PELE</h1>
        <p class="muted" style="margin:0">${esc(d.name)}</p>
        <p class="skin-type">${esc(r.skinTypeLabel)}</p>
        <div class="chips">
          <span class="chip">Confiança: <strong>${esc(r.confidenceLabel)}</strong></span>
          <span class="chip">Sensibilidade: <strong>${esc(r.assessments.sensitivity)}</strong></span>
          <span class="chip">Tendência a acne: <strong>${esc(r.assessments.acneTendency)}</strong></span>
          ${r.assessments.dehydration ? '<span class="chip"><strong>Sinais de desidratação</strong></span>' : ''}
        </div>
        <p class="small muted" style="margin:0">Gerado em ${esc(d.generatedAt)}</p>
      </section>

      ${r.redFlag ? `<div class="alert alert-danger" role="alert"><strong>Atenção:</strong> ${esc(r.referral[0])}</div>` : ''}

      <section class="card">
        <h2>Resultado</h2>
        ${paragraphs}
        <p class="small muted">${esc(r.confidenceNote)}${d.explanationByAI ? ' Texto redigido com apoio de inteligência artificial a partir das regras de análise.' : ''}</p>
      </section>

      <section class="card"><h2>Principais necessidades cosméticas</h2>${list(r.needs)}</section>
      <section class="card"><h2>Fatores que podem influenciar sua pele</h2>${list(r.factors)}</section>

      <section class="card"><p class="eyebrow">Rotina personalizada</p><h2>Manhã</h2>${steps(r.morning)}</section>
      <section class="card"><p class="eyebrow">Rotina personalizada</p><h2>Noite</h2>${steps(r.night)}</section>

      <section class="card">
        <h2>Ativos que podem fazer sentido para sua pele</h2>
        <p class="muted small">Poucos ativos de cada vez: introduza um por vez e observe a resposta da pele.</p>
        ${r.actives.map((a, i) => `
          <details class="active-card" ${i === 0 ? 'open' : ''}><summary>${esc(a.name)}</summary><div class="body">
            <p><strong>Finalidade cosmética:</strong> ${esc(a.purpose)}</p>
            <p><strong>Por que foi selecionado:</strong> ${esc(a.why)}</p>
            <p><strong>Benefícios esperados:</strong> ${esc(a.benefits)}</p>
            <p><strong>Como se encaixa na rotina:</strong> ${esc(a.fit)}</p>
            <p><strong>Cuidados e limitações:</strong> ${esc(a.cautions)}</p>
            <p><strong>Quando buscar orientação profissional:</strong> ${esc(a.professional)}</p>
            ${a.sources && a.sources.length ? `<p class="sources"><strong>Fontes:</strong><br>${a.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.citation)}</a>`).join('<br>')}</p>` : ''}
          </div></details>`).join('')}
      </section>

      <section class="card"><h2>Cuidados que exigem cautela</h2>${list(r.cautions)}</section>
      <section class="card"><h2>Quando procurar avaliação profissional</h2>${list(r.referral)}</section>

      <section class="card no-print">
        <h2>E agora?</h2>
        <div class="cta-grid">
          <a class="btn btn-primary" id="pdf" href="/api/results/${encodeURIComponent(token)}/pdf">SALVAR MEU RESULTADO EM PDF</a>
          <button class="btn btn-secondary" id="share" type="button">COMPARTILHAR MEU RESULTADO</button>
          ${d.tiktokUrl || d.instagramUrl ? `<div class="meet">
            <a class="btn btn-secondary btn-block" href="${esc(d.tiktokUrl || d.instagramUrl)}" target="_blank" rel="noopener">QUERO CONHECER A DRA. FERNANDA</a>
            ${d.tiktokUrl && d.instagramUrl ? `<a class="meet-alt" href="${esc(d.instagramUrl)}" target="_blank" rel="noopener">Não tem TikTok? Veja no Instagram</a>` : ''}
          </div>` : ''}
          <button class="btn btn-sage" id="contact" type="button" ${d.contactRequested ? 'disabled' : ''}>${d.contactRequested ? 'SOLICITAÇÃO REGISTRADA ✓' : 'QUERO SABER MAIS SOBRE OS TRATAMENTOS'}</button>
          ${d.whatsappReportAvailable ? `<button class="btn btn-ghost" id="wa" type="button" ${['enviada', 'entregue', 'lida'].includes(d.whatsappReportStatus) ? 'disabled' : ''}>${['enviada', 'entregue', 'lida'].includes(d.whatsappReportStatus) ? 'Link enviado ao seu WhatsApp ✓' : 'Receber o link deste resultado no meu WhatsApp'}</button>` : ''}
        </div>
        <p class="small muted" style="margin-top:14px">Este link é pessoal. Para mostrar a outras pessoas, use “Compartilhar”, que gera uma versão sem seus dados pessoais e sem respostas de saúde.</p>
        <p class="disclaimer">Este resultado é uma orientação cosmética educativa baseada nas respostas fornecidas. Não é diagnóstico dermatológico, médico ou laboratorial, não substitui consulta e não garante resultados. Interrompa o uso de qualquer produto diante de reações e procure um profissional de saúde.</p>
      </section>`;
    bind(d);
  }

  function modal(html) {
    dlg.querySelector('.dialog-body').innerHTML = html;
    dlg.showModal();
    dlg.querySelector('[data-close]')?.addEventListener('click', () => dlg.close());
  }

  function consentModal({ title, text, consentText, confirm, onConfirm }) {
    modal(`<h2>${esc(title)}</h2><p>${esc(text)}</p>
      <label class="check"><input type="checkbox" id="dlg-consent"><span>${esc(consentText)}</span></label>
      <p class="form-msg" role="alert" style="margin-top:10px"></p>
      <div class="nav"><button class="btn btn-ghost" data-close type="button">Cancelar</button><button class="btn btn-primary" id="dlg-ok" type="button">${esc(confirm)}</button></div>`);
    const ok = document.getElementById('dlg-ok');
    const msg = dlg.querySelector('.form-msg');
    ok.addEventListener('click', async () => {
      if (!document.getElementById('dlg-consent').checked) { msg.textContent = 'Marque a autorização para continuar.'; return; }
      ok.disabled = true; ok.textContent = 'Enviando…'; msg.textContent = '';
      try {
        const res = await onConfirm();
        dlg.querySelector('.dialog-body').innerHTML = `<h2>Pronto!</h2><p>${esc(res.message)}</p><div class="nav"><button class="btn btn-primary" data-close type="button">Fechar</button></div>`;
        dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
        return res;
      } catch (e) { msg.textContent = e.message; ok.disabled = false; ok.textContent = confirm; return null; }
    });
  }

  function bind(d) {
    document.getElementById('pdf').addEventListener('click', () => track('pdf'));
    document.getElementById('share').addEventListener('click', async () => {
      try {
        const { url } = await api(`/api/results/${encodeURIComponent(token)}/share`, { method: 'POST' });
        track('share');
        const text = `Descobri meu perfil de pele: ${d.result.skinTypeLabel}. Faça o seu também!`;
        if (navigator.share) { try { await navigator.share({ title: 'Descubra Sua Pele', text, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
        modal(`<h2>Compartilhar resultado</h2><p>Este link mostra apenas o tipo de pele estimado — sem seu nome, contato ou respostas de saúde.</p>
          <input type="text" readonly value="${esc(url)}" id="share-url" aria-label="Link de compartilhamento">
          <div class="nav"><button class="btn btn-ghost" data-close type="button">Fechar</button><button class="btn btn-primary" id="copy" type="button">Copiar link</button></div>`);
        document.getElementById('copy').addEventListener('click', async (ev) => {
          const inp = document.getElementById('share-url');
          try { await navigator.clipboard.writeText(inp.value); } catch { inp.select(); document.execCommand('copy'); }
          ev.target.textContent = 'Copiado ✓';
        });
      } catch (e) { modal(`<h2>Ops</h2><p>${esc(e.message)}</p><div class="nav"><button class="btn btn-primary" data-close>Fechar</button></div>`); }
    });
    const contact = document.getElementById('contact');
    contact.addEventListener('click', () => {
      track('contact_click');
      consentModal({
        title: 'Avaliação estética individualizada',
        text: 'Registre seu interesse e a equipe da Dra. Fernanda poderá entrar em contato pelo WhatsApp informado no cadastro. Isso não é um agendamento.',
        consentText: d.consentTexts.contato_avaliacao,
        confirm: 'Registrar interesse',
        onConfirm: async () => {
          const r = await api(`/api/results/${encodeURIComponent(token)}/contact`, { method: 'POST', body: { consent: true } });
          contact.disabled = true; contact.textContent = 'SOLICITAÇÃO REGISTRADA ✓';
          return r;
        },
      });
    });
    const wa = document.getElementById('wa');
    wa?.addEventListener('click', () => consentModal({
      title: 'Receber no WhatsApp',
      text: 'Enviaremos o link deste resultado para o número cadastrado.',
      consentText: d.consentTexts.envio_relatorio_whatsapp,
      confirm: 'Enviar',
      onConfirm: async () => { const r = await api(`/api/results/${encodeURIComponent(token)}/whatsapp`, { method: 'POST', body: { consent: true } }); wa.disabled = true; wa.textContent = 'Link enviado ao seu WhatsApp ✓'; return r; },
    }));
  }

  api(`/api/results/${encodeURIComponent(token)}`)
    .then(render)
    .catch((e) => {
      root.innerHTML = `<section class="card center" role="alert"><h2>Resultado indisponível</h2><p>${esc(e.message)}</p><a class="btn btn-primary" href="/">Fazer o questionário</a></section>`;
    });
})();
