import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/engine.js';
import { validateAnswers, HEALTH_QUESTIONS, SKIN_QUESTIONS } from '../src/questions.js';

export const SAFE_HEALTH = { h1: ['nenhuma'], h2: ['nao'], h3: 'nao', h4: ['nenhum'], h5: ['nao'], h6: ['nao'], h7: 'nao', h8: ['nenhum'], h9: ['nenhuma'] };
export const OILY_SKIN = { s1: 'oleosa_toda', s2: 'oleosa_logo', s3: 'todo_rosto', s4: 'tolera', s5: 'varias', s6: 'poros_cravos', s7: 'mais_oleosa', s8: ['oleosidade', 'poros'], s9: 'sabonete_hidratante', s10: ['deslocamentos', 'fps_ocasional'], s11: 'quente_umido', s12: 'oleosidade' };
const P = { firstName: 'Ana', age: 30, goal: 'oleosidade', region: 'Curitiba/PR' };
const keys = (r) => r.actives.map((a) => a.key);

test('respostas válidas passam na validação; inválidas não', () => {
  assert.equal(validateAnswers(HEALTH_QUESTIONS, SAFE_HEALTH).ok, true);
  assert.equal(validateAnswers(SKIN_QUESTIONS, OILY_SKIN).ok, true);
  assert.equal(validateAnswers(SKIN_QUESTIONS, { ...OILY_SKIN, s8: ['oleosidade', 'poros', 'acne', 'manchas'] }).ok, false, 'máximo de 3');
  assert.equal(validateAnswers(HEALTH_QUESTIONS, { ...SAFE_HEALTH, h4: ['nenhum', 'retinoides'] }).ok, false, 'exclusiva + outra');
  assert.equal(validateAnswers(SKIN_QUESTIONS, { ...OILY_SKIN, s1: 'inventada' }).ok, false);
});

test('pele oleosa consistente → oleosa com confiança alta e niacinamida', () => {
  const r = analyze(P, SAFE_HEALTH, OILY_SKIN);
  assert.equal(r.skinType, 'oleosa');
  assert.equal(r.confidence, 'alto');
  assert.ok(keys(r).includes('niacinamida'));
  assert.ok(keys(r).includes('filtro_solar'));
  assert.ok(r.actives.length <= 6, 'poucos ativos');
});

test('texto do resultado é curto e não repete as respostas', () => {
  const r = analyze(P, SAFE_HEALTH, OILY_SKIN);
  assert.equal(r.explanation, 'Ana, seu perfil de pele mais provável é: pele oleosa.');
  const ind = analyze(P, SAFE_HEALTH, { ...OILY_SKIN, s1: 'nao_sei', s2: 'depende', s3: 'nao_sei', s4: 'nao_sei', s5: 'nao_sei', s6: 'varias', s7: 'nao_sei' });
  assert.match(ind.explanation, /não foi possível determinar/);
  const red = analyze(P, { ...SAFE_HEALTH, h9: ['ferida'] }, OILY_SKIN);
  assert.match(red.explanation, /avaliação profissional/);
  for (const x of [r, ind, red]) assert.doesNotMatch(x.explanation, /respostas que mais pesaram|"/);
});

test('pele seca → seca, com ceramidas', () => {
  const r = analyze({ ...P, goal: 'hidratacao' }, SAFE_HEALTH, { ...OILY_SKIN, s1: 'ressecada', s2: 'repuxando', s3: 'pouco_visiveis', s4: 'descama', s5: 'quase_nunca', s6: 'aspera', s7: 'ressecada', s8: ['ressecamento'], s12: 'hidratacao', s11: 'frio_seco' });
  assert.equal(r.skinType, 'seca');
  assert.ok(keys(r).includes('ceramidas'));
});

test('pele mista pela zona T', () => {
  const r = analyze(P, SAFE_HEALTH, { ...OILY_SKIN, s1: 'oleosa_t', s2: 'confortavel', s3: 'nariz_testa', s5: 'zona_t', s6: 'irregular' });
  assert.equal(r.skinType, 'mista');
});

test('respostas "não sei" → perfil indeterminado, confiança baixa', () => {
  const r = analyze(P, SAFE_HEALTH, { ...OILY_SKIN, s1: 'nao_sei', s2: 'depende', s3: 'nao_sei', s4: 'nao_sei', s5: 'nao_sei', s6: 'varias', s7: 'nao_sei' });
  assert.equal(r.skinType, 'indeterminado');
  assert.equal(r.confidence, 'baixo');
});

test('gravidez: nunca retinoide nem ácido salicílico', () => {
  for (const s12 of ['linhas', 'prevencao', 'acne', 'textura']) {
    const r = analyze(P, { ...SAFE_HEALTH, h7: 'sim' }, { ...OILY_SKIN, s12 });
    assert.ok(!keys(r).includes('retinoide'), `retinoide em ${s12}`);
    assert.ok(!keys(r).includes('acido_salicilico'), `salicílico em ${s12}`);
    assert.ok(r.cautions.some((c) => c.includes('Gestação')));
  }
});

test('sinais de alerta interrompem ativos de tratamento e encaminham', () => {
  const r = analyze(P, { ...SAFE_HEALTH, h9: ['lesao_mudou'] }, { ...OILY_SKIN, s12: 'linhas' });
  assert.equal(r.redFlag, true);
  assert.ok(!r.actives.some((a) => ['am', 'pm'].includes(a.slot)), 'sem tratamento ativo');
  assert.ok(r.referral[0].includes('avaliação médica'));
});

test('menor de idade: só cuidados básicos', () => {
  const r = analyze({ ...P, age: 15 }, SAFE_HEALTH, { ...OILY_SKIN, s12: 'acne' });
  assert.ok(!r.actives.some((a) => ['am', 'pm'].includes(a.slot)));
});

test('procedimento recente e tratamento prescrito: sem ácidos/retinoides', () => {
  const a = analyze(P, { ...SAFE_HEALTH, h8: ['laser'] }, { ...OILY_SKIN, s12: 'textura' });
  const b = analyze(P, { ...SAFE_HEALTH, h4: ['med_acne'] }, { ...OILY_SKIN, s12: 'acne' });
  for (const r of [a, b]) assert.ok(!keys(r).some((k) => ['retinoide', 'acido_salicilico', 'acido_azelaico'].includes(k)));
});

test('rotinas variam conforme as respostas', () => {
  const oily = analyze(P, SAFE_HEALTH, OILY_SKIN);
  const dry = analyze(P, SAFE_HEALTH, { ...OILY_SKIN, s1: 'ressecada', s2: 'repuxando', s3: 'pouco_visiveis', s6: 'aspera', s5: 'quase_nunca', s12: 'linhas' });
  assert.notEqual(oily.morning[0].lookFor, dry.morning[0].lookFor);
  assert.ok(keys(dry).includes('retinoide'), 'adulta, sem restrições, linhas → retinoide');
  assert.equal(oily.morning.at(-1).title, 'Fotoproteção');
});
