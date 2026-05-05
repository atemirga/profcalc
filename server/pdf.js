// server/pdf.js — generate PDF КП document with Cyrillic support (DejaVu Sans)
import PDFDocument from 'pdfkit';
import path from 'node:path';
import fs from 'node:fs';
import db from './db.js';
import { calcProject, calcWindow, buildBom } from './calc.js';

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

// ── Phase 4: Detailed Logikal-style 1:40 drawing with per-section dimensions
function drawSchemaWithDims(doc, x, y, w, h, layout, posLabel, qty) {
  const totalW = layout.width || 1000;
  const totalH = layout.height || 1000;
  const dimGutter = 22;  // space for dimension lines
  const innerW = w - dimGutter * 2;
  const innerH = h - dimGutter * 2;
  const drawX = x + dimGutter;
  const drawY = y + dimGutter;

  function normalize(arr, total, key) {
    const fixedSum = arr.reduce((s, x) => s + (x[key] || 0), 0);
    const ratioItems = arr.filter(x => !x[key]);
    const remaining = Math.max(0, total - fixedSum);
    const ratioSum = ratioItems.reduce((s, x) => s + (x.ratio ?? 1), 0) || 1;
    return arr.map(x => x[key] ? x[key] / total : (remaining * (x.ratio ?? 1) / ratioSum) / total);
  }

  // outer frame
  doc.save();
  doc.fillColor('#3a3a3a').rect(drawX, drawY, innerW, innerH).fill();

  const frameT = 5;
  const impostT = 2.5;
  const cavW = innerW - frameT * 2;
  const cavH = innerH - frameT * 2 - impostT * (layout.rows.length - 1);
  const rowRatios = normalize(layout.rows, totalH, 'height_mm');

  // Compute pixel positions of section boundaries (for dimensions)
  const xBoundaries = [drawX]; // outer edges + impost lines
  const yBoundaries = [drawY];

  let yCursor = drawY + frameT;
  layout.rows.forEach((row, ri) => {
    const rowH = cavH * rowRatios[ri];
    const colRatios = normalize(row.sections, totalW, 'width_mm');
    let xCursor = drawX + frameT;
    const cavRowW = cavW - impostT * (row.sections.length - 1);
    if (ri === 0) xBoundaries.length = 0; // recompute first row
    if (ri === 0) {
      // first time we see col boundaries — record them
      xBoundaries.push(drawX);
      let xx = drawX + frameT;
      row.sections.forEach((sec, ci) => {
        const sw = cavRowW * colRatios[ci];
        xx += sw;
        if (ci < row.sections.length - 1) { xBoundaries.push(xx); xx += impostT; }
      });
      xBoundaries.push(drawX + innerW);
    }
    row.sections.forEach((sec, ci) => {
      const sw = cavRowW * colRatios[ci];
      doc.fillColor('#5a5a5a').rect(xCursor, yCursor, sw, rowH).fill();
      doc.fillColor('#dceaf0').rect(xCursor + 1.5, yCursor + 1.5, sw - 3, rowH - 3).fill();
      doc.strokeColor('#999').lineWidth(0.3).rect(xCursor + 1.5, yCursor + 1.5, sw - 3, rowH - 3).stroke();
      // opening glyph (re-use simple FIX/door diagonals)
      const code = sec.opening || 'FIX';
      const isFix = code === 'FIX' || code.endsWith('-FIX');
      const cx = xCursor + sw / 2, cy = yCursor + rowH / 2;
      doc.strokeColor('#2a2a2a').lineWidth(0.4);
      if (isFix) {
        doc.opacity(0.4);
        doc.moveTo(xCursor + 2, yCursor + 2).lineTo(xCursor + sw - 2, yCursor + rowH - 2).stroke();
        doc.moveTo(xCursor + sw - 2, yCursor + 2).lineTo(xCursor + 2, yCursor + rowH - 2).stroke();
        doc.opacity(1);
      } else if (code.includes('Л') && !code.includes('ОП')) {
        doc.moveTo(xCursor + sw - 2, yCursor + 2).lineTo(xCursor + 2, cy).lineTo(xCursor + sw - 2, yCursor + rowH - 2).stroke();
      } else if (code.includes('П') && !code.includes('ОЛ')) {
        doc.moveTo(xCursor + 2, yCursor + 2).lineTo(xCursor + sw - 2, cy).lineTo(xCursor + 2, yCursor + rowH - 2).stroke();
      }
      xCursor += sw + impostT;
    });
    yBoundaries.push(yCursor + rowH);
    yCursor += rowH + impostT;
  });
  if (yBoundaries.length === 1) yBoundaries.push(drawY + innerH);

  doc.restore();

  // Dimension lines — top (per-column widths) and right (per-row heights)
  doc.font('Mono').fontSize(6).fillColor(TEXT).strokeColor(MUTED).lineWidth(0.3);
  // Top dimensions: column widths
  const colRatios0 = normalize(layout.rows[0].sections, totalW, 'width_mm');
  const colWidthsMm = colRatios0.map(r => Math.round(r * totalW));
  // tick marks on top
  const topY = drawY - 4;
  doc.moveTo(drawX, topY).lineTo(drawX + innerW, topY).stroke();
  let cursorPx = drawX;
  colWidthsMm.forEach((mm, i) => {
    const widthPx = (mm / totalW) * innerW;
    // tick at start
    doc.moveTo(cursorPx, topY - 3).lineTo(cursorPx, topY + 3).stroke();
    // label centered
    doc.text(String(mm), cursorPx, topY - 12, { width: widthPx, align: 'center' });
    cursorPx += widthPx;
    if (i === colWidthsMm.length - 1) doc.moveTo(cursorPx, topY - 3).lineTo(cursorPx, topY + 3).stroke();
  });
  // total width label above
  doc.fillColor(TEXT).fontSize(7);
  doc.text(String(totalW), drawX, drawY - 22, { width: innerW, align: 'center' });

  // Right dimensions: row heights
  const rightX = drawX + innerW + 4;
  doc.fillColor(MUTED).strokeColor(MUTED).lineWidth(0.3).fontSize(6);
  doc.moveTo(rightX, drawY).lineTo(rightX, drawY + innerH).stroke();
  let cursorYPx = drawY;
  rowRatios.forEach((r, i) => {
    const mm = Math.round(r * totalH);
    const hPx = r * innerH;
    doc.moveTo(rightX - 3, cursorYPx).lineTo(rightX + 3, cursorYPx).stroke();
    doc.fillColor(TEXT);
    doc.text(String(mm), rightX + 5, cursorYPx + hPx / 2 - 3);
    cursorYPx += hPx;
    if (i === rowRatios.length - 1) doc.moveTo(rightX - 3, cursorYPx).lineTo(rightX + 3, cursorYPx).stroke();
  });
  // total height label
  doc.fillColor(TEXT).fontSize(7);
  doc.text(String(totalH), rightX + 12, drawY + innerH / 2 - 3);

  // Position label (Поз: NNN, Кол-во: N) in top-left corner
  if (posLabel) {
    doc.font('SansB').fontSize(8).fillColor(TEXT).text(posLabel, x, y, { width: dimGutter * 4 });
    if (qty != null) doc.font('Mono').fontSize(7).fillColor(MUTED).text(`Кол-во: ${qty}`, x, y + 10);
  }
}

// ── Phase 4: Render the BOM page (Logikal-style materials list)
function drawBomPage(doc, bom, project, items, installer) {
  doc.addPage();
  const W = doc.page.width - 80;
  const startX = 40;
  let y = 40;

  // Header
  doc.font('SansB').fontSize(16).fillColor(TEXT).text('Список материалов', startX, y);
  doc.font('Mono').fontSize(9).fillColor(ACCENT).text(new Date().toLocaleDateString('ru-RU') + ' / ' + new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }), 0, y + 4, { width: doc.page.width - 40, align: 'right' });
  doc.font('Sans').fontSize(9).fillColor(MUTED).text('Объект: ' + (project?.client_name || project?.name || '—'), startX, y + 22);
  doc.font('Sans').fontSize(9).fillColor(MUTED).text('Ответственное лицо: ' + (installer?.name || 'PLUR Solutions'), startX, y + 34);
  y += 56;
  doc.moveTo(startX, y).lineTo(startX + W, y).strokeColor(RULE).lineWidth(0.8).stroke();
  y += 10;

  function tableHeader(title) {
    if (y > doc.page.height - 80) { doc.addPage(); y = 40; }
    doc.rect(startX, y, W, 18).fill('#faf7f1');
    doc.font('SansB').fontSize(10).fillColor(ACCENT_DARK).text(title, startX + 8, y + 4);
    y += 22;
    // column headers
    doc.font('Sans').fontSize(7).fillColor(MUTED);
    doc.text('Кол-во',     startX + 8,            y, { width: 60 });
    doc.text('Номер',      startX + 70,           y, { width: 80 });
    doc.text('Описание',   startX + 152,          y, { width: W - 270 });
    doc.text('Цена',       startX + W - 110,      y, { width: 50, align: 'right' });
    doc.text('Всего',      startX + W - 50,       y, { width: 50, align: 'right' });
    y += 10;
    doc.moveTo(startX, y).lineTo(startX + W, y).strokeColor(RULE).lineWidth(0.3).stroke();
    y += 4;
  }
  function row(item) {
    if (y > doc.page.height - 60) { doc.addPage(); y = 40; }
    doc.font('Mono').fontSize(8).fillColor(TEXT).text(num(item.qty) + ' ' + (item.unit || ''), startX + 8, y, { width: 60 });
    doc.font('Mono').fontSize(8).fillColor(TEXT).text(item.code || '—', startX + 70, y, { width: 80, ellipsis: true });
    doc.font('Sans').fontSize(8).fillColor(TEXT).text(item.label || '', startX + 152, y, { width: W - 270, ellipsis: true });
    doc.font('Mono').fontSize(8).fillColor(MUTED).text(num(item.unitPrice), startX + W - 110, y, { width: 50, align: 'right' });
    doc.font('Mono').fontSize(8).fillColor(TEXT).text(num(item.total), startX + W - 50, y, { width: 50, align: 'right' });
    y += 12;
  }
  function sectionTotal(label, sum) {
    if (y > doc.page.height - 40) { doc.addPage(); y = 40; }
    y += 4;
    doc.moveTo(startX + W * 0.55, y).lineTo(startX + W, y).strokeColor(RULE).lineWidth(0.4).stroke();
    y += 4;
    doc.font('SansB').fontSize(9).fillColor(TEXT).text(label, startX + W * 0.55, y);
    doc.font('Mono').fontSize(9).fillColor(ACCENT_DARK).text(num(sum) + ' ₸', startX + W - 110, y, { width: 100, align: 'right' });
    y += 16;
  }

  // Profiles section
  if (bom.profiles.length) {
    tableHeader('Профили');
    bom.profiles.forEach(row);
    sectionTotal('Сумма (Профили)', bom.profiles.reduce((s, x) => s + x.total, 0));
  }
  // Special lengths
  if (bom.special.length) {
    tableHeader('Специальные длины');
    bom.special.forEach(row);
    sectionTotal('Сумма (Спец. длины)', bom.special.reduce((s, x) => s + x.total, 0));
  }
  // Accessories (hardware + glazing + extras + reinforcement + consumables)
  if (bom.accessories.length) {
    tableHeader('Аксессуары');
    bom.accessories.forEach(row);
    sectionTotal('Сумма (Аксессуары)', bom.accessories.reduce((s, x) => s + x.total, 0));
  }
  // Sealing
  if (bom.sealing.length) {
    tableHeader('Уплотнители');
    bom.sealing.forEach(row);
    sectionTotal('Сумма (Уплотнители)', bom.sealing.reduce((s, x) => s + x.total, 0));
  }

  // Grand total
  if (y > doc.page.height - 60) { doc.addPage(); y = 40; }
  y += 6;
  doc.moveTo(startX + W * 0.5, y).lineTo(startX + W, y).strokeColor(TEXT).lineWidth(1).stroke();
  y += 6;
  doc.font('SansB').fontSize(12).fillColor(TEXT).text('ВСЕГО', startX + W * 0.55, y);
  doc.font('SansB').fontSize(13).fillColor(ACCENT_DARK).text(num(bom.total) + ' ₸', startX + W - 110, y - 1, { width: 100, align: 'right' });
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

    // schematic + meta — Phase 4: detailed Logikal-style schema with dimensions
    const posLabel = `Поз:${String(idx + 1).padStart(3, '0')}`;
    drawSchemaWithDims(doc, startX, y - 6, 200, 130, item.layout, posLabel, it.qty);
    const metaX = startX + 215;
    doc.font('Sans').fontSize(9).fillColor(MUTED);
    doc.text(`Размер: ${item.layout.width} × ${item.layout.height} мм`, metaX, y + 4);
    doc.text(`Секций: ${it.geometry.totalSections} · створок: ${it.geometry.openCount}`, metaX, y + 16);
    doc.text(`Стекло: ${it.geometry.glazingArea} м² · профиль: ${it.geometry.framePerim} м`, metaX, y + 28);
    doc.text(`Периметр: ${it.geometry.framePerim.toFixed(1)} м · Площадь: ${(item.layout.width / 1000 * item.layout.height / 1000).toFixed(2)} м²`, metaX, y + 40);
    if (it.qty > 1) doc.text(`Количество: ${it.qty} шт`, metaX, y + 52);

    // price stack on the right
    doc.font('Sans').fontSize(8).fillColor(MUTED).text('за единицу', 0, y + 4, { width: doc.page.width - 48, align: 'right' });
    doc.font('Mono').fontSize(11).fillColor(TEXT).text(rub(it.total / (it.qty || 1)), 0, y + 16, { width: doc.page.width - 48, align: 'right' });
    if (it.discount > 0) {
      doc.font('Mono').fontSize(8).fillColor(ACCENT).text(`скидка ${it.discountPct}%`, 0, y + 32, { width: doc.page.width - 48, align: 'right' });
    }

    y += 145;  // taller block for the Logikal-style schema with dimensions

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

  // ── Phase 4: append BOM (Список материалов) page — Logikal-style
  try {
    // Aggregate all priced lines across items × qty, then merge identical SKUs
    const aggregate = [];
    items.forEach((it, idx) => {
      const c = calcWindow({
        layout: it.layout, glazingId: it.glazingId, systemId: it.systemId,
        manufacturerId: project?.manufacturer_id || null,
        installerId: project?.installer_id || null,
        priceLevel: 'dealer',
        extras: it.extras, colorId: it.colorId, hardwareKitId: it.hardwareKitId,
        handleId: it.handleId, handleColorId: it.handleColorId, doorKit: it.doorKit,
        turnProfile: it.turnProfile, frameAdapter: it.frameAdapter,
      });
      const itQty = it.qty || 1;
      c.lines.forEach(ln => aggregate.push({
        ...ln, qtyNum: ln.qtyNum * itQty, price: ln.price * itQty,
      }));
    });
    const merged = {};
    for (const ln of aggregate) {
      const k = ln.article + '|' + ln.label;
      if (merged[k]) { merged[k].qtyNum += ln.qtyNum; merged[k].price += ln.price; }
      else merged[k] = { ...ln };
    }
    const bom = buildBom(Object.values(merged));
    drawBomPage(doc, bom, project, items, installer);
  } catch (e) {
    // never block KP rendering on BOM failure
    console.error('BOM page generation failed:', e.message);
  }

  return doc;
}

// ── Phase 5: Заявка-накладная (Order invoice) — replicates the photo's format
export function buildInvoicePdf(project, installer) {
  const doc = new PDFDocument({ size: 'A4', margin: 30, info: {
    Title: `Заявка-накладная ${project.order_number || ''}`,
    Author: installer?.name || 'PLUR Solutions',
  } });
  if (fs.existsSync(FONT_REG)) doc.registerFont('Sans', FONT_REG);
  if (fs.existsSync(FONT_BOLD)) doc.registerFont('SansB', FONT_BOLD);
  if (fs.existsSync(FONT_MONO)) doc.registerFont('Mono', FONT_MONO);
  doc.font('Sans');

  const startX = 30;
  const W = doc.page.width - 60;

  // Header — "ЗАЯВКА-НАКЛАДНАЯ" black banner like the photo
  doc.rect(startX, 30, 220, 28).fill('#1a1a1a');
  doc.font('SansB').fontSize(14).fillColor('#fff').text('ЗАЯВКА-НАКЛАДНАЯ', startX + 10, 38);

  // Top-right info block
  let metaY = 32;
  const metaX = startX + 240;
  doc.font('Sans').fontSize(8).fillColor(MUTED);
  doc.text('Номер заказа / Дата:', metaX, metaY);
  doc.font('SansB').fontSize(9).fillColor(TEXT).text(
    (project.order_number || '—') + ' / ' + new Date(project.created_at * 1000).toLocaleDateString('ru-RU'),
    metaX + 110, metaY);
  doc.font('Sans').fontSize(8).fillColor(MUTED).text('Тип квитанции:', metaX, metaY + 12);
  doc.font('Sans').fontSize(9).fillColor(TEXT).text('Квитанция Принятых Заказов', metaX + 110, metaY + 12);
  doc.font('Sans').fontSize(8).fillColor(MUTED).text('Склад:', metaX, metaY + 24);
  doc.font('Sans').fontSize(9).fillColor(TEXT).text(project.warehouse || 'Центральный склад', metaX + 110, metaY + 24);

  let y = 75;
  // Client/object block
  doc.font('Sans').fontSize(8).fillColor(MUTED).text('Код клиента:', startX, y);
  doc.font('Mono').fontSize(9).fillColor(TEXT).text(project.client_code || '120-100-0001', startX + 80, y);
  doc.font('Sans').fontSize(8).fillColor(MUTED).text('Название Клиента:', startX, y + 12);
  doc.font('Sans').fontSize(9).fillColor(TEXT).text('Частное лицо / ' + (project.client_name || project.object_name || '—'), startX + 80, y + 12);
  doc.font('Sans').fontSize(8).fillColor(MUTED).text('Объект:', metaX, y);
  doc.font('SansB').fontSize(9).fillColor(TEXT).text(project.object_name || project.client_name || '—', metaX + 80, y);
  doc.font('Sans').fontSize(8).fillColor(MUTED).text('Ответственное лицо:', metaX, y + 12);
  doc.font('Sans').fontSize(9).fillColor(TEXT).text(project.responsible || installer?.name || 'Raimbek', metaX + 80, y + 12);
  y = 110;

  // Compute lines: aggregate everything as in BOM
  const items = JSON.parse(project.items);
  const aggregate = [];
  let totalArea = 0;
  items.forEach((it) => {
    const c = calcWindow({
      layout: it.layout, glazingId: it.glazingId, systemId: it.systemId,
      manufacturerId: project.manufacturer_id, installerId: project.installer_id, priceLevel: 'dealer',
      extras: it.extras, colorId: it.colorId, hardwareKitId: it.hardwareKitId,
      handleId: it.handleId, handleColorId: it.handleColorId, doorKit: it.doorKit,
      turnProfile: it.turnProfile, frameAdapter: it.frameAdapter,
    });
    const itQty = it.qty || 1;
    totalArea += (it.layout.width / 1000 * it.layout.height / 1000) * itQty;
    c.lines.forEach(ln => aggregate.push({
      ...ln, qtyNum: ln.qtyNum * itQty, price: ln.price * itQty,
    }));
  });
  const merged = {};
  for (const ln of aggregate) {
    const k = ln.article + '|' + ln.label;
    if (merged[k]) { merged[k].qtyNum += ln.qtyNum; merged[k].price += ln.price; }
    else merged[k] = { ...ln };
  }
  const rows = Object.values(merged);

  // Table header — bordered like the photo
  doc.font('SansB').fontSize(8).fillColor(TEXT);
  const colXs = [startX + 4, startX + 30, startX + 90, startX + 250, startX + 290, startX + 340, startX + 405, startX + 470];
  const headers = ['№', 'Код', 'Наименование товара', 'Кол-во', 'Ед.', 'Цена', 'Цена со скидкой', 'Сумма со скидкой'];
  doc.rect(startX, y, W, 18).fillAndStroke('#f0ece4', '#999');
  doc.fillColor(TEXT);
  headers.forEach((hd, i) => {
    doc.text(hd, colXs[i], y + 5, { width: (colXs[i + 1] || startX + W) - colXs[i] - 4, align: i === 0 ? 'center' : 'left', ellipsis: true });
  });
  y += 18;

  // Rows
  doc.font('Sans').fontSize(8).fillColor(TEXT);
  let totalSum = 0;
  rows.forEach((r, idx) => {
    if (y > doc.page.height - 110) { doc.addPage(); y = 40; }
    const discounted = Math.round(r.unitPrice * 0.85);
    const lineTotal = Math.round(r.qtyNum * discounted);
    totalSum += lineTotal;
    // alt-row bg
    if (idx % 2 === 0) doc.rect(startX, y, W, 14).fill('#faf7f1');
    doc.fillColor(TEXT).font('Mono').fontSize(7);
    doc.text(String(idx + 1), colXs[0], y + 3, { width: 22, align: 'center' });
    doc.text(r.article || '—', colXs[1], y + 3, { width: 56, ellipsis: true });
    doc.font('Sans').fontSize(7).text(r.label || '', colXs[2], y + 3, { width: 158, ellipsis: true });
    doc.font('Mono').fontSize(7).text(num(r.qtyNum), colXs[3], y + 3, { width: 36, align: 'right' });
    doc.text(r.unit || '', colXs[4], y + 3, { width: 46, align: 'left' });
    doc.text(num(r.unitPrice), colXs[5], y + 3, { width: 60, align: 'right' });
    doc.text(num(discounted), colXs[6], y + 3, { width: 60, align: 'right' });
    doc.font('SansB').fontSize(7).fillColor(TEXT).text(num(lineTotal), colXs[7], y + 3, { width: 80, align: 'right' });
    y += 14;
  });

  // ── Phase 5: Assembly fee row (separate from goods)
  const assemblyAmount = (project.assembly_per_m2 || 0) > 0
    ? Math.round((project.assembly_per_m2 || 0) * totalArea)
    : (project.assembly_fee || 0);

  if (y > doc.page.height - 100) { doc.addPage(); y = 40; }
  // Total row — "Итого"
  y += 6;
  doc.moveTo(startX, y).lineTo(startX + W, y).strokeColor(TEXT).lineWidth(0.6).stroke();
  y += 6;
  doc.font('SansB').fontSize(9).fillColor(TEXT).text('Итого:', colXs[5], y);
  doc.font('Mono').fontSize(10).fillColor(TEXT).text(num(totalSum) + ' ₸', colXs[7] - 10, y, { width: 90, align: 'right' });
  y += 14;
  doc.font('Sans').fontSize(8).fillColor(MUTED).text('В том числе НДС 12%:', colXs[5], y);
  doc.font('Mono').fontSize(8).fillColor(MUTED).text(num(Math.round(totalSum * 0.12 / 1.12)), colXs[7] - 10, y, { width: 90, align: 'right' });
  y += 18;

  // Handwritten-style summary block (like the photo: "сборка: 78 600 тг" + total)
  if (assemblyAmount > 0) {
    doc.font('Sans').fontSize(10).fillColor(ACCENT_DARK).text('сборка:', startX + W - 200, y);
    doc.font('SansB').fontSize(11).fillColor(ACCENT_DARK).text(num(assemblyAmount) + ' тг', startX + W - 110, y, { width: 100, align: 'right' });
    y += 16;
    doc.moveTo(startX + W - 200, y).lineTo(startX + W, y).strokeColor(TEXT).lineWidth(0.5).stroke();
    y += 4;
    doc.font('SansB').fontSize(13).fillColor(TEXT).text(num(totalSum + assemblyAmount) + ' тг', startX + W - 110, y, { width: 100, align: 'right' });
    y += 24;
  }

  // Signatures footer
  doc.font('Sans').fontSize(8).fillColor(MUTED);
  doc.text('Оформил: ' + (project.responsible || installer?.name || 'Raimbek'), startX, y);
  doc.text('Получил: ___________________', startX + W / 2, y);

  // Footer with platform info
  const footerY = doc.page.height - 40;
  doc.font('SansB').fontSize(9).fillColor(ACCENT).text('PROFCALC', startX, footerY);
  doc.font('Sans').fontSize(7).fillColor(MUTED).text(
    'PLUR Solutions, Алматы · Сформировано автоматически · Каталог: ' + (project.catalog || 'Logikal 12.6'),
    startX + 60, footerY + 2);

  return doc;
}
