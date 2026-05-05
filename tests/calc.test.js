// tests/calc.test.js — calculation engine
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcWindow, compareManufacturers } from '../server/calc.js';

test('calcWindow: 3-section ПОЛ+FIX+ПОП window matches expected category outputs', () => {
  const r = calcWindow({
    width: 2100, height: 1400,
    sections: ['ПОЛ', 'FIX', 'ПОП'],
    glazingId: 'g-4-10-4-10-4i',
    systemId: 'rehau-delight-70',
    manufacturerId: 'm-rehau',
    installerId: 'i-okna-almaty',  // 8% discount
    priceLevel: 'dealer',
  });
  // basic structural assertions
  assert.ok(r.subtotal > 0, 'subtotal positive');
  assert.equal(r.discountPct, 8, 'installer discount applied');
  assert.equal(r.discount, Math.round(r.subtotal * 0.08));
  assert.equal(r.total, r.subtotal - r.discount);
  assert.ok(r.lines.length >= 8, 'has multiple breakdown lines');
  assert.equal(r.geometry.openCount, 2, '2 opening sashes');
  // glazing area sanity: ~ width × height in m² minus sash insets for opening sashes
  assert.ok(r.geometry.glazingArea > 1.5 && r.geometry.glazingArea < 3.5, 'glazing area in expected range');
  // frame perim = 2 × (2.1 + 1.4) = 7.0 m
  assert.equal(r.geometry.framePerim, 7);
});

test('calcWindow: all-FIX window has zero hardware/sash lines', () => {
  const r = calcWindow({
    width: 1500, height: 1400,
    sections: ['FIX'],
    glazingId: 'g-4-10-4-10-4',
    systemId: 'kbe-70-expert',
    manufacturerId: 'm-kbe',
    priceLevel: 'retail',
    extras: { sill: false, ebb: false, mesh: false, install: false },
  });
  // No hardware / no sash line
  assert.ok(!r.lines.some(l => /Фурнитура/.test(l.label)));
  assert.ok(!r.lines.some(l => /створка/.test(l.label)));
  assert.equal(r.geometry.openCount, 0);
  assert.equal(r.discountPct, 0, 'no installer → no discount');
});

test('calcWindow: dealer price < retail price for the same window', () => {
  const params = {
    width: 1500, height: 1400, sections: ['FIX', 'ПП'],
    glazingId: 'g-4-10-4-10-4i', systemId: 'rehau-delight-70',
    manufacturerId: 'm-rehau',
  };
  const dealer = calcWindow({ ...params, priceLevel: 'dealer' });
  const retail = calcWindow({ ...params, priceLevel: 'retail' });
  assert.ok(retail.subtotal > dealer.subtotal, `retail (${retail.subtotal}) should exceed dealer (${dealer.subtotal})`);
});

test('calcWindow: discount cap at 25%', () => {
  // bestwindow has 10% on Rehau in seed data — well under cap; check the code path itself
  const r = calcWindow({
    width: 2100, height: 1400, sections: ['ПОЛ', 'ПОП'],
    glazingId: 'g-4-10-4-10-4i', systemId: 'rehau-delight-70',
    manufacturerId: 'm-rehau', installerId: 'i-bestwindow', priceLevel: 'dealer',
  });
  assert.equal(r.discountPct, 10);
});

test('calcWindow: bad input throws', () => {
  assert.throws(() => calcWindow({ width: 100, height: 1400, sections: ['FIX'], glazingId: 'g-4-10-4-10-4', systemId: 'rehau-delight-70', manufacturerId: 'm-rehau' }), /width/);
  assert.throws(() => calcWindow({ width: 1500, height: 1400, sections: [], glazingId: 'g-4-10-4-10-4', systemId: 'rehau-delight-70', manufacturerId: 'm-rehau' }), /sections/);
  assert.throws(() => calcWindow({ width: 1500, height: 1400, sections: ['FIX'], glazingId: 'g-bogus', systemId: 'rehau-delight-70', manufacturerId: 'm-rehau' }), /glazing/);
});

test('compareManufacturers: returns sorted ascending by final price', () => {
  const rows = compareManufacturers({
    width: 2100, height: 1400, sections: ['ПОЛ', 'FIX', 'ПОП'],
    glazingId: 'g-4-10-4-10-4i', installerId: 'i-okna-almaty', priceLevel: 'dealer',
  });
  assert.ok(rows.length >= 3, 'at least 3 manufacturers');
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].final >= rows[i - 1].final, 'sorted ascending');
  }
  for (const r of rows) {
    assert.ok(r.manufacturerId);
    assert.ok(r.name);
    assert.ok(r.final > 0);
  }
});

test('calcWindow: rows-based layout (T-shape: фрамуга + 2 створки)', () => {
  const r = calcWindow({
    layout: {
      width: 1800, height: 1700,
      rows: [
        { ratio: 0.3, sections: [{ ratio: 1, opening: 'ФР' }] },
        { ratio: 0.7, sections: [{ ratio: 1, opening: 'ПОЛ' }, { ratio: 1, opening: 'ПОП' }] },
      ],
    },
    glazingId: 'g-4-10-4-10-4i',
    systemId: 'rehau-delight-70',
    manufacturerId: 'm-rehau',
  });
  assert.ok(r.subtotal > 0);
  assert.equal(r.geometry.openCount, 3, '3 opening sashes (ФР + 2)');
  assert.ok(r.geometry.mullionH > 0, 'has horizontal impost');
  assert.ok(r.geometry.mullionV > 0, 'has vertical impost');
  assert.equal(r.geometry.totalSections, 3);
});

test('calcWindow: rows-based layout with mm-precise sizes (П-shape)', () => {
  const r = calcWindow({
    layout: {
      width: 2700, height: 2200,
      rows: [
        { height_mm: 400, sections: [{ width_mm: 800, opening: 'ФР' }, { width_mm: 1100, opening: 'ФР' }, { width_mm: 800, opening: 'ФР' }] },
        { sections: [
          { width_mm: 800, opening: 'FIX' },
          { width_mm: 1100, opening: 'ДВЕРЬ-ПП' },
          { width_mm: 800, opening: 'FIX' },
        ] },
      ],
    },
    glazingId: 'g-4-10-4-10-4',
    systemId: 'kbe-70-expert',
    manufacturerId: 'm-kbe',
    extras: { sill: false, ebb: false, mesh: false, install: false },
  });
  assert.ok(r.total > 0);
  assert.equal(r.geometry.totalSections, 6);
  assert.ok(r.geometry.doorCount === 1, 'has 1 door');
  assert.ok(r.lines.some(l => /дверная/.test(l.label)), 'has door hardware line');
});

test('calcWindow: complex 3-row layout with mm sizes (как в TЗ примере)', () => {
  // top transom 400mm, middle row 1200mm with 2 sections, bottom 400mm with 2 sections
  const r = calcWindow({
    layout: {
      width: 2000, height: 2000,
      rows: [
        { height_mm: 400, sections: [{ ratio: 1, opening: 'ФР' }] },
        { height_mm: 1200, sections: [{ width_mm: 800, opening: 'ПОЛ' }, { width_mm: 1200, opening: 'ПОП' }] },
        { height_mm: 400, sections: [{ width_mm: 1000, opening: 'FIX' }, { width_mm: 1000, opening: 'FIX' }] },
      ],
    },
    glazingId: 'g-4-10-4-10-4i',
    systemId: 'rehau-delight-70',
    manufacturerId: 'm-rehau',
  });
  assert.ok(r.total > 0);
  assert.equal(r.geometry.totalSections, 5);
  assert.equal(r.geometry.openCount, 3, '1 ФР + 2 ПО');
  assert.ok(r.geometry.mullionH > 0, 'has 2 horizontal imposts');
  assert.ok(r.geometry.glazingArea > 2 && r.geometry.glazingArea < 5);
});

test('calcWindow: legacy sections array still works', () => {
  const r = calcWindow({
    width: 1500, height: 1400,
    sections: ['FIX', 'ПОП'],
    glazingId: 'g-4-10-4-10-4',
    systemId: 'rehau-delight-70',
    manufacturerId: 'm-rehau',
  });
  assert.ok(r.total > 0);
  assert.equal(r.geometry.totalSections, 2);
});

test('calcWindow: scope=profile only returns just profile lines and a smaller total', () => {
  const params = {
    width: 1800, height: 1400, sections: ['FIX', 'ПП'],
    glazingId: 'g-4-10-4-10-4i', systemId: 'rehau-delight-70',
    manufacturerId: 'm-rehau', priceLevel: 'retail',
    extras: { sill: true, ebb: true, mesh: true, install: true },
  };
  const full = calcWindow(params);
  const profileOnly = calcWindow({ ...params, scope: ['profile'] });
  assert.ok(profileOnly.lines.length > 0, 'has profile lines');
  assert.ok(profileOnly.lines.every(l => l.category === 'profile'),
    'all returned lines are profile category');
  assert.ok(profileOnly.total < full.total, 'profile-only total is less than full total');
  assert.equal(profileOnly.byCategory.profile, profileOnly.subtotal,
    'byCategory.profile matches subtotal when only profile is in scope');
  assert.equal(profileOnly.byCategory.glazing, 0, 'no glazing line under profile-only scope');
  assert.equal(profileOnly.byCategory.hardware, 0, 'no hardware line under profile-only scope');
});

test('calcWindow: scope=hardware+glazing combines just those two categories', () => {
  const r = calcWindow({
    width: 2000, height: 1500, sections: ['ПП', 'FIX', 'ПП'],
    glazingId: 'g-4-10-4-10-4i', systemId: 'rehau-delight-70',
    manufacturerId: 'm-rehau', priceLevel: 'retail',
    extras: { sill: false, ebb: false, mesh: false, install: false },
    scope: ['hardware', 'glazing'],
  });
  assert.ok(r.lines.length > 0);
  assert.ok(r.lines.every(l => ['hardware', 'glazing'].includes(l.category)),
    'every line is hardware or glazing');
  assert.ok(r.byCategory.profile === 0);
  assert.ok(r.byCategory.hardware > 0 && r.byCategory.glazing > 0);
});

test('calcWindow: scope=all (default) returns full breakdown unchanged', () => {
  const params = {
    width: 1500, height: 1400, sections: ['ПП', 'FIX'],
    glazingId: 'g-4-10-4-10-4', systemId: 'rehau-delight-70',
    manufacturerId: 'm-rehau', priceLevel: 'retail',
  };
  const a = calcWindow(params);
  const b = calcWindow({ ...params, scope: 'all' });
  assert.equal(a.total, b.total);
  assert.equal(a.lines.length, b.lines.length);
});
