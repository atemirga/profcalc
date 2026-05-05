// server/shapes.js — Shape geometry: path generators, perimeters, area calc, bar lists.
// Each shape returns: { svgPath, framePerim, framePerimStraight, framePerimArched,
//                       glassArea, bars: [{kind, role, length, angles, radius?}] }
//
// kind = 'straight' | 'arched' (preformed, sold per arc-meter) | 'curved' (bent on site)

const PI = Math.PI;

// Ramanujan elliptic perimeter approximation (good to 10⁻⁵)
function ellipsePerim(a, b) {
  const h = ((a - b) / (a + b)) ** 2;
  return PI * (a + b) * (1 + 3 * h / (10 + Math.sqrt(4 - 3 * h)));
}

// ── Rectangle (default, 4 straight bars) ─────────────────────────────
export function shapeRectangle({ width: w, height: h }) {
  return {
    svgPath: `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`,
    framePerim: 2 * (w + h),
    framePerimStraight: 2 * (w + h),
    framePerimArched: 0,
    glassArea: w * h,
    bars: [
      { kind: 'straight', role: 'верх',  length: w, angles: [45, 45] },
      { kind: 'straight', role: 'низ',   length: w, angles: [45, 45] },
      { kind: 'straight', role: 'лев.',  length: h, angles: [45, 45] },
      { kind: 'straight', role: 'прав.', length: h, angles: [45, 45] },
    ],
  };
}

// ── Arched (rectangular base + elliptical arch on top) ───────────────
export function shapeArched({ width: w, height: h, arch_rise = 400 }) {
  const rectH = Math.max(0, h - arch_rise);
  const arcLen = ellipsePerim(w / 2, arch_rise) / 2; // half ellipse = top arch
  const archArea = PI * (w / 2) * arch_rise / 2;     // half ellipse area
  return {
    svgPath: `M 0 ${h} L 0 ${rectH} A ${w / 2} ${arch_rise} 0 0 1 ${w} ${rectH} L ${w} ${h} Z`,
    framePerim: 2 * rectH + w + arcLen,
    framePerimStraight: 2 * rectH + w,
    framePerimArched: arcLen,
    glassArea: w * rectH + archArea,
    bars: [
      { kind: 'straight', role: 'низ',   length: w,     angles: [90, 90] },
      { kind: 'straight', role: 'лев.',  length: rectH, angles: [90, 90] },
      { kind: 'straight', role: 'прав.', length: rectH, angles: [90, 90] },
      { kind: 'arched',   role: 'арка',  length: arcLen, radius: w / 2, rise: arch_rise, angles: [0, 0] },
    ],
  };
}

// ── Half-circle (полукруг) — full semicircle, no rectangular base ────
export function shapeHalfCircle({ width: w, height: h }) {
  // Diameter = w; height ignored (forced to w/2). Could also take radius directly.
  const r = w / 2;
  const arcLen = PI * r;
  return {
    svgPath: `M 0 ${r} L 0 ${r} A ${r} ${r} 0 0 1 ${w} ${r} L ${w} ${r} Z`,
    framePerim: w + arcLen,
    framePerimStraight: w,
    framePerimArched: arcLen,
    glassArea: PI * r * r / 2,
    bars: [
      { kind: 'straight', role: 'низ',  length: w,      angles: [90, 90] },
      { kind: 'arched',   role: 'арка', length: arcLen, radius: r, rise: r, angles: [0, 0] },
    ],
  };
}

// ── Triangle ─────────────────────────────────────────────────────────
export function shapeTriangle({ width: w, height: h, apex_x = null }) {
  const ax = apex_x != null ? apex_x : w / 2;
  // Vertices: (0, h) bottom-left, (w, h) bottom-right, (ax, 0) apex
  const leftLen  = Math.hypot(ax, h);
  const rightLen = Math.hypot(w - ax, h);
  // Internal angles
  const angA = Math.atan2(h, ax) * 180 / PI;             // bottom-left to apex
  const angB = Math.atan2(h, w - ax) * 180 / PI;         // bottom-right to apex
  const angApex = 180 - angA - angB;                      // at the apex
  // Cut angles — half of internal angle at each vertex (mirror miter)
  const cutBottomL = angA / 2;
  const cutBottomR = angB / 2;
  const cutApexL = angApex / 2;
  const cutApexR = angApex / 2;
  return {
    svgPath: `M 0 ${h} L ${ax} 0 L ${w} ${h} Z`,
    framePerim: w + leftLen + rightLen,
    framePerimStraight: w + leftLen + rightLen,
    framePerimArched: 0,
    glassArea: 0.5 * w * h,
    bars: [
      { kind: 'straight', role: 'низ',  length: w,        angles: [cutBottomL, cutBottomR] },
      { kind: 'straight', role: 'лев.', length: leftLen,  angles: [cutBottomL, cutApexL] },
      { kind: 'straight', role: 'прав.',length: rightLen, angles: [cutBottomR, cutApexR] },
    ],
  };
}

// ── Trapezoid (asymmetric: left side ≠ right side height) ───────────
export function shapeTrapezoid({ width: w, height: h, left_h = null, right_h = null }) {
  const lh = left_h != null ? left_h : h;
  const rh = right_h != null ? right_h : h;
  // Vertices: (0, lh)=top-left, (w, rh)=top-right, (w, h)=bottom-right, (0, h)=bottom-left
  const topLen = Math.hypot(w, rh - lh);
  // Cut angles at each corner
  const slope = Math.atan2(rh - lh, w) * 180 / PI;
  return {
    svgPath: `M 0 ${lh} L ${w} ${rh} L ${w} ${h} L 0 ${h} Z`,
    framePerim: topLen + (h - rh) + w + (h - lh),
    framePerimStraight: topLen + (h - rh) + w + (h - lh),
    framePerimArched: 0,
    glassArea: 0.5 * w * (2 * h - lh - rh),
    bars: [
      { kind: 'straight', role: 'низ',  length: w,           angles: [90, 90] },
      { kind: 'straight', role: 'лев.', length: h - lh,      angles: [90, 90 - slope] },
      { kind: 'straight', role: 'прав.',length: h - rh,      angles: [90 + slope, 90] },
      { kind: 'straight', role: 'верх (скос)', length: topLen, angles: [90 - slope, 90 + slope] },
    ],
  };
}

// ── Gothic (pointed arch — стрельчатая) ──────────────────────────────
export function shapeGothic({ width: w, height: h, arch_rise = 500, peak_offset = 0 }) {
  const rectH = h - arch_rise;
  // Two arc segments meeting at peak (offset from center horizontally)
  const peakX = w / 2 + peak_offset;
  // Approximate arc length as 1.7× chord (pointed arch is shorter than half-circle)
  const arcSeg = Math.hypot(w / 2, arch_rise) * 1.6;
  const totalArc = arcSeg * 2;
  return {
    svgPath: `M 0 ${h} L 0 ${rectH}
              Q ${w / 4} 0 ${peakX} 0
              Q ${3 * w / 4} 0 ${w} ${rectH}
              L ${w} ${h} Z`,
    framePerim: 2 * rectH + w + totalArc,
    framePerimStraight: 2 * rectH + w,
    framePerimArched: totalArc,
    glassArea: w * rectH + 0.5 * w * arch_rise * 0.85,
    bars: [
      { kind: 'straight', role: 'низ',   length: w,     angles: [90, 90] },
      { kind: 'straight', role: 'лев.',  length: rectH, angles: [90, 90] },
      { kind: 'straight', role: 'прав.', length: rectH, angles: [90, 90] },
      { kind: 'arched',   role: 'арка лев.',  length: arcSeg, radius: w, rise: arch_rise, angles: [0, 0] },
      { kind: 'arched',   role: 'арка прав.', length: arcSeg, radius: w, rise: arch_rise, angles: [0, 0] },
    ],
  };
}

// ── Pentagon (5-sided, "house" outline) ──────────────────────────────
export function shapePentagon({ width: w, height: h, peak_h = 300 }) {
  const rectH = h - peak_h;
  const sideLen = Math.hypot(w / 2, peak_h);
  return {
    svgPath: `M 0 ${h} L 0 ${rectH} L ${w / 2} 0 L ${w} ${rectH} L ${w} ${h} Z`,
    framePerim: 2 * rectH + w + 2 * sideLen,
    framePerimStraight: 2 * rectH + w + 2 * sideLen,
    framePerimArched: 0,
    glassArea: w * rectH + 0.5 * w * peak_h,
    bars: [
      { kind: 'straight', role: 'низ',         length: w,       angles: [90, 90] },
      { kind: 'straight', role: 'лев.',        length: rectH,   angles: [90, 90] },
      { kind: 'straight', role: 'прав.',       length: rectH,   angles: [90, 90] },
      { kind: 'straight', role: 'верх лев.',   length: sideLen, angles: [90, 60] },
      { kind: 'straight', role: 'верх прав.',  length: sideLen, angles: [60, 90] },
    ],
  };
}

// ── Hexagon ──────────────────────────────────────────────────────────
export function shapeHexagon({ width: w, height: h, side_h = null }) {
  const sh = side_h != null ? side_h : h * 0.25;
  const midH = h - 2 * sh;
  const sideLen = Math.hypot(w / 2, sh);
  return {
    svgPath: `M 0 ${h - sh} L ${w / 2} ${h} L ${w} ${h - sh}
              L ${w} ${sh} L ${w / 2} 0 L 0 ${sh} Z`,
    framePerim: 2 * midH + 4 * sideLen,
    framePerimStraight: 2 * midH + 4 * sideLen,
    framePerimArched: 0,
    glassArea: w * midH + w * sh,  // approximate
    bars: [
      { kind: 'straight', role: 'верх лев.',  length: sideLen, angles: [60, 60] },
      { kind: 'straight', role: 'верх прав.', length: sideLen, angles: [60, 60] },
      { kind: 'straight', role: 'прав.',      length: midH,    angles: [60, 60] },
      { kind: 'straight', role: 'низ прав.',  length: sideLen, angles: [60, 60] },
      { kind: 'straight', role: 'низ лев.',   length: sideLen, angles: [60, 60] },
      { kind: 'straight', role: 'лев.',       length: midH,    angles: [60, 60] },
    ],
  };
}

// ── Oval (full ellipse) ──────────────────────────────────────────────
export function shapeOval({ width: w, height: h }) {
  const a = w / 2, b = h / 2;
  const perim = ellipsePerim(a, b);
  return {
    svgPath: `M 0 ${b}
              A ${a} ${b} 0 0 1 ${w} ${b}
              A ${a} ${b} 0 0 1 0 ${b} Z`,
    framePerim: perim,
    framePerimStraight: 0,
    framePerimArched: perim,
    glassArea: PI * a * b,
    bars: [
      { kind: 'arched', role: 'овал верх',  length: perim / 2, radius: Math.max(a, b), rise: b, angles: [0, 0] },
      { kind: 'arched', role: 'овал низ',   length: perim / 2, radius: Math.max(a, b), rise: b, angles: [0, 0] },
    ],
  };
}

// ── Circle ───────────────────────────────────────────────────────────
export function shapeCircle({ width: w }) {
  const r = w / 2;
  const perim = 2 * PI * r;
  return {
    svgPath: `M 0 ${r}
              A ${r} ${r} 0 0 1 ${w} ${r}
              A ${r} ${r} 0 0 1 0 ${r} Z`,
    framePerim: perim,
    framePerimStraight: 0,
    framePerimArched: perim,
    glassArea: PI * r * r,
    bars: [
      { kind: 'arched', role: 'круг верх', length: perim / 2, radius: r, rise: r, angles: [0, 0] },
      { kind: 'arched', role: 'круг низ',  length: perim / 2, radius: r, rise: r, angles: [0, 0] },
    ],
  };
}

// ── Quarter circle ───────────────────────────────────────────────────
export function shapeQuarterCircle({ width: w, height: h }) {
  const r = Math.min(w, h);
  const arcLen = PI * r / 2;
  return {
    svgPath: `M 0 ${h} L 0 ${h - r} A ${r} ${r} 0 0 1 ${r} ${h} Z`,
    framePerim: 2 * r + arcLen,
    framePerimStraight: 2 * r,
    framePerimArched: arcLen,
    glassArea: PI * r * r / 4,
    bars: [
      { kind: 'straight', role: 'низ',   length: r,      angles: [90, 90] },
      { kind: 'straight', role: 'лев.',  length: r,      angles: [90, 90] },
      { kind: 'arched',   role: 'арка',  length: arcLen, radius: r, rise: r, angles: [0, 0] },
    ],
  };
}

// ── Free polygon (custom vertices) ───────────────────────────────────
export function shapePolygon({ vertices = [] }) {
  if (vertices.length < 3) return shapeRectangle({ width: 1200, height: 1800 });
  // Bars: edge between each pair of consecutive vertices
  const bars = [];
  for (let i = 0; i < vertices.length; i++) {
    const [x1, y1] = vertices[i];
    const [x2, y2] = vertices[(i + 1) % vertices.length];
    const len = Math.hypot(x2 - x1, y2 - y1);
    bars.push({ kind: 'straight', role: `сторона ${i + 1}`, length: len, angles: [60, 60] });
  }
  // Shoelace formula for area
  let area = 0;
  for (let i = 0; i < vertices.length; i++) {
    const [x1, y1] = vertices[i];
    const [x2, y2] = vertices[(i + 1) % vertices.length];
    area += x1 * y2 - x2 * y1;
  }
  area = Math.abs(area) / 2;
  const perim = bars.reduce((s, b) => s + b.length, 0);
  const path = 'M ' + vertices.map(v => v.join(' ')).join(' L ') + ' Z';
  return {
    svgPath: path,
    framePerim: perim, framePerimStraight: perim, framePerimArched: 0,
    glassArea: area, bars,
  };
}

// ── Dispatcher ───────────────────────────────────────────────────────
const SHAPE_FUNCTIONS = {
  rectangle: shapeRectangle,
  arched: shapeArched,
  half_circle: shapeHalfCircle,
  triangle: shapeTriangle,
  trapezoid: shapeTrapezoid,
  gothic: shapeGothic,
  pentagon: shapePentagon,
  hexagon: shapeHexagon,
  oval: shapeOval,
  circle: shapeCircle,
  quarter_circle: shapeQuarterCircle,
  polygon: shapePolygon,
};

/**
 * Compute geometry for a shape — universal entry point.
 * @param {object} shape  { kind: 'arched', width, height, params: { arch_rise } }
 * @returns {object}      { svgPath, framePerim, framePerimStraight, framePerimArched, glassArea, bars }
 */
export function shapeGeometry(shape) {
  if (!shape || !shape.kind) return shapeRectangle(shape || { width: 1200, height: 1400 });
  const fn = SHAPE_FUNCTIONS[shape.kind] || shapeRectangle;
  return fn({ width: shape.width || 1200, height: shape.height || 1400, ...(shape.params || {}) });
}

export const SHAPE_KINDS = Object.keys(SHAPE_FUNCTIONS);
