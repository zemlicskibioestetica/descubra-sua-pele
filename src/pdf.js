import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';

const C = { ink: '#3b342e', soft: '#7a6e64', gold: '#a8864f', green: '#5f7a5f', line: '#e6dccf', bg: '#f7f2ea' };

function findLogo(publicDir) {
  for (const f of ['logo.png', 'logo.jpg', 'logo.jpeg']) {
    const p = path.join(publicDir, 'img', f);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Remove caracteres fora do conjunto WinAnsi suportado pelas fontes padrão do PDF
const t = (s) => String(s ?? '').replace(/[→]/g, '->').replace(/[—–]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x00-\xFF€•…]/g, '');

export function renderResultPdf(res, { name, generatedAt, publicDir, explanation }) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 56, left: 56, right: 56 }, info: { Title: 'Seu perfil de pele — Descubra Sua Pele', Author: 'Dra. Fernanda Zemlicski — Biomédica Esteta, CRBM 40187' } });
  const W = doc.page.width - 112;

  const logo = findLogo(publicDir);
  if (logo) { try { doc.image(logo, 56, 40, { fit: [110, 60] }); } catch { /* imagem inválida */ } }
  doc.fillColor(C.gold).font('Helvetica').fontSize(9).text('DESCUBRA SUA PELE', 56, 48, { align: 'right', width: W, characterSpacing: 2 });
  doc.fillColor(C.soft).fontSize(8).text('Dra. Fernanda Zemlicski - Biomédica Esteta - CRBM 40187 - @drafernandabiomedica', { align: 'right', width: W });
  doc.moveDown(3);

  doc.fillColor(C.ink).font('Times-Bold').fontSize(24).text('SEU PERFIL DE PELE', 56, doc.y, { width: W });
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(10).fillColor(C.soft).text(t(`${name}  -  gerado em ${generatedAt}`));
  doc.moveDown(1);

  // Destaque do tipo
  const boxY = doc.y;
  doc.roundedRect(56, boxY, W, 62, 8).fill(C.bg);
  doc.fillColor(C.gold).font('Helvetica').fontSize(9).text('SEU TIPO DE PELE', 72, boxY + 12, { characterSpacing: 1 });
  doc.fillColor(C.ink).font('Times-Bold').fontSize(18).text(t(res.skinTypeLabel), 72, boxY + 26);
  if (res.assessments?.dehydration) doc.font('Helvetica').fontSize(9).fillColor(C.green).text('Com sinais de desidratação', 72, boxY + 12, { width: W - 32, align: 'right' });
  doc.y = boxY + 76;

  const h2 = (s) => {
    if (doc.y > doc.page.height - 140) doc.addPage();
    doc.moveDown(0.6).fillColor(C.gold).font('Helvetica-Bold').fontSize(10).text(t(s.toUpperCase()), 56, doc.y, { characterSpacing: 1, width: W });
    doc.moveTo(56, doc.y + 3).lineTo(56 + W, doc.y + 3).strokeColor(C.line).lineWidth(0.7).stroke();
    doc.moveDown(0.6);
  };
  const p = (s, opts = {}) => doc.fillColor(opts.color || C.ink).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size || 10).text(t(s), 56 + (opts.indent || 0), doc.y, { width: W - (opts.indent || 0), lineGap: 2 });
  const list = (arr) => arr.forEach((s) => { p(`•  ${s}`, { indent: 6 }); doc.moveDown(0.2); });

  const pairs = (arr) => arr.forEach((n) => {
    if (typeof n === 'string') { p(`•  ${n}`, { indent: 6 }); doc.moveDown(0.2); return; }
    if (doc.y > doc.page.height - 110) doc.addPage();
    p(n.problem || n.title, { bold: true });
    p(n.solution || n.text, { color: C.soft, indent: 0 });
    doc.moveDown(0.4);
  });

  h2('Resultado');
  p(explanation);

  h2('O que sua pele precisa e como cuidar');
  pairs(res.needs);
  h2('Dicas para o seu dia a dia');
  list(res.factors);

  const routine = (title, steps) => {
    h2(title);
    steps.forEach((s, i) => {
      if (doc.y > doc.page.height - 160) doc.addPage();
      p(`Etapa ${i + 1} - ${s.title}`, { bold: true, size: 11 });
      doc.moveDown(0.15);
      p(`O que fazer: ${s.what}`);
      p(`Finalidade: ${s.purpose}`);
      p(`O que procurar: ${s.lookFor}`);
      if (s.actives?.length) p(`Ativos que podem ser considerados: ${s.actives.join(', ')}`);
      p(`Cuidados: ${s.cautions}`, { color: C.soft });
      doc.moveDown(0.5);
    });
  };
  routine('Rotina da manhã', res.morning);
  routine('Rotina da noite', res.night);

  if (res.rejuvenation) {
    h2(`Cuidados para rejuvenescer a pele (foco em ${res.rejuvenation.stage})`);
    p(res.rejuvenation.intro);
    doc.moveDown(0.4);
    pairs(res.rejuvenation.items);
    p(`Introduza um ativo novo de cada vez. ${res.rejuvenation.professional}`, { color: C.soft, size: 9 });
  }

  h2('Ativos que podem fazer sentido para sua pele');
  res.actives.forEach((a) => {
    if (doc.y > doc.page.height - 170) doc.addPage();
    p(a.name, { bold: true, size: 11 });
    doc.moveDown(0.15);
    p(`Finalidade: ${a.purpose}`);
    p(`Por que foi selecionado: ${a.why}`);
    p(`Benefícios esperados: ${a.benefits}`);
    p(`Na rotina: ${a.fit}`);
    p(`Cuidados e limitações: ${a.cautions}`);
    p(`Quando buscar orientação profissional: ${a.professional}`);
    a.sources?.forEach((s) => p(`Fonte: ${s.citation}`, { color: C.soft, size: 8 }));
    doc.moveDown(0.5);
  });

  h2('Cuidados que exigem cautela');
  list(res.cautions);
  h2('Quando procurar avaliação profissional');
  list(res.referral);

  doc.moveDown(1);
  p('Este resultado é uma orientação cosmética educativa baseada nas respostas fornecidas. Não é diagnóstico dermatológico, médico ou laboratorial, não substitui consulta e não garante resultados. Interrompa o uso de qualquer produto diante de reações e procure um profissional de saúde.', { color: C.soft, size: 8.5 });

  doc.end();
  return doc;
}
