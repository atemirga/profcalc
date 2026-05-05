// server/pdf.js — generate PDF КП document with Cyrillic support (DejaVu Sans)
import PDFDocument from 'pdfkit';
import path from 'node:path';
import fs from 'node:fs';
import db from './db.js';
import { calcProject } from './calc.js';

const FONT_REG = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const FONT_MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf';

const ACCENT = '#b56b3a';
const ACCENT_DARK = '#8a4d24';
const TEXT = '#1f1d1a';
const MUTED = '#7a756c';
const RULE = '#e9e3d5';

function rub(n) {
  return Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ').replace(/ /g, ' ') + ' ₸';
}
function num(n) {
  return Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ').replace(/ /g, ' ');
}

// Render the small SVG-like window schematic directly to PDF using vector primitives
function drawWindowSchema(doc, x, y, w, h, layout) {
  const totalW = layout.width || 1000;
  const totalH = layout.height || 1000;
  const padR = 6, padB = 6, padT = 4, padL = 6;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const frameT = 4;
  const impostT = 2;

  // outer frame
  doc.save();
  doc.fillColor('#3a3a3a').rect(x + padL, y + padT, innerW, innerH).fill();

  // normalize ratios per row + cols (mm-aware)
  function normalize(arr, total, key) {
    const fixedSum = arr.reduce((s, x) => s + (x[key] || 0), 0);
    const ratioItems = arr.filter(x => !x[key]);
    const remaining = Math.max(0, total - fixedSum);
    const ratioSum = ratioItems.reduce((s, x) => s + (x.ratio ?? 1), 0) || 1;
    return arr.map(x => {
      if (x[key]) return x[key] / total;
      return (remaining * (x.ratio ?? 1) / ratioSum) / total;
    });
  }

  const rowRatios = normalize(layout.rows, totalH, 'height_mm');
  const cavW = innerW - frameT * 2;
  const cavH = innerH - frameT * 2 - impostT * (layout.rows.length - 1);
  let yCursor = y + padT + frameT;
  layout.rows.forEach((row, ri) => {
    const rowH = cavH * rowRatios[ri];
    const colRatios = normalize(row.sections, totalW, 'width_mm');
    let xCursor = x + padL + frameT;
    const cavRowW = cavW - impostT * (row.sections.length - 1);
    row.sections.forEach((sec, ci) => {
      const sw = cavRowW * colRatios[ci];
      // sash frame
      doc.fillColor('#5a5a5a').rect(xCursor, yCursor, sw, rowH).fill();
      // glass
      doc.fillColor('#dceaf0').rect(xCursor + 1.5, yCursor + 1.5, sw - 3, rowH - 3).fill();
      doc.strokeColor('#999').lineWidth(0.3).rect(xCursor + 1.5, yCursor + 1.5, sw - 3, rowH - 3).stroke();
      // opening mark (simplified)
      const code = sec.opening || 'FIX';
      const cx = xCursor + sw / 2, cy = yCursor + rowH / 2;
      doc.strokeColor('#2a2a2a').lineWidth(0.4);
      const isFix = code === 'FIX' || code.endsWith('-FIX');
      const isSliding = typeof code === 'string' && code.startsWith('РАЗД');
      const isDoor = typeof code === 'string' && code.startsWith('ДВЕРЬ');
      const c = isDoor ? code.replace(/^ДВЕРЬ-/, '') : code;
      if (isSliding) {
        doc.moveTo(xCursor + 4, cy).lineTo(xCursor + sw - 4, cy).stroke();
        if (code === 'РАЗД-Л') {
          doc.moveTo(xCursor + 6, cy - 2).lineTo(xCursor + 4, cy).lineTo(xCursor + 6, cy + 2).stroke();
        } else if (code === 'РАЗД-П') {
          doc.moveTo(xCursor + sw - 6, cy - 2).lineTo(xCursor + sw - 4, cy).lineTo(xCursor + sw - 6, cy + 2).stroke();
        }
      } else if (isFix || c === 'FIX') {
        doc.opacity(0.4);
        doc.moveTo(xCursor + 2, yCursor + 2).lineTo(xCursor + sw - 2, yCursor + rowH - 2).stroke();
        doc.moveTo(xCursor + sw - 2, yCursor + 2).lineTo(xCursor + 2, yCursor + rowH - 2).stroke();
        doc.opacity(1);
      } else if (c === 'ПЛ') {
        doc.moveTo(xCursor + sw - 2, yCursor + 2).lineTo(xCursor + 2, cy).lineTo(xCursor + sw - 2, yCursor + rowH - 2).stroke();
      } else if (c === 'ПП') {
        doc.moveTo(xCursor + 2, yCursor + 2).lineTo(xCursor + sw - 2, cy).lineTo(xCursor + 2, yCursor + rowH - 2).stroke();
      } else if (c === 'ОТК') {
        doc.moveTo(xCursor + 2, yCursor + rowH - 2).lineTo(cx, yCursor + 2).lineTo(xCursor + sw - 2, yCursor + rowH - 2).stroke();
      } else if (c === 'ПОЛ') {
        doc.moveTo(xCursor + sw - 2, yCursor + 2).lineTo(xCursor + 2, cy).lineTo(xCursor + sw - 2, yCursor + rowH - 2).stroke();
        doc.dash(1.5, { space: 1.5 });
        doc.moveTo(xCursor + 2, yCursor + rowH - 2).lineTo(cx, yCursor + 2).lineTo(xCursor + sw - 2, yCursor + rowH - 2).stroke();
        doc.undash();
      } else if (c === 'ПОП') {
        doc.moveTo(xCursor + 2, yCursor + 2).lineTo(xCursor + sw - 2, cy).lineTo(xCursor + 2, yCursor + rowH - 2).stroke();
        doc.dash(1.5, { space: 1.5 });
        doc.moveTo(xCursor + 2, yCursor + rowH - 2).lineTo(cx, yCursor + 2).lineTo(xCursor + sw - 2, yCursor + rowH - 2).stroke();
        doc.undash();
      } else if (c === 'ФР') {
        doc.moveTo(xCursor + 2, yCursor + 2).lineTo(cx, yCursor + rowH - 2).lineTo(xCursor + sw - 2, yCursor + 2).stroke();
      }
      xCursor += sw + impostT;
    });
    yCursor += rowH + impostT;
  });
  doc.restore();

  // dimension label
  doc.font('Mono').fontSize(7).fillColor(MUTED).text(`${totalW} × ${totalH} мм`, x, y + h + 2, { width: w, align: 'center' });
}

/**
 * Generate a PDF KP document.
 * @param {object} kp        kp_documents row
 * @param {object} project   project row (or null if legacy single-calc KP)
 * @param {object} calc      legacy calculation row (or null if project)
 * @param {object} installer installer record (or fallback)
 */
export function buildKpPdf(kp, project, calc, installer) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, info: {
    Title: `КП №${kp.number}`,
    Author: installer?.name || 'PLUR Solutions',
    Subject: 'Коммерческое предложение ProfCalc',
  } });

  // register Cyrillic-capable fonts
  if (fs.existsSync(FONT_REG)) doc.registerFont('Sans', FONT_REG);
  if (fs.existsSync(FONT_BOLD)) doc.registerFont('SansB', FONT_BOLD);
  if (fs.existsSync(FONT_MONO)) doc.registerFont('Mono', FONT_MONO);
  doc.font('Sans');

  const W = doc.page.width - 80;
  const startX = 40;

  // Header bar
  doc.font('SansB').fontSize(20).fillColor(TEXT).text('Коммерческое предложение', startX, 40);
  doc.font('Mono').fontSize(10).fillColor(ACCENT).text(`№ ${kp.number}`, 0, 48, { width: doc.page.width - 40, align: 'right' });
  doc.font('Sans').fontSize(9).fillColor(MUTED).text(new Date().toLocaleDateString('ru-RU'), 0, 64, { width: doc.page.width - 40, align: 'right' });
  doc.moveTo(startX, 90).lineTo(startX + W, 90).strokeColor(RULE).lineWidth(1).stroke();

  // From / To block
  let y = 102;
  doc.font('SansB').fontSize(9).fillColor(MUTED).text('ИСПОЛНИТЕЛЬ', startX, y);
  doc.font('SansB').fontSize(13).fillColor(TEXT).text(installer?.name || 'PLUR Solutions', startX, y + 12);
  doc.font('Sans').fontSize(9).fillColor(MUTED);
  if (installer?.bin) doc.text('БИН ' + installer.bin, startX, y + 30);
  if (installer?.phone) doc.text(installer.phone, startX, y + 42);
  if (installer?.city) doc.text(installer.city, startX, y + 54);

  doc.font('SansB').fontSize(9).fillColor(MUTED).text('ЗАКАЗЧИК', startX + W / 2, y);
  doc.font('SansB').fontSize(13).fillColor(TEXT).text(kp.client_name || project?.client_name || calc?.title || 'Клиент', startX + W / 2, y + 12);
  doc.font('Sans').fontSize(9).fillColor(MUTED);
  if (project?.client_phone || kp.client_phone) doc.text(project?.client_phone || kp.client_phone, startX + W / 2, y + 30);
  if (kp.client_address || project?.client_address) doc.text(kp.client_address || project.client_address, startX + W / 2, y + 42);

  y += 78;
  doc.moveTo(startX, y).lineTo(startX + W, y).strokeColor(RULE).lineWidth(0.5).stroke();
  y += 12;

  // ITEMS — either from project or single calc
  let items = [];
  let totals = { subtotal: 0, discount: 0, total: 0, discountPct: 0 };
  if (project) {
    items = JSON.parse(project.items);
    const computed = calcProject({ items, installerId: project.installer_id, priceLevel: 'dealer' });
    totals = computed;
  } else if (calc) {
    const breakdown = JSON.parse(calc.breakdown);
    items = [{
      name: calc.title || 'Окно',
      layout: calc.layout ? JSON.parse(calc.layout) : { width: calc.width, height: calc.height, rows: [{ sections: JSON.parse(calc.sections).map(o => ({ opening: o })) }] },
      qty: 1,
    }];
    totals = {
      perItem: [{ ...breakdown, name: calc.title, qty: 1, total: calc.total, subtotal: breakdown.subtotal, discount: breakdown.discount }],
      subtotal: breakdown.subtotal,
      discount: breakdown.discount,
      total: calc.total,
      discountPct: breakdown.discountPct,
    };
  }

  // Items section
  doc.font('SansB').fontSize(11).fillColor(TEXT).text('СПЕЦИФИКАЦИЯ', startX, y);
  y += 18;

  totals.perItem.forEach((it, idx) => {
    if (y > doc.page.height - 200) { doc.addPage(); y = 40; }
    const item = items[idx];

    // item header
    doc.rect(startX, y, W, 22).fill('#faf7f1');
    doc.font('SansB').fontSize(11).fillColor(TEXT).text(`${idx + 1}. ${it.name}`, startX + 8, y + 6);
    doc.font('Mono').fontSize(11).fillColor(ACCENT_DARK).text(rub(it.total), 0, y + 6, { width: doc.page.width - 48, align: 'right' });
    y += 28;

    // schematic + meta
    drawWindowSchema(doc, startX + 4, y, 110, 80, item.layout);
    const metaX = startX + 130;
    doc.font('Sans').fontSize(9).fillColor(MUTED);
    doc.text(`Размер: ${item.layout.width} × ${item.layout.height} мм`, metaX, y + 4);
    doc.text(`Секций: ${it.geometry.totalSections} · створок: ${it.geometry.openCount}`, metaX, y + 16);
    doc.text(`Стекло: ${it.geometry.glazingArea} м² · профиль: ${it.geometry.framePerim} м`, metaX, y + 28);
    if (it.qty > 1) doc.text(`Количество: ${it.qty} шт`, metaX, y + 40);

    // price stack on the right
    doc.font('Sans').fontSize(8).fillColor(MUTED).text('за единицу', 0, y + 4, { width: doc.page.width - 48, align: 'right' });
    doc.font('Mono').fontSize(11).fillColor(TEXT).text(rub(it.total / (it.qty || 1)), 0, y + 16, { width: doc.page.width - 48, align: 'right' });
    if (it.discount > 0) {
      doc.font('Mono').fontSize(8).fillColor(ACCENT).text(`скидка ${it.discountPct}%`, 0, y + 32, { width: doc.page.width - 48, align: 'right' });
    }

    y += 95;

    // line breakdown (compressed)
    const linesShort = it.lines.slice(0, 6);
    doc.font('Sans').fontSize(8).fillColor(MUTED);
    linesShort.forEach(l => {
      if (y > doc.page.height - 80) { doc.addPage(); y = 40; }
      doc.text('· ' + l.label, startX + 8, y, { width: W * 0.55, ellipsis: true });
      doc.font('Mono').fontSize(8).fillColor(MUTED).text(l.qty, startX + W * 0.6, y);
      doc.font('Mono').fontSize(8).fillColor(TEXT).text(num(l.price), 0, y, { width: doc.page.width - 48, align: 'right' });
      doc.font('Sans').fontSize(8).fillColor(MUTED);
      y += 11;
    });
    if (it.lines.length > linesShort.length) {
      doc.text(`+ ещё ${it.lines.length - linesShort.length} позиций`, startX + 8, y, { italic: true });
      y += 11;
    }
    y += 6;
    doc.moveTo(startX, y).lineTo(startX + W, y).strokeColor(RULE).lineWidth(0.4).stroke();
    y += 10;
  });

  // ── totals ───────────────────────────────────────────────────────────
  if (y > doc.page.height - 150) { doc.addPage(); y = 40; }
  y += 8;
  doc.font('Sans').fontSize(10).fillColor(MUTED).text('Подытог', startX + W * 0.55, y);
  doc.font('Mono').fontSize(10).fillColor(TEXT).text(num(totals.subtotal) + ' ₸', 0, y, { width: doc.page.width - 48, align: 'right' });
  y += 14;
  if (totals.discount > 0) {
    doc.font('Sans').fontSize(10).fillColor(ACCENT).text(`Скидка ${totals.discountPct || ''}${totals.discountPct ? '%' : ''}`.trim(), startX + W * 0.55, y);
    doc.font('Mono').fontSize(10).fillColor(ACCENT).text('−' + num(totals.discount) + ' ₸', 0, y, { width: doc.page.width - 48, align: 'right' });
    y += 14;
  }
  doc.font('Sans').fontSize(10).fillColor(MUTED).text('НДС 12%', startX + W * 0.55, y);
  doc.font('Sans').fontSize(10).fillColor(MUTED).text('включён', 0, y, { width: doc.page.width - 48, align: 'right' });
  y += 18;

  doc.moveTo(startX + W * 0.5, y).lineTo(startX + W, y).strokeColor(TEXT).lineWidth(1).stroke();
  y += 8;
  doc.font('SansB').fontSize(14).fillColor(TEXT).text('ИТОГО', startX + W * 0.55, y);
  doc.font('SansB').fontSize(16).fillColor(ACCENT_DARK).text(rub(totals.total), 0, y - 2, { width: doc.page.width - 48, align: 'right' });
  y += 30;

  // Terms footer
  doc.font('Sans').fontSize(8).fillColor(MUTED).text(
    'Срок действия КП: 14 дней с момента формирования.\n' +
    'Гарантия на конструкции — 5 лет, фурнитура — 2 года.\n' +
    'Цены указаны с учётом НДС 12%. Доставка и монтаж — по согласованию.\n' +
    'Документ сформирован автоматически платформой ProfCalc · PLUR Solutions.',
    startX, y, { width: W, align: 'left' },
  );

  return doc;
}
