// Textos dos consentimentos (LGPD). Uma finalidade por item. O texto exato
// exibido é gravado junto com a versão do aviso, data e horário.

export const CONSENTS = {
  participacao: {
    required: true,
    text: 'Li o Aviso de Privacidade e autorizo o uso dos meus dados de cadastro (nome, país, região, celular, data de nascimento, sexo e objetivo) para gerar minha análise cosmética, registrar minha participação e notificar a Dra. Fernanda Zemlicski de que concluí o questionário (somente nome, país, celular, região, tipo de pele estimado, objetivo e origem do acesso).',
  },
  dados_saude: {
    required: true,
    text: 'Autorizo, de forma específica e destacada, o tratamento das minhas respostas sobre saúde da pele (condições, alergias, medicamentos, gestação, reações e procedimentos) exclusivamente para aplicar precauções de segurança e personalizar as orientações. Essas informações não são enviadas por WhatsApp nem compartilhadas com terceiros.',
  },
  whatsapp_publicidade: {
    required: false,
    text: 'Opcional: aceito receber mensagens da Dra. Fernanda Zemlicski pelo WhatsApp com conteúdos, novidades e ofertas de serviços. Posso cancelar a qualquer momento.',
  },
  responsavel_legal: {
    required: false, // obrigatório apenas para menores de 18 anos
    text: 'Declaro que sou mãe, pai ou responsável legal pelo(a) participante menor de 18 anos, que estou acompanhando o preenchimento e que autorizo o tratamento dos dados acima para as finalidades descritas.',
  },
  envio_relatorio_whatsapp: {
    required: false,
    text: 'Autorizo o envio do link do meu resultado para o meu número de WhatsApp informado no cadastro.',
  },
  contato_avaliacao: {
    required: false,
    text: 'Autorizo a equipe da Dra. Fernanda Zemlicski a entrar em contato pelo meu WhatsApp para enviar informações sobre uma avaliação estética individualizada.',
  },
};

export const CONSENT_LABELS = {
  participacao: 'Participação',
  dados_saude: 'Dados de saúde',
  whatsapp_publicidade: 'Publicidade WhatsApp',
  responsavel_legal: 'Responsável legal',
  envio_relatorio_whatsapp: 'Resultado por WhatsApp',
  contato_avaliacao: 'Contato p/ avaliação',
};
