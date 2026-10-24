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
  peptides: src(
    'Gorouhi F, Maibach HI. Role of topical peptides in preventing or treating aged skin. Int J Cosmet Sci. 2009;31(5):327-345.',
    'Role of topical peptides in preventing or treating aged skin'),
  dmae: src(
    'Grossman R. The role of dimethylaminoethanol in cosmetic dermatology. Am J Clin Dermatol. 2005;6(1):39-47.',
    'The role of dimethylaminoethanol in cosmetic dermatology'),
  hydroxyAcids: src(
    'Kornhauser A, Coelho SG, Hearing VJ. Applications of hydroxy acids: classification, mechanisms, and photoactivity. Clin Cosmet Investig Dermatol. 2010;3:135-142.',
    'Applications of hydroxy acids: classification, mechanisms, and photoactivity'),
  tranexamic: src(
    'Kim SJ, Park JY, Shibata T, Fujiwara R, Kang HY. Efficacy and possible mechanisms of topical tranexamic acid in melasma. Clin Exp Dermatol. 2016;41(5):480-485.',
    'Efficacy and possible mechanisms of topical tranexamic acid in melasma'),
  kojic: src(
    'Saeedi M, Eslamifar M, Khezri K. Kojic acid applications in cosmetic and pharmaceutical preparations. Biomed Pharmacother. 2019;110:582-593.',
    'Kojic acid applications in cosmetic and pharmaceutical preparations'),
  thiamidol: src(
    'Arrowitz C, et al. Effective Tyrosinase Inhibition by Thiamidol Results in Significant Improvement of Mild to Moderate Melasma. J Invest Dermatol. 2019;139(8):1691-1698.',
    'Effective Tyrosinase Inhibition by Thiamidol Results in Significant Improvement of Mild to Moderate Melasma'),
  cysteamine: src(
    'Mansouri P, et al. Evaluation of the efficacy of cysteamine 5% cream in the treatment of epidermal melasma: a randomized double-blind placebo-controlled trial. Br J Dermatol. 2015;173(1):209-217.',
    'Evaluation of the efficacy of cysteamine 5% cream in the treatment of epidermal melasma'),
  centella: src(
    'Su Z, et al. The Effectiveness and Safety of a Skin Care Product With Centella asiatica Leaf Extract, Ceramide NP, and Panthenol in Subjects With Sensitive Skin. J Cosmet Dermatol. 2025;24(7):e70324.',
    'Centella asiatica Leaf Extract, Ceramide NP, and Panthenol in Subjects With Sensitive Skin'),
  bakuchiol: src(
    'Dhaliwal S, et al. Prospective, randomized, double-blind assessment of topical bakuchiol and retinol for facial photoageing. Br J Dermatol. 2019;180(2):289-296.',
    'Prospective, randomized, double-blind assessment of topical bakuchiol and retinol for facial photoageing'),
  pdrn: src(
    'Squadrito F, et al. Pharmacological Activity and Clinical Use of PDRN. Front Pharmacol. 2017;8:224.',
    'Pharmacological Activity and Clinical Use of PDRN'),
  acneGuideline: src(
    'Zaenglein AL, et al. Guidelines of care for the management of acne vulgaris. J Am Acad Dermatol. 2016;74(5):945-973.',
    'Guidelines of care for the management of acne vulgaris'),
};

export const ACTIVES = {
  peptideos: {
    name: 'Peptídeos (ex.: Matrixyl®, Argireline®)',
    purpose: 'Sinalizadores cosméticos usados em séruns e cremes antienvelhecimento.',
    benefits: 'Podem contribuir para a aparência de firmeza e para suavizar linhas finas, com boa tolerância.',
    fit: 'Sérum ou creme, manhã ou noite; combinam bem com ácido hialurônico e podem ser usados em noites sem retinol.',
    cautions: 'Os resultados variam entre fórmulas e pessoas e aparecem com uso contínuo.',
    professional: 'Para linhas mais marcadas ou flacidez, a avaliação individual indica o que mais pode ajudar.',
    sources: [SOURCES.peptides],
  },
  dmae: {
    name: 'DMAE',
    purpose: 'Ativo usado em cosméticos "efeito firmador".',
    benefits: 'Pode proporcionar sensação e aparência de pele mais firme; o efeito costuma ser discreto e depende do uso contínuo.',
    fit: 'Sérum ou creme firmador, normalmente pela manhã, antes do protetor solar.',
    cautions: 'Pode causar leve formigamento. Faça teste em pequena área antes do primeiro uso.',
    professional: 'Em gestação ou amamentação, use somente com orientação profissional.',
    sources: [SOURCES.dmae],
  },
  acido_glicolico: {
    name: 'Ácido glicólico',
    purpose: 'Alfa-hidroxiácido de esfoliação química suave.',
    benefits: 'Pode deixar a textura mais uniforme e a pele mais luminosa.',
    fit: 'À noite, 1 a 3 vezes por semana no início, em tônico ou sérum de concentração cosmética.',
    cautions: 'Aumenta a sensibilidade ao sol: protetor solar diário é obrigatório. Não use na mesma noite que o retinol.',
    professional: 'Peles sensíveis, com rosácea ou após procedimentos devem usar somente com orientação.',
    sources: [SOURCES.hydroxyAcids],
  },
  clareadores: {
    name: 'Clareadores (tiamidol, ácido tranexâmico, cisteamina, alfa-arbutin, ácido kójico)',
    purpose: 'Ativos cosméticos de última geração para uniformizar o tom e suavizar manchas.',
    benefits: 'Podem suavizar a aparência de manchas e melasma leve com uso contínuo, sempre junto com o protetor solar.',
    fit: 'Sérum ou creme à noite (o tiamidol e o tranexâmico também podem ser usados de manhã). A cisteamina é aplicada por poucos minutos e depois enxaguada, conforme o rótulo.',
    cautions: 'Os resultados levam de 8 a 12 semanas. A cisteamina tem cheiro forte e pode arder no início. Sem protetor solar diário, as manchas voltam.',
    professional: 'Melasma e manchas que mudam de cor ou tamanho precisam de avaliação profissional.',
    sources: [SOURCES.thiamidol, SOURCES.tranexamic, SOURCES.cysteamine, SOURCES.kojic],
  },
  centella: {
    name: 'Centella asiática (cica)',
    purpose: 'Extrato calmante muito usado em cremes para pele sensível e irritada.',
    benefits: 'Pode reduzir a vermelhidão e o desconforto e ajudar na recuperação da barreira da pele.',
    fit: 'Em sérum ou creme, manhã e noite; costuma vir combinada com pantenol (B5).',
    cautions: 'Apesar de calmante, algumas pessoas têm alergia: faça teste em pequena área.',
    professional: 'Vermelhidão persistente pode ser rosácea e merece avaliação.',
    sources: [SOURCES.centella],
  },
  bakuchiol: {
    name: 'Bakuchiol',
    purpose: 'Ativo vegetal usado como alternativa mais suave ao retinol.',
    benefits: 'Em estudo comparativo, melhorou rugas e manchas de forma semelhante ao retinol, com menos ressecamento e ardência.',
    fit: 'Sérum à noite (ou manhã e noite), boa opção para pele sensível que não tolera retinol.',
    cautions: 'Não há dados suficientes de segurança na gestação: nesse caso, não use sem orientação.',
    professional: 'Para linhas mais marcadas, a avaliação individual indica o que mais pode ajudar.',
    sources: [SOURCES.bakuchiol],
  },
  pdrn: {
    name: 'PDRN ("DNA de salmão")',
    purpose: 'Tendência da cosmética coreana em séruns de recuperação e viço.',
    benefits: 'É associado à regeneração e ao viço da pele; os estudos em cosméticos de uso em casa ainda são limitados.',
    fit: 'Sérum à noite ou em noites alternadas com o retinol, como complemento.',
    cautions: 'Use como complemento, não como substituto do retinol e do protetor solar.',
    professional: 'Na forma injetável, o PDRN é um procedimento profissional e precisa de avaliação.',
    sources: [SOURCES.pdrn],
  },
  pantenol: {
    name: 'Pantenol (vitamina B5)',
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
    name: 'Retinol (retinoide cosmético)',
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
