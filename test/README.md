# Descubra Sua Pele — Dra. Fernanda Zemlicski

Sistema web de análise cosmética educativa: página inicial para TikTok/Instagram, cadastro com consentimentos LGPD, questionário de saúde e de pele (uma pergunta por tela), resultado personalizado com rotina manhã/noite e ativos, PDF, compartilhamento seguro, notificação ao WhatsApp Business da proprietária e painel administrativo privado.

## Estrutura

| Parte | Arquivos |
|---|---|
| Servidor (Node.js + Express) | `src/server.js` (rotas públicas), `src/admin.js` (painel) |
| Banco de dados (Turso, compatível com SQLite; arquivo local em desenvolvimento) | `src/db.js` — participantes, respostas, resultados, relatórios, consentimentos, eventos de origem/funil, notificações, erros, solicitações LGPD, usuários, auditoria, configurações |
| Motor de análise | `src/engine.js` (regras determinísticas), `src/actives.js` (ativos + fontes verificáveis), `src/questions.js` |
| IA (opcional) | `src/ai.js` — Claude reescreve a explicação em linguagem simples, recebendo só fatos já decididos e sem dados pessoais/saúde |
| WhatsApp Business | `src/whatsapp.js` — Cloud API oficial da Meta, fila, reenvio, duplicidade, webhook de status |
| PDF | `src/pdf.js` |
| Telas | `public/index.html` + `app.js` (início e questionário), `result.html` + `result.js`, `admin.html` + `admin.js` |

## Logo

Coloque o arquivo do logo em `public/img/` com o nome **`logo.png`** (ou `logo.jpg`, `logo.webp`, `logo.svg`). Ele aparece na página inicial, no resultado, no painel e no PDF (o PDF aceita PNG/JPG). Sem o arquivo, aparece o monograma “FZ”.

## Rodar no computador

1. Instale o Node.js 20 ou superior (https://nodejs.org).
2. Nesta pasta:
   ```
   npm install
   npm test
   npm run create-admin -- seu@email.com "SuaSenhaForte123" "Dra. Fernanda Zemlicski"
   npm start
   ```
3. Abra http://localhost:3000 (site) e http://localhost:3000/admin (painel).

## Publicar (endereço público permanente)

O endereço só existe depois da publicação. Configuração gratuita (arquivo `render.yaml`):

- **Render (plano Free)** roda o site: New → Blueprint → este repositório.
- **Turso (plano gratuito)** guarda os dados: crie um banco e informe `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` no Render.
- **UptimeRobot (gratuito)**: monitore `https://SEU-SITE/saude` a cada 5 minutos para o site não "dormir".
- Variáveis pedidas pelo Render: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `DATA_ENCRYPTION_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (veja `.env.example`).
- Depois de publicar, entre em **Painel → Configurações** e informe o “Endereço público do site”. A aba **Divulgação** passa a mostrar os links com rastreamento de origem (`?utm_source=tiktok`, `instagram`, `whatsapp`, `indicacao`).
- Guarde a `DATA_ENCRYPTION_KEY` em local seguro: sem ela, os dados criptografados não podem ser lidos.

## O que falta configurar (serviços externos)

| Integração | Situação sem configurar | O que é necessário |
|---|---|---|
| WhatsApp Business (obrigatória) | Conclusões ficam registradas como “não configurada” no painel; nada é dado como enviado | Conta Meta Business, app com produto WhatsApp, número empresarial, token permanente, Phone Number ID e **modelo de mensagem aprovado** (texto pronto em Configurações). Ao salvar, as pendências são enviadas. |
| Webhook de status | Status fica em “enviada” (aceita pela API) | App Secret + token de verificação; cadastrar a URL `/webhooks/whatsapp` na Meta |
| Resultado por WhatsApp ao participante | Botão não aparece | Modelo aprovado com 2 variáveis (nome, link) |
| IA para explicações | Usa a explicação gerada pelas regras | Chave da API Claude (Anthropic) em Configurações |
| TikTok | Não há envio automático de DM | A plataforma não oferece, em geral, API pública para mensagem automática a novos seguidores; use os links de divulgação |

## Segurança e LGPD (resumo)

- Consentimentos separados e não pré-marcados; versão do aviso, data/hora e texto gravados.
- Dados de saúde e resultado criptografados (AES-256-GCM); só a proprietária vê, com motivo registrado na auditoria. Equipe não vê saúde nem configurações.
- Notificação do WhatsApp com dados mínimos, uma única vez por conclusão (chave de duplicidade), reenvio automático em falhas temporárias.
- Links de resultado privados e não indexados; compartilhamento mostra apenas o tipo de pele.
- Retenção automática configurável (padrão 730 dias) e exclusão definitiva pelo painel.
- Menores de 12 bloqueados; 12–17 com autorização do responsável e apenas cuidados básicos.
- Revise o Aviso de Privacidade (`src/pages.js`) com sua assessoria jurídica antes de publicar.
