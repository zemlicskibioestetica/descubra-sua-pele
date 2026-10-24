import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initKey, randomToken, sha256, encrypt, decrypt, hashPassword, rateLimit } from './security.js';
import { DATA_DIR } from './db.js';

initKey(DATA_DIR); // precisa vir antes de qualquer leitura de configuração secreta

const { db, initDb, getSetting, logError, deleteParticipantData } = await import('./db.js');
await initDb();
const { HEALTH_QUESTIONS, SKIN_QUESTIONS, GOALS, SEX_OPTIONS, validateAnswers, goalLabel } = await import('./questions.js');
const { CONSENTS } = await import('./consents.js');
const { analyze } = await import('./engine.js');
const { explainWithAI } = await import('./ai.js');
const { renderResultPdf } = await import('./pdf.js');
const wa = await import('./whatsapp.js');
const { countryList, countryName, validatePhone, ageFrom, fmtDateTime, normalizeSource, SOURCES, cleanText } = await import('./util.js');
const { adminRouter } = await import('./admin.js');
const { renderPrivacyPage, renderSharePage } = await import('./pages.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT || 3000);
const PROD = process.env.NODE_ENV === 'production';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer', // impede vazamento do link privado do resultado
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  if (PROD) res.set('Strict-Transport-Security', 'max-age=31536000');
  next();
});

app.use(express.json({ limit: '64kb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

// Verificação de funcionamento (usada pela hospedagem e pelo "despertador")
app.get('/saude', (req, res) => res.type('text').send('ok'));

// ---------- Páginas ----------
const sendPage = (file) => (req, res) => { res.set('Cache-Control', 'no-store'); res.sendFile(path.join(PUBLIC_DIR, file)); };
app.get('/', sendPage('index.html'));
app.get('/resultado/:token', sendPage('result.html'));
app.get('/admin', sendPage('admin.html'));
app.get('/privacidade', (req, res) => res.type('html').send(renderPrivacyPage()));
app.get('/c/:share', async (req, res) => {
  const row = await db.get('SELECT skin_type FROM results WHERE share_token = ?', String(req.params.share));
  if (!row) return res.status(404).type('html').send(renderSharePage(null));
  res.type('html').send(renderSharePage(row.skin_type));
});
// Logo da marca: coloque o arquivo em public/img/ com o nome logo.png, logo.jpg, logo.webp ou logo.svg
app.get('/logo', (req, res) => {
  for (const f of ['logo.png', 'logo.jpg', 'logo.jpeg', 'logo.webp', 'logo.svg']) {
    const p = path.join(PUBLIC_DIR, 'img', f);
    if (fs.existsSync(p)) { res.set('Cache-Control', 'public, max-age=3600'); return res.sendFile(p); }
  }
  res.status(404).end();
});
// Arquivos da página (JS/CSS): o navegador sempre confere se há versão nova antes de usar a cópia guardada,
// para que as atualizações do sistema apareçam na hora para todo mundo
app.use(express.static(PUBLIC_DIR, { index: false, setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));

// ---------- API pública ----------
const api = express.Router();
api.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

api.get('/config', (req, res) => {
  res.json({
    policyVersion: getSetting('policy_version'),
    instagramUrl: getSetting('instagram_url'),
    consents: CONSENTS,
    goals: GOALS,
    sexOptions: SEX_OPTIONS,
  });
});
api.get('/countries', (req, res) => { res.set('Cache-Control', 'public, max-age=86400'); res.json(countryList()); });
api.get('/questions', (req, res) => res.json({ health: HEALTH_QUESTIONS, skin: SKIN_QUESTIONS }));

const CLIENT_EVENTS = new Set(['visit', 'start', 'consent', 'registered', 'step', 'pdf', 'share', 'contact_click', 'blocked_minor']);
const INSERT_EVENT = 'INSERT INTO events(anon_id, type, source, campaign, step) VALUES(?,?,?,?,?)';
api.post('/events', rateLimit({ key: 'ev', limit: 300, windowMs: 10 * 60_000 }), async (req, res) => {
  const { anonId, type, source, campaign, step } = req.body || {};
  if (typeof anonId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(anonId) || !CLIENT_EVENTS.has(type)) return res.status(400).json({ error: 'Evento inválido.' });
  await db.run(INSERT_EVENT, anonId, type, normalizeSource(source), cleanText(campaign, 60) || null, cleanText(step, 20) || null);
  res.status(204).end();
});

// Cadastro + consentimentos
api.post('/participants', rateLimit({ key: 'reg', limit: 20, windowMs: 60 * 60_000 }), async (req, res) => {
  const b = req.body || {};
  const errors = {};
  const fullName = cleanText(b.fullName, 120);
  if (fullName.length < 3 || !/\s/.test(fullName)) errors.fullName = 'Informe seu nome completo.';
  const phone = validatePhone(String(b.country || ''), b.areaCode, b.phone);
  if (phone.error) errors.phone = phone.error;
  if (!['sim', 'nao'].includes(b.hasWhatsapp)) errors.hasWhatsapp = 'Informe se o número possui WhatsApp.';
  const age = ageFrom(b.birthDate);
  if (age == null) errors.birthDate = 'Informe uma data de nascimento válida.';
  if (!SEX_OPTIONS.some((s) => s.value === b.sex)) errors.sex = 'Selecione uma opção.';
  const city = cleanText(b.city, 80); const region = cleanText(b.region, 80);
  if (city.length < 2) errors.city = 'Informe sua cidade.';
  if (region.length < 2) errors.region = 'Informe seu estado, província ou região.';
  if (!GOALS.some((g) => g.value === b.goal)) errors.goal = 'Selecione seu principal objetivo.';
  const goalOther = b.goal === 'outro' ? cleanText(b.goalOther, 100) : null;

  const c = b.consents || {};
  if (c.participacao !== true) errors.consent_participacao = 'Este consentimento é necessário para participar.';
  if (c.dados_saude !== true) errors.consent_dados_saude = 'Este consentimento é necessário para aplicarmos as precauções de segurança.';
  if (age != null && age < 12) errors.birthDate = 'Este questionário não está disponível para menores de 12 anos.';
  const minor = age != null && age < 18;
  const guardianName = minor ? cleanText(b.guardianName, 120) : null;
  if (minor) {
    if (!guardianName || guardianName.length < 3) errors.guardianName = 'Informe o nome do responsável legal.';
    if (c.responsavel_legal !== true) errors.consent_responsavel_legal = 'A autorização do responsável legal é necessária.';
  }
  if (Object.keys(errors).length) return res.status(422).json({ error: 'Confira os campos destacados.', fields: errors });

  const token = randomToken();
  const policyVersion = getSetting('policy_version');
  const ua = cleanText(req.get('user-agent'), 200);
  const source = normalizeSource(b.source);
  await db.tx(async (t) => {
    const info = await t.run(`INSERT INTO participants(public_id, token_hash, full_name, country_iso, calling_code, area_code, phone_e164, has_whatsapp,
      birth_date, sex, city, region, goal, goal_other, is_minor, guardian_name, source, campaign) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    randomToken(9), sha256(token), fullName, b.country, phone.callingCode, cleanText(b.areaCode, 8) || null, phone.e164,
    b.hasWhatsapp === 'sim' ? 1 : 0, b.birthDate, b.sex, city, region, b.goal, goalOther, minor ? 1 : 0, guardianName, source, cleanText(b.campaign, 60) || null);
    for (const purpose of ['participacao', 'dados_saude', 'whatsapp_publicidade', ...(minor ? ['responsavel_legal'] : [])]) {
      await t.run('INSERT INTO consents(participant_id, purpose, granted, policy_version, text_snapshot, user_agent) VALUES(?,?,?,?,?,?)',
        info.lastInsertRowid, purpose, c[purpose] === true ? 1 : 0, policyVersion, CONSENTS[purpose].text, ua);
    }
  });
  res.status(201).json({ participantToken: token, minor, firstName: fullName.split(' ')[0] });
});

// Envio das respostas → análise → resultado → notificação
api.post('/participants/:token/submit', rateLimit({ key: 'sub', limit: 20, windowMs: 60 * 60_000 }), async (req, res) => {
  const p = await db.get('SELECT * FROM participants WHERE token_hash = ?', sha256(String(req.params.token)));
  if (!p) return res.status(404).json({ error: 'Cadastro não encontrado. Recomece o questionário.' });
  if (p.status === 'concluido') return res.status(409).json({ error: 'Este questionário já foi concluído.' });

  const health = validateAnswers(HEALTH_QUESTIONS, req.body?.health);
  const skin = validateAnswers(SKIN_QUESTIONS, req.body?.skin);
  if (!health.ok || !skin.ok) return res.status(422).json({ error: 'Algumas perguntas ficaram sem resposta.', details: [...health.errors, ...skin.errors] });

  const firstName = p.full_name.split(' ')[0];
  const age = ageFrom(p.birth_date);
  let result;
  try {
    const place = p.city.toLowerCase() === p.region.toLowerCase() ? p.city : `${p.city} (${p.region})`;
    result = analyze({ firstName, age, goal: p.goal, region: place }, health.clean, skin.clean);
  } catch (e) {
    logError('analise', `Falha na análise do participante ${p.id}: ${e.message}`, e.stack);
    return res.status(500).json({ error: 'Não foi possível gerar sua análise agora. Tente novamente em instantes.' });
  }
  const ai = await explainWithAI(result, firstName);
  result.aiExplanation = ai.text;

  const resultToken = randomToken();
  const anonId = typeof req.body?.anonId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(req.body.anonId) ? req.body.anonId : `srv-${randomToken(6)}`;
  let completedAt;
  try {
    await db.tx(async (t) => {
      // Garante uma única conclusão mesmo com cliques repetidos
      const upd = await t.run(`UPDATE participants SET status='concluido', completed_at=datetime('now') WHERE id=? AND status <> 'concluido'`, p.id);
      if (upd.changes === 0) throw Object.assign(new Error('já concluído'), { duplicate: true });
      await t.run('INSERT INTO answers(participant_id, health_enc, skin_json) VALUES(?,?,?)', p.id, encrypt(JSON.stringify(health.clean)), JSON.stringify(skin.clean));
      const r = await t.run('INSERT INTO results(participant_id, token_hash, skin_type, confidence, result_enc, ai_status, engine_version) VALUES(?,?,?,?,?,?,?)',
        p.id, sha256(resultToken), result.skinType, result.confidence, encrypt(JSON.stringify(result)), ai.status, result.engineVersion);
      await t.run(`INSERT INTO reports(result_id, kind, status) VALUES(?, 'web', 'gerado')`, r.lastInsertRowid);
      await t.run(INSERT_EVENT, anonId, 'complete', p.source, p.campaign, null);
      await t.run(INSERT_EVENT, anonId, 'report', p.source, p.campaign, null);
    });
    completedAt = (await db.get('SELECT completed_at FROM participants WHERE id=?', p.id)).completed_at;
  } catch (e) {
    if (e.duplicate) return res.status(409).json({ error: 'Este questionário já foi concluído.' });
    logError('banco', `Falha ao gravar resultado do participante ${p.id}: ${e.message}`, e.stack);
    return res.status(500).json({ error: 'Não foi possível salvar seu resultado. Tente novamente.' });
  }

  // Relatório confirmado → notificação única à proprietária (dados mínimos, nada de saúde)
  const { row } = await wa.enqueue({
    kind: 'owner_completion', dedupeKey: `completion:${p.id}`, participantId: p.id, recipient: getSetting('owner_whatsapp'),
    params: {
      nome: p.full_name, pais: countryName(p.country_iso), telefone: p.phone_e164, regiao: `${p.city}/${p.region}`,
      conclusao: fmtDateTime(completedAt), resultado: result.skinTypeLabel,
      objetivo: p.goal === 'outro' && p.goal_other ? `Outro: ${p.goal_other}` : goalLabel(p.goal),
      origem: SOURCES[p.source] || p.source, status: 'gerado',
    },
  });
  wa.processNotification(row.id).catch(() => {});

  res.status(201).json({ resultToken });
});

async function loadResult(token) {
  const r = await db.get(`SELECT r.*, p.full_name, p.phone_e164, p.has_whatsapp, p.id AS pid FROM results r JOIN participants p ON p.id = r.participant_id WHERE r.token_hash = ?`, sha256(String(token)));
  if (!r) return null;
  return { row: r, result: JSON.parse(decrypt(r.result_enc)) };
}

api.get('/results/:token', async (req, res) => {
  const lr = await loadResult(req.params.token);
  if (!lr) return res.status(404).json({ error: 'Resultado não encontrado ou removido.' });
  const { row, result } = lr;
  const waReady = wa.waConfigStatus().configured && Boolean(getSetting('wa_template_participant'));
  const contact = await db.get('SELECT 1 AS x FROM contact_requests WHERE participant_id = ?', row.pid);
  const waSent = await db.get('SELECT status FROM notifications WHERE dedupe_key = ?', `report:${row.pid}`);
  res.json({
    name: row.full_name,
    generatedAt: fmtDateTime(row.created_at),
    result,
    explanation: result.aiExplanation || result.explanation,
    explanationByAI: Boolean(result.aiExplanation),
    tiktokUrl: getSetting('tiktok_url'),
    instagramUrl: getSetting('instagram_url'),
    whatsappReportAvailable: waReady && row.has_whatsapp === 1,
    whatsappReportStatus: waSent?.status ?? null,
    contactRequested: Boolean(contact),
    consentTexts: { envio_relatorio_whatsapp: CONSENTS.envio_relatorio_whatsapp.text, contato_avaliacao: CONSENTS.contato_avaliacao.text },
  });
});

api.get('/results/:token/pdf', rateLimit({ key: 'pdf', limit: 30, windowMs: 60 * 60_000 }), async (req, res) => {
  const lr = await loadResult(req.params.token);
  if (!lr) return res.status(404).json({ error: 'Resultado não encontrado.' });
  const { row, result } = lr;
  try {
    const doc = renderResultPdf(result, { name: row.full_name, generatedAt: fmtDateTime(row.created_at), publicDir: PUBLIC_DIR, explanation: result.aiExplanation || result.explanation });
    await db.run(`INSERT INTO reports(result_id, kind, status) VALUES(?, 'pdf', 'gerado')`, row.id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `${req.query.inline ? 'inline' : 'attachment'}; filename="meu-perfil-de-pele.pdf"` });
    doc.pipe(res);
  } catch (e) {
    await db.run(`INSERT INTO reports(result_id, kind, status) VALUES(?, 'pdf', 'erro')`, row.id).catch(() => {});
    logError('pdf', `Falha ao gerar PDF do resultado ${row.id}: ${e.message}`, e.stack);
    res.status(500).json({ error: 'Não foi possível gerar o PDF agora.' });
  }
});

const baseUrl = (req) => (getSetting('public_base_url') || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

api.post('/results/:token/share', async (req, res) => {
  const lr = await loadResult(req.params.token);
  if (!lr) return res.status(404).json({ error: 'Resultado não encontrado.' });
  let share = lr.row.share_token;
  if (!share) { share = randomToken(9); await db.run('UPDATE results SET share_token=? WHERE id=?', share, lr.row.id); }
  res.json({ url: `${baseUrl(req)}/c/${share}` });
});

api.post('/results/:token/contact', rateLimit({ key: 'ct', limit: 5, windowMs: 60 * 60_000 }), async (req, res) => {
  const lr = await loadResult(req.params.token);
  if (!lr) return res.status(404).json({ error: 'Resultado não encontrado.' });
  if (req.body?.consent !== true) return res.status(422).json({ error: 'Para registrarmos sua solicitação, marque a autorização de contato.' });
  const p = await db.get('SELECT * FROM participants WHERE id=?', lr.row.pid);
  const existing = await db.get('SELECT id FROM contact_requests WHERE participant_id=?', p.id);
  if (!existing) {
    await db.tx(async (t) => {
      await t.run('INSERT INTO contact_requests(participant_id, message) VALUES(?,?)', p.id, cleanText(req.body?.message, 500) || null);
      await t.run('INSERT INTO consents(participant_id, purpose, granted, policy_version, text_snapshot, user_agent) VALUES(?,?,1,?,?,?)',
        p.id, 'contato_avaliacao', getSetting('policy_version'), CONSENTS.contato_avaliacao.text, cleanText(req.get('user-agent'), 200));
      await t.run(INSERT_EVENT, `pid-${p.public_id}`, 'contact_request', p.source, p.campaign, null);
    });
    const { row: n } = await wa.enqueue({
      kind: 'owner_contact', dedupeKey: `contact:${p.id}`, participantId: p.id, recipient: getSetting('owner_whatsapp'),
      params: { nome: p.full_name, telefone: p.phone_e164, data: fmtDateTime(new Date().toISOString().slice(0, 19).replace('T', ' ')), origem: SOURCES[p.source] || p.source },
    });
    wa.processNotification(n.id).catch(() => {});
  }
  res.json({ ok: true, message: 'Sua solicitação foi registrada. A equipe da Dra. Fernanda poderá entrar em contato pelo WhatsApp informado no cadastro.' });
});

api.post('/results/:token/whatsapp', rateLimit({ key: 'wr', limit: 5, windowMs: 60 * 60_000 }), async (req, res) => {
  const lr = await loadResult(req.params.token);
  if (!lr) return res.status(404).json({ error: 'Resultado não encontrado.' });
  if (req.body?.consent !== true) return res.status(422).json({ error: 'Marque a autorização para enviarmos o link.' });
  if (!wa.waConfigStatus().configured || !getSetting('wa_template_participant')) return res.status(409).json({ error: 'O envio pelo WhatsApp não está disponível no momento. Use o botão de PDF para salvar seu resultado.' });
  const p = await db.get('SELECT * FROM participants WHERE id=?', lr.row.pid);
  if (!p.has_whatsapp) return res.status(409).json({ error: 'O número cadastrado não foi informado como WhatsApp.' });
  await db.run('INSERT INTO consents(participant_id, purpose, granted, policy_version, text_snapshot, user_agent) VALUES(?,?,1,?,?,?)',
    p.id, 'envio_relatorio_whatsapp', getSetting('policy_version'), CONSENTS.envio_relatorio_whatsapp.text, cleanText(req.get('user-agent'), 200));
  const { row: n, duplicate } = await wa.enqueue({
    kind: 'participant_report', dedupeKey: `report:${p.id}`, participantId: p.id, recipient: p.phone_e164,
    params: { nome: p.full_name.split(' ')[0], link: `${baseUrl(req)}/resultado/${req.params.token}` },
  });
  if (!duplicate) await wa.processNotification(n.id);
  const status = await db.get('SELECT status, last_error FROM notifications WHERE id=?', n.id);
  if (['enviada', 'entregue', 'lida'].includes(status.status)) return res.json({ ok: true, message: 'Link enviado para o seu WhatsApp.' });
  res.status(502).json({ error: 'Não conseguimos confirmar o envio pelo WhatsApp agora. Salve seu resultado em PDF; a equipe verificará a falha.' });
});

// Solicitações de privacidade (acesso, correção, exclusão, revogação)
api.post('/privacy-requests', rateLimit({ key: 'pr', limit: 5, windowMs: 60 * 60_000 }), async (req, res) => {
  const b = req.body || {};
  const types = ['acesso', 'correcao', 'exclusao', 'revogacao'];
  if (!types.includes(b.type)) return res.status(422).json({ error: 'Selecione o tipo de solicitação.' });
  const name = cleanText(b.name, 120);
  if (name.length < 3) return res.status(422).json({ error: 'Informe seu nome completo.' });
  const phone = validatePhone(String(b.country || 'BR'), '', b.phone);
  if (phone.error) return res.status(422).json({ error: 'Informe o celular cadastrado, com DDD (formato internacional ou do país selecionado).' });
  const match = await db.get('SELECT id FROM participants WHERE phone_e164 = ? ORDER BY id DESC', phone.e164);
  await db.run(`INSERT INTO privacy_requests(participant_id, type, requester_name, phone, message, origin) VALUES(?,?,?,?,?, 'publico')`,
    match?.id ?? null, b.type, name, phone.e164, cleanText(b.message, 1000) || null);
  res.status(201).json({ ok: true, message: 'Solicitação registrada. Para sua segurança, a identidade será confirmada pelo WhatsApp informado antes do atendimento.' });
});

// Webhook do WhatsApp (status de entrega)
app.get('/webhooks/whatsapp', (req, res) => {
  const verify = getSetting('wa_webhook_verify_token');
  if (verify && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verify) return res.send(String(req.query['hub.challenge'] ?? ''));
  res.sendStatus(403);
});
app.post('/webhooks/whatsapp', async (req, res) => {
  if (!wa.verifyWebhookSignature(req.rawBody || Buffer.alloc(0), req.get('x-hub-signature-256'))) return res.sendStatus(401);
  try { await wa.applyStatusWebhook(req.body); } catch (e) { logError('webhook', e.message, e.stack); }
  res.sendStatus(200);
});

app.use('/api', api);
app.use('/api/admin', adminRouter({ baseUrl }));

app.use((req, res) => res.status(404).json({ error: 'Não encontrado.' }));
app.use((err, req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Requisição inválida.' });
  logError('servidor', err.message, err.stack);
  res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
});

// ---------- Tarefas de manutenção ----------
async function retentionJob() {
  try {
    const days = Math.max(30, Number(getSetting('retention_days')) || 730);
    const old = await db.all(`SELECT id FROM participants WHERE created_at < datetime('now', ?)`, `-${days} days`);
    for (const { id } of old) await deleteParticipantData(id);
    if (old.length) console.log(`[retenção] ${old.length} participante(s) removido(s) após ${days} dias.`);
    await db.run(`DELETE FROM admin_sessions WHERE expires_at < datetime('now')`);
    await db.run(`DELETE FROM error_logs WHERE created_at < datetime('now', '-365 days')`);
  } catch (e) { logError('retencao', e.message, e.stack); }
}

// Primeira conta administrativa via variáveis de ambiente (útil em hospedagens sem terminal)
async function bootstrapAdmin() {
  const { n } = await db.get('SELECT COUNT(*) AS n FROM admin_users');
  if (n === 0 && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    await db.run(`INSERT INTO admin_users(email, name, password_hash, role) VALUES(?,?,?, 'proprietaria')`,
      process.env.ADMIN_EMAIL.toLowerCase().trim(), process.env.ADMIN_NAME || 'Dra. Fernanda Zemlicski', hashPassword(process.env.ADMIN_PASSWORD));
    console.log(`[admin] Conta da proprietária criada para ${process.env.ADMIN_EMAIL}.`);
  } else if (n === 0) {
    console.warn('[admin] Nenhum usuário administrativo. Defina ADMIN_EMAIL e ADMIN_PASSWORD ou rode: npm run create-admin -- email@exemplo.com "Senha" "Nome"');
  }
}

export async function start() {
  await bootstrapAdmin();
  await retentionJob();
  setInterval(retentionJob, 12 * 60 * 60_000).unref();
  wa.startRetryWorker();
  return app.listen(PORT, () => console.log(`Descubra Sua Pele rodando em http://localhost:${PORT}`));
}

export { app };
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  start().catch((e) => { console.error('Falha ao iniciar:', e); process.exit(1); });
}
