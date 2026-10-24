import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Chave de criptografia dos dados sensíveis (respostas de saúde, tokens de integração).
// Em produção, defina DATA_ENCRYPTION_KEY (32 bytes em base64). Em desenvolvimento,
// uma chave é gerada em data/.dev-key — NÃO use esse arquivo em produção.
let KEY;
export function initKey(dataDir) {
  const env = process.env.DATA_ENCRYPTION_KEY;
  if (env) {
    // Aceita a chave mesmo se vier com espaços, aspas ou junto com o texto do arquivo de instruções
    const found = env.match(/[A-Za-z0-9+/]{43}=/);
    KEY = Buffer.from(found ? found[0] : env.trim(), 'base64');
    if (KEY.length !== 32) throw new Error('DATA_ENCRYPTION_KEY deve ter 32 bytes em base64 (gere com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))")');
    return;
  }
  if (process.env.NODE_ENV === 'production') throw new Error('DATA_ENCRYPTION_KEY é obrigatória em produção.');
  const file = path.join(dataDir, '.dev-key');
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('base64'), { mode: 0o600 });
  KEY = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64');
  console.warn('[aviso] Usando chave de desenvolvimento em data/.dev-key. Defina DATA_ENCRYPTION_KEY em produção.');
}

export function encrypt(plain) {
  if (plain == null) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`;
}

export function decrypt(blob) {
  if (!blob) return null;
  const [v, iv, tag, data] = blob.split(':');
  if (v !== 'v1') throw new Error('Formato de dado criptografado desconhecido');
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
}

export const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt:${salt.toString('base64')}:${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const [alg, salt, hash] = String(stored).split(':');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(salt, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, actual);
}

export function passwordProblems(pw) {
  if (typeof pw !== 'string' || pw.length < 10) return 'A senha deve ter pelo menos 10 caracteres.';
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return 'A senha deve conter letras e números.';
  return null;
}

// Limitador simples em memória (por IP + chave)
const buckets = new Map();
export function rateLimit({ key, limit, windowMs }) {
  return (req, res, next) => {
    const id = `${key}:${req.ip}`;
    const now = Date.now();
    let b = buckets.get(id);
    if (!b || b.reset < now) { b = { count: 0, reset: now + windowMs }; buckets.set(id, b); }
    b.count++;
    if (b.count > limit) {
      res.set('Retry-After', Math.ceil((b.reset - now) / 1000));
      return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
    }
    next();
  };
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k); }, 60_000).unref();
