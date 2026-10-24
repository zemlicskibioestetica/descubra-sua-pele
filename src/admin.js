import express from 'express';
import { db, getSetting, setSetting, SETTING_DEFS, audit, logError, deleteParticipantData } from './db.js';
import { randomToken, sha256, hashPassword, verifyPassword, passwordProblems, decrypt, rateLimit } from './security.js';
import { HEALTH_QUESTIONS, labelOf, goalLabel } from './questions.js';
import { CONSENT_LABELS } from './consents.js';
import { SKIN_TYPE_LABELS } from './engine.js';
import { countryName, fmtDateTime, SOURCES, tzModifier, todayLocal } from './util.js';
import { aiConfigured } from './ai.js';
import * as wa from './whatsapp.js';

const COOKIE = 'dsp_admin';
const SESSION_HOURS = 8;
const PROD = process.env.NODE_ENV === 'production';

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setCookie(res, value, maxAgeSec) {
  res.set('Set-Cookie', `${COOKIE}=${value}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${PROD ? '; Secure' : ''}`);
}

export function adminRouter({ baseUrl }) {
  const r = express.Router();
  r.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  // ---------- Autenticação ----------
  r.post('/login', rateLimit({ key: 'login', limit: 10, windowMs: 15 * 60_000 }), async (req, res) => {
    const email = String(req.body?.email || '').toLowerCase().trim();
    const password = String(req.body?.password || '');
    const u = await db.get('SELECT * FROM admin_users WHERE email = ?', email);
    const fail = () => res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    if (!u || !u.active) { verifyPassword(password, 'scrypt:AAAA:AAAA'); return fail(); }
    if (u.locked_until && new Date(`${u.locked_until.replace(' ', 'T')}Z`) > new Date()) return res.status(423).json({ error: 'Conta temporariamente bloqueada por excesso de tentativas. Tente em 15 minutos.' });
    if (!verifyPassword(password, u.password_hash)) {
      const failed = u.failed_logins + 1;
      await db.run(`UPDATE admin_users SET failed_logins=?, locked_until = CASE WHEN ? >= 5 THEN datetime('now','+15 minutes') ELSE locked_until END WHERE id=?`, failed >= 5 ? 0 : failed, failed, u.id);
      await db.run('INSERT INTO audit_log(user_id, action, ip) VALUES(?,?,?)', u.id, 'login_falhou', req.ip);
      return fail();
    }
    const token = randomToken(32);
    const csrf = randomToken(18);
    await db.run(`INSERT INTO admin_sessions(token_hash, user_id, csrf, expires_at) VALUES(?,?,?, datetime('now', ?))`, sha256(token), u.id, csrf, `+${SESSION_HOURS} hours`);
    await db.run(`UPDATE admin_users SET failed_logins=0, locked_until=NULL, last_login_at=datetime('now') WHERE id=?`, u.id);
    await db.run('INSERT INTO audit_log(user_id, action, ip) VALUES(?,?,?)', u.id, 'login', req.ip);
    setCookie(res, token, SESSION_HOURS * 3600);
    res.json({ user: { name: u.name, email: u.email, role: u.role }, csrf });
  });

  // Middleware de sessão + CSRF
  r.use(async (req, res, next) => {
    const token = parseCookies(req.get('cookie'))[COOKIE];
    if (!token) return res.status(401).json({ error: 'Faça login.' });
    const s = await db.get(`SELECT s.csrf, u.id, u.name, u.email, u.role, u.active FROM admin_sessions s JOIN admin_users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > datetime('now')`, sha256(token));
    if (!s || !s.active) return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    if (req.method !== 'GET' && req.get('x-csrf-token') !== s.csrf) return res.status(403).json({ error: 'Falha de verificação de segurança. Recarregue a página.' });
    req.admin = s; req.sessionToken = token;
    next();
  });
  const ownerOnly = (req, res, next) => (req.admin.role === 'proprietaria' ? next() : res.status(403).json({ error: 'Acesso restrito à proprietária.' }));

  r.get('/me', (req, res) => res.json({ user: { name: req.admin.name, email: req.admin.email, role: req.admin.role }, csrf: req.admin.csrf }));
  r.post('/logout', async (req, res) => {
    await db.run('DELETE FROM admin_sessions WHERE token_hash=?', sha256(req.sessionToken));
    setCookie(res, '', 0);
    res.json({ ok: true });
  });
  r.post('/password', async (req, res) => {
    const u = await db.get('SELECT * FROM admin_users WHERE id=?', req.admin.id);
    if (!verifyPassword(String(req.body?.current || ''), u.password_hash)) return res.status(422).json({ error: 'Senha atual incorreta.' });
    const prob = passwordProblems(req.body?.next);
    if (prob) return res.status(422).json({ error: prob });
    await db.run('UPDATE admin_users SET password_hash=? WHERE id=?', hashPassword(req.body.next), u.id);
    await db.run('DELETE FROM admin_sessions WHERE user_id=? AND token_hash<>?', u.id, sha256(req.sessionToken));
    await audit(req, 'senha_alterada', `usuario:${u.id}`);
    res.json({ ok: true });
  });

  // ---------- Participantes ----------
  function participantQuery(q) {
    const where = []; const args = [];
    if (q.id) { where.push('p.id = ?'); args.push(q.id); }
    if (q.q) { where.push('(p.full_name LIKE ? OR p.phone_e164 LIKE ? OR p.city LIKE ?)'); const like = `%${String(q.q).slice(0, 60)}%`; args.push(like, like, like); }
    if (q.from) { where.push('date(p.created_at, ?) >= date(?)'); args.push(tzModifier(), q.from); }
    if (q.to) { where.push('date(p.created_at, ?) <= date(?)'); args.push(tzModifier(), q.to); }
    if (q.source) { where.push('p.source = ?'); args.push(q.source); }
    if (q.skin) { where.push('r.skin_type = ?'); args.push(q.skin); }
    if (q.status) { where.push('p.status = ?'); args.push(q.status); }
    const sql = `SELECT p.id, p.public_id, p.full_name, p.country_iso, p.city, p.region, p.phone_e164, p.has_whatsapp, p.source, p.campaign, p.goal, p.goal_other,
        p.status, p.is_minor, p.created_at, p.completed_at, r.skin_type, r.confidence,
        (SELECT status FROM reports WHERE result_id = r.id AND kind='web' ORDER BY id DESC LIMIT 1) AS report_status,
        (SELECT status FROM notifications WHERE participant_id = p.id AND kind='owner_completion') AS notif_status,
        (SELECT group_concat(purpose || ':' || granted) FROM consents WHERE participant_id = p.id) AS consents,
        (SELECT COUNT(*) FROM contact_requests WHERE participant_id = p.id) AS contact_requests
      FROM participants p LEFT JOIN results r ON r.participant_id = p.id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY p.created_at DESC, p.id DESC`;
    return { sql, args };
  }
  const shapeRow = (x) => ({
    id: x.id, name: x.full_name, country: countryName(x.country_iso), region: `${x.city}/${x.region}`, phone: x.phone_e164, hasWhatsapp: !!x.has_whatsapp,
    source: SOURCES[x.source] || x.source, sourceKey: x.source, campaign: x.campaign, goal: x.goal === 'outro' && x.goal_other ? `Outro: ${x.goal_other}` : goalLabel(x.goal),
    status: x.status, minor: !!x.is_minor, createdAt: fmtDateTime(x.created_at), completedAt: fmtDateTime(x.completed_at),
    skinType: x.skin_type ? SKIN_TYPE_LABELS[x.skin_type] : '', confidence: x.confidence || '',
    reportStatus: x.report_status || (x.status === 'concluido' ? 'gerado' : 'pendente'), notificationStatus: x.notif_status || '—',
    consents: Object.fromEntries((x.consents || '').split(',').filter(Boolean).map((s) => { const [k, v] = s.split(':'); return [k, v === '1']; })),
    contactRequested: x.contact_requests > 0,
  });

  r.get('/participants', async (req, res) => {
    const { sql, args } = participantQuery(req.query);
    const limit = Math.min(Number(req.query.limit) || 50, 200); const offset = Math.max(Number(req.query.offset) || 0, 0);
    const { n: total } = await db.get(`SELECT COUNT(*) AS n FROM (${sql})`, ...args);
    const rows = (await db.all(`${sql} LIMIT ? OFFSET ?`, ...args, limit, offset)).map(shapeRow);
    res.json({ total, rows });
  });

  r.get('/participants/:id', async (req, res) => {
    const pq = participantQuery({ id: Number(req.params.id) });
    const x = await db.get(pq.sql, ...pq.args);
    if (!x) return res.status(404).json({ error: 'Participante não encontrado.' });
    const consents = (await db.all('SELECT purpose, granted, policy_version, created_at FROM consents WHERE participant_id=? ORDER BY id', x.id))
      .map((c) => ({ purpose: CONSENT_LABELS[c.purpose] || c.purpose, granted: !!c.granted, policyVersion: c.policy_version, at: fmtDateTime(c.created_at) }));
    const notifications = (await db.all('SELECT id, kind, status, attempts, last_error, created_at, sent_at FROM notifications WHERE participant_id=? ORDER BY id', x.id))
      .map((n) => ({ ...n, created_at: fmtDateTime(n.created_at), sent_at: fmtDateTime(n.sent_at) }));
    const p = await db.get('SELECT birth_date, sex, guardian_name FROM participants WHERE id=?', x.id);
    await audit(req, 'ver_participante', `participante:${x.id}`);
    res.json({ ...shapeRow(x), birthDate: p.birth_date, sex: p.sex, guardianName: p.guardian_name, consentLog: consents, notifications });
  });

  // Dados de saúde e relatório completo: somente proprietária, com registro de acesso
  r.get('/participants/:id/report', ownerOnly, async (req, res) => {
    const id = Number(req.params.id);
    const row = await db.get('SELECT r.result_enc, r.created_at, r.ai_status, a.health_enc FROM results r JOIN answers a ON a.participant_id = r.participant_id WHERE r.participant_id=?', id);
    if (!row) return res.status(404).json({ error: 'Relatório não encontrado (questionário não concluído ou dados excluídos).' });
    const health = JSON.parse(decrypt(row.health_enc));
    const healthReadable = HEALTH_QUESTIONS.map((q) => ({
      question: q.title,
      answer: [].concat(health[q.id] ?? []).map((v) => labelOf(HEALTH_QUESTIONS, q.id, v)).join(', ') + (q.followUp && health[q.followUp.field] ? ` — ${health[q.followUp.field]}` : ''),
    }));
    await audit(req, 'ver_relatorio_e_saude', `participante:${id}`, req.query.reason ? `motivo: ${String(req.query.reason).slice(0, 200)}` : null);
    res.json({ result: JSON.parse(decrypt(row.result_enc)), health: healthReadable, generatedAt: fmtDateTime(row.created_at), aiStatus: row.ai_status });
  });

  r.post('/participants/:id/deletion-request', async (req, res) => {
    const id = Number(req.params.id);
    const p = await db.get('SELECT full_name, phone_e164 FROM participants WHERE id=?', id);
    if (!p) return res.status(404).json({ error: 'Participante não encontrado.' });
    await db.run(`INSERT INTO privacy_requests(participant_id, type, requester_name, phone, message, origin) VALUES(?, 'exclusao', ?, ?, ?, 'painel')`,
      id, p.full_name, p.phone_e164, String(req.body?.note || '').slice(0, 500) || null);
    await audit(req, 'registrar_exclusao', `participante:${id}`);
    res.status(201).json({ ok: true });
  });

  // ---------- Exportação CSV (sem dados de saúde) ----------
  r.get('/export.csv', async (req, res) => {
    const { sql, args } = participantQuery(req.query);
    const rows = (await db.all(sql, ...args)).map(shapeRow);
    const cell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
    const header = ['Nome', 'Cadastro', 'Conclusão', 'País', 'Região', 'Celular', 'WhatsApp', 'Origem', 'Campanha', 'Tipo de pele estimado', 'Confiança', 'Objetivo', 'Status', 'Relatório', 'Notificação', 'Consent. participação', 'Consent. saúde', 'Consent. publicidade WhatsApp', 'Pediu contato'];
    const lines = rows.map((x) => [x.name, x.createdAt, x.completedAt, x.country, x.region, x.phone, x.hasWhatsapp ? 'sim' : 'não', x.source, x.campaign, x.skinType, x.confidence, x.goal, x.status, x.reportStatus, x.notificationStatus,
      x.consents.participacao ? 'sim' : 'não', x.consents.dados_saude ? 'sim' : 'não', x.consents.whatsapp_publicidade ? 'sim' : 'não', x.contactRequested ? 'sim' : 'não'].map(cell).join(';'));
    await audit(req, 'exportar_csv', null, `${rows.length} registros; filtros: ${JSON.stringify(req.query)}`);
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="participantes-${todayLocal()}.csv"` });
    res.send(`﻿${header.map(cell).join(';')}\n${lines.join('\n')}`);
  });

  // ---------- Métricas ----------
  r.get('/metrics', async (req, res) => {
    const today = todayLocal();
    const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : today;
    const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : new Date(Date.parse(`${to}T12:00:00Z`) - 29 * 864e5).toISOString().slice(0, 10);
    // Datas no fuso de exibição (Brasília por padrão), não em UTC
    const tz = tzModifier().replace(/[^\d+\- a-z]/g, '');
    const range = `date(created_at, '${tz}') BETWEEN date(?) AND date(?)`;
    const num = async (sql, ...args) => (await db.get(sql, ...args)).n;
    const distinct = (type) => num(`SELECT COUNT(DISTINCT anon_id) AS n FROM events WHERE type=? AND ${range}`, type, from, to);
    const count = (type) => num(`SELECT COUNT(*) AS n FROM events WHERE type=? AND ${range}`, type, from, to);
    const [visits, started, completed, contacts] = await Promise.all([distinct('visit'), distinct('start'), count('complete'), count('contact_request')]);
    const bySource = (await db.all(`SELECT source,
        COUNT(DISTINCT CASE WHEN type='visit' THEN anon_id END) AS visits,
        COUNT(DISTINCT CASE WHEN type='start' THEN anon_id END) AS started,
        SUM(CASE WHEN type='complete' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN type='contact_request' THEN 1 ELSE 0 END) AS contacts
      FROM events WHERE ${range} GROUP BY source ORDER BY visits DESC`, from, to))
      .map((x) => ({ ...x, label: SOURCES[x.source] || x.source }));
    const daily = await db.all(`SELECT date(created_at, '${tz}') AS day,
        COUNT(DISTINCT CASE WHEN type='visit' THEN anon_id END) AS visits,
        COUNT(DISTINCT CASE WHEN type='start' THEN anon_id END) AS started,
        SUM(CASE WHEN type='complete' THEN 1 ELSE 0 END) AS completed
      FROM events WHERE ${range} GROUP BY day ORDER BY day`, from, to);
    // Funil por etapa (pessoas distintas que chegaram a cada tela)
    const stepRows = await db.all(`SELECT step, COUNT(DISTINCT anon_id) AS n FROM events WHERE type='step' AND ${range} GROUP BY step`, from, to);
    const stepMap = Object.fromEntries(stepRows.map((s) => [s.step, s.n]));
    const order = ['privacidade', 'cadastro1', 'cadastro2', 'cadastro3', 'responsavel', ...Array.from({ length: 9 }, (_, i) => `h${i + 1}`), ...Array.from({ length: 12 }, (_, i) => `s${i + 1}`)];
    const funnel = [{ step: 'inicio', label: 'Clicou em começar', n: started }, ...order.filter((s) => s !== 'responsavel' || stepMap[s]).map((s) => ({ step: s, label: s, n: stepMap[s] || 0 })), { step: 'concluido', label: 'Concluiu', n: completed }];
    const skin = (await db.all(`SELECT skin_type, COUNT(*) AS n FROM results WHERE ${range} GROUP BY skin_type`, from, to)).map((x) => ({ label: SKIN_TYPE_LABELS[x.skin_type], n: x.n }));
    res.json({
      from, to, visits, started, completed,
      completionRate: started ? completed / started : null,
      reports: await num(`SELECT COUNT(*) AS n FROM reports WHERE kind='web' AND status='gerado' AND ${range}`, from, to),
      pdfs: await num(`SELECT COUNT(*) AS n FROM reports WHERE kind='pdf' AND status='gerado' AND ${range}`, from, to),
      contacts,
      bySource, daily, funnel, skin,
      pendingNotifications: await num(`SELECT COUNT(*) AS n FROM notifications WHERE status IN ('falhou','nao_configurada')`),
      openPrivacyRequests: await num(`SELECT COUNT(*) AS n FROM privacy_requests WHERE status='aberta'`),
    });
  });

  // ---------- Notificações e falhas ----------
  r.get('/notifications', async (req, res) => {
    const where = req.query.status ? 'WHERE n.status = ?' : '';
    const rows = (await db.all(`SELECT n.id, n.kind, n.status, n.attempts, n.last_error, n.provider_message_id, n.created_at, n.sent_at, n.next_attempt_at, p.full_name
      FROM notifications n LEFT JOIN participants p ON p.id = n.participant_id ${where} ORDER BY n.id DESC LIMIT 200`, ...(req.query.status ? [req.query.status] : [])))
      .map((n) => ({ ...n, created_at: fmtDateTime(n.created_at), sent_at: fmtDateTime(n.sent_at), next_attempt_at: fmtDateTime(n.next_attempt_at) }));
    res.json({ rows, config: wa.waConfigStatus() });
  });
  r.post('/notifications/:id/retry', async (req, res) => {
    const id = Number(req.params.id);
    await wa.resetForRetry(id);
    await wa.processNotification(id);
    const n = await db.get('SELECT status, last_error FROM notifications WHERE id=?', id);
    await audit(req, 'reenviar_notificacao', `notificacao:${id}`, n?.status);
    res.json(n || { error: 'Não encontrada' });
  });
  r.get('/errors', async (req, res) => {
    res.json((await db.all('SELECT id, scope, message, created_at FROM error_logs ORDER BY id DESC LIMIT 200')).map((e) => ({ ...e, created_at: fmtDateTime(e.created_at) })));
  });

  // ---------- Solicitações LGPD ----------
  r.get('/privacy-requests', async (req, res) => {
    res.json((await db.all(`SELECT pr.*, u.name AS resolved_by_name FROM privacy_requests pr LEFT JOIN admin_users u ON u.id = pr.resolved_by ORDER BY pr.status='aberta' DESC, pr.id DESC LIMIT 300`))
      .map((x) => ({ ...x, created_at: fmtDateTime(x.created_at), resolved_at: fmtDateTime(x.resolved_at) })));
  });
  r.post('/privacy-requests/:id/resolve', ownerOnly, async (req, res) => {
    const id = Number(req.params.id);
    const pr = await db.get('SELECT * FROM privacy_requests WHERE id=?', id);
    if (!pr || pr.status !== 'aberta') return res.status(404).json({ error: 'Solicitação não encontrada ou já resolvida.' });
    const action = req.body?.action; // concluir | recusar | excluir_dados
    const notes = String(req.body?.notes || '').slice(0, 500) || null;
    if (action === 'excluir_dados') {
      if (!pr.participant_id) return res.status(422).json({ error: 'Nenhum participante vinculado a esta solicitação.' });
      if (req.body?.confirm !== 'EXCLUIR') return res.status(422).json({ error: 'Digite EXCLUIR para confirmar.' });
      const pid = pr.participant_id;
      try { await deleteParticipantData(pid); } catch (e) { logError('exclusao', e.message, e.stack); return res.status(500).json({ error: 'Falha ao excluir.' }); }
      await db.run(`UPDATE privacy_requests SET status='concluida', notes=?, resolved_at=datetime('now'), resolved_by=?, requester_name='[removido]', phone=NULL, message=NULL WHERE id=?`,
        notes || 'Dados excluídos', req.admin.id, id);
      await audit(req, 'excluir_dados_participante', `participante:${pid}`, `solicitação ${id}`);
    } else if (action === 'concluir' || action === 'recusar') {
      await db.run(`UPDATE privacy_requests SET status=?, notes=?, resolved_at=datetime('now'), resolved_by=? WHERE id=?`, action === 'concluir' ? 'concluida' : 'recusada', notes, req.admin.id, id);
      await audit(req, `solicitacao_${action}`, `solicitacao:${id}`);
    } else return res.status(422).json({ error: 'Ação inválida.' });
    res.json({ ok: true });
  });
  r.post('/privacy-requests/:id/link', ownerOnly, async (req, res) => {
    const pid = Number(req.body?.participantId);
    if (!(await db.get('SELECT 1 AS x FROM participants WHERE id=?', pid))) return res.status(404).json({ error: 'Participante não encontrado.' });
    await db.run('UPDATE privacy_requests SET participant_id=? WHERE id=?', pid, Number(req.params.id));
    await audit(req, 'vincular_solicitacao', `solicitacao:${req.params.id}`, `participante:${pid}`);
    res.json({ ok: true });
  });

  // ---------- Contatos solicitados ----------
  r.get('/contacts', async (req, res) => {
    res.json((await db.all(`SELECT c.id, c.message, c.status, c.created_at, p.id AS participant_id, p.full_name, p.phone_e164 FROM contact_requests c JOIN participants p ON p.id = c.participant_id ORDER BY c.id DESC LIMIT 300`))
      .map((x) => ({ ...x, created_at: fmtDateTime(x.created_at) })));
  });
  r.post('/contacts/:id', async (req, res) => {
    const status = ['nova', 'em_atendimento', 'concluida'].includes(req.body?.status) ? req.body.status : null;
    if (!status) return res.status(422).json({ error: 'Status inválido.' });
    await db.run('UPDATE contact_requests SET status=? WHERE id=?', status, Number(req.params.id));
    res.json({ ok: true });
  });

  // ---------- Links de divulgação ----------
  r.get('/links', (req, res) => {
    const configured = getSetting('public_base_url');
    const base = configured || baseUrl(req);
    const mk = (src, campaign) => `${base}/?utm_source=${src}${campaign ? `&utm_campaign=${encodeURIComponent(campaign)}` : ''}`;
    res.json({
      published: Boolean(configured), base,
      links: [
        { label: 'TikTok (bio)', url: mk('tiktok', 'bio') },
        { label: 'TikTok (vídeos/comentários)', url: mk('tiktok', 'video') },
        { label: 'Instagram (bio)', url: mk('instagram', 'bio') },
        { label: 'Instagram (stories)', url: mk('instagram', 'stories') },
        { label: 'Facebook (página e posts)', url: mk('facebook', 'pagina') },
        { label: 'WhatsApp (status/listas)', url: mk('whatsapp') },
        { label: 'Indicação direta', url: mk('indicacao') },
      ],
    });
  });

  // ---------- Configurações (somente proprietária) ----------
  r.get('/settings', ownerOnly, (req, res) => {
    const out = {};
    for (const [key, def] of Object.entries(SETTING_DEFS)) {
      const v = getSetting(key);
      out[key] = { label: def.label, secret: !!def.secret, value: def.secret ? '' : v, isSet: Boolean(v) };
    }
    res.json({ settings: out, whatsapp: wa.waConfigStatus(), aiConfigured: aiConfigured(), webhookUrl: `${getSetting('public_base_url') || baseUrl(req)}/webhooks/whatsapp` });
  });
  r.put('/settings', ownerOnly, async (req, res) => {
    const body = req.body || {};
    // Valida tudo antes de gravar qualquer coisa
    for (const [key, value] of Object.entries(body)) {
      const def = SETTING_DEFS[key];
      if (!def) continue;
      if (key === 'retention_days' && !(Number(value) >= 30)) return res.status(422).json({ error: 'A retenção mínima é de 30 dias.' });
      if (key === 'wa_mode' && !['template', 'text'].includes(value)) return res.status(422).json({ error: 'Modo inválido.' });
      if (['public_base_url', 'instagram_url', 'tiktok_url'].includes(key) && value && !/^https:\/\/[^\s]+$/.test(value)) return res.status(422).json({ error: `${def.label}: use um endereço https:// válido.` });
    }
    const changed = [];
    for (const [key, value] of Object.entries(body)) {
      const def = SETTING_DEFS[key];
      if (!def) continue;
      if (def.secret && (value === '' || value == null)) continue; // vazio = manter segredo atual
      await setSetting(key, value);
      changed.push(key);
    }
    if (body.clear_secret && SETTING_DEFS[body.clear_secret]?.secret) { await setSetting(body.clear_secret, ''); changed.push(`${body.clear_secret}(removido)`); }
    await audit(req, 'alterar_configuracoes', null, changed.join(', '));
    // Notificações aguardando configuração voltam para a fila
    if (wa.waConfigStatus().configured) {
      for (const { id } of await db.all(`SELECT id FROM notifications WHERE status='nao_configurada'`)) {
        await wa.resetForRetry(id);
        await wa.processNotification(id);
      }
    }
    res.json({ ok: true, changed });
  });
  r.post('/settings/test-whatsapp', ownerOnly, async (req, res) => {
    const cfg = wa.waConfigStatus();
    if (!cfg.configured) return res.status(422).json({ error: `Integração incompleta. Falta: ${cfg.missing.join(', ')}` });
    const now = new Date();
    const { row } = await wa.enqueue({
      kind: 'test', dedupeKey: `test:${now.getTime()}`, recipient: getSetting('owner_whatsapp'),
      params: { nome: 'Teste', pais: 'Brasil', telefone: '+55 (teste)', regiao: 'Teste', conclusao: now.toLocaleString('pt-BR'), resultado: 'Teste', objetivo: 'Teste', origem: 'Painel', status: 'teste' },
    });
    await wa.processNotification(row.id);
    const n = await db.get('SELECT status, last_error, provider_message_id FROM notifications WHERE id=?', row.id);
    await audit(req, 'testar_whatsapp', null, n.status);
    if (n.status === 'enviada') return res.json({ ok: true, message: `A API do WhatsApp aceitou a mensagem (id ${n.provider_message_id}). Confira o recebimento no aparelho.` });
    res.status(502).json({ error: `A API recusou o envio: ${n.last_error}` });
  });

  // ---------- Usuários ----------
  r.get('/users', ownerOnly, async (req, res) => {
    res.json((await db.all('SELECT id, email, name, role, active, created_at, last_login_at FROM admin_users ORDER BY id'))
      .map((u) => ({ ...u, created_at: fmtDateTime(u.created_at), last_login_at: fmtDateTime(u.last_login_at) })));
  });
  r.post('/users', ownerOnly, async (req, res) => {
    const email = String(req.body?.email || '').toLowerCase().trim();
    const name = String(req.body?.name || '').trim().slice(0, 80);
    const role = req.body?.role === 'proprietaria' ? 'proprietaria' : 'equipe';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || name.length < 2) return res.status(422).json({ error: 'Informe nome e e-mail válidos.' });
    const prob = passwordProblems(req.body?.password);
    if (prob) return res.status(422).json({ error: prob });
    if (await db.get('SELECT 1 AS x FROM admin_users WHERE email=?', email)) return res.status(409).json({ error: 'Já existe um usuário com este e-mail.' });
    await db.run('INSERT INTO admin_users(email, name, password_hash, role) VALUES(?,?,?,?)', email, name, hashPassword(req.body.password), role);
    await audit(req, 'criar_usuario', email, role);
    res.status(201).json({ ok: true });
  });
  r.post('/users/:id/active', ownerOnly, async (req, res) => {
    const id = Number(req.params.id);
    if (id === req.admin.id) return res.status(422).json({ error: 'Você não pode desativar a própria conta.' });
    await db.run('UPDATE admin_users SET active=? WHERE id=?', req.body?.active ? 1 : 0, id);
    if (!req.body?.active) await db.run('DELETE FROM admin_sessions WHERE user_id=?', id);
    await audit(req, req.body?.active ? 'ativar_usuario' : 'desativar_usuario', `usuario:${id}`);
    res.json({ ok: true });
  });

  r.get('/audit', ownerOnly, async (req, res) => {
    res.json((await db.all('SELECT a.id, a.action, a.target, a.detail, a.ip, a.created_at, u.name FROM audit_log a LEFT JOIN admin_users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 300'))
      .map((x) => ({ ...x, created_at: fmtDateTime(x.created_at) })));
  });

  return r;
}
