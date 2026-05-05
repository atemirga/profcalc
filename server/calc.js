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
  if (m) return m[part];
  // Phase 3 fallback: any system without legacy mapping uses profile_parts directly
  return null;
}
// Lookup a profile_parts row, or fall back to the legacy `articles` table.
// Returns a synthetic article-shaped object: { article, base, dealer, retail }.
function profilePart(systemId, kind, priceLevel) {
  const sys = db.prepare('SELECT name FROM profile_systems WHERE id = ?').get(systemId);
  const sysName = sys ? sys.name : null;
  const legacyKey = ({ frame: 'frame', sash: 'sash', mullion: 'mull', bead: 'bead' })[kind];
  const legacyArt = sysName && legacyKey ? profileArticle(sysName, legacyKey) : null;
  if (legacyArt) {
    const a = db.prepare('SELECT * FROM articles WHERE article = ?').get(legacyArt);
    if (a) return a;
  }
  const part = db.prepare('SELECT * FROM profile_parts WHERE system_id = ? AND kind = ? LIMIT 1').get(systemId, kind);
  if (!part) return null;
  // Synthesize an articles-shape row: caller does line(... articleRow, priceLevel)
  // and reads articleRow[priceLevel]. Apply tier multiplier to price_per_m.
  const dealerP = Math.round(part.price_per_m * priceMultiplier('dealer'));
  const retailP = Math.round(part.price_per_m * priceMultiplier('retail'));
  return {
    article: part.code, name: part.name, unit: 'м',
    base: part.price_per_m, dealer: dealerP, retail: retailP,
  };
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
 * @param {object} [input.extras]      { sill, ebb, mesh, install, sillId, ebbId, meshId }
 * @param {string} [input.colorId]     — RAL color of the profile (surcharge applies)
 * @param {string} [input.hardwareKitId] — window hardware kit
 * @param {string} [input.handleId]    — window/door handle
 * @param {string} [input.handleColorId]
 * @param {object} [input.doorKit] — door hardware overrides:
 *   { lockId, lockTongueId, cylinderId, hingeId, closerId, thresholdId,
 *     strikeId, rosetteId, fixatorId, handleKitId }
 *   When omitted for a layout that has doors, default kit is auto-selected
 *   (DORMA bachok lock + tongue + TS77 closer + 55 GOLD threshold + K-LONG strike).
 */
export function calcWindow(input) {
  const {
    glazingId, systemId, manufacturerId,
    installerId, priceLevel = 'retail',
    extras = { sill: true, ebb: true, mesh: true, install: true },
    scope,
    colorId, hardwareKitId, handleId, handleColorId,
    doorKit,
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

  // Color surcharge (e.g. RAL 7024 = +25% to profile lines)
  const color = colorId ? db.prepare('SELECT * FROM colors WHERE id = ?').get(colorId) : null;
  const colorSurchargePct = color ? (color.surcharge_pct || 0) : 0;

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
  let doorWidthTotal = 0;  // sum of door section widths (m) — for threshold length

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
        if (isDoor(code)) { doorCount++; doorWidthTotal += sw; }
        if (isSliding(code)) slidingCount++;
      }
    });
  });

  const allLines = [];
  const colorTag = color ? ` · ${color.ral}` : '';

  // Frame
  const frameArt = profilePart(systemId, 'frame', priceLevel);
  if (frameArt) {
    allLines.push(tag(applySurcharge(line(`Профиль ПВХ ${sys.name} · рама${colorTag}`, framePerim, 'м', frameArt, priceLevel), colorSurchargePct), 'profile'));
  }

  // Sash
  if (sashPerimTotal > 0) {
    const sashArt = profilePart(systemId, 'sash', priceLevel);
    if (sashArt) {
      allLines.push(tag(applySurcharge(line(`Профиль ПВХ ${sys.name} · створка (×${openCount})${colorTag}`, sashPerimTotal, 'м', sashArt, priceLevel), colorSurchargePct), 'profile'));
    }
  }

  // Imposts (horizontal + vertical)
  const totalMullion = mullionH + mullionV;
  if (totalMullion > 0) {
    const mullArt = profilePart(systemId, 'mullion', priceLevel);
    if (mullArt) {
      const tagStr = mullionH > 0 && mullionV > 0 ? ' (гориз. + верт.)'
                : mullionH > 0 ? ' (горизонтальный)'
                : ' (вертикальный)';
      allLines.push(tag(applySurcharge(line(`Импост ${sys.name}${tagStr}${colorTag}`, totalMullion, 'м', mullArt, priceLevel), colorSurchargePct), 'profile'));
    }
  }

  // ── Phase 3: bead (штапик) length — perimeter of all glass packets, +5% запас на раскрой
  const beadPart = db.prepare("SELECT * FROM profile_parts WHERE system_id = ? AND kind = 'bead' LIMIT 1").get(systemId);
  if (beadPart) {
    // Glass perimeter approx — sum of (sw, rh) per glass-bearing section.
    // We approximate as: full window perim + sash perim + mullion (every glass edge gets a bead)
    const beadLen = +(framePerim + sashPerimTotal + totalMullion).toFixed(2) * 1.05;
    const unitPrice = Math.round(beadPart.price_per_m * priceMultiplier(priceLevel));
    allLines.push(tag(applySurcharge({
      label: `Штапик ${beadPart.code} ${beadPart.width_mm} мм${colorTag}`,
      qty: beadLen.toFixed(2) + ' м', qtyNum: beadLen, unit: 'м',
      article: beadPart.id, unitPrice, price: Math.round(beadLen * unitPrice),
    }, colorSurchargePct), 'profile'));
  }
  // Phase 3: shtulp — second sash on doors / shtulp window (height of door sash)
  const shtulpPart = db.prepare("SELECT * FROM profile_parts WHERE system_id = ? AND kind = 'shtulp' LIMIT 1").get(systemId);
  if (shtulpPart && doorCount >= 2) {
    const shtulpLen = +(h_m * Math.floor(doorCount / 2)).toFixed(2);
    const unitPrice = Math.round(shtulpPart.price_per_m * priceMultiplier(priceLevel));
    allLines.push(tag(applySurcharge({
      label: `Штульп ${shtulpPart.code}${colorTag}`,
      qty: shtulpLen + ' м', qtyNum: shtulpLen, unit: 'м',
      article: shtulpPart.id, unitPrice, price: Math.round(shtulpLen * unitPrice),
    }, colorSurchargePct), 'profile'));
  }
  // Phase 3: turn (разворотный) — added when caller asks for it (input.turnProfile=true)
  if (input.turnProfile) {
    const turnPart = db.prepare("SELECT * FROM profile_parts WHERE system_id = ? AND kind = 'turn' LIMIT 1").get(systemId);
    if (turnPart) {
      const turnLen = +(h_m * 2).toFixed(2);  // both vertical edges
      const unitPrice = Math.round(turnPart.price_per_m * priceMultiplier(priceLevel));
      allLines.push(tag(applySurcharge({
        label: `Разворотный ${turnPart.code}${colorTag}`,
        qty: turnLen + ' м', qtyNum: turnLen, unit: 'м',
        article: turnPart.id, unitPrice, price: Math.round(turnLen * unitPrice),
      }, colorSurchargePct), 'profile'));
    }
  }
  // Phase 3: frame adapter — for outward-opening doors
  if (input.frameAdapter && doorCount > 0) {
    const adPart = db.prepare("SELECT * FROM profile_parts WHERE system_id = ? AND kind = 'adapter' LIMIT 1").get(systemId);
    if (adPart) {
      const adLen = +(doorWidthTotal + h_m * 2 * doorCount).toFixed(2);  // door perim minus top
      const unitPrice = Math.round(adPart.price_per_m * priceMultiplier(priceLevel));
      allLines.push(tag(applySurcharge({
        label: `Адаптер рамы наружн. откр. ${adPart.code}${colorTag}`,
        qty: adLen + ' м', qtyNum: adLen, unit: 'м',
        article: adPart.id, unitPrice, price: Math.round(adLen * unitPrice),
      }, colorSurchargePct), 'profile'));
    }
  }

  // Glazing
  const glazArt = art(glazingArticle(glaz.formula));
  allLines.push(tag(line(`Стеклопакет ${glaz.formula}`, glazingArea, 'м²', glazArt, priceLevel), 'glazing'));

  // Hardware — caller can pick a specific kit; otherwise default Roto NT
  const winSashCount = openCount - doorCount - slidingCount;
  const hwKit = hardwareKitId ? db.prepare('SELECT * FROM hardware_kits WHERE id = ?').get(hardwareKitId) : null;
  if (winSashCount > 0) {
    const kit = hwKit && hwKit.kind === 'window' ? hwKit : null;
    if (kit) {
      const unitPrice = Math.round(kit.price_per_sash * priceMultiplier(priceLevel));
      allLines.push(tag({
        label: `Фурнитура ${kit.vendor} · ${kit.name} (×${winSashCount})`, qty: `${winSashCount} компл.`,
        qtyNum: winSashCount, unit: 'компл.', article: kit.id, unitPrice, price: unitPrice * winSashCount,
      }, 'hardware'));
    } else {
      const hwArt = art('HW-ROTO-NT-PO');
      allLines.push(tag(lineFlat(`Фурнитура Roto NT · оконная (×${winSashCount})`, winSashCount, 'компл.', hwArt, priceLevel), 'hardware'));
    }
  }
  if (doorCount > 0) {
    // door hardware kit (only if user picked one of kind='door')
    const doorKit = hwKit && hwKit.kind === 'door' ? hwKit : null;
    if (doorKit) {
      const unitPrice = Math.round(doorKit.price_per_sash * priceMultiplier(priceLevel));
      allLines.push(tag({
        label: `Фурнитура ${doorKit.vendor} · ${doorKit.name} (×${doorCount})`, qty: `${doorCount} компл.`,
        qtyNum: doorCount, unit: 'компл.', article: doorKit.id, unitPrice, price: unitPrice * doorCount,
      }, 'hardware'));
    } else {
      const hwArt = art('HW-ROTO-NT-PO');
      const price = Math.round(doorCount * hwArt[priceLevel] * 1.5);
      allLines.push(tag({
        label: `Фурнитура Roto NT · дверная (×${doorCount})`, qty: `${doorCount} компл.`,
        qtyNum: doorCount, unit: 'компл.', article: hwArt.article,
        unitPrice: Math.round(hwArt[priceLevel] * 1.5), price,
      }, 'hardware'));
    }
  }
  if (slidingCount > 0) {
    const slKit = hwKit && hwKit.kind === 'sliding' ? hwKit : null;
    if (slKit) {
      const unitPrice = Math.round(slKit.price_per_sash * priceMultiplier(priceLevel));
      allLines.push(tag({
        label: `Фурнитура ${slKit.vendor} · ${slKit.name} (×${slidingCount})`, qty: `${slidingCount} компл.`,
        qtyNum: slidingCount, unit: 'компл.', article: slKit.id, unitPrice, price: unitPrice * slidingCount,
      }, 'hardware'));
    } else {
      const hwArt = art('HW-ROTO-NT-PO');
      const price = Math.round(slidingCount * hwArt[priceLevel] * 1.8);
      allLines.push(tag({
        label: `Фурнитура раздвижная (рельсы, каретки) (×${slidingCount})`, qty: `${slidingCount} компл.`,
        qtyNum: slidingCount, unit: 'компл.', article: hwArt.article,
        unitPrice: Math.round(hwArt[priceLevel] * 1.8), price,
      }, 'hardware'));
    }
  }
  // Window/door handles (separate line) — qty = number of opening sashes (excluding fix)
  if (handleId) {
    const hnd = db.prepare('SELECT * FROM handles WHERE id = ?').get(handleId);
    if (hnd) {
      const handleQty = hnd.kind === 'door' ? Math.max(doorCount, 1) : winSashCount;
      if (handleQty > 0) {
        const colorH = handleColorId ? db.prepare('SELECT * FROM colors WHERE id = ?').get(handleColorId) : null;
        const tagH = colorH ? ` · ${colorH.ral}` : '';
        const unitPrice = Math.round(hnd.price * priceMultiplier(priceLevel));
        allLines.push(tag({
          label: `Ручка ${hnd.vendor} ${hnd.name}${tagH} (×${handleQty})`, qty: `${handleQty} шт`,
          qtyNum: handleQty, unit: 'шт', article: hnd.id, unitPrice, price: unitPrice * handleQty,
        }, 'hardware'));
      }
    }
  }

  // ── Phase 2: Door hardware kit (lock, hinge, closer, threshold, strike, etc)
  if (doorCount > 0) {
    const dkOverride = doorKit || {};
    // Default selection — matches the photo's invoice (DORMA bachok + tongue + TS77 + 55 GOLD + K-LONG)
    const defaults = {
      lockId:       'dh-lock-bachok-dorma',
      lockTongueId: 'dh-lock-tongue-dorma',
      cylinderId:   'dh-cyl-dorma',
      hingeId:      'dh-hinge-hn3303-sk',
      closerId:     'dh-closer-ts77-dorma',
      thresholdId:  'dh-thresh-55gold',
      strikeId:     'dh-strike-klong',
      rosetteId:    'dh-rosette-sk',
      fixatorId:    'dh-fixator-klong',
      handleKitId:  'dh-handle-kit-sk',
    };
    const selected = { ...defaults, ...dkOverride };
    // Allow caller to disable a specific component by passing null/false
    const dhRow = (id) => id ? db.prepare('SELECT * FROM door_hardware WHERE id = ?').get(id) : null;
    const dhLine = (row, qtyMultiplier = 1) => {
      if (!row) return;
      // qty: per-door * doorCount * qtyMultiplier (threshold uses multiplier=doorWidth)
      const qty = row.unit === 'м'
        ? +(qtyMultiplier).toFixed(2)
        : +(row.qty_per_door * doorCount * qtyMultiplier).toFixed(2);
      const unitPrice = Math.round(row.price * priceMultiplier(priceLevel));
      const colorTag = row.color_default ? (() => {
        const c = db.prepare('SELECT * FROM colors WHERE id = ?').get(row.color_default);
        return c ? ' · ' + c.ral : '';
      })() : '';
      allLines.push(tag({
        label: `${row.vendor} · ${row.name}${colorTag}` + (doorCount > 1 ? ` (×${doorCount} двери)` : ''),
        qty: qty + ' ' + row.unit, qtyNum: qty, unit: row.unit,
        article: row.id, unitPrice, price: Math.round(qty * unitPrice),
      }, 'hardware'));
    };
    dhLine(dhRow(selected.lockId));
    dhLine(dhRow(selected.lockTongueId));
    dhLine(dhRow(selected.cylinderId));
    dhLine(dhRow(selected.hingeId));               // qty_per_door=3 → 3×doorCount
    dhLine(dhRow(selected.closerId));
    dhLine(dhRow(selected.strikeId));               // qty_per_door=2
    dhLine(dhRow(selected.rosetteId));
    dhLine(dhRow(selected.fixatorId));
    dhLine(dhRow(selected.handleKitId));
    // Threshold — length = sum of door widths in meters
    if (doorWidthTotal > 0) dhLine(dhRow(selected.thresholdId), doorWidthTotal);
  }

  // Reinforcement (steel inside profiles)
  const reinfLen = framePerim + totalMullion + sashPerimTotal * 0.6;
  allLines.push(tag(line('Армирование оцинк. сталь 1.5 мм', reinfLen, 'м', art('REINF-1.5'), priceLevel), 'reinforcement'));

  // ── Phase 3: typed seals — CON 01/02/05/07-4/11-4 (Logikal-style)
  function sealLine(code, length) {
    if (length <= 0) return;
    const s = db.prepare('SELECT * FROM seals WHERE code = ?').get(code);
    if (!s) return;
    const unitPrice = Math.round(s.price_per_m * priceMultiplier(priceLevel));
    allLines.push(tag({
      label: `Уплотнитель ${s.code} · ${s.name.replace(/^Уплотнитель\s*/, '')}`,
      qty: length.toFixed(2) + ' м', qtyNum: length, unit: 'м',
      article: s.id, unitPrice, price: Math.round(length * unitPrice),
    }, 'sealing'));
  }
  // CON 01 internal frame seal — periph of frame
  sealLine('CON 01', framePerim);
  // CON 02 external frame seal — periph of frame
  sealLine('CON 02', framePerim);
  // CON 05 central seal — sash perimeter
  if (sashPerimTotal > 0) sealLine('CON 05', sashPerimTotal);
  // CON 07-4 bead seal — same length as bead (frame+sash+mullion×1.05)
  sealLine('CON 07-4', (framePerim + sashPerimTotal + totalMullion) * 1.05);
  // CON 11-4 sash-to-frame seal — sash perimeter
  if (sashPerimTotal > 0) sealLine('CON 11-4', sashPerimTotal);

  // ── Phase 3: brackets (сухари + соединители + крепёжные уголки)
  function brkLine(brkCode, qty) {
    if (qty <= 0) return;
    const b = db.prepare('SELECT * FROM brackets WHERE code = ?').get(brkCode);
    if (!b) return;
    const unitPrice = Math.round(b.price_per_unit * priceMultiplier(priceLevel));
    allLines.push(tag({
      label: `${b.name} (${b.code})`,
      qty: qty + ' ' + b.unit, qtyNum: qty, unit: b.unit,
      article: b.id, unitPrice, price: qty * unitPrice,
    }, 'consumables'));
  }
  // Frame anchor brackets: ~6 per frame (top/bottom + 2 each side)
  brkLine('1000', 6);
  // Sash anchor brackets: ~6 per opening sash
  if (openCount > 0) brkLine('1020', Math.max(6, openCount * 2));
  // Соединительный уголок 1058 — corners: 4×rama + 4×sash×openCount + 4×mullion endpoints
  const cornerCount = 4 + openCount * 4 + (totalMullion > 0 ? layout.rows.length * 2 : 0);
  brkLine('1058', cornerCount);
  // Соединитель импоста 1140 — endpoints of all imposts
  let mullEndpoints = 0;
  layout.rows.forEach((row, ri) => {
    if (ri > 0) mullEndpoints += 2;                    // horizontal impost: 2 ends
    if (row.sections.length > 1) mullEndpoints += (row.sections.length - 1) * 2;  // vertical imposts
  });
  if (mullEndpoints > 0) brkLine('1140', mullEndpoints);
  // Сухари — proxy: 2 per sash (typical reinforcement strut count)
  if (openCount > 0) {
    brkLine('132-285-083', openCount * 2);
    brkLine('130-566-058', openCount * 2);
  }

  // Расходники (1.5% of everything else inside scope)
  const consumablesBase = allLines.filter(l => scopeSet.has(l.category)).reduce((s, l) => s + l.price, 0);
  if (consumablesBase > 0) {
    allLines.push(tag({
      label: 'Расходники (крепёж, герметик)', qty: 'компл.', qtyNum: 1, unit: 'компл.',
      article: '—', unitPrice: Math.round(consumablesBase * 0.015), price: Math.round(consumablesBase * 0.015),
    }, 'consumables'));
  }

  // Extras — sill / ebb / mesh, with optional catalog model selection
  if (extras.sill) {
    const sillRow = extras.sillId ? db.prepare('SELECT * FROM sills WHERE id = ?').get(extras.sillId) : null;
    if (sillRow) {
      const unitPrice = Math.round(sillRow.price_per_m * priceMultiplier(priceLevel));
      allLines.push(tag({
        label: `Подоконник ${sillRow.vendor} ${sillRow.name} ${sillRow.width_mm}мм${sillRow.color ? ' · ' + sillRow.color : ''}`,
        qty: w_m.toFixed(2) + ' м', qtyNum: w_m, unit: 'м',
        article: sillRow.id, unitPrice, price: Math.round(w_m * unitPrice),
      }, 'extras'));
    } else {
      const a = art('SILL-MOELLER-250');
      allLines.push(tag(line('Подоконник Moeller 250 мм', w_m, 'м', a, priceLevel), 'extras'));
    }
  }
  if (extras.ebb) {
    const ebbRow = extras.ebbId ? db.prepare('SELECT * FROM ebbs WHERE id = ?').get(extras.ebbId) : null;
    if (ebbRow) {
      const unitPrice = Math.round(ebbRow.price_per_m * priceMultiplier(priceLevel));
      allLines.push(tag({
        label: `Отлив ${ebbRow.material} ${ebbRow.width_mm}мм${ebbRow.color ? ' · ' + ebbRow.color : ''}`,
        qty: w_m.toFixed(2) + ' м', qtyNum: w_m, unit: 'м',
        article: ebbRow.id, unitPrice, price: Math.round(w_m * unitPrice),
      }, 'extras'));
    } else {
      const a = art('EBB-150');
      allLines.push(tag(line('Отлив оцинкованный 150 мм', w_m, 'м', a, priceLevel), 'extras'));
    }
  }
  if (extras.mesh) {
    const meshQty = Math.max(1, openCount - doorCount || 1);
    const meshRow = extras.meshId ? db.prepare('SELECT * FROM meshes WHERE id = ?').get(extras.meshId) : null;
    if (meshRow) {
      const unitPrice = Math.round(meshRow.price_per_unit * priceMultiplier(priceLevel));
      const kindLabel = ({ frame: 'рамочная', sliding: 'раздвижная', pleated: 'плиссе', antikoshka: 'антикошка', roll: 'рулонная' })[meshRow.kind] || meshRow.kind;
      allLines.push(tag({
        label: `Москитная сетка ${kindLabel} · ${meshRow.name}${meshRow.color ? ' · ' + meshRow.color : ''}`,
        qty: meshQty + ' ' + meshRow.unit, qtyNum: meshQty, unit: meshRow.unit,
        article: meshRow.id, unitPrice, price: meshQty * unitPrice,
      }, 'extras'));
    } else {
      const a = art('MESH-FRAME');
      allLines.push(tag(lineFlat('Москитная сетка рамочная', meshQty, 'шт', a, priceLevel), 'extras'));
    }
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
    input: { width, height, layout, glazingId, systemId, manufacturerId, installerId, priceLevel, extras, scope: [...scopeSet], colorId, hardwareKitId, handleId, handleColorId, doorKit, turnProfile: !!input.turnProfile, frameAdapter: !!input.frameAdapter },
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
      colorId: it.colorId,
      hardwareKitId: it.hardwareKitId,
      handleId: it.handleId,
      handleColorId: it.handleColorId,
      doorKit: it.doorKit,
      turnProfile: it.turnProfile,
      frameAdapter: it.frameAdapter,
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

// Apply a percentage surcharge (e.g. RAL color +25%) to a single line in-place.
function applySurcharge(ln, pct) {
  if (!pct) return ln;
  const f = 1 + pct / 100;
  ln.unitPrice = Math.round(ln.unitPrice * f);
  ln.price = Math.round(ln.price * f);
  return ln;
}
// Map dealer/retail/base level multipliers to the catalog (price-per-* fields).
// hardware_kits/handles/sills/ebbs/meshes store one base price; multiply by level.
function priceMultiplier(level) {
  return level === 'retail' ? 1.18 : level === 'dealer' ? 1.06 : 1.00;
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

// ── Phase 4: Logikal-style BOM grouping ─────────────────────────────────
// Group all priced lines into 4 sections (Профили / Спец. длины / Аксессуары / Уплотнители)
// + summary row (qty, unit, code, name, color, price/pkg, total).
export const BOM_SECTIONS = [
  { id: 'profiles',    title: 'Профили',           keys: ['profile-frame','profile-sash','profile-mullion','profile-bead'] },
  { id: 'special',     title: 'Специальные длины', keys: ['profile-shtulp','profile-turn','profile-adapter','profile-doorsash','profile-threshold'] },
  { id: 'accessories', title: 'Аксессуары',        keys: ['hardware','consumables','reinforcement','extras','glazing'] },
  { id: 'sealing',     title: 'Уплотнители',       keys: ['sealing'] },
];

export function buildBom(allLines) {
  const out = { profiles: [], special: [], accessories: [], sealing: [], total: 0 };
  for (const ln of allLines) {
    // categorize: split 'profile' more finely by article name
    let bucket = 'accessories';
    if (ln.category === 'sealing') bucket = 'sealing';
    else if (ln.category === 'profile') {
      const lbl = (ln.label || '').toLowerCase();
      if (/штульп|разворот|адаптер|порог|дверная створка/.test(lbl)) bucket = 'special';
      else bucket = 'profiles';
    }
    out[bucket].push({
      qty: ln.qtyNum, unit: ln.unit, code: ln.article, label: ln.label,
      unitPrice: ln.unitPrice, total: ln.price,
    });
    out.total += ln.price;
  }
  return out;
}
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
