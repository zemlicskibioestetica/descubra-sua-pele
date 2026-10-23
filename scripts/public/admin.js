(function () {
  const { esc } = window.DSP;
  const view = document.getElementById('view');
  const dlg = document.getElementById('dlg');
  const tip = document.getElementById('tip');
  let CSRF = null; let ME = null;

  async function api(path, opts = {}) {
    const res = await fetch(`/api/admin${path}`, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(CSRF ? { 'X-CSRF-Token': CSRF } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
    let data = null; try { data = await res.json(); } catch { /* */ }
    if (res.status === 401 && path !== '/login') { showLogin(); throw new Error('Sessão expirada.'); }
    if (!res.ok) throw new Error((data && data.error) || `Erro ${res.status}`);
    return data;
  }

  const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('pt-BR'));
  const pct = (x) => (x == null ? '—' : `${(x * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
  const badge = (s) => {
    const cls = { enviada: 'ok', entregue: 'ok', lida: 'ok', gerado: 'ok', concluido: 'ok', concluida: 'ok', falhou: 'bad', recusada: 'bad', nao_configurada: 'warn', pendente: 'warn', aberta: 'warn', cadastrado: 'warn', nova: 'warn' }[s] || '';
    const label = { nao_configurada: 'não configurada', concluido: 'concluído', cadastrado: 'só cadastro', em_atendimento: 'em atendimento' }[s] || s;
    return `<span class="badge ${cls}">${esc(label || '—')}</span>`;
  };
  function modal(html) {
    dlg.querySelector('.dialog-body').innerHTML = `${html}<div class="nav"><span></span><button class="btn btn-secondary" data-close type="button">Fechar</button></div>`;
    dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
    if (!dlg.open) dlg.showModal();
    return dlg.querySelector('.dialog-body');
  }
  const errorBox = (e) => `<div class="alert alert-danger" role="alert">${esc(e.message)}</div>`;

  // Dica flutuante para os gráficos (hover e foco)
  function bindTips(container) {
    container.querySelectorAll('[data-tip]').forEach((el) => {
      const show = () => { tip.textContent = el.dataset.tip; tip.hidden = false; const r = el.getBoundingClientRect(); tip.style.left = `${Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, r.left + r.width / 2 - tip.offsetWidth / 2))}px`; tip.style.top = `${r.top - tip.offsetHeight - 8}px`; };
      el.addEventListener('mouseenter', show); el.addEventListener('focus', show);
      el.addEventListener('mouseleave', () => { tip.hidden = true; }); el.addEventListener('blur', () => { tip.hidden = true; });
    });
  }

  // ---------- Login ----------
  function showLogin() {
    document.getElementById('shell').hidden = true;
    document.getElementById('login').hidden = false;
  }
  document.getElementById('login-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target); const msg = ev.target.querySelector('.form-msg');
    msg.textContent = '';
    try {
      const r = await api('/login', { method: 'POST', body: Object.fromEntries(fd) });
      CSRF = r.csrf; ME = r.user; enter();
    } catch (e) { msg.textContent = e.message; }
  });
  document.getElementById('logout').addEventListener('click', async () => { try { await api('/logout', { method: 'POST' }); } catch { /* */ } location.reload(); });
  document.getElementById('pw-btn').addEventListener('click', () => {
    const b = modal(`<h2>Alterar senha</h2><form class="form" id="pw-form"><label class="field"><span>Senha atual</span><input type="password" name="current" autocomplete="current-password"></label>
      <label class="field"><span>Nova senha (mín. 10 caracteres, letras e números)</span><input type="password" name="next" autocomplete="new-password"></label><p class="form-msg"></p><button class="btn btn-primary">Salvar</button></form>`);
    b.querySelector('#pw-form').addEventListener('submit', async (ev) => {
      ev.preventDefault(); const m = ev.target.querySelector('.form-msg');
      try { await api('/password', { method: 'POST', body: Object.fromEntries(new FormData(ev.target)) }); m.className = 'form-msg ok'; m.textContent = 'Senha alterada.'; } catch (e) { m.className = 'form-msg'; m.textContent = e.message; }
    });
  });

  function enter() {
    document.getElementById('login').hidden = true;
    document.getElementById('shell').hidden = false;
    document.getElementById('who').textContent = `${ME.name} (${ME.role === 'proprietaria' ? 'proprietária' : 'equipe'})`;
    document.querySelectorAll('[data-owner]').forEach((b) => { b.hidden = ME.role !== 'proprietaria'; });
    openTab(location.hash.slice(1) || 'dashboard');
  }

  const TABS = { dashboard, participants, contacts, notifications, privacy, links, settings, users, audit };
  function openTab(name) {
    if (!TABS[name]) name = 'dashboard';
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    history.replaceState(null, '', `#${name}`);
    view.innerHTML = '<p class="muted">Carregando…</p>';
    TABS[name]().catch((e) => { view.innerHTML = errorBox(e); });
  }
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => openTab(b.dataset.tab)));
  window.addEventListener('hashchange', () => { if (ME) openTab(location.hash.slice(1)); });

  // ---------- Painel / métricas ----------
  const STEP_LABELS = { inicio: 'Clicou em começar', privacidade: 'Privacidade', cadastro1: 'Cadastro: dados', cadastro2: 'Cadastro: contato', cadastro3: 'Cadastro: região/objetivo', responsavel: 'Responsável legal', concluido: 'Concluiu' };
  const stepLabel = (s) => STEP_LABELS[s] || (s.startsWith('h') ? `Saúde ${s.slice(1)}` : s.startsWith('s') ? `Pele ${s.slice(1)}` : s);
  const hbars = (rows, valueKey = 'n', labelKey = 'label') => {
    const max = Math.max(1, ...rows.map((r) => r[valueKey]));
    return `<div class="hbars">${rows.map((r) => `<div class="hbar"><span>${esc(r[labelKey])}</span><div class="track"><div class="fill" style="width:${(r[valueKey] / max) * 100}%"></div></div><span class="n">${fmt(r[valueKey])}</span></div>`).join('')}</div>`;
  };

  async function dashboard(from, to) {
    const q = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) });
    const m = await api(`/metrics?${q}`);
    const maxDay = Math.max(1, ...m.daily.map((d) => d.visits));
    view.innerHTML = `
      <h2>Indicadores</h2>
      <form class="toolbar" id="mf"><label class="field"><span>De</span><input type="date" name="from" value="${m.from}"></label><label class="field"><span>Até</span><input type="date" name="to" value="${m.to}"></label><button class="btn btn-secondary">Aplicar</button></form>
      ${m.pendingNotifications ? `<div class="alert alert-warn">${m.pendingNotifications} notificação(ões) do WhatsApp com falha ou aguardando configuração. <a href="#notifications" data-go="notifications">Ver pendências</a></div>` : ''}
      ${m.openPrivacyRequests ? `<div class="alert alert-warn">${m.openPrivacyRequests} solicitação(ões) LGPD em aberto. <a href="#privacy" data-go="privacy">Ver solicitações</a></div>` : ''}
      <div class="kpis">
        <div class="kpi"><div class="label">Visitas</div><div class="value">${fmt(m.visits)}</div></div>
        <div class="kpi"><div class="label">Iniciaram o teste</div><div class="value">${fmt(m.started)}</div></div>
        <div class="kpi"><div class="label">Concluídos</div><div class="value">${fmt(m.completed)}</div></div>
        <div class="kpi"><div class="label">Taxa de conclusão</div><div class="value">${pct(m.completionRate)}</div></div>
        <div class="kpi"><div class="label">Relatórios gerados</div><div class="value">${fmt(m.reports)}</div></div>
        <div class="kpi"><div class="label">PDFs baixados</div><div class="value">${fmt(m.pdfs)}</div></div>
        <div class="kpi"><div class="label">Pedidos de contato</div><div class="value">${fmt(m.contacts)}</div></div>
      </div>
      <div class="panel"><h3>Visitas por dia</h3>
        ${m.daily.length ? `<div class="cols" role="img" aria-label="Visitas por dia no período">${m.daily.map((d) => `<div class="col" tabindex="0" style="height:${Math.max(2, (d.visits / maxDay) * 100)}%" data-tip="${d.day.split('-').reverse().join('/')}: ${d.visits} visitas · ${d.started} iniciaram · ${d.completed} concluíram"></div>`).join('')}</div>
        <div class="axis"><span>${m.daily[0].day.split('-').reverse().join('/')}</span><span>${m.daily[m.daily.length - 1].day.split('-').reverse().join('/')}</span></div>
        <details style="margin-top:10px"><summary class="small">Ver tabela</summary><div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>Dia</th><th class="num">Visitas</th><th class="num">Iniciaram</th><th class="num">Concluíram</th></tr></thead><tbody>${m.daily.map((d) => `<tr><td>${d.day.split('-').reverse().join('/')}</td><td class="num">${d.visits}</td><td class="num">${d.started}</td><td class="num">${d.completed}</td></tr>`).join('')}</tbody></table></div></details>`
        : '<p class="muted">Sem visitas no período.</p>'}
      </div>
      <div class="grid-2">
        <div class="panel"><h3>Origem dos acessos</h3>
          <div class="table-wrap"><table><thead><tr><th>Canal</th><th class="num">Visitas</th><th class="num">Iniciaram</th><th class="num">Concluíram</th><th class="num">Conversão</th><th class="num">Contatos</th></tr></thead>
          <tbody>${m.bySource.map((s) => `<tr><td>${esc(s.label)}</td><td class="num">${fmt(s.visits)}</td><td class="num">${fmt(s.started)}</td><td class="num">${fmt(s.completed)}</td><td class="num">${s.visits ? pct(s.completed / s.visits) : '—'}</td><td class="num">${fmt(s.contacts)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Sem dados.</td></tr>'}</tbody></table></div>
        </div>
        <div class="panel"><h3>Tipos de pele estimados</h3>${m.skin.length ? hbars(m.skin) : '<p class="muted">Sem resultados no período.</p>'}</div>
      </div>
      <div class="panel"><h3>Funil — onde as pessoas desistem</h3>
        <p class="small muted">Pessoas distintas que chegaram a cada tela. Quedas grandes entre uma etapa e a seguinte indicam desistência.</p>
        ${hbars(m.funnel.map((f) => ({ label: stepLabel(f.step), n: f.n })))}
      </div>`;
    bindTips(view);
    view.querySelector('#mf').addEventListener('submit', (ev) => { ev.preventDefault(); const f = new FormData(ev.target); dashboard(f.get('from'), f.get('to')).catch((e) => { view.innerHTML = errorBox(e); }); });
    view.querySelectorAll('[data-go]').forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); openTab(a.dataset.go); }));
  }

  // ---------- Participantes ----------
  let PF = { offset: 0 };
  async function participants() {
    const q = new URLSearchParams(Object.entries(PF).filter(([, v]) => v !== '' && v != null));
    const d = await api(`/participants?${q}`);
    const consentTxt = (c) => [c.participacao ? 'participação' : null, c.dados_saude ? 'saúde' : null, c.whatsapp_publicidade ? 'publicidade' : null].filter(Boolean).join(', ') || '—';
    view.innerHTML = `
      <h2>Participantes</h2>
      <form class="toolbar" id="pf">
        <label class="field" style="flex:2 1 200px"><span>Buscar</span><input type="search" name="q" placeholder="Nome, celular ou cidade" value="${esc(PF.q || '')}"></label>
        <label class="field"><span>De</span><input type="date" name="from" value="${esc(PF.from || '')}"></label>
        <label class="field"><span>Até</span><input type="date" name="to" value="${esc(PF.to || '')}"></label>
        <label class="field"><span>Origem</span><select name="source"><option value="">Todas</option>${[['tiktok', 'TikTok'], ['instagram', 'Instagram'], ['whatsapp', 'WhatsApp'], ['indicacao', 'Indicação'], ['compartilhamento', 'Compartilhamento'], ['direto', 'Direto'], ['outro', 'Outro']].map(([v, l]) => `<option value="${v}" ${PF.source === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Tipo de pele</span><select name="skin"><option value="">Todos</option>${[['normal', 'Normal'], ['seca', 'Seca'], ['oleosa', 'Oleosa'], ['mista', 'Mista'], ['indeterminado', 'Indeterminado']].map(([v, l]) => `<option value="${v}" ${PF.skin === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Situação</span><select name="status"><option value="">Todas</option><option value="concluido" ${PF.status === 'concluido' ? 'selected' : ''}>Concluiu</option><option value="cadastrado" ${PF.status === 'cadastrado' ? 'selected' : ''}>Só cadastro</option></select></label>
        <button class="btn btn-secondary">Filtrar</button>
        <a class="btn btn-secondary" id="csv" href="/api/admin/export.csv?${q}">Exportar CSV</a>
      </form>
      <p class="small muted">${fmt(d.total)} registro(s). Clique em uma linha para detalhes.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Nome</th><th>Cadastro</th><th>Conclusão</th><th>País / Região</th><th>Celular</th><th>Origem</th><th>Tipo de pele</th><th>Objetivo</th><th>Relatório</th><th>Notificação</th><th>Consentimentos</th></tr></thead>
        <tbody>${d.rows.map((r) => `<tr class="clickable" data-id="${r.id}" tabindex="0">
          <td>${esc(r.name)}${r.minor ? ' <span class="badge warn">menor</span>' : ''}${r.contactRequested ? ' <span class="badge ok">pediu contato</span>' : ''}</td><td>${esc(r.createdAt)}</td><td>${r.completedAt ? esc(r.completedAt) : badge('cadastrado')}</td>
          <td>${esc(r.country)}<br><span class="muted small">${esc(r.region)}</span></td><td>${esc(r.phone)}${r.hasWhatsapp ? '' : '<br><span class="muted small">sem WhatsApp</span>'}</td><td>${esc(r.source)}</td>
          <td>${esc(r.skinType || '—')}</td><td>${esc(r.goal)}</td><td>${badge(r.reportStatus)}</td><td>${badge(r.notificationStatus)}</td><td class="small">${esc(consentTxt(r.consents))}</td></tr>`).join('') || '<tr><td colspan="11" class="muted">Nenhum participante encontrado.</td></tr>'}</tbody>
      </table></div>
      <div class="nav"><button class="btn btn-ghost" id="prev" ${PF.offset ? '' : 'disabled'}>← Anteriores</button><button class="btn btn-ghost" id="next" ${PF.offset + 50 < d.total ? '' : 'disabled'}>Próximos →</button></div>`;
    view.querySelector('#pf').addEventListener('submit', (ev) => { ev.preventDefault(); PF = { ...Object.fromEntries(new FormData(ev.target)), offset: 0 }; participants().catch((e) => { view.innerHTML = errorBox(e); }); });
    view.querySelector('#prev').addEventListener('click', () => { PF.offset = Math.max(0, PF.offset - 50); participants(); });
    view.querySelector('#next').addEventListener('click', () => { PF.offset += 50; participants(); });
    view.querySelectorAll('tr.clickable').forEach((tr) => {
      const open = () => participantDetail(tr.dataset.id);
      tr.addEventListener('click', open); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    });
  }

  async function participantDetail(id) {
    let p;
    try { p = await api(`/participants/${id}`); } catch (e) { modal(errorBox(e)); return; }
    const b = modal(`<h2>${esc(p.name)} <span class="muted small">#${p.id}</span></h2>
      <dl class="kv"><dt>Cadastro</dt><dd>${esc(p.createdAt)}</dd><dt>Conclusão</dt><dd>${esc(p.completedAt || '—')}</dd>
      <dt>Celular</dt><dd>${esc(p.phone)} ${p.hasWhatsapp ? '(WhatsApp)' : '(sem WhatsApp)'}</dd><dt>País / Região</dt><dd>${esc(p.country)} — ${esc(p.region)}</dd>
      <dt>Nascimento / Sexo</dt><dd>${esc(p.birthDate)} · ${esc(p.sex)}</dd>${p.guardianName ? `<dt>Responsável legal</dt><dd>${esc(p.guardianName)}</dd>` : ''}
      <dt>Origem</dt><dd>${esc(p.source)}${p.campaign ? ` · ${esc(p.campaign)}` : ''}</dd><dt>Objetivo</dt><dd>${esc(p.goal)}</dd>
      <dt>Tipo de pele</dt><dd>${esc(p.skinType || '—')} ${p.confidence ? `(confiança ${esc(p.confidence)})` : ''}</dd></dl>
      <h3>Consentimentos registrados</h3>
      <div class="table-wrap"><table><thead><tr><th>Finalidade</th><th>Autorizado</th><th>Versão do aviso</th><th>Data/hora</th></tr></thead><tbody>${p.consentLog.map((c) => `<tr><td>${esc(c.purpose)}</td><td>${c.granted ? badge('concluida').replace('concluida', 'sim') : '<span class="badge">não</span>'}</td><td>${esc(c.policyVersion)}</td><td>${esc(c.at)}</td></tr>`).join('')}</tbody></table></div>
      <h3 style="margin-top:14px">Notificações</h3>
      ${p.notifications.length ? `<div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Status</th><th>Tentativas</th><th>Erro</th></tr></thead><tbody>${p.notifications.map((n) => `<tr><td>${esc(n.kind)}</td><td>${badge(n.status)}</td><td>${n.attempts}</td><td class="small">${esc(n.last_error || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">Nenhuma.</p>'}
      <div class="nav" style="flex-wrap:wrap">
        ${ME.role === 'proprietaria' && p.status === 'concluido' ? '<button class="btn btn-primary" id="rep" type="button">Ver relatório e dados de saúde</button>' : ''}
        <button class="btn btn-secondary" id="del" type="button">Registrar solicitação de exclusão</button>
      </div><div id="rep-area"></div>`);
    b.querySelector('#del').addEventListener('click', async () => {
      const note = prompt('Observação (opcional) sobre a solicitação de exclusão:') ?? null;
      if (note === null) return;
      try { await api(`/participants/${id}/deletion-request`, { method: 'POST', body: { note } }); alert('Solicitação registrada na aba LGPD. A proprietária pode concluir a exclusão por lá.'); } catch (e) { alert(e.message); }
    });
    b.querySelector('#rep')?.addEventListener('click', async () => {
      const reason = prompt('Motivo do acesso aos dados de saúde (fica registrado na auditoria):');
      if (!reason) return;
      try {
        const r = await api(`/participants/${id}/report?reason=${encodeURIComponent(reason)}`);
        const res = r.result;
        b.querySelector('#rep-area').innerHTML = `<hr><h3>Respostas de saúde (confidencial)</h3><div class="table-wrap"><table><tbody>${r.health.map((h) => `<tr><td>${esc(h.question)}</td><td>${esc(h.answer)}</td></tr>`).join('')}</tbody></table></div>
          <h3 style="margin-top:14px">Relatório gerado em ${esc(r.generatedAt)}</h3><p><strong>${esc(res.skinTypeLabel)}</strong> · confiança ${esc(res.confidenceLabel)} · IA: ${esc(r.aiStatus)}</p>
          <p>${esc(res.aiExplanation || res.explanation)}</p>
          <p><strong>Ativos:</strong> ${esc(res.actives.map((a) => a.name).join(', '))}</p>
          <p><strong>Manhã:</strong> ${esc(res.morning.map((s) => s.title).join(' → '))}<br><strong>Noite:</strong> ${esc(res.night.map((s) => s.title).join(' → '))}</p>
          <p><strong>Cautelas:</strong></p><ul class="list">${res.cautions.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
          <p><strong>Encaminhamentos:</strong></p><ul class="list">${res.referral.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`;
      } catch (e) { b.querySelector('#rep-area').innerHTML = errorBox(e); }
    });
  }

  // ---------- Contatos ----------
  async function contacts() {
    const rows = await api('/contacts');
    view.innerHTML = `<h2>Pedidos de informação sobre tratamentos</h2>
      <div class="table-wrap"><table><thead><tr><th>Data</th><th>Nome</th><th>Celular</th><th>Status</th></tr></thead><tbody>
      ${rows.map((c) => `<tr><td>${esc(c.created_at)}</td><td>${esc(c.full_name)}</td><td><a href="https://wa.me/${esc(c.phone_e164.replace(/\D/g, ''))}" target="_blank" rel="noopener">${esc(c.phone_e164)}</a></td>
        <td><select data-id="${c.id}">${[['nova', 'Nova'], ['em_atendimento', 'Em atendimento'], ['concluida', 'Concluída']].map(([v, l]) => `<option value="${v}" ${c.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Nenhum pedido ainda.</td></tr>'}
      </tbody></table></div>`;
    view.querySelectorAll('select[data-id]').forEach((s) => s.addEventListener('change', () => api(`/contacts/${s.dataset.id}`, { method: 'POST', body: { status: s.value } }).catch((e) => alert(e.message))));
  }

  // ---------- Notificações e falhas ----------
  async function notifications(status = '') {
    const [d, errs] = await Promise.all([api(`/notifications${status ? `?status=${status}` : ''}`), api('/errors')]);
    const kinds = { owner_completion: 'Conclusão (proprietária)', owner_contact: 'Pedido de contato (proprietária)', participant_report: 'Resultado ao participante', test: 'Teste' };
    view.innerHTML = `<h2>WhatsApp Business — notificações</h2>
      ${d.config.configured ? `<div class="alert alert-ok">Integração configurada (modo: ${esc(d.config.mode)}). Status “enviada” significa que a API da Meta aceitou a mensagem; “entregue/lida” chegam pelo webhook.</div>`
        : `<div class="alert alert-warn"><strong>Integração não configurada.</strong> Falta: ${esc(d.config.missing.join(', '))}. As conclusões ficam registradas como “não configurada” e serão enviadas automaticamente quando a configuração for concluída.</div>`}
      <form class="toolbar" id="nf"><label class="field"><span>Status</span><select name="status"><option value="">Todos</option>${['pendente', 'enviada', 'entregue', 'lida', 'falhou', 'nao_configurada'].map((s) => `<option value="${s}" ${status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label><button class="btn btn-secondary">Filtrar</button></form>
      <div class="table-wrap"><table><thead><tr><th>Criada</th><th>Tipo</th><th>Participante</th><th>Status</th><th class="num">Tentativas</th><th>Último erro</th><th>Próxima tentativa</th><th></th></tr></thead><tbody>
      ${d.rows.map((n) => `<tr><td>${esc(n.created_at)}</td><td>${esc(kinds[n.kind] || n.kind)}</td><td>${esc(n.full_name || '—')}</td><td>${badge(n.status)}</td><td class="num">${n.attempts}</td><td class="small">${esc(n.last_error || '')}</td><td>${esc(n.next_attempt_at || '')}</td>
        <td>${['falhou', 'nao_configurada'].includes(n.status) ? `<button class="btn btn-ghost" data-retry="${n.id}">Reenviar</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Nenhuma notificação.</td></tr>'}
      </tbody></table></div>
      <h2 style="margin-top:28px">Registro de erros</h2>
      <div class="table-wrap"><table><thead><tr><th>Data</th><th>Área</th><th>Mensagem</th></tr></thead><tbody>${errs.map((e) => `<tr><td>${esc(e.created_at)}</td><td>${esc(e.scope)}</td><td class="small">${esc(e.message)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Nenhum erro registrado.</td></tr>'}</tbody></table></div>`;
    view.querySelector('#nf').addEventListener('submit', (ev) => { ev.preventDefault(); notifications(new FormData(ev.target).get('status')); });
    view.querySelectorAll('[data-retry]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true; b.textContent = 'Enviando…';
      try { const r = await api(`/notifications/${b.dataset.retry}/retry`, { method: 'POST' }); alert(r.status === 'enviada' ? 'A API do WhatsApp aceitou a mensagem.' : `Não enviada: ${r.last_error || r.status}`); } catch (e) { alert(e.message); }
      notifications(status);
    }));
  }

  // ---------- LGPD ----------
  async function privacy() {
    const rows = await api('/privacy-requests');
    const types = { acesso: 'Acesso', correcao: 'Correção', exclusao: 'Exclusão', revogacao: 'Revogação' };
    const owner = ME.role === 'proprietaria';
    view.innerHTML = `<h2>Solicitações de titulares (LGPD)</h2>
      <p class="small muted">Antes de atender, confirme a identidade da pessoa pelo WhatsApp cadastrado. A exclusão remove definitivamente cadastro, respostas, resultado e consentimentos; métricas anônimas permanecem.</p>
      <div class="table-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Solicitante</th><th>Celular</th><th>Participante</th><th>Origem</th><th>Status</th><th>Detalhes</th><th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${esc(r.created_at)}</td><td>${esc(types[r.type] || r.type)}</td><td>${esc(r.requester_name || '')}</td><td>${esc(r.phone || '')}</td>
        <td>${r.participant_id ? `#${r.participant_id}` : '<span class="muted">não vinculado</span>'}</td><td>${esc(r.origin)}</td><td>${badge(r.status)}${r.resolved_by_name ? `<br><span class="small muted">${esc(r.resolved_by_name)} · ${esc(r.resolved_at)}</span>` : ''}</td>
        <td class="small">${esc(r.message || '')}${r.notes ? `<br><em>${esc(r.notes)}</em>` : ''}</td>
        <td>${owner && r.status === 'aberta' ? `<select data-act="${r.id}" aria-label="Ação"><option value="">Ação…</option>${r.participant_id ? '<option value="excluir_dados">Excluir dados</option>' : '<option value="link">Vincular participante</option>'}<option value="concluir">Marcar concluída</option><option value="recusar">Recusar</option></select>` : ''}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">Nenhuma solicitação.</td></tr>'}
      </tbody></table></div>`;
    view.querySelectorAll('[data-act]').forEach((s) => s.addEventListener('change', async () => {
      const id = s.dataset.act; const action = s.value; s.value = '';
      try {
        if (action === 'link') {
          const pid = prompt('Número (#) do participante, visto no detalhe/URL do painel:'); if (!pid) return;
          await api(`/privacy-requests/${id}/link`, { method: 'POST', body: { participantId: Number(pid.replace('#', '')) } });
        } else if (action === 'excluir_dados') {
          const confirm = prompt('Esta ação é definitiva. Digite EXCLUIR para confirmar:'); if (confirm !== 'EXCLUIR') return;
          await api(`/privacy-requests/${id}/resolve`, { method: 'POST', body: { action, confirm, notes: 'Dados excluídos a pedido do titular' } });
        } else if (action) {
          const notes = prompt('Observação (opcional):') ?? '';
          await api(`/privacy-requests/${id}/resolve`, { method: 'POST', body: { action, notes } });
        }
        privacy();
      } catch (e) { alert(e.message); }
    }));
  }

  // ---------- Divulgação ----------
  async function links() {
    const d = await api('/links');
    view.innerHTML = `<h2>Links de divulgação</h2>
      ${d.published ? '' : '<div class="alert alert-warn">O endereço público definitivo ainda não foi configurado. Os links abaixo usam o endereço atual do navegador; depois de publicar o site, informe o endereço em Configurações → “Endereço público do site”.</div>'}
      <p class="muted small">Cada link identifica a origem do acesso (parâmetro <code>utm_source</code>) para o painel de métricas. Use um link diferente em cada canal.</p>
      <div class="panel">${d.links.map((l, i) => `<div class="field" style="margin-bottom:12px"><span>${esc(l.label)}</span><div class="copy-row"><input type="text" readonly value="${esc(l.url)}" id="lk${i}"><button class="btn btn-secondary" data-copy="lk${i}" type="button">Copiar</button></div></div>`).join('')}</div>
      <div class="panel"><h3>Convite automático para novos seguidores do TikTok</h3>
        <p class="small">O TikTok não oferece, de forma geral, uma API pública para enviar mensagens diretas automáticas a cada novo seguidor. Por isso, este sistema <strong>não</strong> envia mensagens no TikTok. Alternativas seguras: link na bio, resposta fixada nos comentários, vídeos com chamada para o link e, se a sua conta tiver acesso, as ferramentas oficiais de mensagens do TikTok (ex.: respostas automáticas em contas comerciais) usando o link “TikTok (bio)” acima.</p></div>`;
    view.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
      const inp = document.getElementById(b.dataset.copy);
      try { await navigator.clipboard.writeText(inp.value); } catch { inp.select(); document.execCommand('copy'); }
      b.textContent = 'Copiado ✓'; setTimeout(() => { b.textContent = 'Copiar'; }, 1500);
    }));
  }

  // ---------- Configurações ----------
  const GROUPS = [
    ['WhatsApp Business (Cloud API oficial)', ['owner_whatsapp', 'wa_phone_number_id', 'wa_access_token', 'wa_mode', 'wa_template_owner', 'wa_template_contact', 'wa_template_participant', 'wa_template_lang', 'wa_api_version', 'wa_app_secret', 'wa_webhook_verify_token']],
    ['Site e perfis', ['public_base_url', 'tiktok_url', 'instagram_url']],
    ['Privacidade (LGPD)', ['privacy_contact_email', 'privacy_contact_whatsapp', 'retention_days', 'policy_version']],
    ['Inteligência artificial (opcional)', ['anthropic_api_key']],
  ];
  async function settings() {
    const d = await api('/settings');
    const S = d.settings;
    const input = (k) => {
      const s = S[k];
      if (k === 'wa_mode') return `<select name="${k}"><option value="template" ${s.value === 'template' ? 'selected' : ''}>template — modelo aprovado (recomendado)</option><option value="text" ${s.value === 'text' ? 'selected' : ''}>text — só funciona com conversa aberta nas últimas 24h</option></select>`;
      if (s.secret) return `<input type="password" name="${k}" autocomplete="off" placeholder="${s.isSet ? '•••••• (salvo — deixe vazio para manter)' : 'não configurado'}">`;
      return `<input type="text" name="${k}" value="${esc(s.value)}">`;
    };
    view.innerHTML = `<h2>Configurações</h2>
      <div class="status-line" style="margin-bottom:12px">WhatsApp: ${d.whatsapp.configured ? badge('enviada').replace('enviada', 'configurado') : `<span class="badge warn">incompleto — falta ${esc(d.whatsapp.missing.join(', '))}</span>`}
        &nbsp; IA: ${d.aiConfigured ? '<span class="badge ok">configurada</span>' : '<span class="badge">não configurada (usa explicação padrão)</span>'}</div>
      <form id="sf" class="settings-grid" autocomplete="off">
        ${GROUPS.map(([title, keys]) => `<div class="panel"><h3>${esc(title)}</h3><div class="form">${keys.map((k) => `<label class="field"><span>${esc(S[k].label)}</span>${input(k)}</label>`).join('')}</div></div>`).join('')}
        <div class="panel" style="grid-column:1/-1"><p class="form-msg" role="status"></p><div class="nav"><button type="button" class="btn btn-secondary" id="test-wa">Enviar mensagem de teste</button><button class="btn btn-primary" type="submit">Salvar configurações</button></div></div>
      </form>
      <div class="panel"><h3>Como ativar o WhatsApp Business</h3>
        <ol class="small">
          <li>Na Meta (business.facebook.com / developers.facebook.com), crie um app do tipo Business com o produto <strong>WhatsApp</strong> e vincule um número empresarial.</li>
          <li>Gere um <strong>token permanente</strong> (usuário do sistema com permissão whatsapp_business_messaging) e copie o <strong>Phone Number ID</strong>.</li>
          <li>Crie e envie para aprovação o modelo <code>${esc(S.wa_template_owner.value || 'novo_participante_pele')}</code> (categoria Utilidade, idioma pt_BR) com 9 variáveis, nesta ordem:</li>
        </ol>
        <pre class="code">✨ NOVO PARTICIPANTE — DESCUBRA SUA PELE

Uma pessoa concluiu a análise cosmética.

Nome: {{1}}
País: {{2}}
Celular: {{3}}
Região: {{4}}
Data e horário: {{5}}
Tipo de pele estimado: {{6}}
Principal interesse: {{7}}
Origem: {{8}}
Status do relatório: {{9}}

Consulte o painel administrativo para acessar os dados autorizados.</pre>
        <ol class="small" start="4">
          <li>Opcional: modelo <code>${esc(S.wa_template_contact.value || 'solicitacao_contato_pele')}</code> com 4 variáveis (nome, celular, data, origem) para pedidos de contato.</li>
          <li>Opcional: modelo para enviar o resultado ao participante com 2 variáveis ({{1}} primeiro nome, {{2}} link do resultado). Sem ele, o botão não aparece para o participante.</li>
          <li>Webhook de status (entregue/lida): URL <code>${esc(d.webhookUrl)}</code>, com o token de verificação acima e o App Secret preenchido; assine o campo <code>messages</code>.</li>
          <li>Salve aqui e use “Enviar mensagem de teste”. O painel só mostra “enviada” quando a API da Meta confirma.</li>
        </ol>
      </div>`;
    const form = view.querySelector('#sf'); const msg = form.querySelector('.form-msg');
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault(); msg.className = 'form-msg'; msg.textContent = 'Salvando…';
      try { await api('/settings', { method: 'PUT', body: Object.fromEntries(new FormData(form)) }); msg.className = 'form-msg ok'; msg.textContent = 'Configurações salvas.'; setTimeout(settings, 800); } catch (e) { msg.textContent = e.message; }
    });
    view.querySelector('#test-wa').addEventListener('click', async () => {
      msg.className = 'form-msg'; msg.textContent = 'Testando…';
      try { const r = await api('/settings/test-whatsapp', { method: 'POST' }); msg.className = 'form-msg ok'; msg.textContent = r.message; } catch (e) { msg.textContent = e.message; }
    });
  }

  // ---------- Usuários ----------
  async function users() {
    const rows = await api('/users');
    view.innerHTML = `<h2>Usuários do painel</h2>
      <p class="small muted">“Equipe” vê cadastros, métricas e notificações, mas não acessa respostas de saúde, relatórios completos nem configurações.</p>
      <div class="table-wrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Último acesso</th><th>Situação</th><th></th></tr></thead><tbody>
      ${rows.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${u.role === 'proprietaria' ? 'Proprietária' : 'Equipe'}</td><td>${esc(u.last_login_at || '—')}</td><td>${u.active ? '<span class="badge ok">ativo</span>' : '<span class="badge">inativo</span>'}</td>
        <td><button class="btn btn-ghost" data-toggle="${u.id}" data-active="${u.active ? 0 : 1}">${u.active ? 'Desativar' : 'Ativar'}</button></td></tr>`).join('')}
      </tbody></table></div>
      <div class="panel" style="margin-top:16px"><h3>Novo usuário</h3><form class="toolbar" id="uf">
        <label class="field"><span>Nome</span><input type="text" name="name" required></label><label class="field"><span>E-mail</span><input type="email" name="email" required></label>
        <label class="field"><span>Senha inicial</span><input type="password" name="password" autocomplete="new-password" required></label>
        <label class="field"><span>Perfil</span><select name="role"><option value="equipe">Equipe</option><option value="proprietaria">Proprietária</option></select></label>
        <button class="btn btn-primary">Criar</button></form><p class="form-msg" id="um"></p></div>`;
    view.querySelector('#uf').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try { await api('/users', { method: 'POST', body: Object.fromEntries(new FormData(ev.target)) }); users(); } catch (e) { view.querySelector('#um').textContent = e.message; }
    });
    view.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
      try { await api(`/users/${b.dataset.toggle}/active`, { method: 'POST', body: { active: b.dataset.active === '1' } }); users(); } catch (e) { alert(e.message); }
    }));
  }

  async function audit() {
    const rows = await api('/audit');
    view.innerHTML = `<h2>Registro de acessos administrativos</h2>
      <div class="table-wrap"><table><thead><tr><th>Data</th><th>Usuário</th><th>Ação</th><th>Alvo</th><th>Detalhe</th><th>IP</th></tr></thead><tbody>
      ${rows.map((a) => `<tr><td>${esc(a.created_at)}</td><td>${esc(a.name || '—')}</td><td>${esc(a.action)}</td><td>${esc(a.target || '')}</td><td class="small">${esc(a.detail || '')}</td><td class="small">${esc(a.ip || '')}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  // Início
  fetch('/api/admin/me', { credentials: 'same-origin' }).then(async (r) => {
    if (!r.ok) return showLogin();
    const d = await r.json(); CSRF = d.csrf; ME = d.user; enter();
  }).catch(showLogin);
})();
