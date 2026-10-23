// Teste de ponta a ponta da API com banco temporário.
// A API do WhatsApp é SIMULADA apenas aqui, interceptando chamadas a graph.facebook.com.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsp-test-'));
process.env.DATA_DIR = tmp;

const SAFE_HEALTH = { h1: ['nenhuma'], h2: ['nao'], h3: 'nao', h4: ['nenhum'], h5: ['nao'], h6: ['nao'], h7: 'nao', h8: ['nenhum'], h9: ['nenhuma'] };
const SKIN = { s1: 'oleosa_toda', s2: 'oleosa_logo', s3: 'todo_rosto', s4: 'tolera', s5: 'varias', s6: 'poros_cravos', s7: 'mais_oleosa', s8: ['oleosidade'], s9: 'sabonete', s10: ['frequente'], s11: 'quente_umido', s12: 'oleosidade' };
const CONSENTS = { participacao: true, dados_saude: true, whatsapp_publicidade: false };
const REG = { fullName: 'Maria Teste Silva', country: 'BR', areaCode: '41', phone: '991234567', hasWhatsapp: 'sim', birthDate: '1990-05-10', sex: 'feminino', city: 'Curitiba', region: 'PR', goal: 'oleosidade', source: 'tiktok', consents: CONSENTS };

let server; let base; let db; let hashPassword;
const realFetch = globalThis.fetch;
let waMode = 'ok'; const waCalls = [];

before(async () => {
  globalThis.fetch = async (url, opts) => {
    if (String(url).startsWith('https://graph.facebook.com/')) {
      waCalls.push({ url: String(url), body: JSON.parse(opts.body) });
      if (waMode === 'ok') return new Response(JSON.stringify({ messages: [{ id: `wamid.${waCalls.length}` }] }), { status: 200 });
      return new Response(JSON.stringify({ error: { code: 131000, message: 'Something went wrong' } }), { status: 500 });
    }
    return realFetch(url, opts);
  };
  const mod = await import('../src/server.js');
  ({ db } = await import('../src/db.js'));
  ({ hashPassword } = await import('../src/security.js'));
  server = mod.app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server?.close(); globalThis.fetch = realFetch; db?.close(); });

const j = async (p, opts = {}) => {
  const res = await realFetch(base + p, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, headers: res.headers, body: ct.includes('json') ? await res.json() : await res.arrayBuffer() };
};
async function participant(over = {}) {
  const r = await j('/api/participants', { method: 'POST', body: { ...REG, ...over } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const s = await j(`/api/participants/${r.body.participantToken}/submit`, { method: 'POST', body: { health: SAFE_HEALTH, skin: SKIN, anonId: 'testanon1234' } });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  return { pToken: r.body.participantToken, rToken: s.body.resultToken };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let ownerCookie; let ownerCsrf;
async function login(email, password) {
  const res = await realFetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const body = await res.json();
  return { status: res.status, cookie: (res.headers.get('set-cookie') || '').split(';')[0], csrf: body.csrf };
}
const adm = (p, opts = {}, who = { cookie: ownerCookie, csrf: ownerCsrf }) => j(`/api/admin${p}`, { ...opts, headers: { Cookie: who.cookie, 'X-CSRF-Token': who.csrf } });

test('páginas públicas respondem', async () => {
  for (const p of ['/', '/privacidade', '/admin', '/styles.css', '/app.js']) {
    const r = await realFetch(base + p); assert.equal(r.status, 200, p);
  }
  const r = await realFetch(`${base}/`);
  assert.match(await r.text(), /QUERO DESCOBRIR MINHA PELE/);
});

test('cadastro valida campos, telefone e consentimentos', async () => {
  const bad = await j('/api/participants', { method: 'POST', body: { ...REG, fullName: 'Maria', phone: '123', consents: { participacao: false } } });
  assert.equal(bad.status, 422);
  assert.ok(bad.body.fields.fullName && bad.body.fields.phone && bad.body.fields.consent_participacao && bad.body.fields.consent_dados_saude);
  const fixo = await j('/api/participants', { method: 'POST', body: { ...REG, phone: '32221234' } });
  assert.equal(fixo.status, 422, 'telefone fixo rejeitado');
  const crianca = await j('/api/participants', { method: 'POST', body: { ...REG, birthDate: '2018-01-01' } });
  assert.equal(crianca.status, 422);
  const adolescente = await j('/api/participants', { method: 'POST', body: { ...REG, birthDate: '2011-01-01' } });
  assert.ok(adolescente.body.fields.guardianName && adolescente.body.fields.consent_responsavel_legal);
  const ok = await j('/api/participants', { method: 'POST', body: { ...REG, birthDate: '2011-01-01', guardianName: 'Joana Responsável', consents: { ...CONSENTS, responsavel_legal: true } } });
  assert.equal(ok.status, 201); assert.equal(ok.body.minor, true);
});

test('fluxo completo: resultado, banco, PDF, compartilhamento, notificação não configurada', async () => {
  const { pToken, rToken } = await participant();
  const p = await db.get(`SELECT * FROM participants WHERE full_name='Maria Teste Silva' AND status='concluido' ORDER BY id DESC`);
  assert.equal(p.phone_e164, '+5541991234567');
  assert.equal(p.source, 'tiktok');
  const consents = await db.all('SELECT purpose, granted, policy_version FROM consents WHERE participant_id=? ORDER BY id', p.id);
  assert.deepEqual(consents.map((c) => [c.purpose, c.granted]), [['participacao', 1], ['dados_saude', 1], ['whatsapp_publicidade', 0]]);
  assert.ok(consents.every((c) => c.policy_version));
  const ans = await db.get('SELECT health_enc FROM answers WHERE participant_id=?', p.id);
  assert.ok(ans.health_enc.startsWith('v1:') && !ans.health_enc.includes('nenhuma'), 'saúde criptografada');

  const r = await j(`/api/results/${rToken}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.result.skinType, 'oleosa');
  assert.equal(r.body.name, 'Maria Teste Silva');

  const again = await j(`/api/participants/${pToken}/submit`, { method: 'POST', body: { health: SAFE_HEALTH, skin: SKIN } });
  assert.equal(again.status, 409, 'não conclui duas vezes');

  const pdf = await realFetch(`${base}/api/results/${rToken}/pdf`);
  assert.equal(pdf.status, 200);
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), '%PDF');

  const sh = await j(`/api/results/${rToken}/share`, { method: 'POST' });
  const sharePage = await (await realFetch(sh.body.url.replace(/^https?:\/\/[^/]+/, base))).text();
  assert.match(sharePage, /Pele oleosa/);
  assert.doesNotMatch(sharePage, /Maria|991234567/);

  await wait(50);
  const n = await db.all(`SELECT * FROM notifications WHERE participant_id=? AND kind='owner_completion'`, p.id);
  assert.equal(n.length, 1, 'uma notificação por conclusão');
  assert.equal(n[0].status, 'nao_configurada', 'sem credenciais, não finge envio');
});

test('painel: login, permissões, CSV sem saúde, métricas', async () => {
  await db.run(`INSERT INTO admin_users(email, name, password_hash, role) VALUES('dona@teste.com','Dona',?, 'proprietaria')`, hashPassword('SenhaForte123'));
  await db.run(`INSERT INTO admin_users(email, name, password_hash, role) VALUES('equipe@teste.com','Equipe',?, 'equipe')`, hashPassword('SenhaForte123'));
  assert.equal((await j('/api/admin/participants')).status, 401, 'sem login');
  assert.equal((await login('dona@teste.com', 'errada')).status, 401);
  const o = await login('dona@teste.com', 'SenhaForte123'); ownerCookie = o.cookie; ownerCsrf = o.csrf;
  const list = await adm('/participants?source=tiktok');
  assert.ok(list.body.total >= 1);
  const id = list.body.rows.find((r) => r.status === 'concluido').id;

  const noCsrf = await j(`/api/admin/participants/${id}/deletion-request`, { method: 'POST', headers: { Cookie: ownerCookie }, body: {} });
  assert.equal(noCsrf.status, 403, 'CSRF exigido');

  const staff = await login('equipe@teste.com', 'SenhaForte123');
  assert.equal((await adm(`/participants/${id}/report`, {}, staff)).status, 403, 'equipe não vê saúde');
  assert.equal((await adm('/settings', {}, staff)).status, 403);
  const rep = await adm(`/participants/${id}/report?reason=teste`);
  assert.equal(rep.status, 200); assert.ok(rep.body.health.length === 9);
  assert.ok(await db.get(`SELECT 1 AS x FROM audit_log WHERE action='ver_relatorio_e_saude'`), 'acesso auditado');

  const csv = await realFetch(`${base}/api/admin/export.csv`, { headers: { Cookie: ownerCookie } });
  const text = await csv.text();
  assert.match(text, /Maria Teste Silva/);
  assert.doesNotMatch(text, /alergia|medicamento|gesta/i);

  const m = await adm('/metrics');
  assert.ok(m.body.completed >= 1);
  assert.ok(m.body.bySource.some((s) => s.source === 'tiktok'));
});

test('WhatsApp: envio confirmado, falha registrada com reenvio, sem dados de saúde', async () => {
  const put = await adm('/settings', { method: 'PUT', body: { owner_whatsapp: '+5541999990000', wa_phone_number_id: '123456', wa_access_token: 'TOKEN_DE_TESTE', wa_mode: 'template', wa_template_owner: 'novo_participante_pele' } });
  assert.equal(put.status, 200);
  await wait(100);
  // a notificação "não configurada" anterior volta para a fila e é enviada
  assert.equal((await db.get(`SELECT COUNT(*) n FROM notifications WHERE status='nao_configurada'`)).n, 0);
  const sent = await db.all(`SELECT * FROM notifications WHERE status='enviada'`);
  assert.ok(sent.length >= 1 && sent[0].provider_message_id.startsWith('wamid.'));
  const call = waCalls.at(-1);
  assert.equal(call.body.template.name, 'novo_participante_pele');
  assert.equal(call.body.template.components[0].parameters.length, 9);
  assert.doesNotMatch(JSON.stringify(call.body), /nenhuma|alerg|medic/i);
  const settings = await adm('/settings');
  assert.equal(settings.body.settings.wa_access_token.value, '', 'token nunca volta ao navegador');

  waMode = 'fail';
  await participant({ fullName: 'Joana Falha Souza', phone: '991112222' });
  await wait(100);
  const failed = await db.get(`SELECT n.* FROM notifications n JOIN participants p ON p.id=n.participant_id WHERE p.full_name='Joana Falha Souza'`);
  assert.equal(failed.status, 'falhou');
  assert.ok(failed.next_attempt_at, 'reenvio agendado');
  assert.ok(await db.get(`SELECT 1 AS x FROM error_logs WHERE scope='whatsapp'`));

  waMode = 'ok';
  const retry = await adm(`/notifications/${failed.id}/retry`, { method: 'POST' });
  assert.equal(retry.body.status, 'enviada');
});

test('exclusão LGPD remove os dados do participante', async () => {
  const { rToken } = await participant({ fullName: 'Carla Excluir Lima', phone: '993334444' });
  const req = await j('/api/privacy-requests', { method: 'POST', body: { type: 'exclusao', name: 'Carla Excluir Lima', country: 'BR', phone: '41993334444' } });
  assert.equal(req.status, 201);
  const pr = await db.get(`SELECT * FROM privacy_requests WHERE requester_name='Carla Excluir Lima'`);
  assert.ok(pr.participant_id, 'vinculada pelo celular');
  const pid = pr.participant_id;
  const bad = await adm(`/privacy-requests/${pr.id}/resolve`, { method: 'POST', body: { action: 'excluir_dados' } });
  assert.equal(bad.status, 422, 'exige confirmação');
  const ok = await adm(`/privacy-requests/${pr.id}/resolve`, { method: 'POST', body: { action: 'excluir_dados', confirm: 'EXCLUIR' } });
  assert.equal(ok.status, 200);
  assert.equal((await db.get('SELECT COUNT(*) n FROM participants WHERE id=?', pid)).n, 0);
  assert.equal((await db.get('SELECT COUNT(*) n FROM answers WHERE participant_id=?', pid)).n, 0);
  assert.equal((await j(`/api/results/${rToken}`)).status, 404);
});
