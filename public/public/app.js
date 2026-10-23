// Fluxo público: página inicial → privacidade/consentimentos → cadastro → saúde → pele → envio.
(function () {
  const { api, store, esc } = window.DSP;
  const app = document.getElementById('app');
  const STATE_KEY = 'dsp_state';

  // ---------- Origem e identificador anônimo (sem dados pessoais) ----------
  const params = new URLSearchParams(location.search);
  const urlSource = params.get('utm_source') || params.get('src') || params.get('ref') || params.get('origem');
  const urlCampaign = params.get('utm_campaign');
  if (urlSource) store.set('dsp_source', { source: urlSource, campaign: urlCampaign });
  const origin = store.get('dsp_source') || { source: 'direto', campaign: null };
  let anonId = store.get('dsp_anon');
  if (!anonId) {
    const a = new Uint8Array(12); crypto.getRandomValues(a);
    anonId = Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
    store.set('dsp_anon', anonId);
  }
  const track = (type, step) => api('/api/events', { method: 'POST', body: { anonId, type, step, source: origin.source, campaign: origin.campaign } }).catch(() => {});
  if (!store.get('dsp_visited')) { track('visit'); store.set('dsp_visited', true); }

  // ---------- Estado (salvo apenas nesta aba; apagado ao fechá-la) ----------
  let S = store.get(STATE_KEY) || { step: null, reg: { country: 'BR' }, consents: {}, health: {}, skin: {}, token: null, minor: false };
  const save = () => store.set(STATE_KEY, S);
  let CFG = null; let Q = null;

  async function loadConfig() {
    if (CFG) return;
    [CFG, Q] = await Promise.all([api('/api/config'), api('/api/questions')]);
  }

  // Sequência de telas
  function steps() {
    const reg = ['privacidade', 'cadastro1', 'cadastro2', 'cadastro3'];
    if (S.needsGuardian) reg.push('responsavel');
    return [...reg, ...Q.health.map((q) => q.id), ...Q.skin.map((q) => q.id)];
  }

  function progressHtml(stepId) {
    const all = steps();
    const i = all.indexOf(stepId);
    const pct = Math.round((i / all.length) * 100);
    const section = stepId.startsWith('h') ? 'Saúde e segurança' : stepId.startsWith('s') ? 'Sua pele' : 'Cadastro';
    return `<div class="progress-wrap no-print"><div class="progress-meta"><span>${section}</span><span>${i + 1} de ${all.length}</span></div>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Progresso do questionário"><span style="width:${pct}%"></span></div></div>`;
  }

  function render(stepId) {
    S.step = stepId; save();
    track('step', stepId);
    let html;
    if (stepId === 'privacidade') html = viewPrivacy();
    else if (stepId === 'cadastro1') html = viewReg1();
    else if (stepId === 'cadastro2') html = viewReg2();
    else if (stepId === 'cadastro3') html = viewReg3();
    else if (stepId === 'responsavel') html = viewGuardian();
    else html = viewQuestion(stepId);
    app.innerHTML = progressHtml(stepId) + html;
    bind(stepId);
    app.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
    const h = app.querySelector('h2'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }

  const navHtml = (canBack, nextLabel = 'Continuar') => `<div class="nav">${canBack ? '<button type="button" class="btn btn-ghost" data-back>← Voltar</button>' : '<span></span>'}<button type="submit" class="btn btn-primary">${nextLabel}</button></div>`;
  const fieldErr = (name) => `<span class="field-error" id="err-${name}" aria-live="polite"></span>`;

  // ---------- Telas ----------
  function viewPrivacy() {
    const c = CFG.consents;
    const box = (k, required) => `<label class="check ${required ? 'required-tag' : 'optional-tag'}"><input type="checkbox" name="${k}" ${S.consents[k] ? 'checked' : ''} aria-describedby="err-consent_${k}"><span>${esc(c[k].text)}</span></label>${fieldErr(`consent_${k}`)}`;
    return `<form class="card step" novalidate>
      <h2>Antes de começar: sua privacidade</h2>
      <dl class="privacy-summary">
        <dt>Quem é responsável</dt><dd>Dra. Fernanda Zemlicski, Biomédica Esteta (CRBM 40187).</dd>
        <dt>Por que coletamos</dt><dd>Para gerar sua análise cosmética educativa, registrar sua participação e avisar a Dra. Fernanda de que você concluiu.</dd>
        <dt>Dados de saúde</dt><dd>Usados só para aplicar precauções de segurança. Ficam criptografados, com acesso restrito e registrado, e nunca são enviados por WhatsApp.</dd>
        <dt>Por quanto tempo</dt><dd>Pelo prazo informado no aviso; depois são excluídos automaticamente.</dd>
        <dt>Seus direitos</dt><dd>Acesso, correção, exclusão e revogação a qualquer momento pela página do aviso.</dd>
      </dl>
      <p class="small"><a href="/privacidade" target="_blank" rel="noopener">Ler o Aviso de Privacidade completo (versão ${esc(CFG.policyVersion)})</a></p>
      <fieldset class="form" style="border:0;padding:0;margin:0"><legend class="visually-hidden">Consentimentos</legend>
        ${box('participacao', true)}${box('dados_saude', true)}${box('whatsapp_publicidade', false)}
      </fieldset>
      ${navHtml(false, 'Concordo e quero continuar')}
    </form>`;
  }

  function viewReg1() {
    const r = S.reg;
    return `<form class="card step form" novalidate>
      <h2>Vamos nos conhecer</h2>
      <label class="field"><span>Nome completo</span><input type="text" name="fullName" autocomplete="name" maxlength="120" value="${esc(r.fullName || '')}" required aria-describedby="err-fullName">${fieldErr('fullName')}</label>
      <label class="field"><span>Data de nascimento</span><input type="date" name="birthDate" value="${esc(r.birthDate || '')}" max="${new Date().toISOString().slice(0, 10)}" min="1900-01-01" required aria-describedby="err-birthDate">${fieldErr('birthDate')}</label>
      <label class="field"><span>Sexo</span><select name="sex" required aria-describedby="err-sex"><option value="">Selecione</option>${CFG.sexOptions.map((o) => `<option value="${o.value}" ${r.sex === o.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>${fieldErr('sex')}</label>
      ${navHtml(true)}
    </form>`;
  }

  function viewReg2() {
    const r = S.reg;
    return `<form class="card step form" novalidate>
      <h2>Seu contato</h2>
      <label class="field"><span>País de residência</span><select name="country" data-countries required aria-describedby="err-country"><option>Carregando…</option></select>${fieldErr('country')}</label>
      <div class="row row-phone">
        <label class="field"><span>Código</span><input type="text" name="callingCode" readonly tabindex="-1" aria-label="Código telefônico internacional" value=""></label>
        <label class="field"><span>DDD</span><input type="tel" name="areaCode" inputmode="numeric" maxlength="5" value="${esc(r.areaCode || '')}" aria-describedby="hint-ddd"></label>
        <label class="field"><span>Celular</span><input type="tel" name="phone" inputmode="tel" autocomplete="tel-national" maxlength="20" value="${esc(r.phone || '')}" required aria-describedby="err-phone"></label>
      </div>
      <small id="hint-ddd" class="muted small">DDD ou código de área, quando aplicável no seu país.</small>
      ${fieldErr('phone')}
      <fieldset class="options" style="margin:0"><legend class="field"><span>Este número possui WhatsApp?</span></legend>
        ${[['sim', 'Sim, possui WhatsApp'], ['nao', 'Não possui']].map(([v, l]) => `<label class="option"><input type="radio" name="hasWhatsapp" value="${v}" ${r.hasWhatsapp === v ? 'checked' : ''}><span class="mark"></span><span>${l}</span></label>`).join('')}
      </fieldset>${fieldErr('hasWhatsapp')}
      ${navHtml(true)}
    </form>`;
  }

  function viewReg3() {
    const r = S.reg;
    return `<form class="card step form" novalidate>
      <h2>Onde você mora e o que busca</h2>
      <div class="row row-2">
        <label class="field"><span>Cidade</span><input type="text" name="city" autocomplete="address-level2" maxlength="80" value="${esc(r.city || '')}" required aria-describedby="err-city">${fieldErr('city')}</label>
        <label class="field"><span>Estado, província ou região</span><input type="text" name="region" autocomplete="address-level1" maxlength="80" value="${esc(r.region || '')}" required aria-describedby="err-region">${fieldErr('region')}</label>
      </div>
      <fieldset class="options" style="margin:0"><legend class="field"><span>Principal objetivo com os cuidados da pele</span></legend>
        ${CFG.goals.map((g) => `<label class="option"><input type="radio" name="goal" value="${g.value}" ${r.goal === g.value ? 'checked' : ''}><span class="mark"></span><span>${esc(g.label)}</span></label>`).join('')}
      </fieldset>${fieldErr('goal')}
      <label class="field" data-goal-other ${r.goal === 'outro' ? '' : 'hidden'}><span>Qual objetivo?</span><input type="text" name="goalOther" maxlength="100" value="${esc(r.goalOther || '')}"></label>
      <p class="form-msg" role="alert"></p>
      ${navHtml(true, 'Continuar')}
    </form>`;
  }

  function viewGuardian() {
    return `<form class="card step form" novalidate>
      <h2>Autorização do responsável</h2>
      <div class="alert alert-warn">Como a participante ou o participante tem menos de 18 anos, um responsável legal precisa acompanhar e autorizar. As orientações serão limitadas a cuidados básicos e seguros: limpeza suave, hidratação e fotoproteção.</div>
      <label class="field"><span>Nome completo do responsável legal</span><input type="text" name="guardianName" maxlength="120" value="${esc(S.reg.guardianName || '')}" required aria-describedby="err-guardianName">${fieldErr('guardianName')}</label>
      <label class="check required-tag"><input type="checkbox" name="responsavel_legal" ${S.consents.responsavel_legal ? 'checked' : ''}><span>${esc(CFG.consents.responsavel_legal.text)}</span></label>${fieldErr('consent_responsavel_legal')}
      <p class="form-msg" role="alert"></p>
      ${navHtml(true)}
    </form>`;
  }

  function findQ(id) { return Q.health.find((q) => q.id === id) || Q.skin.find((q) => q.id === id); }
  function answersFor(id) { return id.startsWith('h') ? S.health : S.skin; }

  function viewQuestion(id) {
    const q = findQ(id);
    const ans = answersFor(id);
    const val = ans[id];
    const multi = !!q.multi;
    const type = multi ? 'checkbox' : 'radio';
    const opts = q.options.map((o) => {
      const checked = multi ? (val || []).includes(o.value) : val === o.value;
      return `<label class="option ${multi ? 'multi' : ''}"><input type="${type}" name="${id}" value="${o.value}" ${checked ? 'checked' : ''} ${o.exclusive ? 'data-exclusive' : ''}><span class="mark"></span><span>${esc(o.label)}</span></label>`;
    }).join('');
    const follow = q.followUp ? `<label class="field" data-follow ${val === q.followUp.when ? '' : 'hidden'}><span>${esc(q.followUp.label)}</span><input type="text" name="${q.followUp.field}" maxlength="${q.followUp.maxLength}" value="${esc(ans[q.followUp.field] || '')}"></label>` : '';
    const hint = q.hint || (multi && !q.max ? 'Você pode marcar mais de uma opção.' : '');
    return `<form class="card step" novalidate>
      <h2 id="q-title">${esc(q.title)}</h2>
      ${hint ? `<p class="hint">${esc(hint)}</p>` : ''}
      <fieldset class="options" aria-labelledby="q-title">${opts}</fieldset>
      ${follow}
      <p class="form-msg" role="alert"></p>
      ${navHtml(!(id === Q.health[0].id && S.token), isLast(id) ? 'Ver meu resultado' : 'Continuar')}
    </form>`;
  }
  const isLast = (id) => { const all = steps(); return all[all.length - 1] === id; };

  // ---------- Comportamento ----------
  function showErrors(form, fields) {
    form.querySelectorAll('.field-error').forEach((e) => { e.textContent = ''; });
    form.querySelectorAll('.invalid').forEach((e) => e.classList.remove('invalid'));
    let first = null;
    for (const [k, msg] of Object.entries(fields)) {
      const el = form.querySelector(`#err-${k}`);
      if (el) { el.textContent = msg; const f = el.closest('.field'); if (f) f.classList.add('invalid'); first = first || el; }
    }
    if (first) {
      const input = first.closest('.field')?.querySelector('input,select') || first.previousElementSibling;
      (input || first).scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (input && input.focus) input.focus({ preventScroll: true });
    }
    return Object.keys(fields).length === 0;
  }

  function go(delta) {
    const all = steps();
    const i = all.indexOf(S.step);
    const next = all[i + delta];
    if (next) render(next);
  }

  function bind(stepId) {
    const form = app.querySelector('form');
    form.querySelector('[data-back]')?.addEventListener('click', () => {
      if (steps().indexOf(stepId) === 0) { location.href = '/'; return; }
      go(-1);
    });

    if (stepId === 'cadastro2') {
      const sel = form.querySelector('[data-countries]');
      const code = form.querySelector('[name=callingCode]');
      const sync = () => { const o = sel.selectedOptions[0]; code.value = o && o.dataset.code ? `+${o.dataset.code}` : ''; };
      window.DSP.fillCountries(sel, S.reg.country || 'BR').then(sync)
        .catch(() => { sel.innerHTML = '<option value="">Não foi possível carregar os países</option>'; });
      sel.addEventListener('change', sync);
    }
    if (stepId === 'cadastro3') {
      form.querySelectorAll('[name=goal]').forEach((r) => r.addEventListener('change', () => { form.querySelector('[data-goal-other]').hidden = r.value !== 'outro' || !r.checked; }));
    }

    // Opções múltiplas: exclusivas e limite
    const q = Q && findQ(stepId);
    if (q) {
      const inputs = [...form.querySelectorAll(`[name=${stepId}]`)];
      const enforce = () => {
        if (q.multi && q.max) {
          const n = inputs.filter((i) => i.checked).length;
          inputs.forEach((i) => { if (!i.checked) { i.disabled = n >= q.max; i.closest('.option').style.opacity = n >= q.max ? '.5' : ''; } });
        }
        const follow = form.querySelector('[data-follow]');
        if (follow) follow.hidden = !inputs.some((i) => i.checked && i.value === q.followUp.when);
      };
      inputs.forEach((inp) => inp.addEventListener('change', () => {
        if (q.multi && inp.checked) {
          if (inp.hasAttribute('data-exclusive')) inputs.forEach((o) => { if (o !== inp) o.checked = false; });
          else inputs.forEach((o) => { if (o.hasAttribute('data-exclusive')) o.checked = false; });
        }
        enforce();
      }));
      enforce();
    }

    form.addEventListener('submit', (ev) => { ev.preventDefault(); onSubmit(stepId, form); });
  }

  function onSubmit(stepId, form) {
    const fd = new FormData(form);
    const msg = form.querySelector('.form-msg');
    if (stepId === 'privacidade') {
      ['participacao', 'dados_saude', 'whatsapp_publicidade'].forEach((k) => { S.consents[k] = form.querySelector(`[name=${k}]`).checked; });
      const errs = {};
      if (!S.consents.participacao) errs.consent_participacao = 'Este consentimento é necessário para participar.';
      if (!S.consents.dados_saude) errs.consent_dados_saude = 'Necessário para aplicarmos as precauções de segurança da sua rotina.';
      save();
      if (showErrors(form, errs)) { track('consent'); go(1); }
      return;
    }
    if (stepId === 'cadastro1') {
      Object.assign(S.reg, { fullName: fd.get('fullName').trim(), birthDate: fd.get('birthDate'), sex: fd.get('sex') });
      const errs = {};
      if (S.reg.fullName.length < 3 || !/\s/.test(S.reg.fullName)) errs.fullName = 'Informe seu nome completo (nome e sobrenome).';
      const age = ageOf(S.reg.birthDate);
      if (age == null) errs.birthDate = 'Informe uma data de nascimento válida.';
      if (!S.reg.sex) errs.sex = 'Selecione uma opção (você pode escolher “Prefiro não informar”).';
      save();
      if (!showErrors(form, errs)) return;
      if (age < 12) { track('blocked_minor'); return renderBlockedMinor(); }
      S.needsGuardian = age < 18; save();
      return go(1);
    }
    if (stepId === 'cadastro2') {
      Object.assign(S.reg, { country: fd.get('country'), areaCode: (fd.get('areaCode') || '').trim(), phone: (fd.get('phone') || '').trim(), hasWhatsapp: fd.get('hasWhatsapp') });
      save();
      const errs = {};
      if (!S.reg.country) errs.country = 'Selecione o país.';
      if (S.reg.phone.replace(/\D/g, '').length < 6) errs.phone = 'Informe o número de celular.';
      if (!S.reg.hasWhatsapp) errs.hasWhatsapp = 'Informe se o número possui WhatsApp.';
      if (showErrors(form, errs)) go(1);
      return;
    }
    if (stepId === 'cadastro3' || stepId === 'responsavel') {
      if (stepId === 'cadastro3') {
        Object.assign(S.reg, { city: fd.get('city').trim(), region: fd.get('region').trim(), goal: fd.get('goal'), goalOther: (fd.get('goalOther') || '').trim() });
        const errs = {};
        if (S.reg.city.length < 2) errs.city = 'Informe sua cidade.';
        if (S.reg.region.length < 2) errs.region = 'Informe seu estado, província ou região.';
        if (!S.reg.goal) errs.goal = 'Selecione seu principal objetivo.';
        save();
        if (!showErrors(form, errs)) return;
        if (S.needsGuardian) return go(1);
      } else {
        S.reg.guardianName = fd.get('guardianName').trim();
        S.consents.responsavel_legal = form.querySelector('[name=responsavel_legal]').checked;
        save();
        const errs = {};
        if (S.reg.guardianName.length < 3) errs.guardianName = 'Informe o nome completo do responsável.';
        if (!S.consents.responsavel_legal) errs.consent_responsavel_legal = 'A autorização do responsável é necessária.';
        if (!showErrors(form, errs)) return;
      }
      return register(form, msg);
    }
    // Perguntas
    const q = findQ(stepId);
    const ans = answersFor(stepId);
    const values = fd.getAll(stepId);
    if (!values.length) { msg.textContent = 'Escolha uma opção para continuar.'; form.querySelector('input')?.focus(); return; }
    ans[stepId] = q.multi ? values : values[0];
    if (q.followUp) ans[q.followUp.field] = (fd.get(q.followUp.field) || '').trim();
    save();
    if (isLast(stepId)) return submitAll();
    go(1);
  }

  function ageOf(d) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); if (!m) return null;
    const b = new Date(+m[1], +m[2] - 1, +m[3]); const now = new Date();
    if (isNaN(b) || b > now || +m[1] < 1900) return null;
    let a = now.getFullYear() - b.getFullYear();
    if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--;
    return a;
  }

  async function register(form, msg) {
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Salvando…'; msg.textContent = '';
    try {
      const r = await api('/api/participants', { method: 'POST', body: { ...S.reg, consents: S.consents, source: origin.source, campaign: origin.campaign } });
      S.token = r.participantToken; S.firstName = r.firstName; save();
      track('registered');
      render(Q.health[0].id);
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Continuar';
      const f = (e.data && e.data.fields) || {};
      // Leva a pessoa à tela onde está o primeiro erro
      const where = [['cadastro1', ['fullName', 'birthDate', 'sex']], ['cadastro2', ['phone', 'country', 'hasWhatsapp']], ['cadastro3', ['city', 'region', 'goal']], ['privacidade', ['consent_participacao', 'consent_dados_saude']], ['responsavel', ['guardianName', 'consent_responsavel_legal']]]
        .find(([, keys]) => keys.some((k) => f[k]));
      if (where && where[0] !== S.step) { render(where[0]); showErrors(app.querySelector('form'), f); }
      else { showErrors(form, f); msg.textContent = e.message; }
    }
  }

  async function submitAll() {
    app.innerHTML = `<section class="card loading" aria-live="polite" aria-busy="true"><div class="spinner" aria-hidden="true"></div><h2>Analisando suas respostas…</h2><p class="muted">Estamos montando seu perfil de pele e sua rotina personalizada. Isso pode levar alguns segundos.</p></section>`;
    try {
      const r = await api(`/api/participants/${encodeURIComponent(S.token)}/submit`, { method: 'POST', body: { health: S.health, skin: S.skin, anonId } });
      store.del(STATE_KEY);
      store.set('dsp_last_result', r.resultToken);
      location.replace(`/resultado/${encodeURIComponent(r.resultToken)}`);
    } catch (e) {
      const last = store.get('dsp_last_result');
      if (e.status === 409 && last) { store.del(STATE_KEY); location.replace(`/resultado/${encodeURIComponent(last)}`); return; }
      app.innerHTML = `<section class="card center" role="alert"><h2>Não conseguimos gerar seu resultado</h2><p>${esc(e.message)}</p>
        ${e.data && e.data.details ? `<ul class="list" style="text-align:left">${e.data.details.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
        <p class="muted small">Suas respostas continuam salvas nesta aba.</p><button class="btn btn-primary" id="retry">Tentar novamente</button></section>`;
      document.getElementById('retry').addEventListener('click', submitAll);
    }
  }

  function renderBlockedMinor() {
    store.del(STATE_KEY);
    app.innerHTML = `<section class="card center" role="alert"><h2>Este questionário é para maiores de 12 anos</h2>
      <p>Para crianças, os cuidados com a pele devem ser orientados pelo pediatra ou dermatologista. Nenhum dado foi registrado.</p>
      <a class="btn btn-secondary" href="/">Voltar ao início</a></section>`;
  }

  async function start(resume) {
    const btn = document.getElementById('start-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Carregando…'; }
    try {
      await loadConfig();
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'QUERO DESCOBRIR MINHA PELE'; }
      alert(e.message); return;
    }
    if (!resume) {
      S = { step: null, reg: { country: 'BR' }, consents: {}, health: {}, skin: {}, token: null };
      track('start');
    }
    render(resume && S.step ? S.step : 'privacidade');
  }

  document.getElementById('start-btn')?.addEventListener('click', () => start(false));

  // Retomar progresso salvo nesta aba
  if (S.step) {
    const landing = document.getElementById('landing');
    const box = document.createElement('div');
    box.className = 'alert alert-ok';
    box.innerHTML = 'Você tem um questionário em andamento. <button class="btn btn-ghost" type="button" id="resume">Continuar de onde parei</button>';
    landing.insertBefore(box, landing.querySelector('.benefits'));
    document.getElementById('resume').addEventListener('click', () => start(true));
  }
})();
