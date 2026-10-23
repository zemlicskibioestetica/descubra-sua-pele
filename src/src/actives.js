// Base de conhecimento dos ativos cosméticos.
// As fontes são publicações reais; o link aponta para a busca do título no PubMed,
// para que qualquer pessoa possa verificar a referência. Revise periodicamente.

const pubmed = (title) => `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(title)}`;
const src = (citation, title) => ({ citation, url: pubmed(title) });

export const SOURCES = {
  moisturizers: src(
    'Draelos ZD. The science behind skin care: Moisturizers. J Cosmet Dermatol. 2018;17(2):138-144.',
    'The science behind skin care: Moisturizers'),
  glycerol: src(
    'Fluhr JW, Darlenski R, Surber C. Glycerol and the skin: holistic approach to its origin and functions. Br J Dermatol. 2008;159(1):23-34.',
    'Glycerol and the skin: holistic approach to its origin and functions'),
  dexpanthenol: src(
    'Proksch E, de Bony R, Trapp S, Boudon S. Topical use of dexpanthenol: a 70th anniversary article. J Dermatolog Treat. 2017;28(8):766-773.',
    'Topical use of dexpanthenol: a 70th anniversary article'),
  hyaluronic: src(
    'Pavicic T, et al. Efficacy of cream-based novel formulations of hyaluronic acid of different molecular weights in anti-wrinkle treatment. J Drugs Dermatol. 2011;10(9):990-1000.',
    'Efficacy of cream-based novel formulations of hyaluronic acid of different molecular weights in anti-wrinkle treatment'),
  niacinamideAging: src(
    'Bissett DL, Oblong JE, Berge CA. Niacinamide: a B vitamin that improves aging facial skin appearance. Dermatol Surg. 2005;31(7 Pt 2):860-865.',
    'Niacinamide: A B vitamin that improves aging facial skin appearance'),
  niacinamideSebum: src(
    'Draelos ZD, Matsubara A, Smiles K. The effect of 2% niacinamide on facial sebum production. J Cosmet Laser Ther. 2006;8(2):96-101.',
    'The effect of 2% niacinamide on facial sebum production'),
  vitaminC: src(
    'Al-Niaimi F, Chiang NYZ. Topical Vitamin C and the Skin: Mechanisms of Action and Clinical Applications. J Clin Aesthet Dermatol. 2017;10(7):14-17.',
    'Topical Vitamin C and the Skin: Mechanisms of Action and Clinical Applications'),
  azelaic: src(
    'Schulte BC, Wu W, Rosen T. Azelaic Acid: Evidence-based Update on Mechanism of Action and Clinical Application. J Drugs Dermatol. 2015;14(9):964-968.',
    'Azelaic Acid: Evidence-based Update on Mechanism of Action and Clinical Application'),
  salicylic: src(
    'Arif T. Salicylic acid as a peeling agent: a comprehensive review. Clin Cosmet Investig Dermatol. 2015;8:455-461.',
    'Salicylic acid as a peeling agent: a comprehensive review'),
  retinoids: src(
    'Mukherjee S, et al. Retinoids in the treatment of skin aging: an overview of clinical efficacy and safety. Clin Interv Aging. 2006;1(4):327-348.',
    'Retinoids in the treatment of skin aging: an overview of clinical efficacy and safety'),
  sunscreen: src(
    'Hughes MCB, Williams GM, Baker P, Green AC. Sunscreen and prevention of skin aging: a randomized trial. Ann Intern Med. 2013;158(11):781-790.',
    'Sunscreen and prevention of skin aging: a randomized trial'),
  acneGuideline: src(
    'Zaenglein AL, et al. Guidelines of care for the management of acne vulgaris. J Am Acad Dermatol. 2016;74(5):945-973.',
    'Guidelines of care for the management of acne vulgaris'),
};

export const ACTIVES = {
  glicerina: {
    name: 'Glicerina',
    purpose: 'Umectante: atrai e retém água nas camadas superficiais da pele.',
    benefits: 'Pode aumentar a sensação de conforto e hidratação e apoiar a função de barreira.',
    fit: 'Presente em hidratantes e séruns; costuma ser bem tolerada e pode ser usada de manhã e à noite.',
    cautions: 'Raramente irrita, mas a fórmula completa do produto (fragrâncias, conservantes) pode causar reações.',
    professional: 'Se surgir irritação persistente mesmo com produtos simples.',
    sources: [SOURCES.glycerol, SOURCES.moisturizers],
  },
  ceramidas: {
    name: 'Ceramidas',
    purpose: 'Lipídios semelhantes aos da barreira cutânea natural.',
    benefits: 'Podem ajudar a reduzir a perda de água e o desconforto associado à barreira fragilizada.',
    fit: 'Em hidratantes, especialmente à noite ou quando a pele está ressecada ou sensível.',
    cautions: 'Texturas mais ricas podem não agradar peles muito oleosas; prefira versões leves nesse caso.',
    professional: 'Se a pele permanecer ressecada, descamando ou com coceira apesar da hidratação.',
    sources: [SOURCES.moisturizers],
  },
  pantenol: {
    name: 'Pantenol (pró-vitamina B5)',
    purpose: 'Hidratante e calmante cosmético.',
    benefits: 'Pode contribuir para o conforto da pele e para a manutenção da barreira.',
    fit: 'Em hidratantes ou séruns calmantes, manhã ou noite.',
    cautions: 'Geralmente bem tolerado; faça teste em pequena área se houver histórico de reações.',
    professional: 'Diante de vermelhidão, ardência ou inflamação persistentes.',
    sources: [SOURCES.dexpanthenol],
  },
  acido_hialuronico: {
    name: 'Ácido hialurônico',
    purpose: 'Umectante que ajuda a reter água na superfície da pele.',
    benefits: 'Pode melhorar a sensação de hidratação e a aparência de viço.',
    fit: 'Sérum ou hidratante aplicado na pele limpa, antes do hidratante ou como hidratante leve.',
    cautions: 'Em climas muito secos, combine com um hidratante que "sele" a hidratação.',
    professional: 'Se o ressecamento for intenso ou acompanhado de descamação e coceira.',
    sources: [SOURCES.hyaluronic],
  },
  niacinamida: {
    name: 'Niacinamida',
    purpose: 'Vitamina B3 com uso cosmético para oleosidade, poros, uniformidade e barreira.',
    benefits: 'Estudos sugerem melhora da aparência de oleosidade, textura e uniformidade do tom em algumas pessoas.',
    fit: 'Sérum ou hidratante, manhã ou noite; costuma combinar bem com outras etapas.',
    cautions: 'Algumas pessoas sentem leve vermelhidão ou ardência; introduza aos poucos.',
    professional: 'Se houver irritação persistente ou se você já usa tratamentos prescritos.',
    sources: [SOURCES.niacinamideSebum, SOURCES.niacinamideAging],
  },
  vitamina_c: {
    name: 'Vitamina C (ácido ascórbico e derivados)',
    purpose: 'Antioxidante cosmético com foco em luminosidade e uniformidade.',
    benefits: 'Pode contribuir para a aparência de luminosidade e complementar a fotoproteção — não a substitui.',
    fit: 'Pela manhã, após a limpeza e antes do hidratante e do protetor solar.',
    cautions: 'Algumas formas podem arder em peles sensíveis; prefira introduzir em dias alternados. O produto oxida com o tempo (escurece).',
    professional: 'Se você tem melasma, manchas persistentes ou pele muito reativa.',
    sources: [SOURCES.vitaminC],
  },
  acido_azelaico: {
    name: 'Ácido azelaico',
    purpose: 'Ativo cosmético usado para uniformidade do tom e pele com tendência a espinhas.',
    benefits: 'Pode ajudar na aparência de manchas e na oleosidade com espinhas, com boa tolerância para muitas pessoas.',
    fit: 'À noite (ou conforme o rótulo), em camada fina sobre a pele limpa e seca.',
    cautions: 'Pode causar formigamento ou ardência nos primeiros usos. Concentrações mais altas são de uso sob orientação profissional.',
    professional: 'Em gestação/amamentação, rosácea, melasma ou acne inflamatória: use somente com orientação profissional.',
    sources: [SOURCES.azelaic],
  },
  acido_salicilico: {
    name: 'Ácido salicílico',
    purpose: 'Beta-hidroxiácido que atua na oleosidade e no interior dos poros.',
    benefits: 'Pode ajudar na aparência de cravos, poros obstruídos e textura em peles oleosas.',
    fit: 'Em sabonete ou tônico/sérum à noite, poucas vezes por semana no início.',
    cautions: 'Pode ressecar e irritar; não combine com outros esfoliantes ou retinoides no início. Evite em áreas irritadas.',
    professional: 'Em gestação/amamentação, alergia a salicilatos/aspirina, acne inflamatória ou uso de medicamentos para acne.',
    sources: [SOURCES.salicylic, SOURCES.acneGuideline],
  },
  retinoide: {
    name: 'Retinoide cosmético (ex.: retinol)',
    purpose: 'Derivado da vitamina A usado em cosméticos para textura e sinais do envelhecimento.',
    benefits: 'Pode melhorar a aparência de textura e linhas finas com uso contínuo; os efeitos variam entre pessoas.',
    fit: 'Somente à noite, em pequena quantidade, 2 a 3 vezes por semana no início, sempre com fotoproteção diária.',
    cautions: 'Pode causar ressecamento, vermelhidão e descamação no início. Não usar junto com outros esfoliantes no começo.',
    professional: 'Não usar em gestação, amamentação ou tentativa de engravidar sem orientação. Converse com um profissional se usa tratamentos prescritos ou tem pele sensível.',
    sources: [SOURCES.retinoids],
  },
  filtro_solar: {
    name: 'Protetor solar de amplo espectro',
    purpose: 'Proteção contra a radiação UVA e UVB.',
    benefits: 'O uso diário é uma das medidas com melhor evidência para prevenir manchas e sinais do fotoenvelhecimento.',
    fit: 'Última etapa da manhã, com reaplicação conforme exposição e instruções do produto.',
    cautions: 'Escolha textura compatível com sua pele; se houver reações, prefira fórmulas sem fragrância.',
    professional: 'Se surgirem reações ao protetor, manchas que mudam ou lesões novas.',
    sources: [SOURCES.sunscreen],
  },
};
