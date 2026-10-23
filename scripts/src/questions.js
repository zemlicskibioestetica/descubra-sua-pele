// Definição única dos questionários. Servida ao navegador via /api/questions
// e usada pelo servidor para validar as respostas.

export const GOALS = [
  ['oleosidade', 'Controlar oleosidade'],
  ['hidratacao', 'Melhorar hidratação'],
  ['manchas', 'Cuidar de manchas'],
  ['textura_luminosidade', 'Melhorar textura e luminosidade'],
  ['linhas', 'Amenizar a aparência de linhas finas'],
  ['acne', 'Cuidar de acne e cravos'],
  ['poros', 'Melhorar a aparência dos poros'],
  ['prevencao', 'Prevenir sinais do envelhecimento'],
  ['manutencao', 'Manter a pele saudável'],
  ['outro', 'Outro'],
].map(([value, label]) => ({ value, label }));

export const SEX_OPTIONS = [
  { value: 'feminino', label: 'Feminino' },
  { value: 'masculino', label: 'Masculino' },
  { value: 'outro', label: 'Outro' },
  { value: 'nao_informar', label: 'Prefiro não informar' },
];

const o = (value, label, extra = {}) => ({ value, label, ...extra });

// exclusive: ao marcar, desmarca as demais (ex.: "Nenhum")
export const HEALTH_QUESTIONS = [
  {
    id: 'h1', multi: true, title: 'Você possui alguma condição de saúde que considera importante para os cuidados com a pele?',
    options: [
      o('nenhuma', 'Não tenho nenhuma condição conhecida', { exclusive: true }),
      o('hormonal', 'Alterações hormonais'),
      o('tireoide', 'Alterações da tireoide'),
      o('diabetes', 'Diabetes'),
      o('autoimune', 'Doença autoimune'),
      o('dermatologica', 'Condição dermatológica'),
      o('outra', 'Outra condição'),
      o('nao_informar', 'Prefiro não informar', { exclusive: true }),
    ],
  },
  {
    id: 'h2', multi: true, title: 'Você possui alergias conhecidas?',
    options: [
      o('nao', 'Não', { exclusive: true }),
      o('medicamentos', 'A medicamentos'),
      o('cosmeticos', 'A cosméticos'),
      o('fragrancias', 'A fragrâncias ou conservantes'),
      o('outras', 'Outras'),
      o('nao_sei', 'Não sei informar', { exclusive: true }),
    ],
  },
  {
    id: 'h3', multi: false, title: 'Você utiliza medicamentos que podem interferir na pele?',
    options: [o('nao', 'Não'), o('sim', 'Sim'), o('nao_sei', 'Não sei')],
    followUp: { when: 'sim', field: 'h3_detail', label: 'Se quiser, informe o nome do medicamento (opcional)', maxLength: 120 },
  },
  {
    id: 'h4', multi: true, title: 'Você utiliza algum destes produtos ou tratamentos?',
    options: [
      o('acidos', 'Ácidos cosméticos'),
      o('retinoides', 'Retinoides'),
      o('med_acne', 'Medicamentos para acne'),
      o('clareadores', 'Clareadores'),
      o('corticoides', 'Corticoides tópicos'),
      o('prescritos', 'Tratamentos dermatológicos prescritos'),
      o('nenhum', 'Nenhum', { exclusive: true }),
      o('outros', 'Outros'),
    ],
  },
  {
    id: 'h5', multi: true, title: 'Você costuma apresentar reações aos cosméticos?',
    options: [
      o('nao', 'Não', { exclusive: true }),
      o('vermelhidao', 'Vermelhidão'),
      o('ardencia', 'Ardência'),
      o('coceira', 'Coceira'),
      o('descamacao', 'Descamação'),
      o('inchaco', 'Inchaço'),
      o('outra', 'Outra reação'),
    ],
  },
  {
    id: 'h6', multi: true, title: 'Algum profissional já diagnosticou uma condição de pele?',
    options: [
      o('acne', 'Acne'),
      o('rosacea', 'Rosácea'),
      o('dermatite', 'Dermatite'),
      o('melasma', 'Melasma'),
      o('psoriase', 'Psoríase'),
      o('outra', 'Outra condição'),
      o('nao', 'Não', { exclusive: true }),
      o('nao_sei', 'Não sei', { exclusive: true }),
    ],
  },
  {
    id: 'h7', multi: false, title: 'Você está grávida, amamentando ou tentando engravidar?',
    hint: 'Usamos essa informação somente para aplicar precauções de segurança nas recomendações.',
    options: [o('sim', 'Sim'), o('nao', 'Não'), o('nao_informar', 'Prefiro não informar')],
  },
  {
    id: 'h8', multi: true, title: 'Você realizou recentemente algum procedimento estético ou dermatológico?',
    options: [
      o('nenhum', 'Nenhum', { exclusive: true }),
      o('peeling', 'Peeling'),
      o('laser', 'Laser'),
      o('microagulhamento', 'Microagulhamento'),
      o('outro', 'Outro procedimento'),
    ],
  },
  {
    id: 'h9', multi: true, title: 'Você possui atualmente alguma alteração de pele que preocupa você?',
    options: [
      o('ferida', 'Ferida persistente'),
      o('lesao_mudou', 'Lesão que mudou de aparência'),
      o('inflamacao', 'Inflamação intensa'),
      o('dor_inchaco', 'Dor ou inchaço'),
      o('alergia_importante', 'Reação alérgica importante'),
      o('nenhuma', 'Nenhuma dessas situações', { exclusive: true }),
      o('outra', 'Outra alteração'),
    ],
  },
];

export const SKIN_QUESTIONS = [
  {
    id: 's1', title: 'Como sua pele costuma ficar durante o dia?',
    options: [
      o('oleosa_toda', 'Oleosa e brilhante em quase todo o rosto'),
      o('oleosa_t', 'Oleosa principalmente na testa, nariz e queixo'),
      o('equilibrada', 'Equilibrada, sem excesso de brilho ou ressecamento'),
      o('ressecada', 'Ressecada ou repuxando'),
      o('varia', 'Varia entre oleosidade e ressecamento'),
      o('nao_sei', 'Não sei identificar'),
    ],
  },
  {
    id: 's2', title: 'Como sua pele fica depois de lavar o rosto?',
    options: [
      o('confortavel', 'Confortável'),
      o('repuxando', 'Repuxando ou ressecada'),
      o('oleosa_logo', 'Oleosa novamente pouco tempo depois'),
      o('sensivel', 'Sensível, com ardência ou vermelhidão'),
      o('depende', 'Depende do produto utilizado'),
    ],
  },
  {
    id: 's3', title: 'Como são os poros do seu rosto?',
    options: [
      o('pouco_visiveis', 'Pouco visíveis'),
      o('nariz_testa', 'Mais aparentes no nariz e na testa'),
      o('todo_rosto', 'Visíveis em boa parte do rosto'),
      o('nao_sei', 'Não sei identificar'),
    ],
  },
  {
    id: 's4', title: 'Como sua pele reage aos cosméticos?',
    options: [
      o('tolera', 'Tolera a maioria dos produtos'),
      o('vermelha_arde', 'Fica vermelha ou arde facilmente'),
      o('coceira', 'Apresenta coceira ou irritação'),
      o('descama', 'Resseca ou descama facilmente'),
      o('nao_sei', 'Não sei'),
    ],
  },
  {
    id: 's5', title: 'Você apresenta cravos ou espinhas?',
    options: [
      o('quase_nunca', 'Quase nunca'),
      o('zona_t', 'Principalmente na testa, nariz e queixo'),
      o('varias', 'Em várias regiões do rosto'),
      o('inflamadas', 'Espinhas inflamadas frequentes'),
      o('ciclo', 'Varia conforme o período menstrual'),
      o('nao_sei', 'Não sei'),
    ],
  },
  {
    id: 's6', title: 'Como você descreveria a textura da pele?',
    options: [
      o('lisa', 'Lisa e uniforme'),
      o('poros_cravos', 'Com poros e cravos aparentes'),
      o('irregular', 'Com pequenas irregularidades'),
      o('aspera', 'Áspera ou descamando'),
      o('manchas', 'Com manchas'),
      o('varias', 'Com mais de uma dessas características'),
    ],
  },
  {
    id: 's7', title: 'Como sua pele reage ao sol?',
    options: [
      o('confortavel', 'Geralmente permanece confortável'),
      o('mais_oleosa', 'Fica mais oleosa'),
      o('ressecada', 'Fica ressecada'),
      o('vermelha', 'Fica vermelha ou sensível'),
      o('manchas', 'Apresenta manchas com facilidade'),
      o('nao_sei', 'Não sei'),
    ],
  },
  {
    id: 's8', multi: true, max: 3, title: 'O que mais incomoda você na aparência da pele?', hint: 'Escolha até 3 opções.',
    options: [
      o('oleosidade', 'Oleosidade'),
      o('ressecamento', 'Ressecamento'),
      o('sensibilidade', 'Sensibilidade'),
      o('acne', 'Acne e cravos'),
      o('manchas', 'Manchas'),
      o('poros', 'Poros aparentes'),
      o('textura', 'Textura irregular'),
      o('linhas', 'Linhas finas'),
      o('luminosidade', 'Falta de luminosidade'),
      o('firmeza', 'Perda de firmeza'),
      o('nenhuma', 'Nenhuma dessas opções', { exclusive: true }),
    ],
  },
  {
    id: 's9', title: 'Qual é sua rotina atual de cuidados?',
    options: [
      o('nenhuma', 'Não utilizo produtos regularmente'),
      o('sabonete', 'Utilizo somente sabonete'),
      o('sabonete_hidratante', 'Utilizo sabonete e hidratante'),
      o('basica_completa', 'Utilizo sabonete, hidratante e protetor solar'),
      o('diversos', 'Utilizo diversos cosméticos e ativos'),
      o('dermato', 'Faço acompanhamento dermatológico'),
    ],
  },
  {
    id: 's10', multi: true, max: 2, title: 'Como você se expõe ao sol?', hint: 'Você pode marcar até 2 opções (exposição e uso de protetor).',
    options: [
      o('raramente', 'Raramente'),
      o('deslocamentos', 'Principalmente nos deslocamentos diários'),
      o('frequente', 'Frequentemente por lazer ou trabalho'),
      o('prolongado', 'Por períodos prolongados ao ar livre'),
      o('fps_diario', 'Utilizo protetor solar diariamente'),
      o('fps_ocasional', 'Utilizo protetor solar apenas ocasionalmente'),
    ],
  },
  {
    id: 's11', title: 'Em qual tipo de clima você vive?',
    options: [
      o('quente_umido', 'Quente e úmido'),
      o('quente_seco', 'Quente e seco'),
      o('frio_seco', 'Frio e seco'),
      o('frio_umido', 'Frio e úmido'),
      o('variavel', 'Clima variável'),
      o('nao_sei', 'Não sei'),
    ],
  },
  {
    id: 's12', title: 'O que você gostaria de melhorar primeiro?',
    options: [
      o('oleosidade', 'Oleosidade'),
      o('hidratacao', 'Hidratação'),
      o('manchas', 'Manchas'),
      o('textura', 'Textura'),
      o('luminosidade', 'Luminosidade'),
      o('acne', 'Acne'),
      o('linhas', 'Linhas finas'),
      o('prevencao', 'Prevenção e manutenção'),
      o('outro', 'Outro objetivo'),
    ],
  },
];

export function labelOf(questions, qid, value) {
  const q = questions.find((x) => x.id === qid);
  return q?.options.find((op) => op.value === value)?.label ?? value;
}

export const goalLabel = (v) => GOALS.find((g) => g.value === v)?.label ?? v;

// Valida um conjunto de respostas contra as definições. Retorna { ok, errors, clean }.
export function validateAnswers(questions, answers) {
  const errors = [];
  const clean = {};
  if (!answers || typeof answers !== 'object') return { ok: false, errors: ['Respostas ausentes.'], clean };
  for (const q of questions) {
    const raw = answers[q.id];
    const allowed = new Set(q.options.map((op) => op.value));
    if (q.multi) {
      const arr = Array.isArray(raw) ? [...new Set(raw)] : [];
      if (!arr.length) { errors.push(`Responda: ${q.title}`); continue; }
      if (arr.some((v) => !allowed.has(v))) { errors.push(`Opção inválida em: ${q.title}`); continue; }
      if (q.max && arr.length > q.max) { errors.push(`Escolha no máximo ${q.max} opções em: ${q.title}`); continue; }
      const exclusive = q.options.filter((op) => op.exclusive).map((op) => op.value);
      if (arr.length > 1 && arr.some((v) => exclusive.includes(v))) { errors.push(`Combinação inválida em: ${q.title}`); continue; }
      clean[q.id] = arr;
    } else {
      if (typeof raw !== 'string' || !allowed.has(raw)) { errors.push(`Responda: ${q.title}`); continue; }
      clean[q.id] = raw;
    }
    if (q.followUp && clean[q.id] === q.followUp.when) {
      const detail = answers[q.followUp.field];
      if (typeof detail === 'string' && detail.trim()) clean[q.followUp.field] = detail.trim().slice(0, q.followUp.maxLength);
    }
  }
  return { ok: errors.length === 0, errors, clean };
}
