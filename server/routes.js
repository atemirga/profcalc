// server/routes.js — REST API for admin + mini-app
import express from 'express';
import db, { logEvent } from './db.js';
import { calcWindow, compareManufacturers, calcProject, CATEGORIES, CATEGORY_LABELS } from './calc.js';
import { verifyInitData } from './telegram-auth.js';
import { buildKpPdf } from './pdf.js';

const BOT_TOKEN = process.env.BOT_TOKEN || '8674981496:AAFCDyX7K_oW9WvHO36Mo8cSadeUSeIIkbI';

export const api = express.Router();
api.use(express.json({ limit: '1mb' }));

// ─── tiny middleware to identify mini-app caller via initData ────────────
api.use((req, res, next) => {
  const initData = req.header('X-Telegram-Init-Data');
  if (initData) {
    const v = verifyInitData(initData, BOT_TOKEN);
    if (v && v.user) {
      req.tgUser = v.user;
      // ensure installer record exists for known authors
      const inst = db.prepare('SELECT * FROM installers WHERE telegram_id = ?').get(v.user.id);
      if (inst) req.installer = inst;
    }
  }
  next();
});

// dev shortcut: ?as=<installer_id> impersonates a seeded installer (for the prototype/UI test path)
api.use((req, res, next) => {
  if (!req.installer && req.query.as) {
    const inst = db.prepare('SELECT * FROM installers WHERE id = ?').get(String(req.query.as));
    if (inst) req.installer = inst;
  }
  next();
});

// ── catalog ─────────────────────────────────────────────────────────────
api.get('/profile-systems', (_, res) => {
  res.json(db.prepare('SELECT * FROM profile_systems').all());
});

api.get('/glazing', (_, res) => {
  res.json(db.prepare('SELECT * FROM glazing').all());
});

api.get('/manufacturers', (_, res) => {
  const rows = db.prepare('SELECT * FROM manufacturers').all();
  res.json(rows.map(r => ({ ...r, systems: JSON.parse(r.systems) })));
});

api.post('/manufacturers', (req, res) => {
  const { id, name, region, systems = [], rating = 4.5, status = 'active' } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'id and name required' });
  db.prepare(`INSERT INTO manufacturers (id,name,region,systems,rating,status) VALUES (?,?,?,?,?,?)`)
    .run(id, name, region || '', JSON.stringify(systems), rating, status);
  logEvent('admin', 'manufacturer.create', id);
  res.json({ ok: true });
});

api.put('/manufacturers/:id', (req, res) => {
  const { name, region, systems, rating, status } = req.body;
  const cur = db.prepare('SELECT * FROM manufacturers WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  db.prepare(`UPDATE manufacturers SET name=?,region=?,systems=?,rating=?,status=? WHERE id=?`).run(
    name ?? cur.name, region ?? cur.region,
    systems ? JSON.stringify(systems) : cur.systems,
    rating ?? cur.rating, status ?? cur.status, req.params.id,
  );
  logEvent('admin', 'manufacturer.update', req.params.id);
  res.json({ ok: true });
});

api.delete('/manufacturers/:id', (req, res) => {
  db.prepare('DELETE FROM manufacturers WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM discounts WHERE manufacturer_id = ?').run(req.params.id);
  logEvent('admin', 'manufacturer.delete', req.params.id);
  res.json({ ok: true });
});

// ── installers ──────────────────────────────────────────────────────────
api.get('/installers', (_, res) => {
  res.json(db.prepare('SELECT * FROM installers ORDER BY calcs DESC').all());
});

api.post('/installers', (req, res) => {
  const { id, name, city, verified = 0, bin = null, phone = null, telegram_id = null } = req.body;
  if (!id || !name || !city) return res.status(400).json({ error: 'id, name, city required' });
  db.prepare(`INSERT INTO installers (id,name,city,verified,calcs,bin,phone,telegram_id) VALUES (?,?,?,?,0,?,?,?)`)
    .run(id, name, city, verified ? 1 : 0, bin, phone, telegram_id);
  logEvent('admin', 'installer.create', id);
  res.json({ ok: true });
});

api.put('/installers/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM installers WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  const { name, city, verified, bin, phone, calcs } = req.body;
  db.prepare(`UPDATE installers SET name=?,city=?,verified=?,bin=?,phone=?,calcs=? WHERE id=?`).run(
    name ?? cur.name, city ?? cur.city,
    verified !== undefined ? (verified ? 1 : 0) : cur.verified,
    bin !== undefined ? bin : cur.bin,
    phone !== undefined ? phone : cur.phone,
    calcs !== undefined ? calcs : cur.calcs,
    req.params.id,
  );
  logEvent('admin', 'installer.update', req.params.id);
  res.json({ ok: true });
});

api.delete('/installers/:id', (req, res) => {
  db.prepare('DELETE FROM installers WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM discounts WHERE installer_id = ?').run(req.params.id);
  logEvent('admin', 'installer.delete', req.params.id);
  res.json({ ok: true });
});

// ── discount matrix ─────────────────────────────────────────────────────
api.get('/discounts', (_, res) => {
  const rows = db.prepare('SELECT installer_id, manufacturer_id, pct FROM discounts').all();
  const matrix = {};
  for (const r of rows) {
    matrix[r.installer_id] = matrix[r.installer_id] || {};
    matrix[r.installer_id][r.manufacturer_id] = r.pct;
  }
  res.json(matrix);
});

api.put('/discounts/:installerId/:manufacturerId', (req, res) => {
  const { installerId, manufacturerId } = req.params;
  const pct = Math.max(0, Math.min(25, parseInt(req.body.pct, 10) || 0));
  db.prepare(`INSERT INTO discounts (installer_id, manufacturer_id, pct) VALUES (?,?,?)
              ON CONFLICT(installer_id, manufacturer_id) DO UPDATE SET pct = excluded.pct`).run(installerId, manufacturerId, pct);
  logEvent('admin', 'discount.update', `${installerId}×${manufacturerId} → ${pct}%`);
  res.json({ ok: true, pct });
});

// ── articles / pricing ──────────────────────────────────────────────────
api.get('/articles', (req, res) => {
  let q = 'SELECT * FROM articles';
  const filters = [];
  const args = [];
  if (req.query.system) { filters.push('system = ?'); args.push(req.query.system); }
  if (req.query.search) { filters.push('(name LIKE ? OR article LIKE ?)'); args.push(`%${req.query.search}%`, `%${req.query.search}%`); }
  if (filters.length) q += ' WHERE ' + filters.join(' AND ');
  q += ' ORDER BY system, article';
  res.json(db.prepare(q).all(...args));
});

api.put('/articles/:article', (req, res) => {
  const cur = db.prepare('SELECT * FROM articles WHERE article = ?').get(req.params.article);
  if (!cur) return res.status(404).json({ error: 'not found' });
  const { name, unit, base, dealer, retail, system } = req.body;
  db.prepare(`UPDATE articles SET name=?,unit=?,base=?,dealer=?,retail=?,system=? WHERE article=?`).run(
    name ?? cur.name, unit ?? cur.unit,
    base ?? cur.base, dealer ?? cur.dealer, retail ?? cur.retail,
    system ?? cur.system, req.params.article,
  );
  logEvent('admin', 'article.update', req.params.article);
  res.json({ ok: true });
});

api.post('/articles', (req, res) => {
  const { article, name, unit, base, dealer, retail, system } = req.body;
  if (!article || !name) return res.status(400).json({ error: 'article and name required' });
  db.prepare(`INSERT INTO articles (article,name,unit,base,dealer,retail,system) VALUES (?,?,?,?,?,?,?)`)
    .run(article, name, unit || 'м', base || 0, dealer || 0, retail || 0, system || '—');
  logEvent('admin', 'article.create', article);
  res.json({ ok: true });
});

api.delete('/articles/:article', (req, res) => {
  db.prepare('DELETE FROM articles WHERE article = ?').run(req.params.article);
  logEvent('admin', 'article.delete', req.params.article);
  res.json({ ok: true });
});

api.post('/articles/bulk-bump', (req, res) => {
  const { vendorPrefix, pct } = req.body;
  if (!vendorPrefix || typeof pct !== 'number') return res.status(400).json({ error: 'vendorPrefix and pct required' });
  const r = db.prepare(`UPDATE articles SET base = CAST(base * (1 + ?/100.0) AS INTEGER),
    dealer = CAST(dealer * (1 + ?/100.0) AS INTEGER),
    retail = CAST(retail * (1 + ?/100.0) AS INTEGER) WHERE system LIKE ?`).run(pct, pct, pct, vendorPrefix + '%');
  logEvent('admin', 'articles.bulk-bump', `${vendorPrefix} ${pct}% (${r.changes} rows)`);
  res.json({ ok: true, changed: r.changes });
});

// ── Phase 1 catalogs: colors / hardware kits / handles / sills / ebbs / meshes
function makeCrud(table, idField = 'id', allowedFields) {
  api.get('/' + table, (_req, res) => res.json(db.prepare(`SELECT * FROM ${table} ORDER BY ${idField}`).all()));
  api.post('/' + table, (req, res) => {
    const fields = allowedFields.filter(f => req.body[f] !== undefined);
    if (!fields.length || !req.body[idField]) return res.status(400).json({ error: idField + ' required' });
    const cols = fields.join(','); const ph = fields.map(() => '?').join(',');
    db.prepare(`INSERT INTO ${table} (${cols}) VALUES (${ph})`).run(...fields.map(f => req.body[f]));
    logEvent('admin', table + '.create', req.body[idField]);
    res.json({ ok: true });
  });
  api.put('/' + table + '/:id', (req, res) => {
    const cur = db.prepare(`SELECT * FROM ${table} WHERE ${idField} = ?`).get(req.params.id);
    if (!cur) return res.status(404).json({ error: 'not found' });
    const sets = []; const vals = [];
    for (const f of allowedFields) if (req.body[f] !== undefined && f !== idField) { sets.push(`${f}=?`); vals.push(req.body[f]); }
    if (!sets.length) return res.json({ ok: true });
    vals.push(req.params.id);
    db.prepare(`UPDATE ${table} SET ${sets.join(',')} WHERE ${idField} = ?`).run(...vals);
    logEvent('admin', table + '.update', req.params.id);
    res.json({ ok: true });
  });
  api.delete('/' + table + '/:id', (req, res) => {
    db.prepare(`DELETE FROM ${table} WHERE ${idField} = ?`).run(req.params.id);
    logEvent('admin', table + '.delete', req.params.id);
    res.json({ ok: true });
  });
}
makeCrud('colors',         'id', ['id','ral','name','hex','surcharge_pct']);
makeCrud('hardware_kits',  'id', ['id','vendor','name','kind','price_per_sash','notes']);
makeCrud('handles',        'id', ['id','vendor','name','kind','color_default','price']);
makeCrud('sills',          'id', ['id','vendor','name','width_mm','color','price_per_m']);
makeCrud('ebbs',           'id', ['id','material','width_mm','color','price_per_m']);
makeCrud('meshes',         'id', ['id','kind','name','color','price_per_unit','unit']);
makeCrud('door_hardware',  'id', ['id','category','vendor','name','unit','qty_per_door','price','color_default','notes']);

// ── calc scope categories (profile / hardware / glazing / …) ───────────
api.get('/calc/categories', (_req, res) => {
  res.json(CATEGORIES.map(id => ({ id, label: CATEGORY_LABELS[id] })));
});

// ── calculation ─────────────────────────────────────────────────────────
api.post('/calc', (req, res) => {
  try {
    const installerId = req.installer ? req.installer.id : (req.body.installerId || null);
    const priceLevel = req.installer ? 'dealer' : (req.body.priceLevel || 'retail');
    const result = calcWindow({ ...req.body, installerId, priceLevel });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

api.post('/compare', (req, res) => {
  try {
    const installerId = req.installer ? req.installer.id : (req.body.installerId || null);
    const priceLevel = req.installer ? 'dealer' : (req.body.priceLevel || 'retail');
    const rows = compareManufacturers({ ...req.body, installerId, priceLevel });
    res.json(rows);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── calculations history ────────────────────────────────────────────────
api.post('/calculations', (req, res) => {
  try {
    const installerId = req.installer ? req.installer.id : (req.body.installerId || null);
    const telegramId = req.tgUser ? req.tgUser.id : null;
    const priceLevel = req.installer ? 'dealer' : 'retail';
    const result = calcWindow({ ...req.body, installerId, priceLevel });
    const id = 'c-' + Date.now().toString(36);
    // Derive width/height/sections summary from layout if needed (for legacy columns)
    const layout = result.input.layout;
    const width = layout?.width || req.body.width;
    const height = layout?.height || req.body.height;
    const sectionsSummary = layout
      ? layout.rows.flatMap(r => r.sections.map(s => s.opening || 'FIX'))
      : (req.body.sections || []);
    const title = req.body.title || `Расчёт · ${sectionsSummary.join('+') || '?'}`;
    db.prepare(`INSERT INTO calculations
      (id, installer_id, telegram_id, width, height, sections, layout, glazing, system, manufacturer_id, total, breakdown, title, template_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, installerId, telegramId,
        width, height,
        JSON.stringify(sectionsSummary),
        JSON.stringify(layout),
        req.body.glazingId, req.body.systemId, req.body.manufacturerId || null,
        result.total, JSON.stringify(result), title,
        req.body.templateId || null,
      );
    if (installerId) {
      db.prepare('UPDATE installers SET calcs = calcs + 1 WHERE id = ?').run(installerId);
    }
    logEvent(installerId || telegramId || 'anon', 'calc.save', `${id} → ${result.total}₸`);
    res.json({ id, ...result });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

api.delete('/calculations/:id', (req, res) => {
  const calc = db.prepare('SELECT * FROM calculations WHERE id = ?').get(req.params.id);
  if (!calc) return res.status(404).json({ error: 'not found' });
  db.prepare('DELETE FROM calculations WHERE id = ?').run(req.params.id);
  logEvent(req.installer?.id || req.tgUser?.id || 'anon', 'calc.delete', req.params.id);
  res.json({ ok: true });
});

api.get('/calculations', (req, res) => {
  let q = 'SELECT id,title,width,height,sections,system,manufacturer_id,total,created_at FROM calculations';
  const args = [];
  const conds = [];
  if (req.installer) { conds.push('installer_id = ?'); args.push(req.installer.id); }
  else if (req.query.installerId) { conds.push('installer_id = ?'); args.push(req.query.installerId); }
  if (req.tgUser && !req.installer) { conds.push('telegram_id = ?'); args.push(req.tgUser.id); }
  if (conds.length) q += ' WHERE ' + conds.join(' AND ');
  q += ' ORDER BY created_at DESC LIMIT 100';
  const rows = db.prepare(q).all(...args).map(r => ({ ...r, sections: JSON.parse(r.sections) }));
  res.json(rows);
});

api.get('/calculations/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM calculations WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  row.sections = JSON.parse(row.sections);
  row.breakdown = JSON.parse(row.breakdown);
  if (row.layout) try { row.layout = JSON.parse(row.layout); } catch {}
  res.json(row);
});

// ── KP ──────────────────────────────────────────────────────────────────
api.post('/kp', (req, res) => {
  try {
    const { calcId, projectId } = req.body;
    let { clientName, clientAddress, clientPhone } = req.body;
    if (!calcId && !projectId) return res.status(400).json({ error: 'calcId or projectId required' });
    let total = 0, installerId = null;
    if (projectId) {
      const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
      if (!p) return res.status(404).json({ error: 'project not found' });
      const totals = p.totals ? JSON.parse(p.totals) : null;
      total = totals?.total || 0;
      installerId = p.installer_id;
      // fall back to project's stored client info
      clientName = clientName || p.client_name;
      clientPhone = clientPhone || p.client_phone;
      clientAddress = clientAddress || p.client_address;
    } else {
      const calc = db.prepare('SELECT * FROM calculations WHERE id = ?').get(calcId);
      if (!calc) return res.status(404).json({ error: 'calc not found' });
      total = calc.total; installerId = calc.installer_id;
    }
    installerId = installerId || (req.installer ? req.installer.id : null);
    const id = 'kp-' + Date.now().toString(36);
    const year = new Date().getFullYear();
    const seq = String(db.prepare('SELECT COUNT(*) AS c FROM kp_documents').get().c + 1).padStart(4, '0');
    const number = `${year}-${seq}`;
    db.prepare(`INSERT INTO kp_documents (id,number,calc_id,project_id,client_name,client_address,client_phone,installer_id,total)
                VALUES (?,?,?,?,?,?,?,?,?)`).run(id, number, calcId || null, projectId || null,
                  clientName || 'Клиент', clientAddress || '', clientPhone || null, installerId, total);
    logEvent(installerId || 'anon', 'kp.create', `${number} → ${total}₸`);
    res.json({ id, number, total });
  } catch (e) {
    console.error('POST /kp failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PDF download for КП — must come BEFORE /kp/:id so the .pdf suffix isn't swallowed
api.get('/kp/:id.pdf', (req, res) => {
  const kp = db.prepare('SELECT * FROM kp_documents WHERE id = ?').get(req.params.id);
  if (!kp) return res.status(404).send('not found');
  const project = kp.project_id ? db.prepare('SELECT * FROM projects WHERE id = ?').get(kp.project_id) : null;
  const calc = kp.calc_id ? db.prepare('SELECT * FROM calculations WHERE id = ?').get(kp.calc_id) : null;
  const installer = kp.installer_id ? db.prepare('SELECT * FROM installers WHERE id = ?').get(kp.installer_id) : null;
  const fallbackInstaller = installer || { name: 'PLUR Solutions', bin: '210340029817', city: 'Алматы', phone: '+7 727 000 00 00' };
  try {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="kp-${kp.number}.pdf"`);
    const doc = buildKpPdf(kp, project, calc, fallbackInstaller);
    doc.pipe(res);
    doc.end();
  } catch (e) {
    console.error('PDF generation error:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

api.get('/kp/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM kp_documents WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  if (row.calc_id) {
    const calc = db.prepare('SELECT * FROM calculations WHERE id = ?').get(row.calc_id);
    if (calc) {
      calc.sections = JSON.parse(calc.sections);
      calc.breakdown = JSON.parse(calc.breakdown);
      if (calc.layout) try { calc.layout = JSON.parse(calc.layout); } catch {}
      row.calc = calc;
    }
  }
  if (row.project_id) {
    const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(row.project_id);
    if (p) { p.items = JSON.parse(p.items); if (p.totals) p.totals = JSON.parse(p.totals); row.project = p; }
  }
  res.json(row);
});

// ── analytics ───────────────────────────────────────────────────────────
api.get('/analytics', (_, res) => {
  const totalCalcs = db.prepare('SELECT COUNT(*) AS c FROM calculations').get().c;
  const seedCalcs = db.prepare('SELECT SUM(calcs) AS c FROM installers').get().c || 0;
  const total = totalCalcs + seedCalcs;
  const avgRow = db.prepare('SELECT AVG(total) AS a FROM calculations').get();
  const avg = Math.round(avgRow.a || 184500);

  const installers = db.prepare('SELECT * FROM installers ORDER BY calcs DESC').all();
  const cities = {};
  for (const i of installers) cities[i.city] = (cities[i.city] || 0) + i.calcs;
  const cityRows = Object.entries(cities).map(([city, calcs]) => ({ city, calcs })).sort((a, b) => b.calcs - a.calcs);

  // Topsystems (from calculations)
  const sysRows = db.prepare('SELECT system, COUNT(*) AS c FROM calculations GROUP BY system').all();
  const sysTotal = sysRows.reduce((s, r) => s + r.c, 0) || 1;
  const colors = ['#b08968', '#a08c70', '#8a7560', '#9c8772', '#7a6856'];
  let topSystems = sysRows.map((r, i) => ({
    name: db.prepare('SELECT name FROM profile_systems WHERE id = ?').get(r.system)?.name || r.system,
    share: Math.round(r.c / sysTotal * 100), color: colors[i % colors.length],
  }));
  if (topSystems.length === 0) {
    // fall back to seed shares
    topSystems = [
      { name: 'Rehau Delight 70', share: 38, color: colors[0] },
      { name: 'KBE 70 Expert',    share: 24, color: colors[1] },
      { name: 'VEKA Softline 82', share: 18, color: colors[2] },
      { name: 'Rehau Grazio 70',  share: 12, color: colors[3] },
      { name: 'Salamander 82',    share:  8, color: colors[4] },
    ];
  }

  // monthly: last 12 months calculation counts
  const now = new Date();
  const monthly = []; const monthLabels = [];
  const labels = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = Math.floor(d.getTime() / 1000);
    const end = Math.floor(new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() / 1000);
    const c = db.prepare('SELECT COUNT(*) AS c FROM calculations WHERE created_at >= ? AND created_at < ?').get(start, end).c;
    monthly.push(c);
    monthLabels.push(labels[d.getMonth()]);
  }
  // If everything is zero (fresh DB), splice in seed monthly
  if (monthly.every(v => v === 0)) {
    const seed = [128, 142, 198, 240, 312, 388, 421, 480, 512, 548, 596, 653];
    for (let i = 0; i < 12; i++) monthly[i] = seed[i];
  }

  const conv = 31.4;
  const calcsDelta = '+18%';

  res.json({
    totalCalcs: total,
    calcsDelta,
    conversion: conv,
    avgCheck: avg,
    topSystems,
    cities: cityRows,
    monthly, monthLabels,
    activeInstallers: installers.filter(i => i.verified).length,
    totalInstallers: installers.length,
  });
});

// ── log/journal ─────────────────────────────────────────────────────────
api.get('/log', (req, res) => {
  const limit = Math.min(500, parseInt(req.query.limit, 10) || 100);
  const rows = db.prepare('SELECT * FROM log_events ORDER BY ts DESC LIMIT ?').all(limit);
  res.json(rows);
});

// ── PROJECTS (multi-window calculations) ───────────────────────────────
api.post('/projects/calc', (req, res) => {
  try {
    const installerId = req.installer ? req.installer.id : (req.body.installerId || null);
    const priceLevel = req.installer ? 'dealer' : 'retail';
    const result = calcProject({ ...req.body, installerId, priceLevel });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

api.post('/projects', (req, res) => {
  try {
    const owner = ownerKey(req) || 'anon';
    const installerId = req.installer ? req.installer.id : (req.body.installerId || null);
    const priceLevel = req.installer ? 'dealer' : 'retail';
    const items = req.body.items || [];
    const markupPct = Number(req.body.markupPct) || 0;
    const computed = items.length ? calcProject({
      items, installerId, priceLevel,
      manufacturerId: req.body.manufacturerId,
      markupPct,
    }) : { subtotal: 0, discount: 0, total: 0, perItem: [], markup: 0, markupPct };
    const id = 'p-' + Date.now().toString(36);
    db.prepare(`INSERT INTO projects
      (id, owner, installer_id, client_id, client_name, client_phone, client_address, name, items, totals, manufacturer_id, status, markup_pct)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, owner, installerId,
        req.body.clientId || null,
        req.body.clientName || null,
        req.body.clientPhone || null,
        req.body.clientAddress || null,
        req.body.name || 'Без названия',
        JSON.stringify(items),
        JSON.stringify(computed),
        req.body.manufacturerId || null,
        req.body.status || 'draft',
        markupPct,
      );
    if (installerId) db.prepare('UPDATE installers SET calcs = calcs + 1 WHERE id = ?').run(installerId);
    logEvent(installerId || owner, 'project.create', `${id} · ${items.length} поз. → ${computed.total}₸`);
    res.json({ id, ...computed });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

api.get('/projects', (req, res) => {
  const owner = ownerKey(req);
  let q = 'SELECT * FROM projects';
  const args = [];
  if (owner) { q += ' WHERE owner = ?'; args.push(owner); }
  q += ' ORDER BY updated_at DESC LIMIT 100';
  const rows = db.prepare(q).all(...args);
  res.json(rows.map(r => {
    try { r.items = JSON.parse(r.items); } catch { r.items = []; }
    try { r.totals = r.totals ? JSON.parse(r.totals) : null; } catch {}
    return r;
  }));
});

api.get('/projects/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  try { row.items = JSON.parse(row.items); } catch { row.items = []; }
  try { row.totals = row.totals ? JSON.parse(row.totals) : null; } catch {}
  res.json(row);
});

api.put('/projects/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  const installerId = cur.installer_id;
  const priceLevel = installerId ? 'dealer' : 'retail';
  const items = req.body.items || JSON.parse(cur.items);
  const markupPct = req.body.markupPct != null ? Number(req.body.markupPct) : (cur.markup_pct || 0);
  const computed = items.length ? calcProject({
    items, installerId, priceLevel,
    manufacturerId: req.body.manufacturerId || cur.manufacturer_id,
    markupPct,
  }) : { subtotal: 0, discount: 0, total: 0, perItem: [], markup: 0, markupPct };
  db.prepare(`UPDATE projects SET name=?, items=?, totals=?, client_id=?, client_name=?, client_phone=?, client_address=?, manufacturer_id=?, status=?, markup_pct=?, updated_at=strftime('%s','now') WHERE id=?`).run(
    req.body.name ?? cur.name,
    JSON.stringify(items),
    JSON.stringify(computed),
    req.body.clientId ?? cur.client_id,
    req.body.clientName ?? cur.client_name,
    req.body.clientPhone ?? cur.client_phone,
    req.body.clientAddress ?? cur.client_address,
    req.body.manufacturerId ?? cur.manufacturer_id,
    req.body.status ?? cur.status,
    markupPct,
    req.params.id,
  );
  logEvent(installerId || 'anon', 'project.update', req.params.id);
  res.json({ ok: true, ...computed });
});

api.delete('/projects/:id', (req, res) => {
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  logEvent(req.installer?.id || 'anon', 'project.delete', req.params.id);
  res.json({ ok: true });
});

// ── CRM clients (per-installer book) ───────────────────────────────────
api.get('/crm/clients', (req, res) => {
  const owner = ownerKey(req);
  if (!owner) return res.json([]);
  const rows = db.prepare('SELECT * FROM crm_clients WHERE owner = ? ORDER BY created_at DESC').all(owner);
  res.json(rows);
});
api.post('/crm/clients', (req, res) => {
  const owner = ownerKey(req);
  if (!owner) return res.status(401).json({ error: 'auth required' });
  const { name, phone = null, address = null, email = null, notes = null } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = 'cl-' + Date.now().toString(36);
  db.prepare(`INSERT INTO crm_clients (id, owner, name, phone, address, email, notes) VALUES (?,?,?,?,?,?,?)`)
    .run(id, owner, name, phone, address, email, notes);
  logEvent(owner, 'crm.client.create', name);
  res.json({ ok: true, id });
});
api.put('/crm/clients/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM crm_clients WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  const { name, phone, address, email, notes } = req.body;
  db.prepare(`UPDATE crm_clients SET name=?, phone=?, address=?, email=?, notes=? WHERE id=?`).run(
    name ?? cur.name, phone ?? cur.phone, address ?? cur.address,
    email ?? cur.email, notes ?? cur.notes, req.params.id,
  );
  res.json({ ok: true });
});
api.delete('/crm/clients/:id', (req, res) => {
  db.prepare('DELETE FROM crm_clients WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── current user (mini-app) ─────────────────────────────────────────────
api.get('/me', (req, res) => {
  if (req.installer) {
    const roleLabels = { okonshchik: 'Оконщик', prorab: 'Прораб', tsekh: 'Цех / завод' };
    return res.json({ kind: 'installer', ...req.installer, markupPct: Number(req.installer.markup_pct) || 0, roleLabel: roleLabels[req.installer.role] || 'Оконщик' });
  }
  if (req.tgUser) {
    let client = db.prepare('SELECT * FROM clients WHERE telegram_id = ?').get(req.tgUser.id);
    if (!client) {
      const name = [req.tgUser.first_name, req.tgUser.last_name].filter(Boolean).join(' ')
        || req.tgUser.username
        || 'Клиент';
      db.prepare(`INSERT INTO clients (telegram_id,name,city,phone) VALUES (?,?,?,?)
                  ON CONFLICT(telegram_id) DO NOTHING`).run(req.tgUser.id, name, 'Алматы', null);
      client = db.prepare('SELECT * FROM clients WHERE telegram_id = ?').get(req.tgUser.id);
      logEvent(req.tgUser.id, 'client.auto-register', name);
    }
    return res.json({ kind: 'client', ...client, telegram: req.tgUser });
  }
  res.json({ kind: 'guest' });
});

// register-as-client (retail) — saves the client record
api.post('/me/register-client', (req, res) => {
  if (!req.tgUser) {
    // tolerate guest registration in dev — synthesize a client with no telegram_id
    if (req.query.devTgId) {
      req.tgUser = { id: parseInt(req.query.devTgId, 10), first_name: req.body.name || 'Гость' };
    } else {
      return res.status(401).json({ error: 'telegram auth required' });
    }
  }
  const { name, city = 'Алматы', phone = null } = req.body;
  db.prepare(`INSERT INTO clients (telegram_id,name,city,phone) VALUES (?,?,?,?)
              ON CONFLICT(telegram_id) DO UPDATE SET name=excluded.name, city=excluded.city, phone=excluded.phone`)
    .run(req.tgUser.id, name || req.tgUser.first_name || 'Клиент', city, phone);
  logEvent(req.tgUser.id, 'client.register', `${name || req.tgUser.first_name}, ${city}`);
  res.json({ ok: true });
});

// register-as-installer (B2B) — supports role: okonshchik | prorab | tsekh
api.post('/me/register-installer', (req, res) => {
  if (!req.tgUser) return res.status(401).json({ error: 'telegram auth required' });
  const { name, city, bin = null, phone = null, role = 'okonshchik' } = req.body;
  if (!name || !city) return res.status(400).json({ error: 'name, city required' });
  if (!['okonshchik', 'prorab', 'tsekh'].includes(role)) return res.status(400).json({ error: 'invalid role' });
  const id = 'i-tg-' + req.tgUser.id;
  db.prepare(`INSERT OR REPLACE INTO installers (id,name,city,verified,calcs,bin,phone,telegram_id,role)
              VALUES (?,?,?,0,0,?,?,?,?)`).run(id, name, city, bin, phone, req.tgUser.id, role);
  logEvent(id, 'installer.self-register', `${role} · ${name}, ${city}`);
  res.json({ ok: true, id, role });
});

// Update installer's own profile (name, phone, markup_pct).
// markup_pct is the installer's private margin — applied silently to every calc.
api.put('/me', (req, res) => {
  if (!req.installer) return res.status(401).json({ error: 'installer auth required' });
  const cur = req.installer;
  const next = {
    name:    req.body.name  ?? cur.name,
    city:    req.body.city  ?? cur.city,
    phone:   req.body.phone ?? cur.phone,
    bin:     req.body.bin   ?? cur.bin,
    markupPct: req.body.markupPct != null ? Math.max(0, Math.min(200, Number(req.body.markupPct) || 0)) : (Number(cur.markup_pct) || 0),
  };
  db.prepare('UPDATE installers SET name=?, city=?, phone=?, bin=?, markup_pct=? WHERE id=?')
    .run(next.name, next.city, next.phone, next.bin, next.markupPct, cur.id);
  logEvent(cur.id, 'profile.update', `markup ${next.markupPct}%`);
  const updated = db.prepare('SELECT * FROM installers WHERE id = ?').get(cur.id);
  res.json({ ok: true, ...updated, markupPct: Number(updated.markup_pct) || 0 });
});

// ── opening type catalog (static) ───────────────────────────────────────
api.get('/opening-types', (_, res) => {
  res.json([
    { code: 'FIX',       label: 'Глухое',                  short: '×',  group: 'window' },
    { code: 'ПЛ',        label: 'Поворотное левое',        short: '◣',  group: 'window' },
    { code: 'ПП',        label: 'Поворотное правое',       short: '◢',  group: 'window' },
    { code: 'ОТК',       label: 'Откидное',                short: '▽',  group: 'window' },
    { code: 'ПОЛ',       label: 'Поворотно-откидное лев.', short: '◣▽', group: 'window' },
    { code: 'ПОП',       label: 'Поворотно-откидное прав.',short: '▽◢', group: 'window' },
    { code: 'ФР',        label: 'Фрамужное',               short: '△',  group: 'window' },
    { code: 'ДВЕРЬ-ПЛ',  label: 'Дверь левая',             short: '⇐',  group: 'door' },
    { code: 'ДВЕРЬ-ПП',  label: 'Дверь правая',            short: '⇒',  group: 'door' },
    { code: 'ДВЕРЬ-FIX', label: 'Дверь глухая',            short: '⊟',  group: 'door' },
  ]);
});

// ── window templates (Топ окон) — server-side mirror of WINDOW_TEMPLATES ─
api.get('/window-templates', (_, res) => {
  res.json([
    { id: 'fix-1',     name: 'Глухое окно',    sub: '1 секция · без открывания',  width: 1200, height: 1400 },
    { id: 'po-1',      name: 'Одностворчатое', sub: 'поворотно-откидное',          width: 900,  height: 1400 },
    { id: 'po-2',      name: 'Двухстворчатое', sub: 'FIX + ПОП',                   width: 1500, height: 1400 },
    { id: 'po-3',      name: 'Трёхстворчатое', sub: 'ПОЛ + FIX + ПОП',             width: 2100, height: 1400 },
    { id: 'balcony',   name: 'Балконный блок', sub: 'окно + дверь',                 width: 2200, height: 2150 },
    { id: 't-shape',   name: 'Т-образное',     sub: 'фрамуга + 2 створки',         width: 1800, height: 1700 },
    { id: 'p-shape',   name: 'П-образное',     sub: 'дверь + окна по бокам',       width: 2700, height: 2200 },
    { id: 'panoramic', name: 'Панорамное',     sub: 'большое глухое',              width: 3000, height: 1800 },
    { id: 'storefront',name: 'Витраж',         sub: '4 секции',                     width: 4000, height: 2400 },
    { id: 'door',      name: 'Дверь',          sub: 'входная / балконная',          width: 900,  height: 2100 },
    { id: 'french',    name: 'Французское окно', sub: 'от пола до потолка',         width: 1200, height: 2400 },
    { id: 'door-window', name: 'Дверь + фрамуга', sub: 'входная с верхним светом',  width: 1100, height: 2400 },
  ]);
});

// ── favorites ────────────────────────────────────────────────────────────
function ownerKey(req) {
  if (req.installer) return 'i:' + req.installer.id;
  if (req.tgUser) return 'tg:' + req.tgUser.id;
  return null;
}
api.get('/favorites', (req, res) => {
  const owner = ownerKey(req);
  if (!owner) return res.json([]);
  const rows = db.prepare(`
    SELECT f.id, f.calc_id, f.created_at, c.title, c.total, c.width, c.height, c.sections, c.system
    FROM favorites f JOIN calculations c ON c.id = f.calc_id
    WHERE f.owner = ? ORDER BY f.created_at DESC`).all(owner);
  res.json(rows.map(r => ({ ...r, sections: JSON.parse(r.sections) })));
});
api.post('/favorites', (req, res) => {
  const owner = ownerKey(req);
  if (!owner) return res.status(401).json({ error: 'auth required' });
  const { calcId } = req.body;
  if (!calcId) return res.status(400).json({ error: 'calcId required' });
  db.prepare(`INSERT OR IGNORE INTO favorites (owner, calc_id) VALUES (?,?)`).run(owner, calcId);
  res.json({ ok: true });
});
api.delete('/favorites/:calcId', (req, res) => {
  const owner = ownerKey(req);
  if (!owner) return res.status(401).json({ error: 'auth required' });
  db.prepare('DELETE FROM favorites WHERE owner = ? AND calc_id = ?').run(owner, req.params.calcId);
  res.json({ ok: true });
});

// ── notifications inbox ──────────────────────────────────────────────────
function pushNotif(recipient, kind, title, body = null, link = null) {
  db.prepare(`INSERT INTO notifications (recipient, kind, title, body, link) VALUES (?,?,?,?,?)`)
    .run(recipient, kind, title, body, link);
}
api.get('/notifications', (req, res) => {
  const owner = ownerKey(req);
  if (!owner) return res.json({ items: [], unread: 0 });
  const items = db.prepare('SELECT * FROM notifications WHERE recipient = ? ORDER BY ts DESC LIMIT 100').all(owner);
  const unread = db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE recipient = ? AND read = 0').get(owner).c;
  res.json({ items, unread });
});
api.post('/notifications/read-all', (req, res) => {
  const owner = ownerKey(req);
  if (!owner) return res.status(401).json({ error: 'auth required' });
  db.prepare('UPDATE notifications SET read = 1 WHERE recipient = ?').run(owner);
  res.json({ ok: true });
});
api.put('/notifications/:id/read', (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── orders (lead from client to installer) ──────────────────────────────
api.get('/orders', (req, res) => {
  const owner = ownerKey(req);
  let q = 'SELECT * FROM orders';
  const args = [];
  if (req.installer) { q += ' WHERE installer_id = ?'; args.push(req.installer.id); }
  else if (req.tgUser) { q += ' WHERE client_telegram_id = ?'; args.push(req.tgUser.id); }
  q += ' ORDER BY created_at DESC LIMIT 100';
  res.json(db.prepare(q).all(...args));
});
api.post('/orders', (req, res) => {
  const { calcId, installerId = null, clientName, clientPhone, clientAddress, comment } = req.body;
  if (!calcId || !clientName) return res.status(400).json({ error: 'calcId and clientName required' });
  const id = 'o-' + Date.now().toString(36);
  const calc = db.prepare('SELECT * FROM calculations WHERE id = ?').get(calcId);
  if (!calc) return res.status(404).json({ error: 'calc not found' });
  const targetInstaller = installerId || calc.installer_id;
  db.prepare(`INSERT INTO orders (id, calc_id, kp_id, client_name, client_phone, client_address, client_telegram_id, installer_id, status, comment)
              VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, calcId, null, clientName, clientPhone || null, clientAddress || null,
         req.tgUser?.id || null, targetInstaller, 'new', comment || null);
  if (targetInstaller) pushNotif('i:' + targetInstaller, 'order.new', 'Новая заявка', `${clientName} · ${calc.total}₸`, '#/orders/' + id);
  if (req.tgUser) pushNotif('tg:' + req.tgUser.id, 'order.confirm', 'Заявка отправлена', 'Оконщик свяжется с вами в течение 24 ч.', '#/orders/' + id);
  logEvent(req.installer?.id || req.tgUser?.id || 'anon', 'order.create', id);
  res.json({ ok: true, id });
});
api.put('/orders/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  const { status, comment } = req.body;
  const valid = ['new', 'contacted', 'measuring', 'production', 'installation', 'done', 'cancelled'];
  if (status && !valid.includes(status)) return res.status(400).json({ error: 'invalid status' });
  db.prepare(`UPDATE orders SET status=?, comment=? WHERE id=?`).run(status ?? cur.status, comment ?? cur.comment, req.params.id);
  if (cur.client_telegram_id && status && status !== cur.status) {
    pushNotif('tg:' + cur.client_telegram_id, 'order.update', 'Статус заявки обновлён', 'Новый статус: ' + status, '#/orders/' + cur.id);
  }
  res.json({ ok: true });
});
api.get('/orders/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  if (row.calc_id) {
    const calc = db.prepare('SELECT * FROM calculations WHERE id = ?').get(row.calc_id);
    if (calc) {
      calc.sections = JSON.parse(calc.sections);
      if (calc.layout) try { calc.layout = JSON.parse(calc.layout); } catch {}
      row.calc = calc;
    }
  }
  res.json(row);
});

// ── My documents (КП history) ───────────────────────────────────────────
api.get('/my/kps', (req, res) => {
  let q = 'SELECT * FROM kp_documents';
  const args = [];
  if (req.installer) { q += ' WHERE installer_id = ?'; args.push(req.installer.id); }
  q += ' ORDER BY created_at DESC LIMIT 100';
  res.json(db.prepare(q).all(...args));
});

// ── Support ticket (simple: just records) ───────────────────────────────
api.post('/support', (req, res) => {
  const { subject, body } = req.body;
  if (!subject || !body) return res.status(400).json({ error: 'subject and body required' });
  const actor = req.installer?.id || (req.tgUser ? 'tg:' + req.tgUser.id : 'anon');
  logEvent(actor, 'support.message', `${subject}: ${body}`.slice(0, 200));
  pushNotif(actor, 'system', 'Запрос принят', 'Команда PLUR ответит в течение 24ч.', null);
  res.json({ ok: true });
});
