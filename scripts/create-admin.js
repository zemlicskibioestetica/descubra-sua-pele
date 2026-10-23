// Uso: npm run create-admin -- email@exemplo.com "SenhaForte123" "Nome" [proprietaria|equipe]
import { initKey, hashPassword, passwordProblems } from '../src/security.js';
import { DATA_DIR } from '../src/db.js';

initKey(DATA_DIR);
const { db } = await import('../src/db.js');

const [email, password, name = 'Dra. Fernanda Zemlicski', role = 'proprietaria'] = process.argv.slice(2);
if (!email || !password) {
  console.error('Uso: npm run create-admin -- email@exemplo.com "SenhaForte123" "Nome" [proprietaria|equipe]');
  process.exit(1);
}
const prob = passwordProblems(password);
if (prob) { console.error(prob); process.exit(1); }
const r = role === 'equipe' ? 'equipe' : 'proprietaria';
db.prepare(`INSERT INTO admin_users(email, name, password_hash, role) VALUES(?,?,?,?)
  ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash, name=excluded.name, role=excluded.role, active=1, failed_logins=0, locked_until=NULL`)
  .run(email.toLowerCase(), name, hashPassword(password), r);
console.log(`Usuário ${email} (${r}) criado/atualizado.`);
