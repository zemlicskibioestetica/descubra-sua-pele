// Explicação em linguagem simples gerada por IA (Claude), opcional.
// A IA recebe SOMENTE os fatos já decididos pelo motor determinístico, sem nome,
// telefone, região ou respostas de saúde, e não pode alterar classificação nem ativos.
// Se não estiver configurada ou falhar, usa-se a explicação determinística.
import Anthropic from '@anthropic-ai/sdk';
import { getSetting, logError } from './db.js';
import { factsForAI } from './engine.js';

const SYSTEM = `Você escreve explicações curtas, acolhedoras e educativas, em português do Brasil, para o resultado de um questionário cosmético da Dra. Fernanda Zemlicski (Biomédica Esteta).
Regras obrigatórias:
- Use exclusivamente os fatos fornecidos em JSON. Não acrescente respostas, sintomas, ativos, produtos, porcentagens, estudos ou referências que não estejam nos fatos.
- Não altere o tipo de pele, o nível de confiança nem a lista de ativos.
- Informe apenas a conclusão (o perfil de pele mais provável e, se houver, sinais de desidratação). NÃO cite nem repita as respostas da pessoa e não explique como a classificação foi feita.
- Não prometa resultados, não fale em cura e não recomende medicamentos ou procedimentos.
- Se houver sinal de alerta, acrescente uma frase recomendando avaliação profissional.
- Se o perfil for indeterminado, diga que não foi possível determinar com segurança.
- Escreva no máximo 2 frases curtas, em segunda pessoa, sem títulos, listas ou markdown.`;

export function aiConfigured() {
  return Boolean(getSetting('anthropic_api_key'));
}

export async function explainWithAI(result, firstName) {
  const apiKey = getSetting('anthropic_api_key');
  if (!apiKey) return { status: 'nao_configurada', text: null };
  try {
    const client = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 });
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 2000,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `Fatos do resultado (JSON):\n${JSON.stringify(factsForAI(result), null, 2)}\n\nEscreva a explicação. Não use o nome da pessoa.`,
      }],
    });
    if (response.stop_reason === 'refusal') return { status: 'recusada', text: null };
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    // Salvaguardas simples: texto vazio, longo demais ou mencionando outro tipo de pele → descarta
    const otherTypes = ['pele normal', 'pele seca', 'pele oleosa', 'pele mista'].filter((t) => t !== result.skinTypeLabel.toLowerCase());
    const mentionsOther = result.skinType !== 'indeterminado' && otherTypes.some((t) => text.toLowerCase().includes(`você tem ${t}`));
    if (!text || text.length > 400 || mentionsOther) return { status: 'descartada', text: null };
    return { status: 'gerada', text: `${firstName}, ${text.charAt(0).toLowerCase()}${text.slice(1)}` };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) logError('ia', 'Chave da API Claude inválida.');
    else if (e instanceof Anthropic.RateLimitError) logError('ia', 'Limite de uso da API Claude atingido.');
    else if (e instanceof Anthropic.APIError) logError('ia', `Erro da API Claude ${e.status}: ${e.message}`);
    else logError('ia', `Falha ao gerar explicação: ${e.message}`);
    return { status: 'erro', text: null };
  }
}
