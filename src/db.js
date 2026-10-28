import { createClient } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { encrypt, decrypt } from './security.js';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
fs.mkdirSync(DATA_DIR, { recursive: true });

// Banco: Turso (gratuito, na nuvem) quando TURSO_DATABASE_URL estiver definido;
// caso contrário, um arquivo local em DATA_DIR (desenvolvimento e testes).
function tursoConfig() {
  const values = [process.env.TURSO_DATABASE_URL, process.env.TURSO_AUTH_TOKEN].map((v) => (v || '').trim().replace(/^["']|["']$/g, ''));
  if (!values.some(Boolean)) return null;
  // Aceita os dois campos mesmo se tiverem sido colados trocados
  const url = values.find((v) => /^(libsql|https?|wss?):\/\//i.test(v));
  const authToken = values.find((v) => v && v !== url);
  if (!url) throw new Error('Configuração do Turso: nenhum dos campos TURSO_DATABASE_URL/TURSO_AUTH_TOKEN contém o endereço do banco (deve começar com libsql://).');
  if (!authToken) throw new Error('Configuração do Turso: falta o token (TURSO_AUTH_TOKEN).');
  return { url, authToken };
}

let client;
try {
  client = createClient(tursoConfig() || { url: pathToFileURL(path.join(DATA_DIR, 'app.db')).href });
} catch (e) {
  // Mensagem curta, sem repetir valores secretos nos registros
  throw new Error(e.code === 'URL_INVALID' ? 'Configuração do Turso: o endereço do banco é inválido (deve começar com libsql://).' : e.message);
}

const toObjects = (rs) => rs.rows.map((r) => Object.fromEntries(rs.columns.map((c, i) => [c, r[i]])));
const clean = (args) => args.map((a) => (a === undefined ? null : typeof a === 'boolean' ? (a ? 1 : 0) : a));

function wrap(exec) {
  return {
    async all(sql, ...args) { return toObjects(await exec({ sql, args: clean(args) })); },
    async get(sql, ...args) { return (await this.all(sql, ...args))[0]; },
    async run(sql, ...args) {
      const rs = await exec({ sql, args: clean(args) });
      return { changes: rs.rowsAffected, lastInsertRowid: rs.lastInsertRowid == null ? null : Number(rs.lastInsertRowid) };
    },
  };
}

export const db = {
  ...wrap((stmt) => client.execute(stmt)),
  // Transação: tudo ou nada
  async tx(fn) {
    const t = await client.transaction('write');
    try {
      const out = await fn(wrap((stmt) => t.execute(stmt)));
      await t.commit();
      return out;
    } catch (e) {
      await t.rollback().catch(() => {});
      throw e;
    } finally {
      t.close();
    }
  },
  close: () => client.close(),
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY,
  public_id TEXT UNIQUE NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  country_iso TEXT NOT NULL,
  calling_code TEXT NOT NULL,
  area_code TEXT,
  phone_e164 TEXT NOT NULL,
  has_whatsapp INTEGER NOT NULL,
  birth_date TEXT NOT NULL,
  sex TEXT NOT NULL,
  city TEXT NOT NULL,
  region TEXT NOT NULL,
  goal TEXT NOT NULL,
  goal_other TEXT,
  is_minor INTEGER NOT NULL DEFAULT 0,
  guardian_name TEXT,
  source TEXT NOT NULL DEFAULT 'direto',
  campaign TEXT,
  status TEXT NOT NULL DEFAULT 'cadastrado',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_part_created ON participants(created_at);
CREATE INDEX IF NOT EXISTS idx_part_source ON participants(source);

CREATE TABLE IF NOT EXISTS consents (
  id INTEGER PRIMARY KEY,
  participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  granted INTEGER NOT NULL,
  policy_version TEXT NOT NULL,
  text_snapshot TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Respostas: saúde criptografada; pele em JSON (sem identificação direta)
CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY,
  participant_id INTEGER UNIQUE NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  health_enc TEXT NOT NULL,
  skin_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY,
  participant_id INTEGER UNIQUE NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  share_token TEXT UNIQUE,
  skin_type TEXT NOT NULL,
  confidence TEXT NOT NULL,
  result_enc TEXT NOT NULL,
  ai_status TEXT NOT NULL DEFAULT 'nao_configurada',
  engine_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_results_type ON results(skin_type);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY,
  result_id INTEGER NOT NULL REFERENCES results(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,             -- web | pdf
  status TEXT NOT NULL,           -- gerado | erro
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Métricas anônimas (sem dados pessoais)
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  anon_id TEXT NOT NULL,
  type TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'direto',
  campaign TEXT,
  step TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  participant_id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,                 -- owner_completion | owner_contact | participant_report | test
  dedupe_key TEXT UNIQUE NOT NULL,
  recipient TEXT NOT NULL,
  body_preview TEXT NOT NULL,
  params_enc TEXT,
  status TEXT NOT NULL DEFAULT 'pendente', -- pendente | enviada | entregue | lida | falhou | nao_configurada | cancelada
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error TEXT,
  provider_message_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_notif_status ON notifications(status);

CREATE TABLE IF NOT EXISTS error_logs (
  id INTEGER PRIMARY KEY,
  scope TEXT NOT NULL,
  message TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contact_requests (
  id INTEGER PRIMARY KEY,
  participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'nova',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS privacy_requests (
  id INTEGER PRIMARY KEY,
  participant_id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
  type TEXT NOT NULL,                 -- acesso | correcao | exclusao | revogacao
  requester_name TEXT,
  phone TEXT,
  message TEXT,
  origin TEXT NOT NULL,               -- publico | painel
  status TEXT NOT NULL DEFAULT 'aberta', -- aberta | concluida | recusada
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  resolved_by INTEGER
);

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'equipe',   -- proprietaria | equipe
  active INTEGER NOT NULL DEFAULT 1,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  is_secret INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

// ---------- Configurações ----------
export const SETTING_DEFS = {
  owner_whatsapp: { label: 'Número WhatsApp de destino (proprietária), formato internacional', default: '' },
  wa_phone_number_id: { label: 'WhatsApp Cloud API — Phone Number ID', default: '' },
  wa_access_token: { label: 'WhatsApp Cloud API — Token de acesso permanente', secret: true, default: '' },
  wa_app_secret: { label: 'App Secret da Meta (valida webhooks)', secret: true, default: '' },
  wa_webhook_verify_token: { label: 'Token de verificação do webhook (você escolhe)', secret: true, default: '' },
  wa_api_version: { label: 'Versão da Graph API', default: 'v21.0' },
  wa_mode: { label: 'Modo de envio à proprietária (template | text)', default: 'template' },
  wa_template_owner: { label: 'Nome do modelo aprovado — notificação de novo participante', default: 'novo_participante_pele' },
  wa_template_contact: { label: 'Nome do modelo aprovado — solicitação de contato', default: 'solicitacao_contato_pele' },
  wa_template_participant: { label: 'Nome do modelo aprovado — envio do resultado ao participante', default: '' },
  wa_template_lang: { label: 'Idioma dos modelos', default: 'pt_BR' },
  anthropic_api_key: { label: 'Chave da API Claude (explicações em linguagem simples)', secret: true, default: '' },
  public_base_url: { label: 'Endereço público do site (após publicação)', default: 'https://descubrasuapele.com.br' },
  tiktok_url: { label: 'Perfil do TikTok (destino principal do botão "Quero conhecer a Dra. Fernanda")', default: 'https://www.tiktok.com/@drafernandabiomedica' },
  instagram_url: { label: 'Perfil do Instagram (opção para quem não tem TikTok)', default: 'https://www.instagram.com/drafernandabiomedica/' },
  privacy_contact_email: { label: 'E-mail para solicitações de privacidade (LGPD)', default: '' },
  privacy_contact_whatsapp: { label: 'WhatsApp para solicitações de privacidade (opcional)', default: '' },
  retention_days: { label: 'Prazo de retenção dos dados (dias)', default: '730' },
  policy_version: { label: 'Versão vigente do aviso de privacidade', default: '2026-10-08' },
};

// Configurações ficam em memória (um único servidor) e são gravadas no banco a cada alteração.
const settingsCache = new Map();

export async function initDb() {
  // Cria as tabelas (uma instrução por vez, compatível com Turso)
  const statements = SCHEMA.replace(/--[^\n]*/g, '').split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
  for (const stmt of statements) await client.execute(stmt);
  settingsCache.clear();
  for (const row of await db.all('SELECT key, value, is_secret FROM settings')) settingsCache.set(row.key, row);
}

export function getSetting(key) {
  const row = settingsCache.get(key);
  if (!row || row.value == null || row.value === '') return SETTING_DEFS[key]?.default ?? '';
  return row.is_secret ? decrypt(row.value) : row.value;
}

export async function setSetting(key, value) {
  const def = SETTING_DEFS[key];
  if (!def) throw new Error(`Configuração desconhecida: ${key}`);
  const v = value == null ? '' : String(value).trim();
  const stored = def.secret && v ? encrypt(v) : v;
  await db.run(`INSERT INTO settings(key, value, is_secret, updated_at) VALUES(?,?,?,datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, is_secret=excluded.is_secret, updated_at=excluded.updated_at`,
  key, stored, def.secret ? 1 : 0);
  settingsCache.set(key, { key, value: stored, is_secret: def.secret ? 1 : 0 });
}

export async function logError(scope, message, detail) {
  console.error(`[${scope}]`, message);
  try {
    await db.run('INSERT INTO error_logs(scope, message, detail) VALUES(?,?,?)',
      scope, String(message).slice(0, 500), detail ? String(detail).slice(0, 4000) : null);
  } catch (e) { console.error('Falha ao registrar erro', e); }
}

export async function audit(req, action, target, detail) {
  try {
    await db.run('INSERT INTO audit_log(user_id, action, target, detail, ip) VALUES(?,?,?,?,?)',
      req.admin?.id ?? null, action, target ?? null, detail ? String(detail).slice(0, 1000) : null, req.ip ?? null);
  } catch (e) { console.error('Falha ao registrar auditoria', e); }
}

// Exclusão definitiva dos dados de um participante (LGPD). Métricas anônimas permanecem.
export async function deleteParticipantData(id) {
  await db.tx(async (t) => {
    await t.run(`UPDATE notifications SET participant_id = NULL, params_enc = NULL, body_preview = '[removido por exclusão de dados]',
      recipient = CASE WHEN kind = 'participant_report' THEN '[removido]' ELSE recipient END WHERE participant_id = ?`, id);
    await t.run(`UPDATE privacy_requests SET participant_id = NULL, requester_name = '[removido]', phone = NULL, message = NULL WHERE participant_id = ?`, id);
    await t.run('DELETE FROM reports WHERE result_id IN (SELECT id FROM results WHERE participant_id = ?)', id);
    for (const table of ['results', 'answers', 'consents', 'contact_requests']) await t.run(`DELETE FROM ${table} WHERE participant_id = ?`, id);
    await t.run('DELETE FROM participants WHERE id = ?', id);
  });
}
