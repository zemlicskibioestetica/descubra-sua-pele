import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { encrypt, decrypt } from './security.js';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
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
`);

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
  public_base_url: { label: 'Endereço público do site (após publicação)', default: '' },
  tiktok_url: { label: 'Perfil do TikTok (destino principal do botão "Quero conhecer a Dra. Fernanda")', default: 'https://www.tiktok.com/@drafernandabiomedica' },
  instagram_url: { label: 'Perfil do Instagram (opção para quem não tem TikTok)', default: 'https://www.instagram.com/drafernandabiomedica/' },
  privacy_contact_email: { label: 'E-mail para solicitações de privacidade (LGPD)', default: '' },
  privacy_contact_whatsapp: { label: 'WhatsApp para solicitações de privacidade (opcional)', default: '' },
  retention_days: { label: 'Prazo de retenção dos dados (dias)', default: '730' },
  policy_version: { label: 'Versão vigente do aviso de privacidade', default: '2026-10-08' },
};

export function getSetting(key) {
  const row = db.prepare('SELECT value, is_secret FROM settings WHERE key = ?').get(key);
  if (!row || row.value == null || row.value === '') return SETTING_DEFS[key]?.default ?? '';
  return row.is_secret ? decrypt(row.value) : row.value;
}

export function setSetting(key, value) {
  const def = SETTING_DEFS[key];
  if (!def) throw new Error(`Configuração desconhecida: ${key}`);
  const v = value == null ? '' : String(value).trim();
  db.prepare(`INSERT INTO settings(key, value, is_secret, updated_at) VALUES(?,?,?,datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, is_secret=excluded.is_secret, updated_at=excluded.updated_at`)
    .run(key, def.secret && v ? encrypt(v) : v, def.secret ? 1 : 0);
}

export function logError(scope, message, detail) {
  try {
    db.prepare('INSERT INTO error_logs(scope, message, detail) VALUES(?,?,?)')
      .run(scope, String(message).slice(0, 500), detail ? String(detail).slice(0, 4000) : null);
  } catch (e) { console.error('Falha ao registrar erro', e); }
  console.error(`[${scope}]`, message);
}

export function audit(req, action, target, detail) {
  db.prepare('INSERT INTO audit_log(user_id, action, target, detail, ip) VALUES(?,?,?,?,?)')
    .run(req.admin?.id ?? null, action, target ?? null, detail ? String(detail).slice(0, 1000) : null, req.ip);
}

// Exclusão definitiva dos dados de um participante (LGPD). Métricas anônimas permanecem.
export function deleteParticipantData(participantId) {
  const tx = db.transaction((id) => {
    db.prepare('UPDATE notifications SET params_enc = NULL, body_preview = \'[removido por exclusão de dados]\', recipient = CASE WHEN kind = \'participant_report\' THEN \'[removido]\' ELSE recipient END WHERE participant_id = ?').run(id);
    db.prepare('UPDATE privacy_requests SET requester_name = \'[removido]\', phone = NULL, message = NULL WHERE participant_id = ?').run(id);
    db.prepare('DELETE FROM participants WHERE id = ?').run(id); // cascata: consents, answers, results, reports, contact_requests
  });
  tx(participantId);
}
