// server/calc.js — pricing engine for windows / doors / storefronts.
// Accepts the canonical "layout" model:
//   { width, height, rows: [{ ratio, sections: [{ ratio, opening }] }] }
// Also accepts the legacy single-row model:
//   { width, height, sections: [openingCode, ...] }

import db from './db.js';

const FIXED_OPENINGS = new Set(['FIX', 'ДВЕРЬ-FIX']);
const DOOR_PREFIX = 'ДВЕРЬ-';
const SLIDING_PREFIX = 'РАЗД-';   // sliding sashes (cheaper hardware, lighter)

// Line category taxonomy. Used by the `scope` filter so users can request
// "profiles only", "glass only", "hardware + glass", etc.
export const CATEGORIES = ['profile', 'hardware', 'glazing', 'reinforcement', 'sealing', 'consumables', 'extras'];
export const CATEGORY_LABELS = {
  profile:       'Профили (рама, створка, импост)',
  hardware:      'Фурнитура',
  glazing:       'Стеклопакеты',
  reinforcement: 'Армирование',
  sealing:       'Уплотнители',
  consumables:   'Расходники',
  extras:        'Доп. (подоконник, отлив, сетка, монтаж)',
};
function normalizeScope(scope) {
  if (!scope || scope === 'all') return new Set(CATEGORIES);
  if (Array.isArray(scope)) {
    const s = new Set(scope.filter(c => CATEGORIES.includes(c)));
    if (!s.size) return new Set(CATEGORIES);
    return s;
  }
  if (typeof scope === 'string') {
    const arr = scope.split(',').map(s => s.trim()).filter(Boolean);
    return normalizeScope(arr);
  }
  return new Set(CATEGORIES);
}

function isDoor(code) { return typeof code === 'string' && code.startsWith(DOOR_PREFIX); }
function isSliding(code) { return typeof code === 'string' && code.startsWith(SLIDING_PREFIX); }
function isOpen(code) { return code && !FIXED_OPENINGS.has(code); }

function art(article) {
  return db.prepare('SELECT * FROM articles WHERE article = ?').get(article);
}

function profileArticle(systemName, part) {
  const mapping = {
    'Rehau Delight 70':           { frame: 'REH-DEL-FRAME', sash: 'REH-DEL-SASH', mull: 'REH-DEL-MULL', bead: 'REH-DEL-BEAD' },
    'Rehau Grazio 70':            { frame: 'REH-GRZ-FRAME', sash: 'REH-GRZ-SASH', mull: 'REH-DEL-MULL', bead: 'REH-DEL-BEAD' },
    'KBE 70 Expert':              { frame: 'KBE-EXP-FRAME', sash: 'KBE-EXP-SASH', mull: 'KBE-EXP-MULL', bead: 'REH-DEL-BEAD' },
    'VEKA Softline 82':           { frame: 'VEK-SOFT-FRAME', sash: 'VEK-SOFT-SASH', mull: 'KBE-EXP-MULL', bead: 'REH-DEL-BEAD' },
    'Salamander bluEvolution 82': { frame: 'SAL-BLU-FRAME', sash: 'SAL-BLU-SASH', mull: 'KBE-EXP-MULL', bead: 'REH-DEL-BEAD' },
  };
  const m = mapping[systemName];
  if (!m) throw new Error(`No article mapping for system ${systemName}`);
  return m[part];
}

function glazingArticle(formula) {
  const map = {
    '4-16-4':         'GLZ-4-16-4',
    '4-10-4-10-4':    'GLZ-4-10-4-10-4',
    '4-14Ar-4И':      'GLZ-4-10-4-10-4I',
    '4-10-4-10-4И':   'GLZ-4-10-4-10-4I',
    '4MF-10-4-10-4':  'GLZ-4MF-10-4-10-4',
    '6-12-4-12-6':    'GLZ-6-12-4-12-6',
  };
  return map[formula] || 'GLZ-4-10-4-10-4';
}

function normalize(arr, totalMm = null, mmKey = null) {
  if (!arr.length) return [];
  if (totalMm && mmKey) {
    const fixedSum = arr.reduce((s, x) => s + (x[mmKey] || 0), 0);
    const ratioItems = arr.filter(x => !x[mmKey]);
    const remaining = Math.max(0, totalMm - fixedSum);
    const ratioSum = ratioItems.reduce((s, x) => s + (x.ratio ?? 1), 0) || 1;
    return arr.map(x => {
      if (x[mmKey]) return x[mmKey] / totalMm;
      return (remaining * (x.ratio ?? 1) / ratioSum) / totalMm;
    });
  }
  const total = arr.reduce((s, x) => s + (x.ratio ?? 1), 0) || 1;
  return arr.map(x => (x.ratio ?? 1) / total);
}

function legacyToLayout(sections, width, height) {
  return {
    width, height,
    rows: [{ ratio: 1, sections: sections.map(opening => ({ ratio: 1, opening })) }],
  };
}

/**
 * @param {object} input
 * @param {object} [input.layout] — { width, height, rows: [{ratio, sections:[{ratio, opening}]}] }
 * @param {number} [input.width] — legacy mode
 * @param {number} [input.height]
 * @param {string[]} [input.sections] — legacy mode
 * @param {string} input.glazingId
 * @param {string} input.systemId
 * @param {string} input.manufacturerId
 * @param {string} [input.installerId]
 * @param {string} [input.priceLevel]  'base' | 'dealer' | 'retail'
 * @param {object} [input.extras]      { sill, ebb, mesh, install }
 */
export function calcWindow(input) {
  const {
    glazingId, systemId, manufacturerId,
    installerId, priceLevel = 'retail',
    extras = { sill: true, ebb: true, mesh: true, install: true },
    scope,
  } = input;
  const scopeSet = normalizeScope(scope);

  // Resolve layout
  let layout = input.layout;
  if (!layout) {
    if (!Array.isArray(input.sections) || !input.sections.length) throw new Error('sections or layout required');
    layout = legacyToLayout(input.sections, input.width, input.height);
  }
  const width = layout.width || input.width;
  const height = layout.height || input.height;
  if (!width || width < 300 || width > 8000) throw new Error('width out of range (300..8000)');
  if (!height || height < 300 || height > 4000) throw new Error('height out of range (300..4000)');
  if (!Array.isArray(layout.rows) || !layout.rows.length) throw new Error('layout.rows required');

  const sys = db.prepare('SELECT * FROM profile_systems WHERE id = ?').get(systemId);
  if (!sys) throw new Error(`system ${systemId} not found`);
  const glaz = db.prepare('SELECT * FROM glazing WHERE id = ?').get(glazingId);
  if (!glaz) throw new Error(`glazing ${glazingId} not found`);

  const w_m = width / 1000;
  const h_m = height / 1000;

  // Geometry calculations across the rows × cols grid (supports mm-based row heights)
  const rowHs = normalize(layout.rows, height, 'height_mm').map(r => h_m * r);
  const sashFrameInset = 0.07; // 70mm sash frame typical

  const framePerim = 2 * (w_m + h_m);
  let mullionH = 0;     // horizontal imposts (between rows)
  let mullionV = 0;     // vertical imposts (between sections within a row)
  let sashPerimTotal = 0;
  let glazingArea = 0;
  let openCount = 0;
  let doorCount = 0;
  let slidingCount = 0;
  let totalSections = 0;

  layout.rows.forEach((row, ri) => {
    const rowH = rowHs[ri];
    const colRatios = normalize(row.sections, width, 'width_mm');
    if (ri > 0) mullionH += w_m;     // horizontal impost above this row (full width)
    if (row.sections.length > 1) mullionV += rowH * (row.sections.length - 1);

    row.sections.forEach((sec, ci) => {
      totalSections++;
      const sw = w_m * colRatios[ci];
      const code = sec.opening || 'FIX';
      if (FIXED_OPENINGS.has(code)) {
        glazingArea += sw * rowH;
      } else {
        const sashPerim = 2 * (sw + rowH);
        sashPerimTotal += sashPerim;
        glazingArea += Math.max(0, (sw - 2 * sashFrameInset)) * Math.max(0, (rowH - 2 * sashFrameInset));
        openCount++;
        if (isDoor(code)) doorCount++;
        if (isSliding(code)) slidingCount++;
      }
    });
  });

  const allLines = [];

  // Frame
  const frameArt = art(profileArticle(sys.name, 'frame'));
  allLines.push(tag(line(`Профиль ПВХ ${sys.name} · рама`, framePerim, 'м', frameArt, priceLevel), 'profile'));

  // Sash
  if (sashPerimTotal > 0) {
    const sashArt = art(profileArticle(sys.name, 'sash'));
    allLines.push(tag(line(`Профиль ПВХ ${sys.name} · створка (×${openCount})`, sashPerimTotal, 'м', sashArt, priceLevel), 'profile'));
  }

  // Imposts (horizontal + vertical)
  const totalMullion = mullionH + mullionV;
  if (totalMullion > 0) {
    const mullArt = art(profileArticle(sys.name, 'mull'));
    const tagStr = mullionH > 0 && mullionV > 0 ? ' (гориз. + верт.)'
              : mullionH > 0 ? ' (горизонтальный)'
              : ' (вертикальный)';
    allLines.push(tag(line(`Импост ${sys.name}${tagStr}`, totalMullion, 'м', mullArt, priceLevel), 'profile'));
  }

  // Glazing
  const glazArt = art(glazingArticle(glaz.formula));
  allLines.push(tag(line(`Стеклопакет ${glaz.formula}`, glazingArea, 'м²', glazArt, priceLevel), 'glazing'));

  // Hardware (per opening sash; doors get heavier hardware; sliding gets its own)
  const winSashCount = openCount - doorCount - slidingCount;
  if (winSashCount > 0) {
    const hwArt = art('HW-ROTO-NT-PO');
    allLines.push(tag(lineFlat(`Фурнитура Roto NT · оконная (×${winSashCount})`, winSashCount, 'компл.', hwArt, priceLevel), 'hardware'));
  }
  if (doorCount > 0) {
    const hwArt = art('HW-ROTO-NT-PO');  // 1.5× as door-hw proxy
    const price = Math.round(doorCount * hwArt[priceLevel] * 1.5);
    allLines.push(tag({
      label: `Фурнитура Roto NT · дверная (×${doorCount})`, qty: `${doorCount} компл.`,
      qtyNum: doorCount, unit: 'компл.', article: hwArt.article,
      unitPrice: Math.round(hwArt[priceLevel] * 1.5), price,
    }, 'hardware'));
  }
  if (slidingCount > 0) {
    const hwArt = art('HW-ROTO-NT-PO');
    // sliding hardware costs ~1.8× single PO due to rails + roller carriages
    const price = Math.round(slidingCount * hwArt[priceLevel] * 1.8);
    allLines.push(tag({
      label: `Фурнитура раздвижная (рельсы, каретки) (×${slidingCount})`, qty: `${slidingCount} компл.`,
      qtyNum: slidingCount, unit: 'компл.', article: hwArt.article,
      unitPrice: Math.round(hwArt[priceLevel] * 1.8), price,
    }, 'hardware'));
  }

  // Reinforcement
  const reinfLen = framePerim + totalMullion + sashPerimTotal * 0.6;
  allLines.push(tag(line('Армирование оцинк. сталь 1.5 мм', reinfLen, 'м', art('REINF-1.5'), priceLevel), 'reinforcement'));

  // Sealing
  const sealLen = framePerim * 2 + sashPerimTotal * 2;
  allLines.push(tag(line('Уплотнитель EPDM (2 контура)', sealLen, 'м', art('SEAL-EPDM'), priceLevel), 'sealing'));

  // Расходники (1.5% of everything else inside scope)
  const consumablesBase = allLines.filter(l => scopeSet.has(l.category)).reduce((s, l) => s + l.price, 0);
  if (consumablesBase > 0) {
    allLines.push(tag({
      label: 'Расходники (крепёж, герметик)', qty: 'компл.', qtyNum: 1, unit: 'компл.',
      article: '—', unitPrice: Math.round(consumablesBase * 0.015), price: Math.round(consumablesBase * 0.015),
    }, 'consumables'));
  }

  // Extras
  if (extras.sill) {
    const a = art('SILL-MOELLER-250');
    allLines.push(tag(line('Подоконник Moeller 250 мм', w_m, 'м', a, priceLevel), 'extras'));
  }
  if (extras.ebb) {
    const a = art('EBB-150');
    allLines.push(tag(line('Отлив оцинкованный 150 мм', w_m, 'м', a, priceLevel), 'extras'));
  }
  if (extras.mesh) {
    const a = art('MESH-FRAME');
    const qty = Math.max(1, openCount - doorCount || 1);
    allLines.push(tag(lineFlat('Москитная сетка рамочная', qty, 'шт', a, priceLevel), 'extras'));
  }
  if (extras.install) {
    // Allow caller to override the install cost. Two shapes:
    //   extras.installCost: number              — flat override
    //   extras.installCost: { value, perM2 }    — per-m² when perM2 truthy
    const dflt = art('INSTALL');
    const objArea = w_m * h_m;
    let qty = 1, unit = 'объект', label = 'Монтаж', unitPrice = dflt[priceLevel];
    if (extras.installCost != null) {
      const cost = typeof extras.installCost === 'object' ? extras.installCost : { value: extras.installCost };
      if (cost.perM2) {
        qty = +objArea.toFixed(3); unit = 'м²'; unitPrice = Math.max(0, Math.round(cost.value));
        label = 'Монтаж (по м²)';
      } else {
        unitPrice = Math.max(0, Math.round(cost.value));
        label = extras.installLabel || 'Монтаж';
      }
    }
    allLines.push(tag({
      label, qty: qty + ' ' + unit, qtyNum: qty, unit,
      article: dflt.article, unitPrice, price: Math.round(qty * unitPrice),
    }, 'extras'));
  }

  // Apply scope filter — caller picks which categories appear in the priced lines
  const lines = allLines.filter(l => scopeSet.has(l.category));

  // Personal discount
  let discountPct = 0;
  if (installerId && manufacturerId) {
    const row = db.prepare('SELECT pct FROM discounts WHERE installer_id=? AND manufacturer_id=?').get(installerId, manufacturerId);
    if (row) discountPct = Math.min(25, row.pct);
  }

  // Installer's personal markup (private — applied silently to all line prices)
  let markupPct = Number(input.markupPct);
  if (!Number.isFinite(markupPct) && installerId) {
    const row = db.prepare('SELECT markup_pct FROM installers WHERE id = ?').get(installerId);
    markupPct = row ? Number(row.markup_pct) || 0 : 0;
  }
  if (!Number.isFinite(markupPct)) markupPct = 0;
  markupPct = Math.max(0, Math.min(200, markupPct));
  if (markupPct > 0) {
    const f = 1 + markupPct / 100;
    for (const l of lines) {
      l.unitPrice = Math.round(l.unitPrice * f);
      l.price = Math.round(l.price * f);
    }
  }

  const subtotal = lines.reduce((s, l) => s + l.price, 0);
  const discount = Math.round(subtotal * discountPct / 100);
  const total = subtotal - discount;

  return {
    input: { width, height, layout, glazingId, systemId, manufacturerId, installerId, priceLevel, extras, scope: [...scopeSet] },
    geometry: {
      framePerim: +framePerim.toFixed(3),
      mullionH: +mullionH.toFixed(3),
      mullionV: +mullionV.toFixed(3),
      sashPerimTotal: +sashPerimTotal.toFixed(3),
      glazingArea: +glazingArea.toFixed(3),
      openCount, doorCount, slidingCount, totalSections,
    },
    lines,
    byCategory: summarizeByCategory(lines),
    scope: [...scopeSet],
    subtotal, discountPct, discount, total,
    vatIncluded: true, vatRate: 12,
  };
}

// Calc a multi-item project (sums across all items).
// Installer's personal markup is loaded from their profile inside calcWindow
// and applied silently — it does NOT appear in totals or any client-visible label.
export function calcProject(input) {
  const { items, glazingId, systemId, manufacturerId, installerId, priceLevel, extras, scope, markupPct } = input;
  if (!Array.isArray(items) || !items.length) throw new Error('items required');
  const perItem = [];
  let subtotal = 0, discount = 0, total = 0;
  const byCategory = {};
  for (const c of CATEGORIES) byCategory[c] = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const c = calcWindow({
      layout: it.layout,
      glazingId: it.glazingId || glazingId,
      systemId: it.systemId || systemId,
      manufacturerId: it.manufacturerId || manufacturerId,
      installerId,
      priceLevel,
      extras: it.extras || extras,
      scope: it.scope || scope,
      markupPct,
    });
    const qty = it.qty || 1;
    perItem.push({
      idx: i, name: it.name || `Позиция ${i + 1}`,
      qty,
      subtotal: c.subtotal * qty,
      total: c.total * qty,
      discount: c.discount * qty,
      discountPct: c.discountPct,
      lines: c.lines,
      byCategory: c.byCategory,
      scope: c.scope,
      geometry: c.geometry,
      input: c.input,
    });
    subtotal += c.subtotal * qty;
    discount += c.discount * qty;
    total += c.total * qty;
    for (const cat of CATEGORIES) byCategory[cat] += (c.byCategory[cat] || 0) * qty;
  }
  return {
    perItem, subtotal, discount, total,
    byCategory,
    scope: normalizeScope(scope) ? [...normalizeScope(scope)] : CATEGORIES,
    itemCount: items.length,
    totalSashes: perItem.reduce((s, p) => s + (p.geometry.openCount || 0) * (p.qty || 1), 0),
    vatIncluded: true, vatRate: 12,
  };
}

function line(label, qty, unit, articleRow, priceLevel) {
  return {
    label, qty: qty.toFixed(2) + ' ' + unit,
    qtyNum: qty, unit,
    article: articleRow.article,
    unitPrice: articleRow[priceLevel],
    price: Math.round(qty * articleRow[priceLevel]),
  };
}
function lineFlat(label, qty, unit, articleRow, priceLevel) {
  return {
    label, qty: qty + ' ' + unit,
    qtyNum: qty, unit,
    article: articleRow.article,
    unitPrice: articleRow[priceLevel],
    price: Math.round(qty * articleRow[priceLevel]),
  };
}
function tag(line, category) { line.category = category; return line; }
function summarizeByCategory(lines) {
  const out = {};
  for (const c of CATEGORIES) out[c] = 0;
  for (const l of lines) out[l.category] = (out[l.category] || 0) + l.price;
  return out;
}

export function compareManufacturers(input) {
  const { glazingId, installerId, priceLevel = 'dealer', extras } = input;
  const manus = db.prepare('SELECT * FROM manufacturers WHERE status = ?').all('active');
  const results = [];
  for (const m of manus) {
    const systems = JSON.parse(m.systems);
    const sysId = systems[0];
    const sys = db.prepare('SELECT * FROM profile_systems WHERE id = ?').get(sysId);
    if (!sys) continue;
    try {
      const calc = calcWindow({
        ...input, systemId: sysId, manufacturerId: m.id, installerId, priceLevel, extras,
      });
      results.push({
        manufacturerId: m.id,
        name: m.name, rating: m.rating,
        systemName: sys.name,
        hardware: sys.vendor === 'Salamander' ? 'Maco' : 'Roto NT',
        base: calc.subtotal,
        discount: calc.discountPct,
        final: calc.total,
      });
    } catch {}
  }
  results.sort((a, b) => a.final - b.final);
  return results;
}
