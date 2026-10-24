// Motor de análise determinístico. Toda classificação, seleção de ativos e
// restrição de segurança é decidida aqui. A IA (ai.js) só reescreve a
// explicação em linguagem simples a partir dos fatos produzidos por este módulo.

import { ACTIVES } from './actives.js';
import { SKIN_QUESTIONS, HEALTH_QUESTIONS, labelOf } from './questions.js';

export const ENGINE_VERSION = '1.0.0';

export const SKIN_TYPE_LABELS = {
  normal: 'Pele normal',
  seca: 'Pele seca',
  oleosa: 'Pele oleosa',
  mista: 'Pele mista',
  indeterminado: 'Perfil indeterminado ou variável',
};

const has = (arr, ...vals) => Array.isArray(arr) && vals.some((v) => arr.includes(v));
const sl = (qid, v) => labelOf(SKIN_QUESTIONS, qid, v);

// ---------- 1. Classificação do tipo de pele ----------
function classify(s) {
  const score = { normal: 0, seca: 0, oleosa: 0, mista: 0 };
  const influences = [];
  let unknown = 0;
  const add = (type, pts, qid, reason) => {
    score[type] += pts;
    influences.push({ question: qid, answer: sl(qid, s[qid]), effect: reason });
  };

  switch (s.s1) {
    case 'oleosa_toda': add('oleosa', 3, 's1', 'indica oleosidade em quase todo o rosto'); break;
    case 'oleosa_t': add('mista', 3, 's1', 'indica oleosidade concentrada na zona T, que é a região da testa, do nariz e do queixo'); break;
    case 'equilibrada': add('normal', 3, 's1', 'indica pele equilibrada durante o dia'); break;
    case 'ressecada': add('seca', 3, 's1', 'indica ressecamento durante o dia'); break;
    case 'varia': add('mista', 2, 's1', 'indica variação entre oleosidade e ressecamento'); break;
    default: unknown++;
  }
  switch (s.s2) {
    case 'confortavel': add('normal', 2, 's2', 'conforto após a limpeza sugere equilíbrio'); break;
    case 'repuxando': add('seca', 2, 's2', 'sensação de repuxar após lavar sugere ressecamento'); break;
    case 'oleosa_logo': add('oleosa', 2, 's2', 'oleosidade que retorna rápido sugere maior produção de sebo'); break;
    case 'sensivel': break; // sensibilidade não define tipo
    default: unknown += 0.5;
  }
  switch (s.s3) {
    case 'pouco_visiveis': score.normal += 1; score.seca += 1; influences.push({ question: 's3', answer: sl('s3', s.s3), effect: 'poros pouco visíveis são mais comuns em peles normais ou secas' }); break;
    case 'nariz_testa': add('mista', 2, 's3', 'poros mais aparentes na zona T combinam com pele mista'); break;
    case 'todo_rosto': add('oleosa', 2, 's3', 'poros visíveis em boa parte do rosto combinam com pele oleosa'); break;
    default: unknown++;
  }
  if (s.s4 === 'descama') add('seca', 1, 's4', 'tendência a ressecar ou descamar');
  if (s.s4 === 'nao_sei') unknown += 0.5;
  switch (s.s5) {
    case 'zona_t': add('mista', 1, 's5', 'cravos/espinhas na zona T'); break;
    case 'varias': case 'inflamadas': add('oleosa', 1, 's5', 'cravos/espinhas em várias regiões (não define o tipo sozinho)'); break;
    case 'nao_sei': unknown += 0.5; break;
  }
  switch (s.s6) {
    case 'lisa': add('normal', 1, 's6', 'textura lisa e uniforme'); break;
    case 'poros_cravos': add('oleosa', 1, 's6', 'poros e cravos aparentes'); break;
    case 'aspera': add('seca', 2, 's6', 'textura áspera ou descamando'); break;
  }
  // P7 (sol) entra com peso pequeno e nunca isoladamente
  if (s.s7 === 'mais_oleosa') { score.oleosa += 0.5; score.mista += 0.5; }
  if (s.s7 === 'ressecada') score.seca += 0.5;
  if (s.s7 === 'nao_sei') unknown += 0.5;

  // Contradições importantes
  const contradictions = [];
  if (s.s1 === 'oleosa_toda' && s.s2 === 'repuxando') contradictions.push('oleosidade durante o dia, mas repuxa após lavar — pode indicar pele oleosa desidratada ou limpeza agressiva');
  if (s.s1 === 'ressecada' && (s.s2 === 'oleosa_logo' || s.s3 === 'todo_rosto')) contradictions.push('ressecamento relatado junto com sinais de oleosidade');
  if (s.s1 === 'equilibrada' && s.s2 === 'oleosa_logo') contradictions.push('pele descrita como equilibrada, mas com oleosidade que retorna rapidamente');

  // Desempate: o resultado é SEMPRE um dos quatro tipos. Quando as respostas principais
  // não bastam, os incômodos, a prioridade e a variação ao longo do dia decidem.
  const hint = { normal: 0, seca: 0, oleosa: 0, mista: 0 };
  if (has(s.s8, 'oleosidade') || s.s12 === 'oleosidade') { hint.oleosa += 1; hint.mista += 0.5; }
  if (has(s.s8, 'ressecamento') || s.s12 === 'hidratacao') hint.seca += 1;
  if (has(s.s8, 'poros')) { hint.oleosa += 0.5; hint.mista += 0.5; }
  if (has(s.s8, 'acne') || s.s12 === 'acne') { hint.oleosa += 0.5; hint.mista += 0.5; }
  if (s.s1 === 'varia') hint.mista += 1.5;
  if (s.s2 === 'oleosa_logo') hint.oleosa += 0.5;
  if (s.s2 === 'repuxando' || s.s4 === 'descama') hint.seca += 0.5;
  // Em empate total, a ordem abaixo define o tipo (mais comum primeiro)
  const ORDER = ['mista', 'normal', 'oleosa', 'seca'];
  const total = (t) => score[t] + hint[t] * 0.5;
  const ranked = Object.keys(score).sort((a, b) => total(b) - total(a) || ORDER.indexOf(a) - ORDER.indexOf(b));
  const skinType = ranked[0];
  const topScore = score[skinType];
  const margin = total(ranked[0]) - total(ranked[1]);

  // Confiança qualitativa (exibida apenas no painel administrativo)
  let confidence;
  if (topScore >= 3 && margin >= 3 && unknown < 1 && contradictions.length === 0) confidence = 'alto';
  else if (topScore >= 3 && margin >= 1.5 && contradictions.length <= 1) confidence = 'moderado';
  else confidence = 'baixo';

  return { skinType, confidence, score, influences, contradictions, unknown };
}

// ---------- 2. Avaliações separadas ----------
function assess(h, s) {
  // Sensibilidade (não é tipo de pele)
  let sens = 0;
  const sensWhy = [];
  if (s.s2 === 'sensivel') { sens += 2; sensWhy.push('ardência ou vermelhidão após a limpeza'); }
  if (s.s4 === 'vermelha_arde' || s.s4 === 'coceira') { sens += 2; sensWhy.push('reações frequentes a cosméticos'); }
  if (s.s7 === 'vermelha') { sens += 1; sensWhy.push('vermelhidão com o sol'); }
  if (has(s.s8, 'sensibilidade')) { sens += 1; sensWhy.push('sensibilidade como incômodo principal'); }
  if (has(h.h5, 'vermelhidao', 'ardencia', 'coceira', 'descamacao', 'inchaco', 'outra')) { sens += 2; sensWhy.push('histórico de reações a cosméticos'); }
  const sensitivity = sens >= 4 ? 'alta' : sens >= 2 ? 'moderada' : 'baixa';

  // Tendência à acne
  let acne = 0;
  if (s.s5 === 'zona_t') acne += 1;
  if (s.s5 === 'varias') acne += 2;
  if (s.s5 === 'inflamadas') acne += 3;
  if (s.s5 === 'ciclo') acne += 1;
  if (s.s6 === 'poros_cravos') acne += 1;
  if (has(s.s8, 'acne')) acne += 1;
  if (has(h.h6, 'acne')) acne += 2;
  const acneTendency = acne >= 4 ? 'alta' : acne >= 2 ? 'moderada' : 'baixa';
  const inflammatoryAcne = s.s5 === 'inflamadas';
  const hormonalPattern = s.s5 === 'ciclo';

  // Desidratação (estado temporário, pode ocorrer em qualquer tipo)
  const dehydration = (['oleosa_toda', 'oleosa_t'].includes(s.s1) && (s.s2 === 'repuxando' || s.s4 === 'descama'))
    || (s.s2 === 'repuxando' && s.s9 === 'sabonete')
    || (s.s7 === 'ressecada' && s.s1 !== 'ressecada')
    || ['quente_seco', 'frio_seco'].includes(s.s11) && (s.s2 === 'repuxando' || has(s.s8, 'ressecamento'));

  // Exposição solar
  const sun = s.s10 || [];
  const highSun = has(sun, 'frequente', 'prolongado');
  const sunscreenDaily = has(sun, 'fps_diario') || s.s9 === 'basica_completa';
  const sunscreenOccasional = has(sun, 'fps_ocasional');
  const sunExposure = has(sun, 'prolongado') ? 'alta' : has(sun, 'frequente') ? 'alta' : has(sun, 'deslocamentos') ? 'moderada' : has(sun, 'raramente') ? 'baixa' : 'não informada';

  return {
    sensitivity, sensWhy, acneTendency, inflammatoryAcne, hormonalPattern, dehydration,
    sunExposure, highSun, sunscreenDaily, sunscreenOccasional,
    pigmentProne: s.s7 === 'manchas' || has(s.s8, 'manchas') || s.s6 === 'manchas' || has(h.h6, 'melasma'),
  };
}

// ---------- 3. Fatores de segurança ----------
function safety(h, s, age) {
  const red = has(h.h9, 'ferida', 'lesao_mudou', 'inflamacao', 'dor_inchaco', 'alergia_importante');
  const pregnancy = h.h7 === 'sim';
  const pregnancyUnknown = h.h7 === 'nao_informar';
  const recentProcedure = has(h.h8, 'peeling', 'laser', 'microagulhamento', 'outro');
  const prescribed = has(h.h4, 'med_acne', 'corticoides', 'prescritos') || s.s9 === 'dermato';
  const usingStrongActives = has(h.h4, 'acidos', 'retinoides', 'clareadores');
  const dermDx = has(h.h6, 'rosacea', 'dermatite', 'psoriase', 'outra');
  const melasma = has(h.h6, 'melasma');
  const acneDx = has(h.h6, 'acne');
  const allergyCosmetic = has(h.h2, 'cosmeticos', 'fragrancias');
  const allergyOther = has(h.h2, 'medicamentos', 'outras');
  const medication = h.h3 === 'sim';
  const healthCondition = has(h.h1, 'autoimune', 'dermatologica', 'diabetes', 'tireoide', 'hormonal', 'outra');
  const minor = age < 18;
  const otherConcern = has(h.h9, 'outra');

  return {
    red, pregnancy, pregnancyUnknown, recentProcedure, prescribed, usingStrongActives, dermDx, melasma, acneDx,
    allergyCosmetic, allergyOther, medication, healthCondition, minor, otherConcern,
    // Bloqueio de ativos esfoliantes/retinoides
    noRetinoid: pregnancy || pregnancyUnknown || minor || recentProcedure || prescribed || dermDx || red,
    noAcids: recentProcedure || prescribed || dermDx || red || minor,
    noSalicylic: pregnancy || pregnancyUnknown || recentProcedure || prescribed || dermDx || red || minor || allergyOther,
    basicOnly: red || recentProcedure || prescribed || dermDx,
  };
}

// ---------- 4. Seleção de ativos ----------
function selectActives(type, a, f, s, age) {
  const priority = s.s12;
  const concerns = s.s8 || [];
  const picks = []; // { key, slot: 'am'|'pm'|'hidratacao', why }
  const add = (key, slot, why) => { if (!picks.some((p) => p.key === key)) picks.push({ key, slot, why }); };

  const highSens = a.sensitivity === 'alta';

  if (f.basicOnly || f.minor) {
    // Somente cuidados básicos (sinais de alerta, tratamento em curso, procedimento recente, condição dermatológica ou menor de idade)
  } else if (highSens) {
    add('niacinamida', 'am', 'Para pele sensível, a niacinamida é um ativo bem tolerado que fortalece a barreira antes de ativos mais intensos.');
    if (['linhas', 'prevencao'].includes(priority) && !f.pregnancy && !f.pregnancyUnknown && age >= 21) {
      add('bakuchiol', 'pm', 'Para linhas finas em pele sensível, o bakuchiol é a alternativa mais suave ao retinol.');
    }
  } else {
    switch (priority) {
      case 'oleosidade':
        add('niacinamida', 'am', 'Você indicou a oleosidade como prioridade, e a niacinamida tem estudos sobre a aparência do sebo e dos poros.');
        break;
      case 'acne':
        if (!f.noSalicylic && !a.inflammatoryAcne) add('acido_salicilico', 'pm', 'Você indicou acne/cravos como prioridade; o ácido salicílico atua na oleosidade dentro dos poros.');
        else if (f.pregnancy && !a.inflammatoryAcne) add('acido_azelaico', 'pm', 'Por precaução (gestação/amamentação), o ácido azelaico costuma ser considerado uma alternativa — use somente com orientação profissional.');
        add('niacinamida', 'am', 'A niacinamida pode ajudar na aparência da oleosidade associada a cravos.');
        break;
      case 'manchas':
        add('vitamina_c', 'am', 'Para manchas, a vitamina C pela manhã ajuda a uniformizar o tom e potencializa o protetor solar.');
        if (f.pregnancy || f.pregnancyUnknown) add('acido_azelaico', 'pm', 'Para manchas com mais segurança neste momento, o ácido azelaico costuma ser a alternativa — use com orientação profissional.');
        else if (!f.noAcids) add('clareadores', 'pm', 'Para manchas, os clareadores mais atuais (tiamidol, ácido tranexâmico, cisteamina ou alfa-arbutin) ajudam a clarear e uniformizar o tom.');
        break;
      case 'luminosidade':
        add('vitamina_c', 'am', 'Para devolver a luminosidade, a vitamina C é o ativo mais indicado pela manhã.');
        if (!f.noAcids && !highSens) add('acido_glicolico', 'pm', 'O ácido glicólico renova a camada superficial e deixa a pele mais iluminada.');
        break;
      case 'textura':
        if (['oleosa', 'mista'].includes(type) && !f.noSalicylic) add('acido_salicilico', 'pm', 'Para textura em pele oleosa ou mista, o ácido salicílico limpa os poros e uniformiza a superfície.');
        else if (!f.noAcids && !highSens) add('acido_glicolico', 'pm', 'Para textura irregular, o ácido glicólico faz uma esfoliação química suave.');
        else if (!f.noRetinoid && age >= 21) add('retinoide', 'pm', 'Para textura, o retinol estimula a renovação da pele.');
        add('niacinamida', 'am', 'A niacinamida ajuda a uniformizar a textura e os poros, com boa tolerância.');
        break;
      case 'linhas':
      case 'prevencao':
        if (!f.noRetinoid && age >= 21) add('retinoide', 'pm', 'Para linhas finas e prevenção do envelhecimento, o retinol é um dos ativos mais estudados.');
        else add('peptideos', 'pm', 'Para linhas finas, os peptídeos são uma opção bem tolerada que ajuda na aparência de firmeza.');
        add('vitamina_c', 'am', 'A vitamina C pela manhã protege contra o envelhecimento causado pelo sol e dá luminosidade.');
        break;
      case 'hidratacao':
        add('acido_hialuronico', 'hidratacao', 'Você indicou hidratação como prioridade; o ácido hialurônico ajuda a reter água na superfície da pele.');
        break;
      default:
        if (concerns.includes('oleosidade') || concerns.includes('poros')) add('niacinamida', 'am', 'Para oleosidade e poros, a niacinamida controla o brilho e melhora a aparência dos poros.');
        else if (concerns.includes('manchas') || concerns.includes('luminosidade')) add('vitamina_c', 'am', 'Para manchas e luminosidade, a vitamina C pela manhã é a escolha mais indicada.');
        else if (concerns.includes('linhas') || concerns.includes('firmeza')) add('peptideos', 'pm', 'Para linhas e firmeza, os peptídeos ajudam na aparência de uma pele mais firme.');
    }
  }

  // Hidratação: ácido hialurônico para todos; pantenol (B5) para pele sensibilizada
  add('acido_hialuronico', 'hidratacao', type === 'seca' ? 'Para o ressecamento, o sérum de ácido hialurônico repõe a água da pele antes do hidratante.'
    : a.dehydration ? 'Há sinais de desidratação: o ácido hialurônico repõe a água sem deixar a pele oleosa.'
      : 'O ácido hialurônico mantém a pele hidratada e com viço, em qualquer tipo de pele.');
  if (highSens || f.recentProcedure || f.dermDx) {
    add('centella', 'hidratacao', 'A centella asiática (cica) acalma a vermelhidão e ajuda a recuperar a pele sensibilizada.');
    add('pantenol', 'hidratacao', 'O pantenol (vitamina B5) acalma e ajuda a recuperar a barreira da pele.');
  }
  add('filtro_solar', 'fps', 'A fotoproteção diária é recomendada para todos os tipos de pele.');

  // Limite: no máximo 1 tratamento de manhã e 1 à noite
  const am = picks.filter((p) => p.slot === 'am').slice(0, 1);
  const pm = picks.filter((p) => p.slot === 'pm').slice(0, 1);
  const hyd = picks.filter((p) => p.slot === 'hidratacao').slice(0, 3);
  const fps = picks.filter((p) => p.slot === 'fps');
  return [...am, ...pm, ...hyd, ...fps].map((p) => ({ key: p.key, slot: p.slot, why: p.why, ...ACTIVES[p.key] }));
}

// ---------- 5. Rotinas ----------
function cleanserFor(type, a, f) {
  if (a.sensitivity !== 'baixa' || f.dermDx || f.recentProcedure) return 'sabonete ou loção de limpeza suave, sem fragrância, com pH fisiológico e sem esfoliantes';
  switch (type) {
    case 'oleosa': return 'gel de limpeza suave para pele oleosa, sem óleos pesados; evite fórmulas muito adstringentes, que podem ressecar';
    case 'mista': return 'gel ou espuma de limpeza suave, que limpe a zona T sem ressecar as bochechas';
    case 'seca': return 'limpador cremoso ou loção de limpeza que não deixe a pele repuxando';
    case 'normal': return 'limpador suave de uso diário';
    default: return 'limpador suave, sem fragrância, que não deixe a pele repuxando nem oleosa';
  }
}

function moisturizerFor(type, a) {
  if (type === 'seca') return 'hidratante de textura mais rica (creme), com ácido hialurônico e pantenol (vitamina B5)';
  if (type === 'oleosa') return a.dehydration ? 'hidratante leve (gel ou gel-creme) oil-free, com ácido hialurônico' : 'hidratante leve, em gel ou fluido, oil-free e não comedogênico';
  if (type === 'mista') return 'hidratante leve no rosto todo; se as bochechas ressecarem, reforce apenas nelas com uma textura mais nutritiva';
  if (type === 'normal') return 'hidratante de textura leve a média, que mantenha o conforto';
  return 'hidratante simples, sem fragrância, de textura confortável — ajuste a textura conforme a resposta da pele';
}

function sunscreenFor(type, a, f) {
  const parts = ['amplo espectro (UVA e UVB), FPS 30 ou superior'];
  if (type === 'oleosa' || type === 'mista') parts.push('toque seco ou textura fluida');
  if (type === 'seca') parts.push('textura hidratante');
  if (a.sensitivity !== 'baixa' || f.allergyCosmetic) parts.push('sem fragrância; filtros minerais costumam ser melhor tolerados por peles reativas');
  if (a.pigmentProne) parts.push('versões com cor podem oferecer proteção adicional contra a luz visível, relevante para quem mancha com facilidade');
  if (a.highSun) parts.push('resistente à água/suor se houver exposição prolongada');
  return parts.join('; ');
}

// "Vitamina C (ácido ascórbico e derivados)" → "vitamina C" (para usar no meio da frase)
const inSentence = (name) => { const n = name.replace(/\s*\(.*\)\s*/, ''); return n.charAt(0).toLowerCase() + n.slice(1); };

function buildRoutines(type, a, f, actives) {
  const amActive = actives.find((x) => x.slot === 'am');
  const pmActive = actives.find((x) => x.slot === 'pm');
  const hydActives = actives.filter((x) => x.slot === 'hidratacao').map((x) => x.name);

  const reapply = a.highSun
    ? 'Como você relatou exposição frequente/prolongada ao sol, reaplique a cada 2 horas de exposição e após suor ou água, conforme as instruções do produto. Complemente com chapéu, óculos e sombra.'
    : 'Reaplique ao longo do dia se houver exposição ao sol, suor ou contato com água, seguindo as instruções do produto.';

  const morning = [
    {
      title: 'Limpeza',
      what: type === 'seca' || a.sensitivity === 'alta' ? 'Pela manhã, basta enxaguar com água ou usar uma pequena quantidade do limpador suave.' : 'Lave o rosto com água fria ou morna e o limpador indicado, sem esfregar.',
      purpose: type === 'seca' ? 'Refrescar a pele sem retirar a oleosidade natural que a protege.' : 'Remover o excesso de oleosidade e resíduos da noite, preparando a pele.',
      lookFor: cleanserFor(type, a, f),
      actives: [],
      cautions: 'Evite água muito quente, buchas e esfoliação frequente.',
    },
  ];
  if (amActive) {
    morning.push({
      title: 'Tratamento cosmético',
      what: `Aplique algumas gotas de um sérum com ${inSentence(amActive.name)} na pele limpa e seca.`,
      purpose: amActive.purpose,
      lookFor: 'Fórmula simples, sem fragrância, em embalagem que proteja da luz e do ar.',
      actives: [amActive.name],
      cautions: `${amActive.cautions} Comece em dias alternados e observe a resposta da pele por 2 a 4 semanas.`,
    });
  }
  morning.push({
    title: 'Hidratação',
    what: 'Aplique uma camada do hidratante em todo o rosto e pescoço.',
    purpose: 'Manter o conforto e a integridade da barreira cutânea.',
    lookFor: moisturizerFor(type, a),
    actives: hydActives,
    cautions: 'Se o protetor solar já for bem hidratante e sua pele for oleosa, esta etapa pode ser simplificada.',
  });
  morning.push({
    title: 'Fotoproteção',
    what: 'Aplique o protetor solar como última etapa, em quantidade suficiente para cobrir rosto, orelhas e pescoço (como referência, cerca de duas falanges de um dedo para o rosto).',
    purpose: 'Proteger contra manchas, queimaduras e fotoenvelhecimento.',
    lookFor: sunscreenFor(type, a, f),
    actives: ['Filtros UVA/UVB'],
    cautions: reapply,
  });

  const night = [
    {
      title: 'Limpeza',
      what: 'Remova protetor solar, maquiagem e oleosidade. Se usar maquiagem ou protetor resistente à água, uma pré-limpeza com água micelar ou óleo/bálsamo de limpeza pode ajudar.',
      purpose: 'Remover resíduos acumulados ao longo do dia.',
      lookFor: cleanserFor(type, a, f),
      actives: [],
      cautions: 'Seque o rosto com toalha limpa, sem esfregar.',
    },
  ];
  if (pmActive) {
    const freq = pmActive.key === 'retinoide' ? '2 a 3 noites por semana no início, aumentando conforme a tolerância' : 'em noites alternadas no início';
    night.push({
      title: 'Tratamento',
      what: `Use um produto com ${inSentence(pmActive.name)} ${freq}, em pequena quantidade, sobre a pele seca.`,
      purpose: pmActive.purpose,
      lookFor: 'Produto cosmético de concentração moderada, sem fragrância. Não combine com outros esfoliantes ou retinoides nas primeiras semanas.',
      actives: [pmActive.name],
      cautions: pmActive.cautions,
    });
  }
  night.push({
    title: 'Hidratação',
    what: pmActive ? 'Aplique o hidratante após o tratamento (ou antes, se sentir ardência — isso suaviza o contato).' : 'Aplique o hidratante em todo o rosto.',
    purpose: 'Repor o conforto e apoiar a recuperação da barreira durante a noite.',
    lookFor: type === 'oleosa' ? moisturizerFor(type, a) : `${moisturizerFor(type, a)}; à noite pode ser um pouco mais nutritivo`,
    actives: hydActives,
    cautions: 'Prefira poucos produtos e observe a resposta da pele.',
  });
  // Etapa complementar só quando justificável
  if (type === 'seca' || (a.dehydration && type !== 'oleosa') || a.sensitivity === 'alta' || f.recentProcedure) {
    night.push({
      title: 'Cuidados complementares',
      what: 'Nas áreas mais ressecadas ou sensíveis, aplique uma camada fina extra de creme reparador com pantenol (vitamina B5).',
      purpose: 'Reduzir a perda de água e o desconforto em áreas específicas.',
      lookFor: 'Creme reparador sem fragrância (os chamados "cicatriciais" ou "B5").',
      actives: ['Pantenol (vitamina B5)'],
      cautions: 'Evite em áreas com espinhas inflamadas.',
    });
  }
  return { morning, night };
}

// ---------- 6. Cuidados cosméticos para rejuvenescimento ----------
// Aparece conforme a idade e o interesse em linhas finas, firmeza ou prevenção.
// Recomenda apenas cuidados cosméticos de uso domiciliar; procedimentos ficam para a avaliação individual.
function buildRejuvenation({ age, goal, s, f, a, actives }) {
  if (f.minor || age == null) return null;
  const wantsAntiAging = ['linhas', 'prevencao'].includes(goal) || ['linhas', 'prevencao'].includes(s.s12)
    || has(s.s8, 'linhas', 'firmeza');
  if (!wantsAntiAging && age < 30) return null;

  const stage = age < 30
    ? { label: 'prevenção', text: 'Nesta fase, o foco é prevenir: fotoproteção diária, antioxidante e hidratação ajudam a retardar o aparecimento dos primeiros sinais.' }
    : age < 40
      ? { label: 'prevenção e primeiros sinais', text: 'A partir dos 30 anos, a renovação da pele desacelera. É a fase ideal para incluir ativos que estimulam a renovação e cuidam das primeiras linhas finas.' }
      : age < 50
        ? { label: 'linhas finas e firmeza', text: 'Entre os 40 e os 50 anos, linhas finas e perda de firmeza ficam mais evidentes. Uma rotina constante com ativos de renovação, antioxidante e boa hidratação faz diferença na aparência da pele.' }
        : { label: 'firmeza e viço', text: 'Após os 50 anos, a pele tende a ficar mais fina e seca. O foco é hidratação intensa, reforço da barreira e ativos de renovação usados com cuidado.' };

  const inRoutine = (key) => actives.some((x) => x.key === key);
  const items = [];
  items.push({
    title: 'Fotoproteção todos os dias',
    text: 'É o cuidado com melhor evidência contra o envelhecimento precoce: protetor de amplo espectro, FPS 30 ou mais, inclusive em dias nublados e dentro de casa perto de janelas.',
  });
  const pregnantOrUnknown = f.pregnancy || f.pregnancyUnknown;
  if (f.noRetinoid) {
    const why = pregnantOrUnknown ? 'durante gestação, amamentação ou tentativa de engravidar ele não é indicado'
      : f.recentProcedure ? 'após um procedimento recente, é preciso aguardar a liberação do profissional'
        : 'pelo seu histórico, ele deve ser usado somente com orientação profissional';
    items.push({ title: 'Retinol', text: `É um dos ativos mais estudados para linhas finas e textura, mas ${why}. Os peptídeos são uma alternativa mais suave.` });
  } else if (a.sensitivity === 'alta') {
    items.push({
      title: 'Bakuchiol à noite',
      text: inRoutine('bakuchiol')
        ? 'Já está na sua rotina da noite: alternativa vegetal ao retinol, com resultados parecidos em linhas e manchas e menos irritação, ideal para pele sensível.'
        : 'Alternativa vegetal ao retinol, com resultados parecidos em linhas e manchas e menos irritação, ideal para pele sensível.',
    });
  } else {
    items.push({
      title: 'Retinol ou retinal à noite',
      text: (inRoutine('retinoide')
        ? 'Já está na sua rotina da noite: comece com 2 a 3 noites por semana e aumente conforme a pele se adaptar.'
        : 'Inclua depois que a rotina atual estiver adaptada (cerca de 4 semanas), começando com 2 a 3 noites por semana.')
        + ' Estimula a renovação e suaviza linhas finas. O retinal (retinaldeído) é a versão que age mais rápido, indicada para quem já usa retinol sem irritação.',
    });
  }
  items.push({
    title: 'Peptídeos',
    text: inRoutine('peptideos')
      ? 'Já estão na sua rotina da noite: séruns com peptídeos (como Matrixyl® e Argireline®) ajudam na aparência de firmeza e de linhas finas.'
      : 'Séruns com peptídeos (como Matrixyl® e Argireline®) ajudam na aparência de firmeza e de linhas finas. Podem ser usados nas noites sem retinol.',
  });
  items.push({
    title: 'Vitamina C pela manhã',
    text: inRoutine('vitamina_c')
      ? 'Já está na sua rotina da manhã: antioxidante que potencializa o protetor solar e devolve a luminosidade.'
      : 'Antioxidante que potencializa o protetor solar e devolve a luminosidade. Inclua aos poucos, depois que a rotina atual estiver adaptada.',
  });
  if ((has(s.s8, 'firmeza') || age >= 40) && !pregnantOrUnknown) {
    items.push({ title: 'DMAE', text: 'Presente em cremes com "efeito firmador", proporciona aparência de pele mais firme. O efeito é discreto e depende do uso contínuo.' });
  }
  items.push({
    title: 'Ácido hialurônico',
    text: 'Sérum que repõe a água da pele e deixa um aspecto mais preenchido e luminoso. Pode ser usado de manhã e à noite, em qualquer tipo de pele.',
  });
  if (age >= 30 && !pregnantOrUnknown) {
    items.push({
      title: 'PDRN ("DNA de salmão") — tendência',
      text: 'Ativo que veio da cosmética coreana e aparece em séruns de recuperação e viço. Os estudos em cosméticos de uso em casa ainda são limitados: use como complemento, nunca no lugar do retinol e do protetor.',
    });
  }

  return {
    headline: `Também preparamos cuidados de rejuvenescimento com foco em ${stage.label}.`,
    stage: stage.label,
    intro: stage.text,
    items,
    professional: 'Na avaliação individualizada, a Dra. Fernanda pode indicar protocolos estéticos profissionais adequados para potencializar esses cuidados.',
  };
}

// ---------- 7. O que a pele precisa: problema → solução ----------
function buildNeeds({ type, a, f, s, actives }) {
  const has2 = (k) => has(s.s8, k) || s.s12 === k;
  const inR = (k) => actives.some((x) => x.key === k);
  const canAcids = !f.noAcids && a.sensitivity !== 'alta';
  const out = [];
  const push = (problem, solution) => { if (!out.some((x) => x.problem === problem)) out.push({ problem, solution }); };

  if (has2('linhas') || s.s12 === 'prevencao') {
    const night = f.noRetinoid ? 'Sérum com peptídeos à noite'
      : a.sensitivity === 'alta' ? 'Bakuchiol à noite (alternativa suave ao retinol)'
        : 'Retinol ou retinal à noite (2 a 3 vezes por semana no início)';
    push(s.s12 === 'prevencao' && !has(s.s8, 'linhas') ? 'Prevenção do envelhecimento' : 'Linhas finas',
      `${night}, vitamina C pela manhã e protetor solar todos os dias.`);
  }
  if (has(s.s8, 'firmeza')) push('Perda de firmeza', `Peptídeos${f.pregnancy || f.pregnancyUnknown ? '' : ' e DMAE'} em sérum ou creme, ácido hialurônico para dar volume de hidratação e ${f.noRetinoid ? 'avaliação profissional para protocolos de firmeza' : 'retinol à noite'}.`);
  if (has2('manchas')) push('Manchas', `Protetor solar com cor todos os dias, vitamina C pela manhã e ${f.pregnancy || f.pregnancyUnknown ? 'ácido azelaico à noite (com orientação)' : f.noAcids ? 'avaliação profissional antes de usar clareadores' : 'sérum clareador à noite (tiamidol, ácido tranexâmico, cisteamina ou alfa-arbutin)'}.`);
  if (has2('oleosidade') || type === 'oleosa') push('Oleosidade e brilho', 'Limpeza com gel 2 vezes ao dia (sem exagerar), sérum de niacinamida com zinco PCA pela manhã, hidratante oil-free e protetor de toque seco.');
  if (has2('acne')) push('Cravos e espinhas', `${f.noSalicylic ? (f.pregnancy ? 'Ácido azelaico à noite (com orientação)' : 'Niacinamida e avaliação profissional') : 'Ácido salicílico à noite'} e niacinamida pela manhã. Não esprema: isso deixa manchas e marcas.`);
  if (has(s.s8, 'poros')) push('Poros aparentes', `Niacinamida pela manhã${!f.noSalicylic ? ' e ácido salicílico 2 a 3 noites por semana' : ''}; mantenha a pele limpa e hidratada.`);
  if (has2('textura')) push('Textura irregular', canAcids ? 'Ácido glicólico 1 a 3 noites por semana (não na mesma noite do retinol) e protetor solar diário.' : 'Niacinamida, hidratação com ácido hialurônico e avaliação para uma esfoliação adequada.');
  if (has2('luminosidade')) push('Falta de luminosidade', `Vitamina C pela manhã${canAcids ? ' e ácido glicólico 1 a 2 noites por semana' : ''}, ácido hialurônico e protetor solar.`);
  if (has(s.s8, 'ressecamento') || s.s12 === 'hidratacao' || type === 'seca') push('Ressecamento', 'Limpador cremoso, sérum de ácido hialurônico antes do hidratante e creme mais nutritivo à noite. Evite água quente no rosto.');
  if (a.dehydration && type !== 'seca') push('Desidratação', 'Sérum de ácido hialurônico de manhã e à noite e hidratante leve. A pele pode ser oleosa e, ainda assim, ter falta de água.');
  if (has(s.s8, 'sensibilidade') || a.sensitivity === 'alta') push('Sensibilidade', 'Poucos produtos, todos sem fragrância, com centella asiática (cica) e pantenol (vitamina B5) para acalmar. Introduza um ativo novo por vez.');
  if (type === 'mista' && !out.some((x) => x.problem.startsWith('Oleosidade'))) push('Zona T oleosa e bochechas mais secas', 'Hidratante leve no rosto todo e niacinamida na zona T; reforce a hidratação só nas bochechas.');
  if (!out.length) push('Manter a pele saudável', `Limpeza suave, ${inR('niacinamida') ? 'niacinamida' : 'ácido hialurônico'}, hidratante e protetor solar todos os dias.`);
  return out;
}

// ---------- 8. Dicas práticas: clima, região, sol, idade e rotina ----------
function buildTips({ type, a, s, h, age, region }) {
  const tips = [];
  const onde = region ? ` em ${region}` : '';
  const climate = {
    quente_umido: `No clima quente e úmido${onde}, prefira texturas leves (gel ou fluido) e protetor de toque seco, e reaplique o protetor mais vezes por causa do suor.`,
    quente_seco: `No clima quente e seco${onde}, use sérum de ácido hialurônico antes do hidratante, beba bastante água e evite banhos muito quentes.`,
    frio_seco: `No clima frio e seco${onde}, troque para um hidratante mais nutritivo, evite lavar o rosto com água quente e use um umidificador no quarto se possível.`,
    frio_umido: `No clima frio e úmido${onde}, mantenha o hidratante e o protetor mesmo em dias nublados: a radiação UVA atravessa as nuvens.`,
    variavel: `Como o clima${onde} muda bastante, adapte a textura: hidratante mais nutritivo nos dias frios e gel leve nos dias quentes. O protetor solar fica o ano todo.`,
  }[s.s11];
  tips.push(climate || `Adapte a textura dos produtos às estações${onde}: mais nutritiva no frio, mais leve no calor.`);

  if (a.highSun) tips.push('Como você se expõe bastante ao sol, reaplique o protetor a cada 2 horas e use chapéu e óculos de sol. É o principal cuidado contra manchas e envelhecimento.');
  else if (!a.sunscreenDaily) tips.push('Use protetor solar todos os dias, mesmo em casa ou em dias nublados: a luz que entra pela janela também envelhece a pele.');
  else tips.push('Continue com o protetor solar diário e reaplique se ficar ao ar livre.');

  if (age != null && age >= 25) {
    const ageTip = age < 35 ? 'Por volta dos 30 anos a produção de colágeno começa a diminuir: é a melhor hora para prevenir com antioxidante e retinol.'
      : age < 45 ? `Aos ${age} anos, a pele já renova mais devagar. Constância é o segredo: os ativos de renovação mostram resultado em 8 a 12 semanas de uso.`
        : `Aos ${age} anos, a pele fica mais fina e perde água com facilidade. Priorize hidratação intensa e ativos de firmeza, introduzidos aos poucos.`;
    tips.push(ageTip);
  }

  if (['nenhuma', 'sabonete'].includes(s.s9)) tips.push('Comece pelo básico por 2 semanas (limpeza, hidratante e protetor) e só depois inclua os ativos, um de cada vez.');
  else if (s.s9 === 'diversos') tips.push('Como você já usa vários produtos, simplifique: não use ácidos e retinol na mesma noite e evite repetir ativos parecidos.');
  if (a.hormonalPattern || has(h.h1, 'hormonal')) tips.push('Nos dias antes da menstruação, reforce a limpeza e mantenha os ativos para oleosidade em dia: é quando as espinhas hormonais costumam aparecer.');
  if (type === 'oleosa' || type === 'mista') tips.push('Não pule o hidratante por ter pele oleosa: a falta de água faz a pele produzir ainda mais oleosidade.');
  return tips;
}

// ---------- 9. Montagem do resultado ----------
export function analyze({ firstName, age, goal, region }, health, skin) {
  const h = health; const s = skin;
  const c = classify(s);
  const a = assess(h, s);
  const f = safety(h, s, age);
  let type = c.skinType;

  const actives = selectActives(type, a, f, s, age);
  const routines = buildRoutines(type, a, f, actives);

  // Características identificadas
  const characteristics = [];
  if (s.s1 !== 'nao_sei') characteristics.push(`Durante o dia: ${sl('s1', s.s1).toLowerCase()}.`);
  if (s.s2) characteristics.push(`Após a limpeza: ${sl('s2', s.s2).toLowerCase()}.`);
  if (s.s3 !== 'nao_sei') characteristics.push(`Poros: ${sl('s3', s.s3).toLowerCase()}.`);
  if (s.s6) characteristics.push(`Textura: ${sl('s6', s.s6).toLowerCase()}.`);
  characteristics.push(`Sensibilidade relatada: ${a.sensitivity}${a.sensWhy.length ? ` (${a.sensWhy.join('; ')})` : ''}.`);
  characteristics.push(`Tendência a cravos e espinhas: ${a.acneTendency}.`);
  if (a.dehydration) characteristics.push('Há sinais de desidratação — um estado temporário (falta de água), diferente do tipo de pele.');

  const needs = buildNeeds({ type, a, f, s, actives });
  const factors = buildTips({ type, a, s, h, age, region });

  // Cuidados que exigem cautela
  const cautions = [
    'Introduza um produto novo por vez, com intervalo de 1 a 2 semanas, e faça teste em pequena área (atrás da orelha ou na lateral do pescoço) antes do uso no rosto.',
    'Interrompa o uso e procure orientação diante de vermelhidão intensa, ardência persistente, inchaço ou coceira.',
  ];
  if (f.pregnancy || f.pregnancyUnknown) cautions.push('Gestação, amamentação ou tentativa de engravidar: retinoides e ácido salicílico não foram incluídos. Confirme qualquer produto com seu médico obstetra.');
  if (f.allergyCosmetic) cautions.push('Alergia a cosméticos/fragrâncias: prefira fórmulas sem fragrância e leia sempre a lista de ingredientes.');
  if (f.allergyOther) cautions.push('Você relatou alergias: verifique a composição dos produtos; quem tem alergia a aspirina/salicilatos deve evitar ácido salicílico.');
  if (f.medication) cautions.push('Você utiliza medicamentos que podem interferir na pele: converse com quem prescreveu antes de introduzir ativos.');
  if (f.usingStrongActives) cautions.push('Você já utiliza ácidos, retinoides ou clareadores: evite somar novos ativos semelhantes, para não irritar a pele.');
  if (f.prescribed) cautions.push('Você está em tratamento prescrito: mantenha as orientações de quem acompanha você; esta rotina não substitui esse tratamento.');
  if (f.recentProcedure) cautions.push('Procedimento recente: siga as orientações pós-procedimento do profissional responsável; ativos esfoliantes foram suspensos.');
  if (f.minor) cautions.push('Para menores de 18 anos, a rotina foi limitada a limpeza suave, hidratação e fotoproteção, com acompanhamento de um responsável.');
  if (a.sensitivity === 'alta') cautions.push('Pele com sensibilidade alta: mantenha a rotina mínima por algumas semanas antes de considerar novos ativos.');

  // Avaliação profissional
  const referral = [];
  if (f.red) referral.push('Você relatou uma alteração de pele que exige atenção (ferida persistente, lesão que mudou, inflamação intensa, dor/inchaço ou reação alérgica importante). Procure avaliação médica, de preferência com dermatologista, antes de iniciar novos produtos.');
  if (f.dermDx) referral.push('Condições como rosácea, dermatite ou psoríase devem ser acompanhadas por dermatologista.');
  if (f.melasma) referral.push('Melasma tem tendência a recorrer e se beneficia de acompanhamento profissional.');
  if (a.inflammatoryAcne || f.acneDx) referral.push('Acne inflamatória ou diagnosticada deve ser avaliada e tratada por dermatologista.');
  if (f.healthCondition) referral.push('Você relatou uma condição de saúde que pode influenciar a pele: considere orientação profissional individualizada.');
  if (f.otherConcern) referral.push('Você indicou outra alteração de pele que preocupa: uma avaliação presencial é recomendada.');
  referral.push('Qualquer lesão nova, que mude de cor, tamanho ou forma, sangre ou não cicatrize deve ser avaliada por médico.');

  // Texto do resultado: curto, só a conclusão (sem repetir as respostas da participante)
  const typeLabel = SKIN_TYPE_LABELS[type];
  let explanation = `${firstName}, seu tipo de pele é: ${typeLabel.toLowerCase()}.`;
  if (a.dehydration) explanation += ' Há também sinais de desidratação.';
  const rejuvenation = buildRejuvenation({ age, goal, s, f, a, actives });
  if (rejuvenation) explanation += ` ${rejuvenation.headline}`;
  if (f.red) explanation += ' Como há uma alteração de pele que merece atenção, recomendamos avaliação profissional antes de iniciar novos produtos.';

  return {
    engineVersion: ENGINE_VERSION,
    skinType: type,
    skinTypeLabel: typeLabel,
    confidence: c.confidence,
    confidenceLabel: { alto: 'Alto', moderado: 'Moderado', baixo: 'Baixo' }[c.confidence],
    confidenceNote: 'Nível qualitativo baseado na consistência e na quantidade de respostas — não é uma medida científica nem um diagnóstico.',
    influences: c.influences,
    contradictions: c.contradictions,
    explanation,
    characteristics,
    needs,
    factors,
    assessments: {
      sensitivity: a.sensitivity,
      acneTendency: a.acneTendency,
      dehydration: a.dehydration,
      sunExposure: a.sunExposure,
      concerns: (s.s8 || []).map((v) => sl('s8', v)),
      habits: sl('s9', s.s9),
    },
    actives: actives.map(({ key, name, purpose, why, benefits, fit, cautions, professional, sources, slot }) => ({ key, name, purpose, why, benefits, fit, cautions, professional, sources, slot })),
    morning: routines.morning,
    night: routines.night,
    cautions,
    referral,
    rejuvenation,
    restricted: f.red || f.basicOnly || f.minor,
    redFlag: f.red,
    goal,
  };
}

// Resumo para a IA: SEM nome, telefone, região exata ou respostas de saúde.
export function factsForAI(result) {
  return {
    tipo_estimado: result.skinTypeLabel,
    confianca: result.confidenceLabel,
    respostas_que_influenciaram: result.influences.map((i) => `${i.answer} → ${i.effect}`),
    contradicoes: result.contradictions,
    sensibilidade: result.assessments.sensitivity,
    tendencia_acne: result.assessments.acneTendency,
    desidratacao: result.assessments.dehydration,
    incomodos: result.assessments.concerns,
    ativos_selecionados: result.actives.map((a) => a.name),
    rotina_restrita_por_seguranca: result.restricted,
    sinal_de_alerta: result.redFlag,
  };
}

export { HEALTH_QUESTIONS, SKIN_QUESTIONS };
