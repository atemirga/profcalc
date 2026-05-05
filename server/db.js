// server/db.js — SQLite schema + seed data drawn from the ProfCalc TZ
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'profcalc.db');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS profile_systems (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  vendor TEXT NOT NULL,
  chambers INTEGER NOT NULL,
  depth INTEGER NOT NULL,
  material TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS glazing (
  id TEXT PRIMARY KEY,
  formula TEXT NOT NULL,
  thickness INTEGER NOT NULL,
  label TEXT NOT NULL,
  price INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS manufacturers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  systems TEXT NOT NULL,         -- JSON array of profile_system ids
  rating REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS installers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  calcs INTEGER NOT NULL DEFAULT 0,
  telegram_id INTEGER UNIQUE,
  bin TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'okonshchik',  -- okonshchik | prorab | tsekh
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS clients (
  telegram_id INTEGER PRIMARY KEY,
  name TEXT,
  city TEXT,
  phone TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS discounts (
  installer_id TEXT NOT NULL,
  manufacturer_id TEXT NOT NULL,
  pct INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (installer_id, manufacturer_id)
);

CREATE TABLE IF NOT EXISTS articles (
  article TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  base INTEGER NOT NULL,
  dealer INTEGER NOT NULL,
  retail INTEGER NOT NULL,
  system TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS calculations (
  id TEXT PRIMARY KEY,
  installer_id TEXT,
  telegram_id INTEGER,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  sections TEXT NOT NULL,        -- JSON array of opening type codes (legacy/summary)
  layout TEXT,                   -- JSON full rows × sections layout
  glazing TEXT NOT NULL,
  system TEXT NOT NULL,
  manufacturer_id TEXT,
  total INTEGER NOT NULL,
  breakdown TEXT NOT NULL,       -- JSON
  title TEXT,
  template_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS log_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  actor TEXT NOT NULL,           -- 'admin' / installer_id / telegram_id
  action TEXT NOT NULL,
  detail TEXT
);

CREATE TABLE IF NOT EXISTS kp_documents (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  calc_id TEXT,
  project_id TEXT,
  client_name TEXT NOT NULL,
  client_address TEXT,
  client_phone TEXT,
  installer_id TEXT,
  total INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`);

// ── seed only if tables are empty ──────────────────────────────────────
function isEmpty(table) {
  return db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c === 0;
}

if (isEmpty('profile_systems')) {
  const ins = db.prepare(`INSERT INTO profile_systems (id,name,vendor,chambers,depth,material) VALUES (?,?,?,?,?,?)`);
  const seeds = [
    ['rehau-delight-70', 'Rehau Delight 70', 'Rehau', 5, 70, 'ПВХ'],
    ['rehau-grazio-70',  'Rehau Grazio 70',  'Rehau', 5, 70, 'ПВХ'],
    ['kbe-70-expert',    'KBE 70 Expert',    'KBE',   5, 70, 'ПВХ'],
    ['veka-softline-82', 'VEKA Softline 82', 'VEKA',  7, 82, 'ПВХ'],
    ['salamander-82',    'Salamander bluEvolution 82', 'Salamander', 6, 82, 'ПВХ'],
    ['lm-2138-55',       'LM-2138 (55 серия)','LM',    5, 55, 'ПВХ'],
  ];
  const tx = db.transaction(() => seeds.forEach(s => ins.run(...s)));
  tx();
}

if (isEmpty('glazing')) {
  const ins = db.prepare(`INSERT INTO glazing (id,formula,thickness,label,price) VALUES (?,?,?,?,?)`);
  const seeds = [
    ['g-4-16-4',         '4-16-4',         24, 'Однокамерный', 3500],
    ['g-4-10-4-10-4',    '4-10-4-10-4',    32, 'Двухкамерный стандарт', 5000],
    ['g-4-14ar-4i',      '4-14Ar-4И',      22, 'Энергосберегающий (i + Ar)', 6500],
    ['g-4-10-4-10-4i',   '4-10-4-10-4И',   32, 'Двухкамерный энергосберег.', 7000],
    ['g-4mf-10-4-10-4',  '4MF-10-4-10-4',  32, 'Мультифункциональный', 8000],
    ['g-6-12-4-12-6',    '6-12-4-12-6',    40, 'Шумозащитный', 9500],
  ];
  const tx = db.transaction(() => seeds.forEach(s => ins.run(...s)));
  tx();
}

if (isEmpty('manufacturers')) {
  const ins = db.prepare(`INSERT INTO manufacturers (id,name,region,systems,rating,status) VALUES (?,?,?,?,?,?)`);
  const seeds = [
    ['m-rehau',      'Rehau KZ',           'Алматы, Астана',   '["rehau-delight-70","rehau-grazio-70"]', 4.8, 'active'],
    ['m-kbe',        'KBE Profile',        'Алматы',            '["kbe-70-expert"]',                      4.6, 'active'],
    ['m-veka',       'VEKA Central Asia',  'РК',                '["veka-softline-82"]',                   4.7, 'active'],
    ['m-salamander', 'Salamander KZ',      'Алматы, Шымкент',   '["salamander-82"]',                      4.5, 'active'],
  ];
  const tx = db.transaction(() => seeds.forEach(s => ins.run(...s)));
  tx();
}

if (isEmpty('installers')) {
  const ins = db.prepare(`INSERT INTO installers (id,name,city,verified,calcs,bin,phone,role) VALUES (?,?,?,?,?,?,?,?)`);
  const seeds = [
    ['i-okna-almaty',  'Окна Алматы ИП', 'Алматы',   1, 142, '970324300892', '+7 727 312 84 50', 'okonshchik'],
    ['i-bestwindow',   'BestWindow ТОО', 'Алматы',   1, 98,  '180440017234', '+7 727 244 11 02', 'tsekh'],
    ['i-prorab-serik', 'Прораб Серик',   'Шымкент',  1, 47,  '850912300455', '+7 705 332 00 17', 'prorab'],
    ['i-windline',     'WindLine KZ',    'Астана',   0, 18,  null,            '+7 717 211 88 99', 'okonshchik'],
    ['i-domokno',      'Дом Окно',       'Караганда',1, 31,  '210830450291', '+7 721 244 60 13', 'okonshchik'],
  ];
  const tx = db.transaction(() => seeds.forEach(s => ins.run(...s)));
  tx();
}

// add role column to existing DBs (idempotent migration)
try {
  const cols = db.prepare("PRAGMA table_info(installers)").all().map(c => c.name);
  if (!cols.includes('role')) {
    db.exec("ALTER TABLE installers ADD COLUMN role TEXT NOT NULL DEFAULT 'okonshchik'");
  }
} catch {}
try {
  const cols = db.prepare("PRAGMA table_info(calculations)").all().map(c => c.name);
  if (!cols.includes('layout')) db.exec("ALTER TABLE calculations ADD COLUMN layout TEXT");
  if (!cols.includes('template_id')) db.exec("ALTER TABLE calculations ADD COLUMN template_id TEXT");
} catch {}

// ── PHASE 1: colors / hardware kits / sills / ebbs / meshes ──────────
db.exec(`
CREATE TABLE IF NOT EXISTS colors (
  id TEXT PRIMARY KEY,
  ral TEXT NOT NULL,                     -- 'RAL 7024', '9016', 'E6 EV1' etc
  name TEXT NOT NULL,                    -- human label ('Графитовый серый')
  hex TEXT,                              -- '#2c3034' for swatch
  surcharge_pct INTEGER NOT NULL DEFAULT 0  -- profile price markup for this color
);
CREATE TABLE IF NOT EXISTS hardware_kits (
  id TEXT PRIMARY KEY,
  vendor TEXT NOT NULL,                  -- Roto / Maco / Siegenia
  name TEXT NOT NULL,                    -- 'Roto NT'
  kind TEXT NOT NULL DEFAULT 'window',   -- 'window' | 'door' | 'sliding'
  price_per_sash INTEGER NOT NULL,
  notes TEXT
);
CREATE TABLE IF NOT EXISTS handles (
  id TEXT PRIMARY KEY,
  vendor TEXT NOT NULL,                  -- Hoppe / Roto / DORMA
  name TEXT NOT NULL,                    -- 'Hoppe Atlanta'
  kind TEXT NOT NULL DEFAULT 'window',   -- 'window' | 'door'
  color_default TEXT,                    -- default color id (FK colors.id)
  price INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sills (
  id TEXT PRIMARY KEY,
  vendor TEXT NOT NULL,                  -- Moeller / Werzalit / Danke
  name TEXT NOT NULL,                    -- 'Moeller'
  width_mm INTEGER NOT NULL,             -- 200/250/300/400/500/600
  color TEXT,                            -- 'белый' / 'дуб' etc
  price_per_m INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ebbs (
  id TEXT PRIMARY KEY,
  material TEXT NOT NULL,                -- 'оцинковка' / 'алюминий' / 'ПВХ'
  width_mm INTEGER NOT NULL,             -- 100/150/200/250/300
  color TEXT,
  price_per_m INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS meshes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                    -- 'frame' / 'sliding' / 'pleated' / 'antikoshka' / 'roll'
  name TEXT NOT NULL,                    -- 'Рамочная стандарт'
  color TEXT,
  price_per_unit INTEGER NOT NULL,       -- цена за шт
  unit TEXT NOT NULL DEFAULT 'шт'
);

-- ── PHASE 3: profile parts catalog (frame/sash/mullion/bead widths) + seals + brackets
CREATE TABLE IF NOT EXISTS profile_parts (
  id TEXT PRIMARY KEY,
  system_id TEXT NOT NULL,
  kind TEXT NOT NULL,                   -- frame | sash | mullion | bead | shtulp | turn | adapter | door_sash
  code TEXT NOT NULL,                   -- '1101-58LHT', '1064', '1151-58'
  width_mm INTEGER,
  thickness_mm REAL,
  name TEXT NOT NULL,
  price_per_m INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS seals (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,                   -- 'CON 01', 'CON 02', 'CON 05', 'CON 07-4', 'CON 11-4'
  position TEXT NOT NULL,               -- internal | external | central | bead | sash
  name TEXT NOT NULL,
  price_per_m INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS brackets (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,               -- 'corner' | 'mull_connector' | 'sukhar' | 'frame_anchor'
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'шт',
  price_per_unit INTEGER NOT NULL
);

-- ── PHASE 2: door hardware components (lock, hinge, closer, threshold, strike, cylinder)
CREATE TABLE IF NOT EXISTS door_hardware (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,                -- 'lock' / 'lock_tongue' / 'cylinder' / 'hinge' / 'closer' / 'threshold' / 'strike' / 'rosette' / 'fixator' / 'handle_kit' / 'peephole' / 'antipanic' / 'bottom_bolt'
  vendor TEXT NOT NULL,                  -- DORMA / SK / Roto / K-LONG / Apecs
  name TEXT NOT NULL,                    -- 'TS77 85-100КГ' / 'Бачковый 85/35' etc
  unit TEXT NOT NULL DEFAULT 'шт',       -- шт / м / компл.
  qty_per_door REAL NOT NULL DEFAULT 1,  -- how many per door (e.g. 3 hinges, 1 lock, 1 closer)
  price INTEGER NOT NULL,
  color_default TEXT,                    -- color id (FK colors)
  notes TEXT
);

-- ── PHASE 7: door types catalog (glazed PVC/profile doors only — NOT metal/wood)
CREATE TABLE IF NOT EXISTS door_types (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  default_width INTEGER NOT NULL,
  default_height INTEGER NOT NULL,
  reinforcement_factor REAL NOT NULL DEFAULT 1.0,
  required_components TEXT,
  default_opening TEXT NOT NULL DEFAULT 'ДВЕРЬ-ПП'
);

-- ── PHASE 18: Shape catalog — non-rectangular outer contours
CREATE TABLE IF NOT EXISTS shape_types (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,                    -- rectangle | arched | half_circle | triangle | trapezoid | gothic | pentagon | hexagon | oval | circle | quarter_circle | polygon | bay
  name TEXT NOT NULL,
  description TEXT,
  glass_factor REAL NOT NULL DEFAULT 1.0,
  bend_fee INTEGER NOT NULL DEFAULT 0,
  has_bent_profile INTEGER NOT NULL DEFAULT 0,
  params_schema TEXT                     -- JSON of parameter names + defaults: {"arch_rise":600,"apex_x":600}
);
`);

// notifications inbox
db.exec(`CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient TEXT NOT NULL,             -- 'tg:<id>' or 'i:<installer_id>'
  ts INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  kind TEXT NOT NULL,                  -- 'kp.created' / 'order.update' / 'discount.changed' / 'system'
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read INTEGER NOT NULL DEFAULT 0
)`);

// favorites
db.exec(`CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner TEXT NOT NULL,                 -- 'tg:<id>' or 'i:<installer_id>'
  calc_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE(owner, calc_id)
)`);

// orders (lead from client to installer)
db.exec(`CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  calc_id TEXT,
  project_id TEXT,
  kp_id TEXT,
  client_name TEXT,
  client_phone TEXT,
  client_address TEXT,
  client_telegram_id INTEGER,
  installer_id TEXT,
  status TEXT NOT NULL DEFAULT 'new', -- new / contacted / measuring / production / installation / done / cancelled
  comment TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
)`);
try {
  const cols = db.prepare("PRAGMA table_info(orders)").all().map(c => c.name);
  if (!cols.includes('project_id')) db.exec("ALTER TABLE orders ADD COLUMN project_id TEXT");
} catch {}

// CLIENTS — local CRM book (per-installer or shared) — distinct from auth-clients
db.exec(`CREATE TABLE IF NOT EXISTS crm_clients (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,        -- 'i:<installer_id>' or 'tg:<id>'
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  email TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
)`);

// PROJECTS — multi-window calculation aggregating multiple items
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,             -- 'i:<id>' or 'tg:<id>'
  installer_id TEXT,
  client_id TEXT,                  -- references crm_clients.id (optional)
  client_name TEXT,
  client_phone TEXT,
  client_address TEXT,
  name TEXT NOT NULL,              -- project label
  items TEXT NOT NULL,             -- JSON array of items
  totals TEXT,                     -- JSON { subtotal, discount, total, perItem }
  manufacturer_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',  -- draft / quoted / ordered / done
  markup_pct REAL NOT NULL DEFAULT 0,    -- installer markup applied to subtotal
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
)`);
try {
  const cols = db.prepare("PRAGMA table_info(projects)").all().map(c => c.name);
  if (!cols.includes('markup_pct')) db.exec("ALTER TABLE projects ADD COLUMN markup_pct REAL NOT NULL DEFAULT 0");
  // ── Phase 5: factory/order tracking fields
  if (!cols.includes('object_name'))    db.exec("ALTER TABLE projects ADD COLUMN object_name TEXT");
  if (!cols.includes('responsible'))    db.exec("ALTER TABLE projects ADD COLUMN responsible TEXT");
  if (!cols.includes('warehouse'))      db.exec("ALTER TABLE projects ADD COLUMN warehouse TEXT DEFAULT 'Центральный склад'");
  if (!cols.includes('order_number'))   db.exec("ALTER TABLE projects ADD COLUMN order_number TEXT");
  if (!cols.includes('catalog'))        db.exec("ALTER TABLE projects ADD COLUMN catalog TEXT");
  if (!cols.includes('client_code'))    db.exec("ALTER TABLE projects ADD COLUMN client_code TEXT");
  if (!cols.includes('assembly_fee'))   db.exec("ALTER TABLE projects ADD COLUMN assembly_fee INTEGER NOT NULL DEFAULT 0");
  if (!cols.includes('assembly_per_m2')) db.exec("ALTER TABLE projects ADD COLUMN assembly_per_m2 INTEGER NOT NULL DEFAULT 0");
} catch {}
// Personal markup belongs to the installer's profile (not per-project)
try {
  const cols = db.prepare("PRAGMA table_info(installers)").all().map(c => c.name);
  if (!cols.includes('markup_pct')) db.exec("ALTER TABLE installers ADD COLUMN markup_pct REAL NOT NULL DEFAULT 0");
} catch {}

// KP — link to projects too, and relax calc_id NOT NULL constraint
try {
  const cols = db.prepare("PRAGMA table_info(kp_documents)").all();
  const colNames = cols.map(c => c.name);
  if (!colNames.includes('project_id')) db.exec("ALTER TABLE kp_documents ADD COLUMN project_id TEXT");
  // SQLite can't ALTER COLUMN; recreate the table if calc_id is still NOT NULL
  const calcCol = cols.find(c => c.name === 'calc_id');
  if (calcCol && calcCol.notnull === 1) {
    db.exec(`
      CREATE TABLE kp_documents__new (
        id TEXT PRIMARY KEY,
        number TEXT NOT NULL,
        calc_id TEXT,
        project_id TEXT,
        client_name TEXT NOT NULL,
        client_address TEXT,
        client_phone TEXT,
        installer_id TEXT,
        total INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      );
      INSERT INTO kp_documents__new (id, number, calc_id, project_id, client_name, client_address, installer_id, total, created_at)
        SELECT id, number, calc_id, project_id, client_name, client_address, installer_id, total, created_at FROM kp_documents;
      DROP TABLE kp_documents;
      ALTER TABLE kp_documents__new RENAME TO kp_documents;
    `);
  } else if (!colNames.includes('client_phone')) {
    db.exec("ALTER TABLE kp_documents ADD COLUMN client_phone TEXT");
  }
} catch (e) { console.error('kp_documents migration failed:', e.message); }

if (isEmpty('discounts')) {
  const ins = db.prepare(`INSERT INTO discounts (installer_id,manufacturer_id,pct) VALUES (?,?,?)`);
  const seeds = [
    ['i-okna-almaty',  'm-rehau', 8],  ['i-okna-almaty',  'm-kbe', 5], ['i-okna-almaty',  'm-veka', 3], ['i-okna-almaty',  'm-salamander', 0],
    ['i-bestwindow',   'm-rehau', 10], ['i-bestwindow',   'm-kbe', 7], ['i-bestwindow',   'm-veka', 5], ['i-bestwindow',   'm-salamander', 3],
    ['i-prorab-serik', 'm-rehau', 5],  ['i-prorab-serik', 'm-kbe', 3], ['i-prorab-serik', 'm-veka', 0], ['i-prorab-serik', 'm-salamander', 0],
    ['i-windline',     'm-rehau', 0],  ['i-windline',     'm-kbe', 0], ['i-windline',     'm-veka', 0], ['i-windline',     'm-salamander', 0],
    ['i-domokno',      'm-rehau', 4],  ['i-domokno',      'm-kbe', 2], ['i-domokno',      'm-veka', 0], ['i-domokno',      'm-salamander', 0],
  ];
  const tx = db.transaction(() => seeds.forEach(s => ins.run(...s)));
  tx();
}

if (isEmpty('articles')) {
  const ins = db.prepare(`INSERT INTO articles (article,name,unit,base,dealer,retail,system) VALUES (?,?,?,?,?,?,?)`);
  const seeds = [
    ['REH-DEL-FRAME',    'Rehau Delight 70 · рама',     'м',      2350, 2680, 3200, 'Rehau Delight 70'],
    ['REH-DEL-SASH',     'Rehau Delight 70 · створка',  'м',      2810, 3210, 3850, 'Rehau Delight 70'],
    ['REH-DEL-MULL',     'Rehau Delight 70 · импост',   'м',      2120, 2420, 2900, 'Rehau Delight 70'],
    ['REH-DEL-BEAD',     'Rehau Delight 70 · штапик',   'м',       480,  550,  650, 'Rehau Delight 70'],
    ['REH-GRZ-FRAME',    'Rehau Grazio 70 · рама',      'м',      2480, 2820, 3380, 'Rehau Grazio 70'],
    ['REH-GRZ-SASH',     'Rehau Grazio 70 · створка',   'м',      2950, 3370, 4040, 'Rehau Grazio 70'],
    ['KBE-EXP-FRAME',    'KBE 70 Expert · рама',        'м',      2150, 2480, 2950, 'KBE 70 Expert'],
    ['KBE-EXP-SASH',     'KBE 70 Expert · створка',     'м',      2580, 2960, 3550, 'KBE 70 Expert'],
    ['KBE-EXP-MULL',     'KBE 70 Expert · импост',      'м',      1980, 2270, 2700, 'KBE 70 Expert'],
    ['VEK-SOFT-FRAME',   'VEKA Softline 82 · рама',     'м',      2680, 3080, 3700, 'VEKA Softline 82'],
    ['VEK-SOFT-SASH',    'VEKA Softline 82 · створка',  'м',      3120, 3580, 4290, 'VEKA Softline 82'],
    ['SAL-BLU-FRAME',    'Salamander 82 · рама',        'м',      2820, 3240, 3880, 'Salamander bluEvolution 82'],
    ['SAL-BLU-SASH',     'Salamander 82 · створка',     'м',      3320, 3810, 4570, 'Salamander bluEvolution 82'],
    ['GLZ-4-16-4',       'СП 4-16-4',                   'м²',     2900, 3360, 3780, 'Стеклопакеты'],
    ['GLZ-4-10-4-10-4',  'СП 4-10-4-10-4',              'м²',     4200, 4900, 5500, 'Стеклопакеты'],
    ['GLZ-4-10-4-10-4I', 'СП 4-10-4-10-4И (низкоэм.)',  'м²',     5800, 6650, 7200, 'Стеклопакеты'],
    ['GLZ-4MF-10-4-10-4','СП 4MF-10-4-10-4',            'м²',     6700, 7700, 8500, 'Стеклопакеты'],
    ['GLZ-6-12-4-12-6',  'СП 6-12-4-12-6 шумозащитный', 'м²',     7900, 9080, 9950, 'Стеклопакеты'],
    ['HW-ROTO-NT-PO',    'Roto NT · комплект ПО',       'компл.', 16800,19200,23000, 'Фурнитура'],
    ['HW-ROTO-NT-FIX',   'Roto NT · фиксированный',     'компл.',  4200, 4830, 5780, 'Фурнитура'],
    ['HW-MACO-PO',       'Maco · комплект ПО',          'компл.', 14500,16700,20000, 'Фурнитура'],
    ['REINF-1.5',        'Армирование оцинк. ст. 1.5мм','м',       420,  500,  600,  'Армирование'],
    ['SEAL-EPDM',        'Уплотнитель EPDM',            'м',       180,  220,  290,  'Уплотнители'],
    ['SILL-MOELLER-250', 'Подоконник Moeller 250 мм',   'м',      3500, 4000, 4750, 'Доп. комплектующие'],
    ['EBB-150',          'Отлив оцинк. 150 мм',         'м',      1200, 1380, 1620, 'Доп. комплектующие'],
    ['MESH-FRAME',       'Москитная сетка рамочная',    'шт',     5400, 6150, 7300, 'Доп. комплектующие'],
    ['INSTALL',          'Монтаж',                      'объект', 14000,16000,18000, 'Услуги'],
  ];
  const tx = db.transaction(() => seeds.forEach(s => ins.run(...s)));
  tx();
}

// ── Phase 1 seeds ──────────────────────────────────────────────────────
if (isEmpty('colors')) {
  const ins = db.prepare(`INSERT INTO colors (id,ral,name,hex,surcharge_pct) VALUES (?,?,?,?,?)`);
  const seeds = [
    ['c-white',   '9016',     'Белый',                  '#f3f3f0',  0],
    ['c-7024',    'RAL 7024', 'Графитовый серый',       '#2c3034', 25],
    ['c-7016',    'RAL 7016', 'Антрацит',               '#383e42', 25],
    ['c-9005',    'RAL 9005', 'Чёрный',                 '#0c0c0c', 25],
    ['c-8014',    'RAL 8014', 'Сепия / тёмный дуб',     '#3a2a1d', 30],
    ['c-oak-gold','E6 EV1',   'Золотой дуб (плёнка)',   '#b78c47', 35],
    ['c-mahogany','—',        'Махагон',                '#5a2a20', 35],
    ['c-anodix',  '—',        'Анодированный (двери)',  '#9c9c9a', 20],
  ];
  const tx = db.transaction(() => seeds.forEach(s => ins.run(...s)));
  tx();
}
if (isEmpty('hardware_kits')) {
  const ins = db.prepare(`INSERT INTO hardware_kits (id,vendor,name,kind,price_per_sash,notes) VALUES (?,?,?,?,?,?)`);
  const seeds = [
    ['hw-roto-nt',         'Roto',     'Roto NT',                 'window',  16800, 'Стандарт ПО, 5 точек'],
    ['hw-roto-nt-design',  'Roto',     'Roto NT Designo (скр.)',  'window',  24800, 'Скрытые петли'],
    ['hw-maco-mm',         'Maco',     'Maco Multi-Matic',        'window',  14500, 'Базовая Maco'],
    ['hw-maco-mm-tip',     'Maco',     'Maco MM TipTronic',       'window',  38000, 'Электропривод'],
    ['hw-siegenia-titan',  'Siegenia', 'Siegenia Titan AF',       'window',  17400, 'Antifrost AF'],
    ['hw-roto-door',       'Roto',     'Roto Door (3 петли)',     'door',    28000, 'Дверная Roto'],
    ['hw-maco-door',       'Maco',     'Maco Door',               'door',    22000, '3 петли'],
    ['hw-sliding-portal',  'Roto',     'Roto Patio Inowa',        'sliding', 42000, 'Раздвижная'],
  ];
  const tx = db.transaction(() => seeds.forEach(s => ins.run(...s)));
  tx();
}
if (isEmpty('handles')) {
  const ins = db.prepare(`INSERT INTO handles (id,vendor,name,kind,color_default,price) VALUES (?,?,?,?,?,?)`);
  const seeds = [
    // Window handles
    ['hnd-hoppe-atlanta', 'Hoppe', 'Hoppe Atlanta',                'window', 'c-white', 4200],
    ['hnd-hoppe-secustic','Hoppe', 'Hoppe Secustic',               'window', 'c-white', 6800],
    ['hnd-roto-line',     'Roto',  'Roto Line',                    'window', 'c-white', 3500],
    ['hnd-roto-swing',    'Roto',  'Roto Swing',                   'window', 'c-7024',  4500],
    // ── Phase 7: handles for glazed PVC doors only (нажимная / скоба-pull / гарнитур / push-pull)
    ['hnd-dorma-klong',   'DORMA', 'DORMA K-LONG',                 'door',   'c-7024',  4725],
    ['hnd-dorma-pure',    'DORMA', 'DORMA Pure',                   'door',   'c-9005',  6200],
    ['hnd-hoppe-paris',   'Hoppe', 'Hoppe Paris (нажимная)',       'door',   'c-white', 5400],
    ['hnd-hoppe-tokyo',   'Hoppe', 'Hoppe Tokyo (скоба-pull)',     'door',   'c-9005',  8200],
    ['hnd-dorma-pushpull','DORMA', 'DORMA Push-Pull (для витража)', 'door',  'c-9005', 12400],
    ['hnd-roto-set',      'Roto',  'Roto Гарнитур (пара ручек)',   'door',   'c-7024',  9800],
    ['hnd-hoppe-balcony', 'Hoppe', 'Hoppe Balkon (балконная односторонняя)', 'door', 'c-white', 3800],
  ];
  const tx = db.transaction(() => seeds.forEach(s => ins.run(...s)));
  tx();
}
if (isEmpty('sills')) {
  const ins = db.prepare(`INSERT INTO sills (id,vendor,name,width_mm,color,price_per_m) VALUES (?,?,?,?,?,?)`);
  const seeds = [
    ['sill-moeller-200', 'Moeller', 'Moeller', 200, 'белый',     3200],
    ['sill-moeller-250', 'Moeller', 'Moeller', 250, 'белый',     3500],
    ['sill-moeller-300', 'Moeller', 'Moeller', 300, 'белый',     4100],
    ['sill-moeller-400', 'Moeller', 'Moeller', 400, 'белый',     5400],
    ['sill-moeller-500', 'Moeller', 'Moeller', 500, 'белый',     6500],
    ['sill-werzalit-300','Werzalit','Werzalit',300, 'дуб',       6800],
    ['sill-danke-350',   'Danke',   'Danke Premium', 350, 'мрамор', 7400],
  ];
  const tx = db.transaction(() => seeds.forEach(s => ins.run(...s)));
  tx();
}
if (isEmpty('ebbs')) {
  const ins = db.prepare(`INSERT INTO ebbs (id,material,width_mm,color,price_per_m) VALUES (?,?,?,?,?)`);
  const seeds = [
    ['ebb-zn-100', 'оцинковка', 100, 'белый', 950],
    ['ebb-zn-150', 'оцинковка', 150, 'белый', 1200],
    ['ebb-zn-200', 'оцинковка', 200, 'белый', 1480],
    ['ebb-zn-250', 'оцинковка', 250, 'белый', 1750],
    ['ebb-al-150', 'алюминий',  150, 'RAL 7024', 1850],
    ['ebb-al-200', 'алюминий',  200, 'RAL 7024', 2200],
    ['ebb-pvc-150','ПВХ',       150, 'белый',  1100],
  ];
  const tx = db.transaction(() => seeds.forEach(s => ins.run(...s)));
  tx();
}
if (isEmpty('door_hardware')) {
  const ins = db.prepare(`INSERT INTO door_hardware (id,category,vendor,name,unit,qty_per_door,price,color_default,notes) VALUES (?,?,?,?,?,?,?,?,?)`);
  const seeds = [
    // locks (drawn from the order invoice on the photo)
    ['dh-lock-bachok-dorma', 'lock',         'DORMA', 'Замок бачковый 85/35',   'шт', 1, 4500, 'c-7024', 'Основной замок двери'],
    ['dh-lock-tongue-dorma', 'lock_tongue',  'DORMA', 'Замок язычковый 85/35',  'шт', 1, 1700, 'c-7024', 'Дополнительный'],
    ['dh-lock-apecs',        'lock',         'Apecs', 'Apecs 8200/85-C',         'шт', 1, 6800, 'c-9005', 'Альтернатива'],
    // cylinder (личинка)
    ['dh-cyl-dorma',         'cylinder',     'DORMA', 'Личинка DORMA 35×35',    'шт', 1, 3800, 'c-9005', null],
    ['dh-cyl-kale',          'cylinder',     'KALE',  'Личинка KALE 35×35',     'шт', 1, 2400, 'c-9005', null],
    // hinges (петли)
    ['dh-hinge-hn3303-sk',   'hinge',        'SK',    'Петля HN-3303 7016/7024','шт', 3, 4258.75, 'c-7024', '3 петли на дверь'],
    ['dh-hinge-roto-3d',     'hinge',        'Roto',  'Петля Roto 3D',          'шт', 3, 5400, 'c-9016', null],
    // door closer (доводчик)
    ['dh-closer-ts77-dorma', 'closer',       'DORMA', 'Доводчик TS77 85-100КГ', 'шт', 1, 11900, 'c-9005', 'Чёрный (RAL 9005)'],
    ['dh-closer-ts73-dorma', 'closer',       'DORMA', 'Доводчик TS73 60-80КГ',  'шт', 1, 8400, 'c-9016', 'Для лёгких дверей'],
    // threshold (порог)
    ['dh-thresh-55gold',     'threshold',    '—',     'Порог 55 GOLD (с термо)','м',  1, 3080, null,    'Анодированный E6 EV1'],
    ['dh-thresh-pvc',        'threshold',    '—',     'Порог ПВХ',              'м',  1, 1450, null,    'Бюджетный'],
    // response strike (ответная планка)
    ['dh-strike-klong',      'strike',       'K-LONG','Ответная планка K-LONG', 'шт', 2, 1700, 'c-7024', '2 шт (бачковый+язычковый)'],
    // rosette (розетка)
    ['dh-rosette-sk',        'rosette',      'SK',    'Розетка 7016/7024',      'компл.', 1, 4080, 'c-7024', null],
    // fixator (фиксатор)
    ['dh-fixator-klong',     'fixator',      'K-LONG','Фиксатор тонкий K-LONG', 'шт', 1, 1275, 'c-7024', null],
    // handle hardware kit (фурнитура для ручки)
    ['dh-handle-kit-sk',     'handle_kit',   'SK',    'Фурнитура для ручки 7016/7024', 'компл.', 1, 10625, 'c-7024', null],
    // ── Phase 7: extras for glazed PVC doors (bottom bolt for double-leaf, sliding bolt)
    ['dh-bottom-bolt',       'bottom_bolt',  'Apecs', 'Нижний шпингалет (для пассивной створки)', 'шт', 1, 2400, 'c-7024', 'Для штульп. / двойных дверей'],
    ['dh-top-bolt',          'top_bolt',     'Apecs', 'Верхний шпингалет (для пассивной створки)','шт', 1, 2400, 'c-7024', 'Для штульп. / двойных дверей'],
    // Sliding-door specific hardware
    ['dh-sl-roller',         'roller',       'Roto',  'Каретка раздвижная Patio Inowa', 'шт', 2, 18000, 'c-9016', 'Для раздвижных порталов'],
    ['dh-sl-rail',           'rail',         'Roto',  'Рельс раздвижной Patio',         'м',  1, 6800, 'c-9016', 'Верхний+нижний'],
  ];
  const tx = db.transaction(() => seeds.forEach(s => ins.run(...s)));
  tx();
}

if (isEmpty('meshes')) {
  const ins = db.prepare(`INSERT INTO meshes (id,kind,name,color,price_per_unit,unit) VALUES (?,?,?,?,?,?)`);
  const seeds = [
    ['mesh-frame-std',   'frame',     'Рамочная стандарт',     'белый',     5400, 'шт'],
    ['mesh-frame-grey',  'frame',     'Рамочная антрацит',     'RAL 7024',  6200, 'шт'],
    ['mesh-frame-anti',  'antikoshka','Антикошка',             'чёрный',   12800, 'шт'],
    ['mesh-sliding',     'sliding',   'Раздвижная',            'белый',     8400, 'шт'],
    ['mesh-pleated',     'pleated',   'Плиссе',                'белый',    18500, 'шт'],
    ['mesh-roll',        'roll',      'Рулонная',              'белый',    16800, 'шт'],
  ];
  const tx = db.transaction(() => seeds.forEach(s => ins.run(...s)));
  tx();
}

// ── Phase 3 seeds: profile parts (Logikal-style codes), seals, brackets ─
if (isEmpty('profile_parts')) {
  const ins = db.prepare(`INSERT INTO profile_parts (id,system_id,kind,code,width_mm,thickness_mm,name,price_per_m) VALUES (?,?,?,?,?,?,?,?)`);
  // From the photo invoice: 5 series LM-2138, 4-digit Logikal codes
  const seeds = [
    // LM-2138 (55) — drawn from accepted-orders sheet on photo
    ['pp-lm-frame',     'lm-2138-55', 'frame',     '102/105',     64, 1.5, 'Рама 64/55',           5627],
    ['pp-lm-sash',      'lm-2138-55', 'sash',      '102/117',     64, 1.5, 'Створка 64/55',        5627],
    ['pp-lm-mull',      'lm-2138-55', 'mullion',   '112/113',     86, 1.5, 'Импост 86/55',         6100],
    ['pp-lm-doorsash',  'lm-2138-55', 'door_sash', '130-566-230', 110, 2.0,'Дверная створка Т 110/55', 8250],
    ['pp-lm-bead',      'lm-2138-55', 'bead',      '7024-150',    20.5, null, 'Штапик 20.5 мм (24нн)', 870],
    ['pp-lm-shtulp',    'lm-2138-55', 'shtulp',    '7024-118/119',58, null,  'Штульп 58',           5679],
    ['pp-lm-turn',      'lm-2138-55', 'turn',      '7024-140/141',null,null, 'Разворотный',         4260],
    ['pp-lm-adapter',   'lm-2138-55', 'adapter',   '5S-7024-140/141', null, null, 'Адаптер рамы наружн. откр.', 3550],
    ['pp-lm-thresh',    'lm-2138-55', 'threshold', '7560-02/04',  null, null, 'Порог 55 GOLD',     3080],
    // Rehau Delight 70 (filling out the catalog so older systems also have parts)
    ['pp-reh-del-frame','rehau-delight-70', 'frame',  'REH-DEL-FRAME', 70, 1.5, 'Rehau Delight рама 70',    5750],
    ['pp-reh-del-sash', 'rehau-delight-70', 'sash',   'REH-DEL-SASH',  76, 1.5, 'Rehau Delight створка 76', 6900],
    ['pp-reh-del-mull', 'rehau-delight-70', 'mullion','REH-DEL-MULL',  82, 1.5, 'Rehau Delight импост 82',  6300],
    ['pp-reh-del-bead', 'rehau-delight-70', 'bead',   'REH-DEL-BEAD',  20, null, 'Rehau штапик 20 мм',      650],
  ];
  const tx = db.transaction(() => seeds.forEach(s => ins.run(...s)));
  tx();
}
if (isEmpty('seals')) {
  const ins = db.prepare(`INSERT INTO seals (id,code,position,name,price_per_m) VALUES (?,?,?,?,?)`);
  const seeds = [
    ['s-con01',   'CON 01',  'internal','Уплотнитель внутренний (рама)',   195],
    ['s-con02',   'CON 02',  'external','Уплотнитель наружный (рама)',     205],
    ['s-con05',   'CON 05',  'central', 'Центральный уплотнитель (створка)',230],
    ['s-con07-4', 'CON 07-4','bead',    'Уплотнитель штапика 4 мм',         95],
    ['s-con11-4', 'CON 11-4','sash',    'Уплотнитель рама-створка 4 мм',   140],
    ['s-ap37',    'AP-37',   'central', 'Уплотнитель AP-37 (12кг=220м)',   210],
    ['s-5686',    '5686',    'sash',    'Уплотнитель 5686 (12.5кг=250м)',  225],
  ];
  const tx = db.transaction(() => seeds.forEach(s => ins.run(...s)));
  tx();
}
if (isEmpty('brackets')) {
  const ins = db.prepare(`INSERT INTO brackets (id,category,code,name,unit,price_per_unit) VALUES (?,?,?,?,?,?)`);
  const seeds = [
    // From the invoice
    ['br-1000-14', 'corner',         '1000', 'Крепёжный уголок 14 мм',       'шт', 270],
    ['br-1020-45', 'corner',         '1020', 'Крепёжный уголок 45 мм',       'шт', 270],
    ['br-1058',    'corner',         '1058', 'Соединительный уголок (L)',    'шт', 120],
    ['br-1140',    'mull_connector', '1140', 'Соединитель импоста (L)',      'шт', 120],
    // Сухари (Sukhar) — strut/spacer for reinforcement, 4 sizes from invoice
    ['br-suh-285-83',  'sukhar', '132-285-083', 'Сухарь 28.5×8.3 / L',       'шт', 270],
    ['br-suh-285-253', 'sukhar', '132-285-253', 'Сухарь 28.5×25.3 / L',      'шт', 635],
    ['br-suh-566-228', 'sukhar', '130-566-230', 'Сухарь 56.6×22.8 / Т6',     'шт', 825],
    ['br-suh-566-58',  'sukhar', '130-566-058', 'Сухарь 56.6×5.8 / Т6+Z6',   'шт', 310],
    // Frame anchor / труба армирования
    ['br-tube-40x2',   'frame_anchor', '101-00', 'Труба арм. 40×2 ALP',      'шт', 3550],
    ['br-glue-pur',    'consumable',  '026-10-14-23', 'Клей Пурокол 310 мл', 'шт', 4665],
  ];
  const tx = db.transaction(() => seeds.forEach(s => ins.run(...s)));
  tx();
}

// ── Phase 7 seeds: glazed PVC door types only (NOT metal/wood doors) ───
if (isEmpty('door_types')) {
  const ins = db.prepare(`INSERT INTO door_types (id,code,name,description,default_width,default_height,reinforcement_factor,required_components,default_opening) VALUES (?,?,?,?,?,?,?,?,?)`);
  const seeds = [
    ['dt-entrance',  'entrance',       'Входная стеклянная одностворчатая',
      'Остеклённая входная дверь — для частного дома, офиса, парадной. Замок, личинка, петли, доводчик, порог.',
      900, 2100, 1.0,
      JSON.stringify(['lock','cylinder','hinge','closer','threshold','handle_kit']),
      'ДВЕРЬ-ПП'],
    ['dt-balcony',   'balcony',        'Балконная дверь',
      'Балконный блок (квартира) — облегчённая фурнитура без доводчика, односторонняя ручка.',
      800, 2100, 1.0,
      JSON.stringify(['lock','hinge','threshold','handle_kit']),
      'ДВЕРЬ-ПП'],
    ['dt-terrace',   'terrace',        'Террасная дверь',
      'Дверь на террасу/веранду частного дома — поворотно-откидная, со встроенной нажимной ручкой.',
      900, 2200, 1.0,
      JSON.stringify(['lock','cylinder','hinge','threshold','handle_kit']),
      'ДВЕРЬ-ПП'],
    ['dt-french',    'french',         'Французская двустворчатая',
      'Полностью остеклённая французская дверь — две створки от пола до потолка, большая площадь стеклопакета.',
      1400, 2400, 1.0,
      JSON.stringify(['lock','cylinder','hinge','threshold','strike','bottom_bolt','top_bolt','handle_kit']),
      'ДВЕРЬ-ПЛ'],
    ['dt-shtulp',    'shtulp',         'Двойная штульповая',
      'Двухстворчатая со штульпом — широкий проём; пассивная створка фиксируется верх.+ниж. шпингалетами.',
      1600, 2100, 1.1,
      JSON.stringify(['lock','lock_tongue','cylinder','hinge','closer','threshold','strike','bottom_bolt','top_bolt','handle_kit']),
      'ДВЕРЬ-ПЛ'],
    ['dt-storefront','storefront',     'Витражная (вход в магазин)',
      'Полностью остеклённая входная дверь магазина / салона — высокий ПВХ-профиль 110/55, ручка-скоба или Push-Pull.',
      1000, 2400, 1.2,
      JSON.stringify(['lock','cylinder','hinge','closer','threshold','strike','handle_kit']),
      'ДВЕРЬ-ПП'],
    ['dt-swing',     'swing',          'Маятниковая (двусторонняя)',
      'Распашная в обе стороны — для проходных зон, кафе, кухонь общепита. Две петли с пружиной + доводчик.',
      900, 2100, 1.0,
      JSON.stringify(['hinge','closer','threshold','handle_kit']),
      'ДВЕРЬ-ПП'],
    ['dt-portal',    'sliding_portal', 'Раздвижная (Patio Inowa)',
      'Параллельно-раздвижная Roto Patio Inowa — для широких проёмов на террасу. Каретки, рельсы, порог-рельс.',
      2400, 2200, 1.2,
      JSON.stringify(['roller','rail','hinge','threshold','handle_kit']),
      'РАЗД-П'],
    ['dt-double',    'double',         'Двустворчатая распашная',
      'Двойная остеклённая дверь без штульпа — обе створки распашные, активная + пассивная со шпингалетами.',
      1800, 2100, 1.1,
      JSON.stringify(['lock','cylinder','hinge','closer','threshold','strike','bottom_bolt','top_bolt','handle_kit']),
      'ДВЕРЬ-ПЛ'],
  ];
  const tx = db.transaction(() => seeds.forEach(s => ins.run(...s)));
  tx();
}

// ── Phase 7 cleanup migration: remove obsolete metal-door SKUs that may
// have been seeded before this commit (peephole, antipanic, fire components).
// Idempotent — DELETE WHERE only affects rows that exist.
try {
  db.prepare(`DELETE FROM door_hardware WHERE id IN (
    'dh-peephole-std','dh-peephole-wide','dh-antipanic-bar',
    'dh-thresh-firedoor','dh-hinge-fire','dh-closer-hidden'
  )`).run();
  db.prepare(`DELETE FROM door_hardware WHERE category IN ('peephole','antipanic')`).run();
  db.prepare(`DELETE FROM handles WHERE id IN ('hnd-antipanic','hnd-apecs-knob')`).run();
  db.prepare(`DELETE FROM door_types WHERE id IN ('dt-firedoor','dt-antipanic')`).run();
} catch {}

// ── Phase 18 seeds: shape catalog ─────────────────────────────────────
if (isEmpty('shape_types')) {
  const ins = db.prepare(`INSERT INTO shape_types (id,code,name,description,glass_factor,bend_fee,has_bent_profile,params_schema) VALUES (?,?,?,?,?,?,?,?)`);
  const seeds = [
    ['sh-rectangle',     'rectangle',     'Прямоугольное',
      'Стандартная прямоугольная форма', 1.0, 0, 0, '{}'],
    ['sh-arched',        'arched',        'Арочное (с подъёмом)',
      'Прямоугольная база + арочный верх. Параметр arch_rise — подъём арки.',
      1.3, 12000, 1, '{"arch_rise":400}'],
    ['sh-half-circle',   'half_circle',   'Полукруглое (fan light)',
      'Полная полуокружность — над дверью или классическое окно.',
      1.5, 18000, 1, '{}'],
    ['sh-triangle',      'triangle',      'Треугольное',
      'Треугольное (мансардное). Параметр apex_x — горизонтальная позиция вершины.',
      1.2, 0, 0, '{"apex_x":600}'],
    ['sh-trapezoid',     'trapezoid',     'Трапециевидное',
      'Со скосом — мансарда, наклонные террасы. Параметр left_h ≠ right_h.',
      1.15, 0, 0, '{"left_h":1400,"right_h":1800}'],
    ['sh-gothic',        'gothic',        'Готическое (стрельчатое)',
      'Стрельчатый верх с пиком — готика, костёлы. Параметр peak_offset = 0.',
      1.4, 14000, 1, '{"arch_rise":500,"peak_offset":0}'],
    ['sh-pentagon',      'pentagon',      'Пятиугольное',
      'Пятиугольник (домовой контур) — стилизованные окна.',
      1.2, 0, 0, '{"peak_h":300}'],
    ['sh-hexagon',       'hexagon',       'Шестиугольное',
      'Декоративный шестиугольник.',
      1.25, 0, 0, '{"side_h":400}'],
    ['sh-oval',          'oval',          'Овальное',
      'Эллипс (мансардное / морское). Параметры — полуоси a и b.',
      1.5, 28000, 1, '{}'],
    ['sh-circle',        'circle',        'Круглое (illuminator)',
      'Окно-иллюминатор / oeil-de-boeuf. Параметр diameter.',
      1.5, 25000, 1, '{}'],
    ['sh-quarter-circle','quarter_circle','Четверть круга',
      'Угловое — четверть окружности.',
      1.4, 16000, 1, '{}'],
    ['sh-polygon',       'polygon',       'Свободный многоугольник',
      'Произвольный N-угольник — для нестандартных проёмов.',
      1.3, 0, 0, '{"vertices":[[0,0],[1200,0],[1200,1800],[0,1800]]}'],
    ['sh-bay',           'bay',           'Эркер (bay window)',
      'Угловой выступ из 3-5 окон под углами 90°/120°/135°.',
      1.0, 0, 0, '{"panels":3,"angle":135}'],
  ];
  const tx = db.transaction(() => seeds.forEach(s => ins.run(...s)));
  tx();
}

// helpers ───────────────────────────────────────────────────────────────
export function logEvent(actor, action, detail = '') {
  db.prepare(`INSERT INTO log_events (actor,action,detail) VALUES (?,?,?)`).run(String(actor), action, detail);
}

export default db;
