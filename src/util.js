import { parsePhoneNumberFromString, getCountries, getCountryCallingCode } from 'libphonenumber-js/max';

const regionNames = new Intl.DisplayNames(['pt-BR'], { type: 'region' });
export const countryName = (iso) => { try { return regionNames.of(iso) || iso; } catch { return iso; } };

export function countryList() {
  return getCountries()
    .map((iso) => ({ iso, code: getCountryCallingCode(iso), name: countryName(iso) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function validatePhone(countryIso, areaCode, number) {
  if (!getCountries().includes(countryIso)) return { error: 'Selecione um país válido.' };
  const national = `${areaCode || ''}${number || ''}`.replace(/\D/g, '');
  if (national.length < 4) return { error: 'Informe o número de celular.' };
  const p = parsePhoneNumberFromString(national, countryIso);
  if (!p || !p.isValid()) return { error: 'Número de celular inválido para o país selecionado. Confira o DDD/código de área e o número.' };
  const type = p.getType();
  if (type && !['MOBILE', 'FIXED_LINE_OR_MOBILE'].includes(type)) return { error: 'Informe um número de celular (não fixo).' };
  return { e164: p.number, callingCode: p.countryCallingCode, formatted: p.formatInternational() };
}

export function ageFrom(birthDate, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate || '');
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (Number.isNaN(d.getTime()) || d.getUTCDate() !== +m[3] || d > now || +m[1] < 1900) return null;
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const md = now.getUTCMonth() - d.getUTCMonth();
  if (md < 0 || (md === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

const DISPLAY_TZ = process.env.DISPLAY_TIMEZONE || 'America/Sao_Paulo';
// Modificador do SQLite para converter UTC no fuso de exibição (ex.: '-180 minutes'), usado ao agrupar por dia
export function tzModifier(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: DISPLAY_TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(now).map((p) => [p.type, p.value]));
  const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  const diff = Math.round((local - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes())) / 60000);
  return `${diff >= 0 ? '+' : ''}${diff} minutes`;
}
export const todayLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: DISPLAY_TZ }).format(new Date());

// SQLite grava em UTC "YYYY-MM-DD HH:MM:SS"
export function fmtDateTime(sqlite) {
  if (!sqlite) return '';
  const d = new Date(`${sqlite.replace(' ', 'T')}Z`);
  return new Intl.DateTimeFormat('pt-BR', { timeZone: DISPLAY_TZ, dateStyle: 'short', timeStyle: 'short' }).format(d);
}

export const SOURCES = {
  tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp', indicacao: 'Indicação', compartilhamento: 'Resultado compartilhado', direto: 'Acesso direto', outro: 'Outro',
};
export function normalizeSource(s) {
  const v = String(s || '').toLowerCase().trim();
  if (!v) return 'direto';
  if (v.includes('tiktok') || v === 'tt') return 'tiktok';
  if (v.includes('insta') || v === 'ig') return 'instagram';
  if (v.includes('face') || v === 'fb' || v.includes('messenger')) return 'facebook';
  if (v.includes('whats') || v === 'wa') return 'whatsapp';
  if (v.includes('indica') || v === 'ref' || v === 'referral') return 'indicacao';
  if (v.includes('compart') || v === 'share') return 'compartilhamento';
  if (v === 'direto' || v === 'direct') return 'direto';
  return 'outro';
}

export const cleanText = (s, max = 120) => (typeof s === 'string' ? s.replace(/[\u0000-\u001F\u007F<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
