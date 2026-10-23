import { getSetting } from './db.js';
import { escapeHtml as e } from './util.js';
import { SKIN_TYPE_LABELS } from './engine.js';

const shell = (title, body, extraHead = '') => `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">${extraHead}
</head><body>
<header class="topbar"><a href="/" class="brand"><img src="/logo" alt="Logo Dra. Fernanda Zemlicski" class="brand-logo" data-fallback><span class="brand-text">Dra. Fernanda Zemlicski</span></a></header>
<main class="page">${body}</main>
<footer class="foot">Dra. Fernanda Zemlicski — Biomédica Esteta · CRBM 40187 · @drafernandabiomedica<br><a href="/privacidade">Aviso de Privacidade</a></footer>
<script src="/common.js"></script>
</body></html>`;

export function renderPrivacyPage() {
  const email = getSetting('privacy_contact_email');
  const waNum = getSetting('privacy_contact_whatsapp');
  const days = Number(getSetting('retention_days')) || 730;
  const version = getSetting('policy_version');
  const contact = [email && `e-mail <strong>${e(email)}</strong>`, waNum && `WhatsApp <strong>${e(waNum)}</strong>`].filter(Boolean).join(' ou ')
    || 'o formulário abaixo';
  const aiOn = Boolean(getSetting('anthropic_api_key'));
  return shell('Aviso de Privacidade — Descubra Sua Pele', `
<article class="card prose">
<p class="eyebrow">Versão ${e(version)}</p>
<h1>Aviso de Privacidade</h1>
<h2>Quem é responsável</h2>
<p>A controladora dos dados é <strong>Fernanda Zemlicski</strong>, Biomédica Esteta (CRBM 40187), responsável pelo sistema “Descubra Sua Pele”. Contato para assuntos de privacidade: ${contact}.</p>
<h2>Quais dados coletamos e por quê</h2>
<ul>
<li><strong>Cadastro</strong> (nome, país, celular, cidade e região, data de nascimento, sexo e objetivo): identificar sua participação, gerar seu resultado e avisar a Dra. Fernanda de que você concluiu o questionário.</li>
<li><strong>Respostas sobre a pele</strong>: estimar seu tipo de pele e montar a rotina.</li>
<li><strong>Respostas sobre saúde</strong> (dados pessoais sensíveis): somente para aplicar precauções de segurança e evitar recomendações inadequadas.</li>
<li><strong>Origem do acesso</strong> (ex.: TikTok, Instagram) e estatísticas anônimas de uso das telas, sem cookies de rastreamento nem identificação pessoal, para entender quais canais funcionam melhor.</li>
</ul>
<p>Não pedimos CPF nem endereço completo. Não vendemos dados e não os usamos para finalidades não informadas.</p>
<h2>Como os dados são usados</h2>
<p>Seus dados geram um resultado educativo que fica disponível em um link privado. A Dra. Fernanda recebe pelo WhatsApp Business apenas uma notificação com nome, país, celular, região, data, tipo de pele estimado, objetivo e origem — <strong>nunca</strong> respostas de saúde. Mensagens publicitárias pelo WhatsApp só são enviadas se você autorizar, em consentimento separado e opcional.</p>
${aiOn ? '<p>Para escrever a explicação do resultado em linguagem simples, um resumo <strong>sem seu nome, telefone, localização ou respostas de saúde</strong> é processado pela API de inteligência artificial Claude (Anthropic), contratada como operadora.</p>' : ''}
<h2>Como protegemos as informações de saúde</h2>
<p>Os dados ficam em servidor de hospedagem contratado, que pode estar localizado fora do Brasil, com conexão protegida (HTTPS). As respostas de saúde e o resultado são armazenados criptografados. O acesso ao painel exige login e senha, é restrito à proprietária e a pessoas autorizadas, e cada consulta a dados de saúde fica registrada. Esses dados não são enviados por WhatsApp nem compartilhados com terceiros.</p>
<h2>Por quanto tempo guardamos</h2>
<p>Os dados identificáveis são mantidos por até <strong>${days} dias</strong> após o cadastro e depois excluídos automaticamente, salvo obrigação legal. Estatísticas anônimas podem ser mantidas.</p>
<h2>Seus direitos</h2>
<p>Você pode pedir confirmação e acesso aos dados, correção, exclusão, informação sobre compartilhamento e revogar consentimentos a qualquer momento, sem prejuízo do que já foi feito com base no consentimento anterior. Use ${contact} ou o formulário abaixo.</p>
<h2>Menores de idade</h2>
<p>O questionário não está disponível para menores de 12 anos. Adolescentes de 12 a 17 anos só participam com autorização e acompanhamento de responsável legal, e recebem apenas orientações básicas (limpeza suave, hidratação e fotoproteção).</p>
<h2>Natureza do resultado</h2>
<p>O resultado é uma orientação cosmética educativa. Não é diagnóstico dermatológico, médico ou laboratorial e não substitui uma consulta.</p>
</article>
<section class="card" id="solicitacao">
<h2>Fazer uma solicitação</h2>
<form id="privacy-form" class="form" novalidate>
<label class="field"><span>Tipo de solicitação</span>
<select name="type" required><option value="">Selecione</option><option value="acesso">Acesso aos meus dados</option><option value="correcao">Correção</option><option value="exclusao">Exclusão</option><option value="revogacao">Revogar consentimento</option></select></label>
<label class="field"><span>Nome completo</span><input name="name" required autocomplete="name" maxlength="120"></label>
<label class="field"><span>País do celular</span><select name="country" data-countries required></select></label>
<label class="field"><span>Celular cadastrado (com DDD)</span><input name="phone" required inputmode="tel" autocomplete="tel-national" maxlength="20"></label>
<label class="field"><span>Detalhes (opcional)</span><textarea name="message" maxlength="1000" rows="3"></textarea></label>
<p class="form-msg" role="status" aria-live="polite"></p>
<button class="btn btn-primary" type="submit">Enviar solicitação</button>
</form>
</section>
<script src="/privacy.js"></script>`);
}

const TYPE_TEXT = {
  normal: 'Pele normal tende a ser equilibrada: nem muito oleosa, nem ressecada. O foco costuma ser manutenção, hidratação leve e fotoproteção diária.',
  seca: 'Pele seca tende a repuxar e precisar de mais conforto. Limpeza suave, hidratantes que apoiam a barreira e fotoproteção são a base.',
  oleosa: 'Pele oleosa produz mais sebo e pode ter poros aparentes. Limpeza suave, hidratação leve e fotoproteção de toque seco costumam ajudar — e ela também pode ficar desidratada.',
  mista: 'Pele mista costuma ter oleosidade na zona T (testa, nariz e queixo) e bochechas normais ou secas. A rotina equilibra controle de brilho e conforto.',
  indeterminado: 'Nem sempre é possível estimar o tipo de pele por questionário. Nesses casos, uma rotina simples — limpeza suave, hidratação e fotoproteção — é o melhor ponto de partida.',
};

export function renderSharePage(type) {
  if (!type) return shell('Resultado não encontrado', `<section class="card center"><h1>Link indisponível</h1><p>Este resultado compartilhado não existe mais.</p><a class="btn btn-primary" href="/?utm_source=compartilhamento">QUERO DESCOBRIR MINHA PELE</a></section>`);
  return shell('Descubra Sua Pele — resultado compartilhado', `
<section class="card center share">
<p class="eyebrow">Resultado compartilhado</p>
<h1>Meu perfil de pele: ${e(SKIN_TYPE_LABELS[type])}</h1>
<p>${e(TYPE_TEXT[type])}</p>
<p class="muted small">Orientação cosmética educativa, baseada em questionário. Não é diagnóstico. Dados pessoais e respostas de saúde não são exibidos nesta página.</p>
<a class="btn btn-primary" href="/?utm_source=compartilhamento">QUERO DESCOBRIR MINHA PELE</a>
</section>`, '<meta name="robots" content="noindex">');
}
