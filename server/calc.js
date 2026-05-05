// server/calc.js — pricing engine for windows / doors / storefronts.
// Accepts the canonical "layout" model:
//   { width, height, rows: [{ ratio, sections: [{ ratio, opening }] }] }
// Also accepts the legacy single-row model:
//   { width, height, sections: [openingCode, ...] }

import db from './db.js';
import { shapeGeometry } from './shapes.js';

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
    doorKit, doorTypeId,
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

  // ── Phase 18: shape geometry (rectangle by default; arched/triangle/circle override perim+area)
  const shape = input.shape || layout.shape || { kind: 'rectangle', width, height, params: {} };
  if (!shape.width)  shape.width  = width;
  if (!shape.height) shape.height = height;
  const shapeGeo = shapeGeometry(shape);
  const isNonRect = shape.kind && shape.kind !== 'rectangle';
  const shapeRow = isNonRect ? db.prepare('SELECT * FROM shape_types WHERE code = ?').get(shape.kind) : null;

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

  // Phase 18: framePerim from shape geometry if non-rectangular; otherwise classic 2(w+h)
  const framePerim = isNonRect ? (shapeGeo.framePerim / 1000) : 2 * (w_m + h_m);
  const framePerimStraight = isNonRect ? (shapeGeo.framePerimStraight / 1000) : framePerim;
  const framePerimArched   = isNonRect ? (shapeGeo.framePerimArched / 1000)   : 0;
  let mullionH = 0;     // horizontal imposts (between rows)
  let mullionV = 0;     // vertical imposts (between sections within a row)
  let sashPerimTotal = 0;
  let glazingArea = 0;
  let openCount = 0;
  let doorCount = 0;
  let slidingCount = 0;
  let totalSections = 0;
  let doorWidthTotal = 0;     // sum of door section widths (m) — for threshold length
  let slidingWidthTotal = 0;  // sum of sliding section widths (m) — for rail length

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
        if (isSliding(code)) { slidingCount++; slidingWidthTotal += sw; }
      }
    });
  });

  const allLines = [];
  const colorTag = color ? ` · ${color.ral}` : '';

  // Frame — Phase 18: split into straight + arched (bent) for non-rectangular shapes
  const frameArt = profilePart(systemId, 'frame', priceLevel);
  if (frameArt) {
    // straight portion
    if (framePerimStraight > 0) {
      allLines.push(tag(applySurcharge(line(`Профиль ПВХ ${sys.name} · рама${isNonRect ? ' (прямые участки)' : ''}${colorTag}`, framePerimStraight, 'м', frameArt, priceLevel), colorSurchargePct), 'profile'));
    }
    // arched (bent) portion — costs 1.5× as preformed/bent
    if (framePerimArched > 0) {
      const bentPrice = Math.round(frameArt[priceLevel] * 1.5);
      allLines.push(tag(applySurcharge({
        label: `Профиль ПВХ ${sys.name} · рама гнутая (${shapeRow?.name || shape.kind})${colorTag}`,
        qty: framePerimArched.toFixed(2) + ' м', qtyNum: framePerimArched, unit: 'м',
        article: frameArt.article + '-ARC', unitPrice: bentPrice,
        price: Math.round(framePerimArched * bentPrice),
      }, colorSurchargePct), 'profile'));
      // Bend service fee — one-time for the whole frame
      const bendFee = shapeRow?.bend_fee || 0;
      if (bendFee > 0) {
        allLines.push(tag({
          label: `Гибка профиля рамы (${shapeRow.name})`,
          qty: '1 услуга', qtyNum: 1, unit: 'услуга',
          article: 'BEND-FRAME', unitPrice: bendFee, price: bendFee,
        }, 'consumables'));
      }
    }
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

  // Glazing — Phase 12+18+19: per-glass-pack lines + shape factor + attribute multipliers
  const glazArt = art(glazingArticle(glaz.formula));
  const glassShapeFactor = shapeRow ? Number(shapeRow.glass_factor) || 1.0 : 1.0;
  // Phase 19: glass attribute multipliers (tempered 1.4, triplex 1.6, tint 1.2, etc)
  const attrIds = Array.isArray(input.glassAttributes) ? input.glassAttributes : [];
  let attrMultiplier = 1.0;
  let attrSurchargePerM2 = 0;
  const attrLabels = [];
  for (const aid of attrIds) {
    const attr = db.prepare('SELECT * FROM glass_attributes WHERE id = ?').get(aid);
    if (!attr) continue;
    attrMultiplier *= Number(attr.multiplier) || 1.0;
    attrSurchargePerM2 += Number(attr.surcharge_per_m2) || 0;
    attrLabels.push(attr.name);
  }
  const totalGlassMultiplier = glassShapeFactor * attrMultiplier;
  // Walk layout sections to emit one line per distinct glass packet size
  // (a stock cutting list will optimize identical sizes anyway).
  const glassMap = {};
  layout.rows.forEach((row, ri) => {
    const rowHRel = rowHs[ri];
    const colRatios = normalize(row.sections, width, 'width_mm');
    row.sections.forEach((sec, ci) => {
      const sw_m = w_m * colRatios[ci];
      const code = sec.opening || 'FIX';
      const isFix = code === 'FIX' || code.endsWith('-FIX');
      const insetM = isFix ? 0.005 : sashFrameInset;  // 5mm fixed bortik vs 70mm sash inset
      const gW = Math.max(0, +(sw_m   - 2 * insetM).toFixed(3));
      const gH = Math.max(0, +(rowHRel - 2 * insetM).toFixed(3));
      if (gW <= 0 || gH <= 0) return;
      const k = `${Math.round(gW * 1000)}×${Math.round(gH * 1000)}`;
      if (glassMap[k]) glassMap[k].qty += 1;
      else glassMap[k] = { wMm: Math.round(gW * 1000), hMm: Math.round(gH * 1000), areaM2: gW * gH, qty: 1 };
    });
  });
  Object.values(glassMap).forEach(g => {
    const factorTag = glassShapeFactor > 1 ? ` · форма ×${glassShapeFactor.toFixed(1)}` : '';
    const attrTag = attrLabels.length ? ` · ${attrLabels.join(' + ')}` : '';
    const label = `Стеклопакет ${glaz.formula} · ${g.wMm}×${g.hMm} мм${factorTag}${attrTag}` + (g.qty > 1 ? ` (×${g.qty})` : '');
    const totalArea = +(g.areaM2 * g.qty).toFixed(3);
    const unitPrice = Math.round(glazArt[priceLevel] * totalGlassMultiplier + attrSurchargePerM2);
    allLines.push(tag({
      label, qty: totalArea.toFixed(2) + ' м²', qtyNum: totalArea, unit: 'м²',
      article: glazArt.article, unitPrice,
      price: Math.round(totalArea * unitPrice),
    }, 'glazing'));
  });
  // ── Phase 18+19: extra glass area for non-rectangular extensions
  if (isNonRect) {
    const rectGlassArea = w_m * h_m;
    const shapeGlassArea = (shapeGeo.glassArea / 1e6);
    const extraArea = +(shapeGlassArea - rectGlassArea).toFixed(3);
    if (extraArea > 0.01) {
      const unitPrice = Math.round(glazArt[priceLevel] * totalGlassMultiplier + attrSurchargePerM2);
      allLines.push(tag({
        label: `Стеклопакет доп. площадь (${shapeRow?.name || shape.kind})`,
        qty: extraArea.toFixed(2) + ' м²', qtyNum: extraArea, unit: 'м²',
        article: glazArt.article + '-EXT', unitPrice,
        price: Math.round(extraArea * unitPrice),
      }, 'glazing'));
    }
  }

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

  // ── Phase 7: door type lookup (used both for kit defaults and reinforcement factor below)
  const doorType = doorTypeId ? db.prepare('SELECT * FROM door_types WHERE id = ?').get(doorTypeId) : null;

  // ── Phase 2/7: Door hardware kit
  // Triggers for: distinct door sections (doorCount), OR sliding-portal door type
  // (slidingCount > 0 with doorType.code === 'sliding_portal')
  const isPortalDoor = doorType && doorType.code === 'sliding_portal' && slidingCount > 0;
  // For sliding portals, treat the whole sliding span as "doors" for hardware purposes
  const effectiveDoorCount = doorCount + (isPortalDoor ? slidingCount : 0);
  const effectiveDoorWidth = doorWidthTotal + (isPortalDoor ? slidingWidthTotal : 0);
  if (effectiveDoorCount > 0) {
    const dkOverride = doorKit || {};
    // Phase 7: door-type-aware defaults — only required_components are pre-filled
    let defaults;
    if (doorType && doorType.required_components) {
      let req = [];
      try { req = JSON.parse(doorType.required_components) || []; } catch {}
      const reqSet = new Set(req);
      // Choose the right component for this door type (firedoor/antipanic get specialized parts)
      const isFire = doorType.code === 'firedoor';
      const isAnti = doorType.code === 'antipanic';
      const isPortal = doorType.code === 'sliding_portal';
      const isStorefront = doorType.code === 'storefront';
      defaults = {
        lockId:       reqSet.has('lock')        ? 'dh-lock-bachok-dorma' : null,
        lockTongueId: reqSet.has('lock_tongue') ? 'dh-lock-tongue-dorma' : null,
        cylinderId:   reqSet.has('cylinder')    ? 'dh-cyl-dorma'         : null,
        hingeId:      reqSet.has('hinge')       ? 'dh-hinge-hn3303-sk'   : null,
        closerId:     reqSet.has('closer')      ? 'dh-closer-ts77-dorma' : null,
        thresholdId:  reqSet.has('threshold')   ? 'dh-thresh-55gold'     : null,
        strikeId:     reqSet.has('strike')      ? 'dh-strike-klong'      : null,
        rosetteId:    reqSet.has('rosette')     ? 'dh-rosette-sk'        : null,
        fixatorId:    reqSet.has('fixator')     ? 'dh-fixator-klong'     : null,
        handleKitId:  reqSet.has('handle_kit')  ? 'dh-handle-kit-sk'     : null,
        bottomBoltId: reqSet.has('bottom_bolt') ? 'dh-bottom-bolt'       : null,
        topBoltId:    reqSet.has('top_bolt')    ? 'dh-top-bolt'          : null,
        rollerId:     reqSet.has('roller')      ? 'dh-sl-roller'         : null,
        railId:       reqSet.has('rail')        ? 'dh-sl-rail'           : null,
      };
    } else {
      // Legacy default — full DORMA + K-LONG kit (matches the photo invoice)
      defaults = {
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
        bottomBoltId: null,
        topBoltId:    null,
        rollerId:     null,
        railId:       null,
      };
    }
    const selected = { ...defaults, ...dkOverride };
    // Allow caller to disable a specific component by passing null/false
    const dhRow = (id) => id ? db.prepare('SELECT * FROM door_hardware WHERE id = ?').get(id) : null;
    const dhLine = (row, qtyMultiplier = 1) => {
      if (!row) return;
      // qty: per-door * effectiveDoorCount * qtyMultiplier (threshold/rail use multiplier=width in m)
      const qty = row.unit === 'м'
        ? +(qtyMultiplier).toFixed(2)
        : +(row.qty_per_door * effectiveDoorCount * qtyMultiplier).toFixed(2);
      const unitPrice = Math.round(row.price * priceMultiplier(priceLevel));
      const colorTag = row.color_default ? (() => {
        const c = db.prepare('SELECT * FROM colors WHERE id = ?').get(row.color_default);
        return c ? ' · ' + c.ral : '';
      })() : '';
      allLines.push(tag({
        label: `${row.vendor} · ${row.name}${colorTag}` + (effectiveDoorCount > 1 ? ` (×${effectiveDoorCount} ${isPortalDoor ? 'створки' : 'двери'})` : ''),
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
    dhLine(dhRow(selected.bottomBoltId));
    dhLine(dhRow(selected.topBoltId));
    dhLine(dhRow(selected.rollerId));
    // Sliding rail — length = total door span × 2 (top+bottom rails)
    if (effectiveDoorWidth > 0 && selected.railId) dhLine(dhRow(selected.railId), effectiveDoorWidth * 2);
    // Threshold — length = sum of door widths in meters
    if (effectiveDoorWidth > 0) dhLine(dhRow(selected.thresholdId), effectiveDoorWidth);
  }

  // Reinforcement (steel inside profiles) — Phase 7+27-29: skip for aluminum/wood
  const reinfFactor = doorType ? Number(doorType.reinforcement_factor) || 1.0 : 1.0;
  const needsReinf = sys.needs_reinforcement !== 0;
  if (needsReinf) {
    const reinfLen = (framePerim + totalMullion + sashPerimTotal * 0.6) * reinfFactor;
    const reinfTag = doorType && reinfFactor !== 1.0 ? ` (${doorType.name}, ×${reinfFactor})` : '';
    allLines.push(tag(line('Армирование оцинк. сталь 1.5 мм' + reinfTag, reinfLen, 'м', art('REINF-1.5'), priceLevel), 'reinforcement'));
  } else if (sys.material_type === 'aluminum_warm') {
    // Tёплый алюминий — нужен термомост (полиамидная вставка)
    const tbLen = framePerim + totalMullion + sashPerimTotal;
    const tbPrice = Math.round(280 * priceMultiplier(priceLevel));
    allLines.push(tag({
      label: `Термомост полиамидный (для тёплого алюминия)`,
      qty: tbLen.toFixed(2) + ' м', qtyNum: +tbLen.toFixed(2), unit: 'м',
      article: 'TBR-AL', unitPrice: tbPrice, price: Math.round(tbLen * tbPrice),
    }, 'reinforcement'));
  } else if (sys.material_type === 'wood' || sys.material_type === 'wood_aluminum') {
    // Деревянным окнам нужно лаковое покрытие (за м² поверхности профиля)
    const surfaceArea = (framePerim + totalMullion + sashPerimTotal) * 0.4;  // ~400mm развёртка профиля
    const lacquerPrice = Math.round(450 * priceMultiplier(priceLevel));
    allLines.push(tag({
      label: 'Лак для дерева (3 слоя)',
      qty: surfaceArea.toFixed(2) + ' м²', qtyNum: +surfaceArea.toFixed(2), unit: 'м²',
      article: 'LACQUER-3X', unitPrice: lacquerPrice, price: Math.round(surfaceArea * lacquerPrice),
    }, 'consumables'));
  }

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

  // ── Phase 13: muntins (шпрос декоративный) — sum of horizontal + vertical bars per section
  let muntinTotalM = 0;
  let muntinSectionsCount = 0;
  layout.rows.forEach((row, ri) => {
    const rowHRel = rowHs[ri];
    const colRatios = normalize(row.sections, width, 'width_mm');
    row.sections.forEach((sec, ci) => {
      if (!sec.muntins) return;
      const mr = sec.muntins.rows || 0;
      const mc = sec.muntins.cols || 0;
      if (!mr && !mc) return;
      const sw_m = w_m * colRatios[ci];
      const code = sec.opening || 'FIX';
      const isFix = code === 'FIX' || code.endsWith('-FIX');
      const insetM = isFix ? 0.005 : sashFrameInset;
      const gW = Math.max(0, sw_m   - 2 * insetM);
      const gH = Math.max(0, rowHRel - 2 * insetM);
      muntinTotalM += mr * gW + mc * gH;
      muntinSectionsCount++;
    });
  });
  if (muntinTotalM > 0) {
    // Use sash bead price as a proxy (шпрос обычно из такого же штапика, тоньше — 18-25 мм)
    const beadPart = db.prepare("SELECT * FROM profile_parts WHERE system_id = ? AND kind = 'bead' LIMIT 1").get(systemId);
    const muntinUnitPrice = beadPart ? Math.round(beadPart.price_per_m * 1.4 * priceMultiplier(priceLevel)) : 1200;
    allLines.push(tag(applySurcharge({
      label: `Шпрос декоративный (${muntinSectionsCount} секц.)${colorTag}`,
      qty: muntinTotalM.toFixed(2) + ' м', qtyNum: +muntinTotalM.toFixed(2), unit: 'м',
      article: 'MUNTIN', unitPrice: muntinUnitPrice, price: Math.round(muntinTotalM * muntinUnitPrice),
    }, colorSurchargePct), 'profile'));
  }

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
    input: { width, height, layout, shape, glazingId, systemId, manufacturerId, installerId, priceLevel, extras, scope: [...scopeSet], colorId, hardwareKitId, handleId, handleColorId, doorKit, doorTypeId, turnProfile: !!input.turnProfile, frameAdapter: !!input.frameAdapter },
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
      doorTypeId: it.doorTypeId,
      turnProfile: it.turnProfile,
      frameAdapter: it.frameAdapter,
      shape: it.shape,
      glassAttributes: it.glassAttributes,
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

// ── Phase 10: stock-bar packing (раскрой по хлыстам).
// Default stock bar = 6500mm. Saw kerf = 4mm per cut.
// FFD (First-Fit-Decreasing): expand each bar by qty into individual cuts,
// sort by length descending, then place each into the first bar that fits.
// Returns: { stockLength, kerf, perProfile: [{ profileCode, profileName, color,
//   bars: [{ idx, used, waste, cuts: [{ posLabel, role, length }] }],
//   totalStockBars, totalUsedMm, totalWasteMm, efficiency }], summary: {...} }
export function packStockBars(cutBars, opts = {}) {
  const STOCK = opts.stockLength || 6500;
  const KERF = opts.kerf != null ? opts.kerf : 4;  // mm consumed by each saw cut

  // Group cuts by profileCode + color
  const byProfile = {};
  for (const b of cutBars) {
    const key = b.profileCode + '|' + (b.color || '');
    if (!byProfile[key]) {
      byProfile[key] = {
        profileCode: b.profileCode, profileName: b.profileName, color: b.color,
        cuts: [],
      };
    }
    // Expand by qty (each unit becomes a separate cut to be packed)
    for (let i = 0; i < b.qty; i++) {
      byProfile[key].cuts.push({
        posLabel: b.posLabel, role: b.role, length: b.lengthMm,
      });
    }
  }

  const perProfile = [];
  let summaryStockBars = 0;
  let summaryUsedMm = 0;
  let summaryWasteMm = 0;

  for (const grp of Object.values(byProfile)) {
    // Sort cuts longest first (FFD)
    grp.cuts.sort((a, b) => b.length - a.length);
    const bars = [];
    for (const cut of grp.cuts) {
      // Find first bar that fits
      let placed = false;
      for (const bar of bars) {
        const need = cut.length + (bar.cuts.length > 0 ? KERF : 0);
        if (bar.used + need <= STOCK) {
          if (bar.cuts.length > 0) bar.used += KERF;
          bar.cuts.push(cut);
          bar.used += cut.length;
          placed = true;
          break;
        }
      }
      if (!placed) {
        // Open a new bar
        bars.push({ idx: bars.length + 1, used: cut.length, cuts: [cut] });
      }
    }
    // Compute waste per bar
    bars.forEach(b => { b.waste = STOCK - b.used; });
    const totalUsed = bars.reduce((s, b) => s + b.used, 0);
    const totalWaste = bars.reduce((s, b) => s + b.waste, 0);
    perProfile.push({
      ...grp, bars,
      totalStockBars: bars.length,
      totalUsedMm: totalUsed,
      totalWasteMm: totalWaste,
      efficiency: bars.length > 0 ? +(totalUsed / (bars.length * STOCK) * 100).toFixed(1) : 100,
    });
    summaryStockBars += bars.length;
    summaryUsedMm += totalUsed;
    summaryWasteMm += totalWaste;
  }

  return {
    stockLength: STOCK, kerf: KERF, perProfile,
    summary: {
      totalStockBars: summaryStockBars,
      totalUsedMm: summaryUsedMm,
      totalWasteMm: summaryWasteMm,
      totalLengthM: +(summaryStockBars * STOCK / 1000).toFixed(2),
      efficiency: summaryStockBars > 0 ? +(summaryUsedMm / (summaryStockBars * STOCK) * 100).toFixed(1) : 100,
    },
  };
}

// ── Phase 12: Build per-glass-pack size list for an item layout.
// Returns: [{ posIdx, secLabel, widthMm, heightMm, formula, areaM2, isDoor }]
// Glass W/H = section size − 2×inset; inset = 70mm (sash) or 5mm (fixed).
export function buildGlassList(items) {
  const out = [];
  function normalize(arr, total, key) {
    const fixedSum = arr.reduce((s, x) => s + (x[key] || 0), 0);
    const ratioItems = arr.filter(x => !x[key]);
    const remaining = Math.max(0, total - fixedSum);
    const ratioSum = ratioItems.reduce((s, x) => s + (x.ratio ?? 1), 0) || 1;
    return arr.map(x => x[key] ? x[key] : remaining * (x.ratio ?? 1) / ratioSum);
  }
  items.forEach((it, idx) => {
    const layout = it.layout || { width: 1500, height: 1400, rows: [] };
    const itQty = it.qty || 1;
    const glaz = it.glazingId ? db.prepare('SELECT * FROM glazing WHERE id = ?').get(it.glazingId) : null;
    const formula = glaz ? glaz.formula : '4-10-4-10-4';
    const rowHs = normalize(layout.rows || [], layout.height, 'height_mm');
    layout.rows.forEach((row, ri) => {
      const rowH = rowHs[ri];
      const colWs = normalize(row.sections || [], layout.width, 'width_mm');
      row.sections.forEach((sec, ci) => {
        const sw = colWs[ci];
        const code = sec.opening || 'FIX';
        const isFix = code === 'FIX' || code.endsWith('-FIX');
        const isDoor = typeof code === 'string' && code.startsWith('ДВЕРЬ-');
        const inset = isFix ? 5 : 70;
        const gW = Math.max(0, Math.round(sw   - 2 * inset));
        const gH = Math.max(0, Math.round(rowH - 2 * inset));
        if (gW <= 0 || gH <= 0) return;
        out.push({
          posIdx: idx + 1,
          posLabel: `Поз:${String(idx + 1).padStart(3, '0')}`,
          secLabel: `Ряд ${ri + 1} · Секция ${ci + 1}`,
          openingCode: code,
          widthMm: gW, heightMm: gH,
          formula, areaM2: +(gW * gH / 1e6).toFixed(3),
          isDoor, isFix,
          qty: itQty,
        });
      });
    });
  });
  return out;
}

// ── Phase 8: Cut list (раскрой) — per-bar list for the factory saw.
// For each item/position, walks the layout and emits one entry per profile
// bar that needs to be cut, with length (mm), start/end miter angles, role,
// color, profile code. Frame bars are 45°/45° mitered; impost bars are
// 90°/90° (butted to the frame); sash bars are 45°/45°; bead bars are 45°.
//
// Length conventions (typical industrial PVC fabrication):
//   frame top/bottom = full width; frame left/right = full height
//   sash bars = sash perim sides (4 bars per opening)
//   mullion bars = full width (horizontal) or row height (vertical)
//   bead bars = 4 per glass (sash inset glass area)
//
// Returns: [{ posIdx, posLabel, role, profileCode, profileName, lengthMm,
//             startAngle, endAngle, color, qty, systemId }]
export function buildCutList(items) {
  const out = [];
  function partLookup(systemId, kind) {
    return db.prepare("SELECT * FROM profile_parts WHERE system_id = ? AND kind = ? LIMIT 1").get(systemId, kind);
  }
  function colorRal(colorId) {
    if (!colorId) return null;
    const c = db.prepare('SELECT ral, name FROM colors WHERE id = ?').get(colorId);
    return c ? c.ral : null;
  }
  items.forEach((it, idx) => {
    const layout = it.layout || { width: 1500, height: 1400, rows: [] };
    const W = layout.width;
    const H = layout.height;
    const itemQty = it.qty || 1;
    const posLabel = `Поз:${String(idx + 1).padStart(3, '0')}`;
    const color = colorRal(it.colorId);
    const sys = it.systemId || 'rehau-delight-70';

    const frame = partLookup(sys, 'frame');
    const sash  = partLookup(sys, 'sash');
    const mull  = partLookup(sys, 'mullion');
    const bead  = partLookup(sys, 'bead');
    const doorSash = partLookup(sys, 'door_sash');

    function emit(role, profile, lengthMm, qty, startAng = 45, endAng = 45) {
      if (!profile || lengthMm <= 0) return;
      out.push({
        posIdx: idx + 1, posLabel, role,
        profileCode: profile.code,
        profileName: profile.name,
        lengthMm: Math.round(lengthMm),
        startAngle: startAng, endAngle: endAng,
        color, qty: qty * itemQty, systemId: sys,
      });
    }

    // ── 1. Frame: 4 bars (top + bottom + left + right), 45°/45° miter
    if (frame) {
      emit('Рама верх',  frame, W, 1, 45, 45);
      emit('Рама низ',   frame, W, 1, 45, 45);
      emit('Рама лев.',  frame, H, 1, 45, 45);
      emit('Рама прав.', frame, H, 1, 45, 45);
    }

    // Compute row heights and column widths in mm
    function normalize(arr, total, key) {
      const fixedSum = arr.reduce((s, x) => s + (x[key] || 0), 0);
      const ratioItems = arr.filter(x => !x[key]);
      const remaining = Math.max(0, total - fixedSum);
      const ratioSum = ratioItems.reduce((s, x) => s + (x.ratio ?? 1), 0) || 1;
      return arr.map(x => x[key] ? x[key] : remaining * (x.ratio ?? 1) / ratioSum);
    }
    const rowHs = normalize(layout.rows || [], H, 'height_mm');

    // ── 2. Horizontal mullions (between rows): 1 bar per inter-row gap, length = W, 90°/90°
    for (let ri = 1; ri < layout.rows.length; ri++) {
      emit('Импост гор.', mull, W, 1, 90, 90);
    }

    // ── 3. Per-row: vertical mullions, sash bars, bead bars
    layout.rows.forEach((row, ri) => {
      const rowH = rowHs[ri];
      const colWs = normalize(row.sections || [], W, 'width_mm');
      // vertical mullions between sections
      for (let ci = 1; ci < row.sections.length; ci++) {
        emit('Импост верт.', mull, rowH, 1, 90, 90);
      }
      // sash + glass per section
      row.sections.forEach((sec, ci) => {
        const sw = colWs[ci];
        const code = sec.opening || 'FIX';
        const isFix = code === 'FIX' || code.endsWith('-FIX');
        const isDoor = typeof code === 'string' && code.startsWith('ДВЕРЬ-');
        const sashFrameInset = 70; // 70 mm typical
        if (!isFix) {
          // 4 sash bars per opening (top+bottom = sw, left+right = rowH)
          // Door uses door_sash profile if available
          const sashProfile = (isDoor && doorSash) ? doorSash : sash;
          emit('Створка верх ' + code,  sashProfile, sw,    1, 45, 45);
          emit('Створка низ ' + code,   sashProfile, sw,    1, 45, 45);
          emit('Створка лев. ' + code,  sashProfile, rowH,  1, 45, 45);
          emit('Створка прав. ' + code, sashProfile, rowH,  1, 45, 45);
          // Glass inset by sashFrameInset mm on each side
          const glassW = sw   - 2 * sashFrameInset;
          const glassH = rowH - 2 * sashFrameInset;
          if (glassW > 0 && glassH > 0 && bead) {
            emit('Штапик верх',  bead, glassW, 1, 45, 45);
            emit('Штапик низ',   bead, glassW, 1, 45, 45);
            emit('Штапик лев.',  bead, glassH, 1, 45, 45);
            emit('Штапик прав.', bead, glassH, 1, 45, 45);
          }
        } else {
          // Fixed glass — bead bars sized to the section minus 5mm tolerance per side
          const glassW = sw   - 10;
          const glassH = rowH - 10;
          if (glassW > 0 && glassH > 0 && bead) {
            emit('Штапик верх',  bead, glassW, 1, 45, 45);
            emit('Штапик низ',   bead, glassW, 1, 45, 45);
            emit('Штапик лев.',  bead, glassH, 1, 45, 45);
            emit('Штапик прав.', bead, glassH, 1, 45, 45);
          }
        }
      });
    });
  });
  // Sort by profile code, then length descending — matches saw-cut optimization
  out.sort((a, b) => a.profileCode.localeCompare(b.profileCode) || b.lengthMm - a.lengthMm);
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
