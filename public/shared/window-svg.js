// window-svg.js — schematic window/door drawer with full row × col grid model.
//
// Layout shape (canonical):
//   {
//     width: 2100, height: 1400,                     // mm, total
//     rows: [
//       { ratio: 0.3, sections: [ { ratio: 1, opening: 'ФР' } ] },                                  // row 1: full-width transom
//       { ratio: 0.7, sections: [ { ratio: 0.3, opening: 'ПОЛ' }, { ratio: 0.4, opening: 'ДВЕРЬ-ПП' }, { ratio: 0.3, opening: 'ПОП' } ] },  // row 2: door in middle
//     ],
//   }
//
// `ratio` is normalized within its parent. Sums don't have to equal 1.0 — they are auto-normalized.
// Opening codes:
//   FIX, ПЛ, ПП, ОТК, ПОЛ, ПОП, ФР  — windows
//   ДВЕРЬ-ПЛ, ДВЕРЬ-ПП, ДВЕРЬ-FIX  — doors (taller styling, knob mark)

(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const DOOR_PREFIX = 'ДВЕРЬ';
  const SLIDING_PREFIX = 'РАЗД';

  function el(tag, attrs = {}, children = []) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue;
      e.setAttribute(k, v);
    }
    for (const c of children) e.appendChild(c);
    return e;
  }

  function isOpen(code) { return code !== 'FIX' && !code.endsWith('-FIX'); }
  function isDoor(code) { return typeof code === 'string' && code.startsWith(DOOR_PREFIX); }
  function isSliding(code) { return typeof code === 'string' && code.startsWith(SLIDING_PREFIX); }

  function openingMark(code, sx, sy, sw, sh) {
    const stroke = '#2a2a2a', sw2 = 1.2;
    const cx = sx + sw / 2, cy = sy + sh / 2;
    const g = el('g');
    function line(x1, y1, x2, y2, opts = {}) {
      g.appendChild(el('line', { x1, y1, x2, y2, stroke, 'stroke-width': sw2, ...opts }));
    }
    function poly(points, opts = {}) {
      g.appendChild(el('polyline', { points, fill: 'none', stroke, 'stroke-width': sw2, ...opts }));
    }
    // sliding sash — show horizontal arrow inside FIX-like rect
    if (isSliding(code)) {
      // crossed FIX lines + arrow
      line(sx + 4, sy + 4, sx + sw - 4, sy + sh - 4, { opacity: 0.18 });
      line(sx + sw - 4, sy + 4, sx + 4, sy + sh - 4, { opacity: 0.18 });
      const dir = code === 'РАЗД-Л' ? -1 : (code === 'РАЗД-П' ? 1 : 0);
      const arrowY = cy;
      if (dir !== 0) {
        line(sx + 8, arrowY, sx + sw - 8, arrowY);
        const tipX = dir > 0 ? sx + sw - 8 : sx + 8;
        const baseX = tipX - dir * 6;
        poly(`${baseX},${arrowY - 4} ${tipX},${arrowY} ${baseX},${arrowY + 4}`);
      } else {
        // center-parting (РАЗД-ЦП): two arrows pointing outward
        line(sx + 8, arrowY, sx + sw - 8, arrowY);
        poly(`${sx + 14},${arrowY - 4} ${sx + 8},${arrowY} ${sx + 14},${arrowY + 4}`);
        poly(`${sx + sw - 14},${arrowY - 4} ${sx + sw - 8},${arrowY} ${sx + sw - 14},${arrowY + 4}`);
      }
      return g;
    }

    // strip door prefix for shape selection
    const c = isDoor(code) ? code.replace(/^ДВЕРЬ-/, '') : code;
    if (c === 'FIX' || c === '') {
      line(sx + 4, sy + 4, sx + sw - 4, sy + sh - 4, { opacity: 0.45 });
      line(sx + sw - 4, sy + 4, sx + 4, sy + sh - 4, { opacity: 0.45 });
    } else if (c === 'ПЛ') {
      poly(`${sx + sw - 4},${sy + 4} ${sx + 4},${cy} ${sx + sw - 4},${sy + sh - 4}`);
    } else if (c === 'ПП') {
      poly(`${sx + 4},${sy + 4} ${sx + sw - 4},${cy} ${sx + 4},${sy + sh - 4}`);
    } else if (c === 'ОТК') {
      poly(`${sx + 4},${sy + sh - 4} ${cx},${sy + 4} ${sx + sw - 4},${sy + sh - 4}`);
    } else if (c === 'ПОЛ') {
      poly(`${sx + sw - 4},${sy + 4} ${sx + 4},${cy} ${sx + sw - 4},${sy + sh - 4}`);
      poly(`${sx + 4},${sy + sh - 4} ${cx},${sy + 4} ${sx + sw - 4},${sy + sh - 4}`, { 'stroke-dasharray': '3 2' });
    } else if (c === 'ПОП') {
      poly(`${sx + 4},${sy + 4} ${sx + sw - 4},${cy} ${sx + 4},${sy + sh - 4}`);
      poly(`${sx + 4},${sy + sh - 4} ${cx},${sy + 4} ${sx + sw - 4},${sy + sh - 4}`, { 'stroke-dasharray': '3 2' });
    } else if (c === 'ФР') {
      poly(`${sx + 4},${sy + 4} ${cx},${sy + sh - 4} ${sx + sw - 4},${sy + 4}`);
    }
    // Door knob hint
    if (isDoor(code)) {
      const knobSide = c === 'ПП' ? sx + sw - 8 : sx + 8;
      g.appendChild(el('circle', { cx: knobSide, cy: cy, r: 1.6, fill: stroke }));
    }
    return g;
  }

  // Normalize an array of {ratio?, width_mm?, height_mm?}.
  // If at least one item specifies mm, uses mm (proportionally distributing remaining space to ratio-only items).
  // Returns normalized fractions summing to 1.
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

  // Convert legacy `sections: ['ПОЛ','FIX','ПОП']` into a single-row layout.
  function legacyToLayout(sections, width = 2100, height = 1400) {
    return {
      width, height,
      rows: [{ ratio: 1, sections: sections.map(opening => ({ ratio: 1, opening })) }],
    };
  }

  /**
   * Render a window/door layout as SVG.
   * @param {object} opts
   * @param {number} [opts.w=280] — outer SVG width (px)
   * @param {number} [opts.h=200] — outer SVG height (px)
   * @param {object} [opts.layout] — { width, height, rows: [...] }
   * @param {string[]} [opts.sections] — legacy single-row mode
   * @param {number} [opts.w_mm] — used when in legacy mode
   * @param {number} [opts.h_mm]
   * @param {boolean} [opts.showDims]
   * @param {string|number|null} [opts.highlight] — id of section to highlight (for editor) — `${rowIdx}:${colIdx}`
   * @param {function} [opts.onPick] — callback(rowIdx, colIdx) when user clicks a section
   */
  function WindowSchema(opts = {}) {
    let {
      w = 280, h = 200, layout,
      sections, w_mm = 2100, h_mm = 1400,
      showDims = true,
      frameColor = '#3a3a3a', sashColor = '#5a5a5a',
      glassColor = 'rgba(160, 200, 220, 0.18)',
      highlightColor = '#b56b3a',
      highlight = null, onPick = null,
    } = opts;

    // Coerce legacy
    if (!layout && sections) layout = legacyToLayout(sections, w_mm, h_mm);
    if (!layout) layout = legacyToLayout(['FIX'], w_mm, h_mm);
    const totalW = layout.width || w_mm;
    const totalH = layout.height || h_mm;

    const padRight = showDims ? 50 : 12;  // wide enough for 4-digit '1800мм' label
    const padBot = showDims ? 32 : 12;
    const padTop = showDims ? 22 : 12;
    const padLeft = showDims ? 12 : 12;
    const innerW = w - padLeft - padRight;
    const innerH = h - padTop - padBot;
    const frameT = 10;
    const impostT = 6;

    const rowRatios = normalize(layout.rows, totalH, 'height_mm');
    const cavW = innerW - frameT * 2;
    const cavH = innerH - frameT * 2 - impostT * (layout.rows.length - 1);

    const svg = el('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, style: 'display:block;background:transparent' });

    // outer frame
    svg.appendChild(el('rect', { x: padLeft, y: padTop, width: innerW, height: innerH, fill: frameColor, rx: 2 }));

    // Track per-row Y positions and per-section x positions for dim labels
    let yCursor = padTop + frameT;
    const rowsLaid = [];
    layout.rows.forEach((row, ri) => {
      const rowH = cavH * rowRatios[ri];
      const colRatios = normalize(row.sections, totalW, 'width_mm');
      let xCursor = padLeft + frameT;
      const cavRowW = cavW - impostT * (row.sections.length - 1);
      const colsLaid = [];
      row.sections.forEach((sec, ci) => {
        const sw = cavRowW * colRatios[ci];
        const sx = xCursor;
        const sy = yCursor;
        const sh = rowH;
        const code = sec.opening || 'FIX';
        const isHighlighted = highlight === `${ri}:${ci}`;

        // sash frame
        svg.appendChild(el('rect', { x: sx, y: sy, width: sw, height: sh, fill: sashColor }));
        // glass
        svg.appendChild(el('rect', {
          x: sx + 4, y: sy + 4, width: sw - 8, height: sh - 8,
          fill: glassColor, stroke: 'rgba(0,0,0,0.25)', 'stroke-width': 0.5,
        }));
        // opening mark
        svg.appendChild(openingMark(code, sx + 4, sy + 4, sw - 8, sh - 8));

        // ── Phase 13: muntins (декоративный шпрос внутри стеклопакета)
        if (sec.muntins && (sec.muntins.rows > 0 || sec.muntins.cols > 0)) {
          const mr = sec.muntins.rows || 0;
          const mc = sec.muntins.cols || 0;
          const gx = sx + 4, gy = sy + 4, gw = sw - 8, gh = sh - 8;
          // horizontal bars
          for (let i = 1; i <= mr; i++) {
            const yy = gy + gh * i / (mr + 1);
            svg.appendChild(el('line', { x1: gx, y1: yy, x2: gx + gw, y2: yy, stroke: '#fff', 'stroke-width': 2.5 }));
            svg.appendChild(el('line', { x1: gx, y1: yy, x2: gx + gw, y2: yy, stroke: '#9a9a9a', 'stroke-width': 1 }));
          }
          // vertical bars
          for (let i = 1; i <= mc; i++) {
            const xx = gx + gw * i / (mc + 1);
            svg.appendChild(el('line', { x1: xx, y1: gy, x2: xx, y2: gy + gh, stroke: '#fff', 'stroke-width': 2.5 }));
            svg.appendChild(el('line', { x1: xx, y1: gy, x2: xx, y2: gy + gh, stroke: '#9a9a9a', 'stroke-width': 1 }));
          }
        }

        // highlight overlay (for selected section in editor)
        if (isHighlighted) {
          svg.appendChild(el('rect', {
            x: sx + 1.5, y: sy + 1.5, width: sw - 3, height: sh - 3,
            fill: 'none', stroke: highlightColor, 'stroke-width': 2.5, rx: 2,
            'pointer-events': 'none',
          }));
        }

        // click target
        if (onPick) {
          const hit = el('rect', { x: sx, y: sy, width: sw, height: sh, fill: 'transparent', style: 'cursor:pointer' });
          hit.addEventListener('click', () => onPick(ri, ci, sec));
          svg.appendChild(hit);
        }

        colsLaid.push({ x: sx, w: sw, sec });
        xCursor += sw + impostT;
      });
      rowsLaid.push({ y: yCursor, h: rowH, cols: colsLaid });
      yCursor += rowH + impostT;
    });

    if (showDims) {
      const dim = el('g', { 'font-family': "ui-monospace, 'SF Mono', monospace", 'font-size': 9, fill: '#6b6b6b' });
      // top width
      const topY = padTop - 8;
      dim.appendChild(el('line', { x1: padLeft, y1: topY, x2: padLeft + innerW, y2: topY, stroke: '#9a9a9a', 'stroke-width': 0.7 }));
      dim.appendChild(el('line', { x1: padLeft, y1: topY - 4, x2: padLeft, y2: topY + 4, stroke: '#9a9a9a', 'stroke-width': 0.7 }));
      dim.appendChild(el('line', { x1: padLeft + innerW, y1: topY - 4, x2: padLeft + innerW, y2: topY + 4, stroke: '#9a9a9a', 'stroke-width': 0.7 }));
      const tw = el('text', { x: padLeft + innerW / 2, y: topY - 5, 'text-anchor': 'middle', fill: '#3a3a3a', 'font-weight': 600 });
      tw.textContent = totalW; dim.appendChild(tw);
      // right height
      const rx = padLeft + innerW + 14;
      dim.appendChild(el('line', { x1: rx, y1: padTop, x2: rx, y2: padTop + innerH, stroke: '#9a9a9a', 'stroke-width': 0.7 }));
      dim.appendChild(el('line', { x1: rx - 4, y1: padTop, x2: rx + 4, y2: padTop, stroke: '#9a9a9a', 'stroke-width': 0.7 }));
      dim.appendChild(el('line', { x1: rx - 4, y1: padTop + innerH, x2: rx + 4, y2: padTop + innerH, stroke: '#9a9a9a', 'stroke-width': 0.7 }));
      const th = el('text', { x: rx + 4, y: padTop + innerH / 2 + 3, fill: '#3a3a3a', 'font-weight': 600 });
      th.textContent = totalH; dim.appendChild(th);
      // per-row height labels (right side, smaller)
      if (layout.rows.length > 1) {
        rowsLaid.forEach(r => {
          const t = el('text', { x: rx - 24, y: r.y + r.h / 2 + 3, fill: '#9a9a9a', 'font-size': 8, 'text-anchor': 'end' });
          t.textContent = Math.round(totalH * r.h / cavH) + 'мм';
          dim.appendChild(t);
        });
      }
      // per-column width labels for the widest row (bottom)
      const widest = rowsLaid.reduce((a, b) => a.cols.length >= b.cols.length ? a : b, rowsLaid[0]);
      widest.cols.forEach(c => {
        const t = el('text', { x: c.x + c.w / 2, y: padTop + innerH + 14, 'text-anchor': 'middle', fill: '#6b6b6b' });
        t.textContent = Math.round(totalW * c.w / cavW);
        dim.appendChild(t);
      });
      svg.appendChild(dim);
    }
    return svg;
  }

  // Tiny opening-type glyph for picker (also supports doors and sliders).
  function MiniOpeningGlyph(code, color = '#1f1d1a') {
    const svg = el('svg', { width: 20, height: 20, viewBox: '0 0 20 20' });
    const s = { stroke: color, 'stroke-width': 1.4, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    svg.appendChild(el('rect', { x: 2, y: 2, width: 16, height: 16, ...s }));
    if (isSliding(code)) {
      if (code === 'РАЗД-П') {
        svg.appendChild(el('line', { x1: 5, y1: 10, x2: 15, y2: 10, ...s }));
        svg.appendChild(el('polyline', { points: '12,7 15,10 12,13', ...s }));
      } else if (code === 'РАЗД-Л') {
        svg.appendChild(el('line', { x1: 5, y1: 10, x2: 15, y2: 10, ...s }));
        svg.appendChild(el('polyline', { points: '8,7 5,10 8,13', ...s }));
      } else {
        // РАЗД-ЦП — two outward arrows
        svg.appendChild(el('line', { x1: 5, y1: 10, x2: 15, y2: 10, ...s }));
        svg.appendChild(el('polyline', { points: '8,7 5,10 8,13', ...s }));
        svg.appendChild(el('polyline', { points: '12,7 15,10 12,13', ...s }));
      }
      return svg;
    }
    const c = isDoor(code) ? code.replace(/^ДВЕРЬ-/, '') : code;
    if (c === 'ПЛ') svg.appendChild(el('polyline', { points: '16,3 4,10 16,17', ...s }));
    if (c === 'ПП') svg.appendChild(el('polyline', { points: '4,3 16,10 4,17', ...s }));
    if (c === 'ОТК') svg.appendChild(el('polyline', { points: '4,17 10,3 16,17', ...s }));
    if (c === 'ПОЛ') {
      svg.appendChild(el('polyline', { points: '16,3 4,10 16,17', ...s }));
      svg.appendChild(el('polyline', { points: '4,17 10,3 16,17', ...s, 'stroke-dasharray': '2 2' }));
    }
    if (c === 'ПОП') {
      svg.appendChild(el('polyline', { points: '4,3 16,10 4,17', ...s }));
      svg.appendChild(el('polyline', { points: '4,17 10,3 16,17', ...s, 'stroke-dasharray': '2 2' }));
    }
    if (c === 'ФР') svg.appendChild(el('polyline', { points: '4,3 10,17 16,3', ...s }));
    if (isDoor(code)) {
      const cx = c === 'ПП' ? 16 : 4;
      svg.appendChild(el('circle', { cx, cy: 10, r: 0.9, fill: color }));
    }
    return svg;
  }

  // ── Window TEMPLATES (Топ окон) ────────────────────────────────────────
  // Each template returns a fresh layout. Sizes are in mm.
  const WINDOW_TEMPLATES = [
    {
      id: 'fix-1',
      name: 'Глухое окно',
      sub: '1 секция · без открывания',
      width: 1200, height: 1400,
      build: () => ({ width: 1200, height: 1400, rows: [{ ratio: 1, sections: [{ ratio: 1, opening: 'FIX' }] }] }),
    },
    {
      id: 'po-1',
      name: 'Одностворчатое',
      sub: 'поворотно-откидное',
      width: 900, height: 1400,
      build: () => ({ width: 900, height: 1400, rows: [{ ratio: 1, sections: [{ ratio: 1, opening: 'ПОЛ' }] }] }),
    },
    {
      id: 'po-2',
      name: 'Двухстворчатое',
      sub: 'FIX + ПОП',
      width: 1500, height: 1400,
      build: () => ({ width: 1500, height: 1400, rows: [{ ratio: 1, sections: [{ ratio: 1, opening: 'FIX' }, { ratio: 1, opening: 'ПОП' }] }] }),
    },
    {
      id: 'po-3',
      name: 'Трёхстворчатое',
      sub: 'ПОЛ + FIX + ПОП',
      width: 2100, height: 1400,
      build: () => ({ width: 2100, height: 1400, rows: [{ ratio: 1, sections: [{ ratio: 1, opening: 'ПОЛ' }, { ratio: 1, opening: 'FIX' }, { ratio: 1, opening: 'ПОП' }] }] }),
    },
    {
      id: 'balcony',
      name: 'Балконный блок',
      sub: 'окно + дверь',
      width: 2200, height: 2150,
      build: () => ({
        width: 2200, height: 2150,
        rows: [{
          ratio: 1,
          sections: [
            { ratio: 1.4, opening: 'FIX' },
            { ratio: 0.8, opening: 'ДВЕРЬ-ПП' },
          ],
        }],
      }),
    },
    {
      id: 't-shape',
      name: 'Т-образное',
      sub: 'фрамуга + 2 створки',
      width: 1800, height: 1700,
      build: () => ({
        width: 1800, height: 1700,
        rows: [
          { ratio: 0.3, sections: [{ ratio: 1, opening: 'ФР' }] },
          { ratio: 0.7, sections: [{ ratio: 1, opening: 'ПОЛ' }, { ratio: 1, opening: 'ПОП' }] },
        ],
      }),
    },
    {
      id: 'p-shape',
      name: 'П-образное',
      sub: 'дверь + окна по бокам',
      width: 2700, height: 2200,
      build: () => ({
        width: 2700, height: 2200,
        rows: [
          { ratio: 0.25, sections: [{ ratio: 1, opening: 'ФР' }, { ratio: 0.9, opening: 'ФР' }, { ratio: 1, opening: 'ФР' }] },
          { ratio: 0.75, sections: [
            { ratio: 1, opening: 'FIX' },
            { ratio: 0.9, opening: 'ДВЕРЬ-ПП' },
            { ratio: 1, opening: 'FIX' },
          ] },
        ],
      }),
    },
    {
      id: 'panoramic',
      name: 'Панорамное',
      sub: 'большое глухое',
      width: 3000, height: 1800,
      build: () => ({ width: 3000, height: 1800, rows: [{ ratio: 1, sections: [{ ratio: 1, opening: 'FIX' }] }] }),
    },
    {
      id: 'storefront',
      name: 'Витраж',
      sub: '4 секции',
      width: 4000, height: 2400,
      build: () => ({
        width: 4000, height: 2400,
        rows: [{ ratio: 1, sections: [
          { ratio: 1, opening: 'FIX' },
          { ratio: 1, opening: 'ПОЛ' },
          { ratio: 1, opening: 'ПОП' },
          { ratio: 1, opening: 'FIX' },
        ] }],
      }),
    },
    {
      id: 'door',
      name: 'Входная одностворчатая',
      sub: 'правое открывание',
      category: 'door',
      doorType: 'dt-entrance',
      width: 900, height: 2100,
      build: () => ({ width: 900, height: 2100, rows: [{ ratio: 1, sections: [{ ratio: 1, opening: 'ДВЕРЬ-ПП' }] }] }),
    },
    {
      id: 'door-balcony',
      name: 'Балконная',
      sub: 'упрощённая фурнитура',
      category: 'door',
      doorType: 'dt-balcony',
      width: 800, height: 2100,
      build: () => ({ width: 800, height: 2100, rows: [{ ratio: 1, sections: [{ ratio: 1, opening: 'ДВЕРЬ-ПП' }] }] }),
    },
    {
      id: 'door-shtulp',
      name: 'Двойная штульповая',
      sub: 'для широких проёмов',
      category: 'door',
      doorType: 'dt-shtulp',
      width: 1600, height: 2100,
      build: () => ({ width: 1600, height: 2100, rows: [{ ratio: 1, sections: [
        { ratio: 1, opening: 'ДВЕРЬ-ШТЛ' }, { ratio: 1, opening: 'ДВЕРЬ-ШТП' },
      ] }] }),
    },
    {
      id: 'door-double',
      name: 'Двустворчатая распашная',
      sub: 'без штульпа',
      category: 'door',
      doorType: 'dt-double',
      width: 1800, height: 2100,
      build: () => ({ width: 1800, height: 2100, rows: [{ ratio: 1, sections: [
        { ratio: 1, opening: 'ДВЕРЬ-ПЛ' }, { ratio: 1, opening: 'ДВЕРЬ-ПП' },
      ] }] }),
    },
    {
      id: 'door-terrace',
      name: 'Террасная',
      sub: 'выход на террасу/веранду',
      category: 'door',
      doorType: 'dt-terrace',
      width: 900, height: 2200,
      build: () => ({ width: 900, height: 2200, rows: [{ ratio: 1, sections: [{ ratio: 1, opening: 'ДВЕРЬ-ПП' }] }] }),
    },
    {
      id: 'door-storefront',
      name: 'Витражная (магазин)',
      sub: 'вход в магазин/салон',
      category: 'door',
      doorType: 'dt-storefront',
      width: 1000, height: 2400,
      build: () => ({ width: 1000, height: 2400, rows: [
        { ratio: 0.18, sections: [{ ratio: 1, opening: 'FIX' }] },         // верхний свет
        { ratio: 0.82, sections: [{ ratio: 1, opening: 'ДВЕРЬ-ПП' }] },
      ] }),
    },
    {
      id: 'door-swing',
      name: 'Маятниковая',
      sub: 'двусторонняя (кафе/общепит)',
      category: 'door',
      doorType: 'dt-swing',
      width: 900, height: 2100,
      build: () => ({ width: 900, height: 2100, rows: [{ ratio: 1, sections: [{ ratio: 1, opening: 'ДВЕРЬ-МАЯТ' }] }] }),
    },
    {
      id: 'door-french',
      name: 'Французская двустворчатая',
      sub: 'от пола до потолка, 2 створки',
      category: 'door',
      doorType: 'dt-french',
      width: 1400, height: 2400,
      build: () => ({ width: 1400, height: 2400, rows: [{ ratio: 1, sections: [
        { ratio: 1, opening: 'ДВЕРЬ-ПЛ' }, { ratio: 1, opening: 'ДВЕРЬ-ПП' },
      ] }] }),
    },
    {
      id: 'door-portal',
      name: 'Раздвижной портал',
      sub: 'Roto Patio Inowa',
      category: 'door',
      doorType: 'dt-portal',
      width: 2400, height: 2200,
      build: () => ({ width: 2400, height: 2200, rows: [{ ratio: 1, sections: [
        { ratio: 1, opening: 'РАЗД-Л' }, { ratio: 1, opening: 'РАЗД-П' },
      ] }] }),
    },
    {
      id: 'french',
      name: 'Французское окно',
      sub: 'от пола до потолка',
      width: 1200, height: 2400,
      build: () => ({
        width: 1200, height: 2400,
        rows: [
          { ratio: 0.6, sections: [{ ratio: 1, opening: 'ПОЛ' }, { ratio: 1, opening: 'ПОП' }] },
          { ratio: 0.4, sections: [{ ratio: 1, opening: 'FIX' }, { ratio: 1, opening: 'FIX' }] },
        ],
      }),
    },
    {
      id: 'door-window',
      name: 'Дверь + фрамуга',
      sub: 'входная с верхним светом',
      width: 1100, height: 2400,
      build: () => ({
        width: 1100, height: 2400,
        rows: [
          { ratio: 0.2, sections: [{ ratio: 1, opening: 'ФР' }] },
          { ratio: 0.8, sections: [{ ratio: 1, opening: 'ДВЕРЬ-ПП' }] },
        ],
      }),
    },
    {
      id: 'sliding-door',
      name: 'Раздвижная дверь',
      sub: '2-створчатая',
      width: 2400, height: 2200,
      build: () => ({
        width: 2400, height: 2200,
        rows: [{ ratio: 1, sections: [
          { ratio: 1, opening: 'РАЗД-Л' }, { ratio: 1, opening: 'РАЗД-П' },
        ] }],
      }),
    },
    {
      id: 'sliding-portal',
      name: 'Раздвижной портал',
      sub: '4-створчатый',
      width: 4000, height: 2400,
      build: () => ({
        width: 4000, height: 2400,
        rows: [{ ratio: 1, sections: [
          { ratio: 1, opening: 'РАЗД-Л' }, { ratio: 1, opening: 'РАЗД-Л' },
          { ratio: 1, opening: 'РАЗД-П' }, { ratio: 1, opening: 'РАЗД-П' },
        ] }],
      }),
    },
    {
      id: 'panoramic-wall',
      name: 'Панорамная стена',
      sub: 'окно во всю стену',
      width: 5000, height: 2700,
      build: () => ({
        width: 5000, height: 2700,
        rows: [
          { ratio: 0.7, sections: [{ ratio: 1, opening: 'FIX' }, { ratio: 1, opening: 'FIX' }, { ratio: 1, opening: 'FIX' }] },
          { ratio: 0.3, sections: [{ ratio: 1, opening: 'РАЗД-Л' }, { ratio: 1, opening: 'РАЗД-П' }] },
        ],
      }),
    },
    {
      id: 'storefront-large',
      name: 'Витраж большой',
      sub: 'фасад с дверью',
      width: 6000, height: 3000,
      build: () => ({
        width: 6000, height: 3000,
        rows: [
          { ratio: 0.25, sections: [{ ratio: 1, opening: 'ФР' }, { ratio: 1, opening: 'ФР' }, { ratio: 1, opening: 'ФР' }, { ratio: 1, opening: 'ФР' }] },
          { ratio: 0.75, sections: [
            { ratio: 1.2, opening: 'FIX' },
            { ratio: 1, opening: 'ДВЕРЬ-ПП' },
            { ratio: 1.2, opening: 'FIX' },
            { ratio: 1, opening: 'FIX' },
          ] },
        ],
      }),
    },
    {
      id: 'sliding-balcony',
      name: 'Раздвижное остекление',
      sub: 'балкон / лоджия',
      width: 6000, height: 1500,
      build: () => ({
        width: 6000, height: 1500,
        rows: [{ ratio: 1, sections: Array.from({ length: 6 }, (_, i) => ({
          ratio: 1, opening: i < 3 ? 'РАЗД-Л' : 'РАЗД-П',
        })) }],
      }),
    },
  ];

  // Helpers usable by both renderer and editor
  function clone(layout) { return JSON.parse(JSON.stringify(layout)); }
  function totalSections(layout) {
    return layout.rows.reduce((s, r) => s + r.sections.length, 0);
  }
  function flattenSections(layout) {
    const out = [];
    layout.rows.forEach((r, ri) => r.sections.forEach((s, ci) => out.push({ ri, ci, sec: s })));
    return out;
  }

  // Auto-classify templates that don't have an explicit category:
  // 'door' = layout contains ДВЕРЬ-* section, 'mixed' = some sections are doors, 'window' otherwise
  WINDOW_TEMPLATES.forEach(t => {
    if (t.category) return;
    const sample = t.build();
    let doorSec = 0, totalSec = 0;
    sample.rows.forEach(r => r.sections.forEach(s => {
      totalSec++;
      if (s.opening && (s.opening.startsWith('ДВЕРЬ-') || s.opening.startsWith('РАЗД-'))) doorSec++;
    }));
    t.category = doorSec === 0 ? 'window' : (doorSec === totalSec ? 'door' : 'mixed');
  });

  // ── Phase 11: WindowSection — schematic cross-section view of frame+sash+glass
  // Renders a horizontal slice through frame/sash/glazing with chambers, seals, reinforcement.
  // opts: { w, h, depth (mm system depth, default 70), glazingDepth (sum of layers, default 32),
  //         frameWidth (default 70), sashWidth (default 76), seals: true, label: 'Рама + створка' }
  function WindowSection(opts = {}) {
    const w = opts.w || 460;
    const h = opts.h || 220;
    const depth = opts.depth || 70;
    const glazingDepth = opts.glazingDepth || 32;
    const frameW = opts.frameWidth || depth;
    const sashW = opts.sashWidth || (depth + 6);
    const showSeals = opts.seals !== false;
    const label = opts.label || 'Профиль (сечение)';

    const svg = el('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${w} ${h}`, width: w, height: h });
    // background
    svg.appendChild(el('rect', { x: 0, y: 0, width: w, height: h, fill: '#f5f2ec' }));

    // Layout: frame on left, then sash, then glazing on right
    const margin = 20;
    const baseY = h * 0.25;
    const baseH = h * 0.5;
    const scale = Math.min((w - margin * 2) / (frameW + sashW + 40 + 60), 2.6);

    let cursorX = margin;

    // Frame profile (multi-chamber PVC) — drawn as 5 horizontal chambers
    function drawProfile(label_, profileWmm, profileDepthMm, color) {
      const pw = profileWmm * scale;
      const pd = profileDepthMm * scale * 1.5; // emphasize visually
      // outer outline
      svg.appendChild(el('rect', { x: cursorX, y: baseY, width: pw, height: pd,
        fill: color, stroke: '#3a3a3a', 'stroke-width': 1 }));
      // chambers (5)
      const chN = 5;
      for (let i = 0; i < chN; i++) {
        const chx = cursorX + 3 + (pw - 6) * i / chN;
        const chw = (pw - 6) / chN - 1;
        svg.appendChild(el('rect', { x: chx, y: baseY + 4, width: chw, height: pd - 8,
          fill: 'rgba(255,255,255,0.55)', stroke: '#7a7060', 'stroke-width': 0.4 }));
      }
      // steel reinforcement
      const reinfX = cursorX + pw / 2 - 6, reinfY = baseY + pd / 2 - 4;
      svg.appendChild(el('rect', { x: reinfX, y: reinfY, width: 12, height: 8,
        fill: '#777', stroke: '#222', 'stroke-width': 0.5 }));
      // label
      const txt = el('text', { x: cursorX + pw / 2, y: baseY + pd + 14, 'text-anchor': 'middle',
        'font-family': "ui-monospace, 'SF Mono', monospace", 'font-size': 9, fill: '#3a3a3a' });
      txt.textContent = label_;
      svg.appendChild(txt);
      // dim line above
      const txt2 = el('text', { x: cursorX + pw / 2, y: baseY - 6, 'text-anchor': 'middle',
        'font-family': "ui-monospace, 'SF Mono', monospace", 'font-size': 9, fill: '#7a756c' });
      txt2.textContent = profileWmm + ' мм';
      svg.appendChild(txt2);
      return pw;
    }

    const fW = drawProfile('Рама', frameW, depth, '#e8e1d0');
    cursorX += fW + 4 * scale;

    // External seal (CON 02) between frame and sash (small bead)
    if (showSeals) {
      svg.appendChild(el('circle', { cx: cursorX - 2 * scale, cy: baseY + baseH * 0.5, r: 2.5,
        fill: '#222', stroke: '#000', 'stroke-width': 0.4 }));
      const sealLbl = el('text', { x: cursorX - 2 * scale, y: baseY - 18, 'text-anchor': 'middle',
        'font-family': "ui-monospace, 'SF Mono', monospace", 'font-size': 8, fill: '#b56b3a' });
      sealLbl.textContent = 'CON 02';
      svg.appendChild(sealLbl);
    }

    // Sash profile
    const sW = drawProfile('Створка', sashW, depth + 6, '#e8e1d0');
    cursorX += sW + 4 * scale;

    // Central seal (CON 05)
    if (showSeals) {
      svg.appendChild(el('circle', { cx: cursorX - 2 * scale, cy: baseY + baseH * 0.5, r: 2.5,
        fill: '#222', stroke: '#000', 'stroke-width': 0.4 }));
      const sealLbl = el('text', { x: cursorX - 2 * scale, y: baseY - 18, 'text-anchor': 'middle',
        'font-family': "ui-monospace, 'SF Mono', monospace", 'font-size': 8, fill: '#b56b3a' });
      sealLbl.textContent = 'CON 05';
      svg.appendChild(sealLbl);
    }

    // Glazing — draw 2 chambers of glass
    const gd = glazingDepth * scale * 1.5;
    const gx = cursorX, gy = baseY;
    const gh = depth * scale * 1.5;
    // 4 mm glass + spacer + 4 mm glass + spacer + 4 mm glass (5 layers for 4-10-4-10-4)
    const layers = (() => {
      const formula = opts.glazingFormula || '4-10-4-10-4';
      const parts = formula.replace(/\D+/g, ' ').trim().split(/\s+/).map(Number);
      return parts.length ? parts : [4, 10, 4, 10, 4];
    })();
    const layerSum = layers.reduce((s, x) => s + x, 0);
    let gxx = gx;
    layers.forEach((mm, i) => {
      const lw = (mm / layerSum) * gd;
      const isGlass = i % 2 === 0;
      svg.appendChild(el('rect', { x: gxx, y: gy, width: lw, height: gh,
        fill: isGlass ? 'rgba(170,210,225,0.8)' : 'rgba(220,210,180,0.7)',
        stroke: '#5a7a8a', 'stroke-width': 0.4 }));
      gxx += lw;
    });
    // glazing label
    const glabel = el('text', { x: gx + gd / 2, y: gy + gh + 14, 'text-anchor': 'middle',
      'font-family': "ui-monospace, 'SF Mono', monospace", 'font-size': 9, fill: '#3a3a3a' });
    glabel.textContent = opts.glazingFormula || '4-10-4-10-4';
    svg.appendChild(glabel);
    const glabel2 = el('text', { x: gx + gd / 2, y: gy - 6, 'text-anchor': 'middle',
      'font-family': "ui-monospace, 'SF Mono', monospace", 'font-size': 9, fill: '#7a756c' });
    glabel2.textContent = layerSum + ' мм';
    svg.appendChild(glabel2);
    cursorX += gd + 4 * scale;

    // Bead seal (штапик) on the right of glazing
    if (showSeals) {
      svg.appendChild(el('rect', { x: cursorX, y: baseY + 6, width: 6 * scale, height: gh - 12,
        fill: '#e8e1d0', stroke: '#3a3a3a', 'stroke-width': 0.6 }));
      const txt = el('text', { x: cursorX + 3 * scale, y: baseY + gh + 14, 'text-anchor': 'middle',
        'font-family': "ui-monospace, 'SF Mono', monospace", 'font-size': 9, fill: '#3a3a3a' });
      txt.textContent = 'Штапик';
      svg.appendChild(txt);
    }

    // Title
    const title = el('text', { x: w / 2, y: 14, 'text-anchor': 'middle',
      'font-family': 'Inter, system-ui, sans-serif', 'font-size': 11, 'font-weight': 600, fill: '#3a3a3a' });
    title.textContent = label;
    svg.appendChild(title);

    return svg;
  }

  // ── Phase 17: WindowIsometric — axonometric (3D-like) view of the window
  // Uses parallel projection (no perspective) — works without three.js, renders to SVG.
  function WindowIsometric(opts = {}) {
    const w = opts.w || 320;
    const h = opts.h || 240;
    const layout = opts.layout || { width: 1200, height: 1400, rows: [{ sections: [{ opening: 'FIX' }] }] };
    const depth = opts.depth || 70;       // профиль глубина в мм
    const angle = opts.angle || 30;       // angle for axonometric Y-axis
    const aspect = (layout.width || 1) / (layout.height || 1);

    const svg = el('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${w} ${h}`, width: w, height: h });
    svg.appendChild(el('rect', { x: 0, y: 0, width: w, height: h, fill: '#f5f2ec' }));

    // Compute size on screen — layout fits in left part with some breathing room
    const padding = 30;
    const drawW = (w - padding * 2) * 0.8;
    const drawH = drawW / aspect;
    const x0 = padding;
    const y0 = (h - drawH) / 2 + 4;
    // Depth offset (parallel projection)
    const dscale = drawW / (layout.width || 1) * depth * 2; // exaggerate depth for visibility
    const dx = dscale * Math.cos(angle * Math.PI / 180);
    const dy = -dscale * Math.sin(angle * Math.PI / 180);

    // Back face (rear of window) — lighter
    svg.appendChild(el('rect', { x: x0 + dx, y: y0 + dy, width: drawW, height: drawH,
      fill: '#dceaf0', stroke: '#7a8a9a', 'stroke-width': 0.6 }));
    // Top/right/bottom/left "depth" panels (4 connecting parallelograms)
    function poly(pts, fill, stroke = '#5a5a5a') {
      const e = el('polygon', { points: pts.map(p => p.join(',')).join(' '),
        fill, stroke, 'stroke-width': 0.6 });
      svg.appendChild(e);
    }
    // top
    poly([
      [x0, y0], [x0 + drawW, y0],
      [x0 + drawW + dx, y0 + dy], [x0 + dx, y0 + dy],
    ], '#9a9a9a');
    // right
    poly([
      [x0 + drawW, y0], [x0 + drawW, y0 + drawH],
      [x0 + drawW + dx, y0 + drawH + dy], [x0 + drawW + dx, y0 + dy],
    ], '#7a7a7a');
    // bottom
    poly([
      [x0, y0 + drawH], [x0 + drawW, y0 + drawH],
      [x0 + drawW + dx, y0 + drawH + dy], [x0 + dx, y0 + drawH + dy],
    ], '#5a5a5a');
    // left
    poly([
      [x0, y0], [x0, y0 + drawH],
      [x0 + dx, y0 + drawH + dy], [x0 + dx, y0 + dy],
    ], '#8a8a8a');

    // Front face — full layout schematic
    function normalizeR(arr, total, key) {
      const fixedSum = arr.reduce((s, x) => s + (x[key] || 0), 0);
      const ratioItems = arr.filter(x => !x[key]);
      const remaining = Math.max(0, total - fixedSum);
      const ratioSum = ratioItems.reduce((s, x) => s + (x.ratio ?? 1), 0) || 1;
      return arr.map(x => x[key] ? x[key] / total : (remaining * (x.ratio ?? 1) / ratioSum) / total);
    }
    const rowRatios = normalizeR(layout.rows || [], layout.height, 'height_mm');
    let yCur = y0 + 3;
    layout.rows.forEach((row, ri) => {
      const rowH = drawH * rowRatios[ri] - 3;
      const colRatios = normalizeR(row.sections, layout.width, 'width_mm');
      let xCur = x0 + 3;
      row.sections.forEach((sec, ci) => {
        const sw = drawW * colRatios[ci] - 3;
        // sash frame
        svg.appendChild(el('rect', { x: xCur, y: yCur, width: sw, height: rowH,
          fill: '#5a5a5a' }));
        // glass
        svg.appendChild(el('rect', { x: xCur + 2, y: yCur + 2, width: sw - 4, height: rowH - 4,
          fill: 'rgba(170,210,225,0.85)', stroke: '#7a8a9a', 'stroke-width': 0.5 }));
        const code = sec.opening || 'FIX';
        const isFix = code === 'FIX' || code.endsWith('-FIX');
        // simple opening glyph
        if (!isFix) {
          const cx = xCur + sw / 2, cy = yCur + rowH / 2;
          if (code.includes('Л') && !code.includes('ОП')) {
            const p = el('polyline', { points: `${xCur + sw - 4},${yCur + 3} ${xCur + 3},${cy} ${xCur + sw - 4},${yCur + rowH - 3}`,
              stroke: '#2a2a2a', 'stroke-width': 0.7, fill: 'none' });
            svg.appendChild(p);
          } else {
            const p = el('polyline', { points: `${xCur + 3},${yCur + 3} ${xCur + sw - 4},${cy} ${xCur + 3},${yCur + rowH - 3}`,
              stroke: '#2a2a2a', 'stroke-width': 0.7, fill: 'none' });
            svg.appendChild(p);
          }
        }
        xCur += sw + 3;
      });
      yCur += rowH + 3;
    });

    // Frame outline (front)
    svg.appendChild(el('rect', { x: x0, y: y0, width: drawW, height: drawH,
      fill: 'none', stroke: '#2a2a2a', 'stroke-width': 1.4 }));

    // Title
    const title = el('text', { x: w / 2, y: 14, 'text-anchor': 'middle',
      'font-family': 'Inter, system-ui, sans-serif', 'font-size': 11, 'font-weight': 600, fill: '#3a3a3a' });
    title.textContent = '3D Изометрия · ' + layout.width + '×' + layout.height + '×' + depth + ' мм';
    svg.appendChild(title);

    return svg;
  }

  window.WindowSchema = WindowSchema;
  window.WindowSection = WindowSection;
  window.WindowIsometric = WindowIsometric;
  window.MiniOpeningGlyph = MiniOpeningGlyph;
  window.WINDOW_TEMPLATES = WINDOW_TEMPLATES;
  window.WindowLayout = { clone, totalSections, flattenSections, normalize, isDoor, isOpen, legacyToLayout };
})();
