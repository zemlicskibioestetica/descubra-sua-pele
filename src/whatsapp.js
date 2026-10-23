// Integração com a API oficial do WhatsApp Business (Meta Cloud API).
// Nenhuma mensagem é marcada como "enviada" sem o retorno de sucesso da API (id da mensagem).
import crypto from 'node:crypto';
import { db, getSetting, logError } from './db.js';
import { encrypt, decrypt } from './security.js';

const BACKOFF_MIN = [1, 5, 15, 60, 240];
export const MAX_ATTEMPTS = BACKOFF_MIN.length;

export function waConfigStatus() {
  const missing = [];
  if (!getSetting('wa_phone_number_id')) missing.push('Phone Number ID');
  if (!getSetting('wa_access_token')) missing.push('Token de acesso');
  if (!getSetting('owner_whatsapp')) missing.push('Número de destino da proprietária');
  const mode = getSetting('wa_mode');
  if (mode === 'template' && !getSetting('wa_template_owner')) missing.push('Nome do modelo de mensagem aprovado');
  return { configured: missing.length === 0, missing, mode };
}

const digits = (s) => String(s || '').replace(/\D/g, '');
// Parâmetros de modelo não aceitam quebras de linha, tabs ou 4+ espaços seguidos
const cleanParam = (s) => String(s ?? '-').replace(/[\n\r\t]+/g, ' ').replace(/ {4,}/g, ' ').trim().slice(0, 300) || '-';

export function ownerMessageText(p) {
  return `✨ NOVO PARTICIPANTE — DESCUBRA SUA PELE

Uma pessoa concluiu a análise cosmética.

Nome: ${p.nome}
País: ${p.pais}
Celular: ${p.telefone}
Região: ${p.regiao}
Data e horário: ${p.conclusao}
Tipo de pele estimado: ${p.resultado}
Principal interesse: ${p.objetivo}
Origem: ${p.origem}
Status do relatório: ${p.status}

Consulte o painel administrativo para acessar os dados autorizados.`;
}

const OWNER_PARAM_ORDER = ['nome', 'pais', 'telefone', 'regiao', 'conclusao', 'resultado', 'objetivo', 'origem', 'status'];

export function contactMessageText(p) {
  return `📩 SOLICITAÇÃO DE CONTATO — DESCUBRA SUA PELE

${p.nome} (${p.telefone}) pediu informações sobre avaliação estética individualizada.
Data e horário: ${p.data}
Origem: ${p.origem}

Consulte o painel administrativo.`;
}
const CONTACT_PARAM_ORDER = ['nome', 'telefone', 'data', 'origem'];

/**
 * Enfileira uma notificação. Retorna a linha criada ou a existente (duplicidade).
 * kind: owner_completion | owner_contact | participant_report | test
 */
export function enqueue({ kind, dedupeKey, participantId = null, recipient, params }) {
  const preview = kind === 'owner_completion' ? ownerMessageText(params)
    : kind === 'owner_contact' ? contactMessageText(params)
    : kind === 'participant_report' ? `Link do resultado enviado ao participante`
    : 'Mensagem de teste do painel — Descubra Sua Pele';
  const info = db.prepare(`INSERT OR IGNORE INTO notifications(participant_id, kind, dedupe_key, recipient, body_preview, params_enc, status, next_attempt_at)
    VALUES(?,?,?,?,?,?, 'pendente', datetime('now'))`)
    .run(participantId, kind, dedupeKey, recipient || '', preview, encrypt(JSON.stringify(params)));
  const row = db.prepare('SELECT * FROM notifications WHERE dedupe_key = ?').get(dedupeKey);
  return { row, duplicate: info.changes === 0 };
}

function buildPayload(n, params) {
  const mode = getSetting('wa_mode');
  const lang = getSetting('wa_template_lang') || 'pt_BR';
  const to = digits(n.recipient);
  const template = (name, order) => ({
    messaging_product: 'whatsapp', to, type: 'template',
    template: { name, language: { code: lang }, components: [{ type: 'body', parameters: order.map((k) => ({ type: 'text', text: cleanParam(params[k]) })) }] },
  });
  switch (n.kind) {
    case 'owner_completion':
      return mode === 'text'
        ? { messaging_product: 'whatsapp', to, type: 'text', text: { body: ownerMessageText(params) } }
        : template(getSetting('wa_template_owner'), OWNER_PARAM_ORDER);
    case 'owner_contact':
      return mode === 'text' || !getSetting('wa_template_contact')
        ? { messaging_product: 'whatsapp', to, type: 'text', text: { body: contactMessageText(params) } }
        : template(getSetting('wa_template_contact'), CONTACT_PARAM_ORDER);
    case 'participant_report':
      // Mensagem iniciada pela empresa ao participante: exige modelo aprovado.
      return template(getSetting('wa_template_participant'), ['nome', 'link']);
    case 'test':
      return mode === 'text'
        ? { messaging_product: 'whatsapp', to, type: 'text', text: { body: 'Teste do painel Descubra Sua Pele: a integração com o WhatsApp está respondendo.' } }
        : template(getSetting('wa_template_owner'), OWNER_PARAM_ORDER);
    default:
      throw new Error(`Tipo de notificação desconhecido: ${n.kind}`);
  }
}

async function callApi(payload) {
  const version = getSetting('wa_api_version') || 'v21.0';
  const url = `https://graph.facebook.com/${encodeURIComponent(version)}/${encodeURIComponent(getSetting('wa_phone_number_id'))}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getSetting('wa_access_token')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  let body = null;
  try { body = await res.json(); } catch { /* resposta sem JSON */ }
  const id = body?.messages?.[0]?.id;
  if (res.ok && id) return { ok: true, id };
  const err = body?.error;
  const msg = err ? `${err.code ?? res.status}: ${err.message}${err.error_data?.details ? ` — ${err.error_data.details}` : ''}` : `HTTP ${res.status}`;
  // 4xx de configuração (token, modelo inexistente, parâmetros) não melhoram com reenvio automático
  const permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
  return { ok: false, error: msg, permanent };
}

const sending = new Set();

export async function processNotification(id) {
  if (sending.has(id)) return;
  sending.add(id);
  try {
    const n = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
    if (!n || ['enviada', 'entregue', 'lida', 'cancelada'].includes(n.status)) return;
    // Mensagens à proprietária usam sempre o número configurado no momento do envio
    if (n.kind !== 'participant_report') {
      const owner = getSetting('owner_whatsapp');
      if (owner && owner !== n.recipient) { db.prepare('UPDATE notifications SET recipient=? WHERE id=?').run(owner, id); n.recipient = owner; }
    }
    const params = JSON.parse(decrypt(n.params_enc) || '{}');
    const cfg = waConfigStatus();
    if (n.kind === 'participant_report' && !getSetting('wa_template_participant')) cfg.missing.push('Modelo para envio ao participante');
    if (!getSetting('wa_phone_number_id') || !getSetting('wa_access_token') || (n.kind !== 'participant_report' && !n.recipient)) {
      db.prepare(`UPDATE notifications SET status='nao_configurada', last_error=?, updated_at=datetime('now'), next_attempt_at=NULL WHERE id=?`)
        .run(`Integração não configurada. Falta: ${cfg.missing.join(', ')}`, id);
      return;
    }
    let payload;
    try { payload = buildPayload(n, params); } catch (e) {
      db.prepare(`UPDATE notifications SET status='falhou', last_error=?, updated_at=datetime('now'), next_attempt_at=NULL WHERE id=?`).run(e.message, id);
      return;
    }
    let r;
    try { r = await callApi(payload); } catch (e) { r = { ok: false, error: `Erro de rede: ${e.message}`, permanent: false }; }
    const attempts = n.attempts + 1;
    if (r.ok) {
      db.prepare(`UPDATE notifications SET status='enviada', attempts=?, provider_message_id=?, last_error=NULL, sent_at=datetime('now'), updated_at=datetime('now'), next_attempt_at=NULL WHERE id=?`)
        .run(attempts, r.id, id);
    } else {
      const retry = !r.permanent && attempts < MAX_ATTEMPTS;
      db.prepare(`UPDATE notifications SET status='falhou', attempts=?, last_error=?, updated_at=datetime('now'),
        next_attempt_at = CASE WHEN ? THEN datetime('now', ?) ELSE NULL END WHERE id=?`)
        .run(attempts, r.error, retry ? 1 : 0, `+${BACKOFF_MIN[attempts - 1] ?? 240} minutes`, id);
      logError('whatsapp', `Notificação ${id} (${n.kind}) falhou: ${r.error}`);
    }
  } catch (e) {
    logError('whatsapp', `Erro inesperado na notificação ${id}: ${e.message}`, e.stack);
  } finally {
    sending.delete(id);
  }
}

// Reenvio automático das falhas temporárias
export function startRetryWorker() {
  const tick = async () => {
    const due = db.prepare(`SELECT id FROM notifications WHERE status IN ('pendente','falhou') AND next_attempt_at IS NOT NULL AND next_attempt_at <= datetime('now') LIMIT 20`).all();
    for (const { id } of due) await processNotification(id);
  };
  setInterval(() => tick().catch((e) => logError('whatsapp', e.message)), 60_000).unref();
  tick().catch(() => {});
}

// Reenvio manual pelo painel (também usado após configurar a integração)
export function resetForRetry(id) {
  db.prepare(`UPDATE notifications SET status='pendente', next_attempt_at=datetime('now'), attempts = CASE WHEN attempts >= ? THEN 0 ELSE attempts END, updated_at=datetime('now') WHERE id=? AND status IN ('falhou','nao_configurada')`)
    .run(MAX_ATTEMPTS, id);
}

// ---------- Webhook de status (entregue / lida / falhou) ----------
export function verifyWebhookSignature(rawBody, header) {
  const secret = getSetting('wa_app_secret');
  if (!secret) return false;
  if (!header?.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(header.slice(7)); const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function applyStatusWebhook(body) {
  const map = { sent: 'enviada', delivered: 'entregue', read: 'lida', failed: 'falhou' };
  for (const entry of body?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const st of change.value?.statuses ?? []) {
        const status = map[st.status];
        if (!status || !st.id) continue;
        const err = st.errors?.[0] ? `${st.errors[0].code}: ${st.errors[0].title || st.errors[0].message}` : null;
        db.prepare(`UPDATE notifications SET status=?, last_error=COALESCE(?, last_error), updated_at=datetime('now') WHERE provider_message_id=?`)
          .run(status, err, st.id);
        if (status === 'falhou') logError('whatsapp', `Meta informou falha de entrega da mensagem ${st.id}: ${err}`);
      }
    }
  }
}
