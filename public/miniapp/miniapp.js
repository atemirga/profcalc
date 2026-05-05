// miniapp.js — ProfCalc Telegram Mini App (project-oriented)
(function () {
  const { api, fmtKZT, fmtNum } = window;
  const root = document.getElementById('root');

  // ── Telegram WebApp setup ─────────────────────────────────────────────
  const tg = window.Telegram?.WebApp;
  if (tg) {
    try {
      tg.ready(); tg.expand();
      tg.setHeaderColor && tg.setHeaderColor('#f5f2ec');
      tg.setBackgroundColor && tg.setBackgroundColor('#f5f2ec');
    } catch {}
  }

  // ── DOM helpers ───────────────────────────────────────────────────────
  function h(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') e.innerHTML = v;
      else e.setAttribute(k, v);
    }
    if (!Array.isArray(children)) children = [children];
    for (const c of children) {
      if (c == null || c === false) continue;
      e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return e;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function toast(msg, kind = '') {
    const t = h('div', { class: 'toast ' + kind }, msg);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2400);
    if (tg?.HapticFeedback) try { tg.HapticFeedback.notificationOccurred(kind === 'error' ? 'error' : 'success'); } catch {}
  }
  function loader() { return h('div', { class: 'loader' }, h('div', { class: 'spin' })); }

  // ── icons ─────────────────────────────────────────────────────────────
  const icons = {
    home: '<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M3 9l8-6 8 6v10a1 1 0 01-1 1h-4v-7H8v7H4a1 1 0 01-1-1V9z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    calc: '<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="3" y="3" width="16" height="16" rx="2" stroke="currentColor" stroke-width="1.6"/><line x1="11" y1="3" x2="11" y2="19" stroke="currentColor" stroke-width="1.6"/><line x1="3" y1="11" x2="19" y2="11" stroke="currentColor" stroke-width="1.6"/></svg>',
    catalog: '<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M4 4h6v14H4V4zM12 4h6v14h-6V4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><line x1="6" y1="8" x2="8" y2="8" stroke="currentColor" stroke-width="1.6"/><line x1="14" y1="8" x2="16" y2="8" stroke="currentColor" stroke-width="1.6"/></svg>',
    docs: '<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M5 3h9l4 4v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M14 3v4h4" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><line x1="7" y1="11" x2="15" y2="11" stroke="currentColor" stroke-width="1.6"/><line x1="7" y1="14" x2="15" y2="14" stroke="currentColor" stroke-width="1.6"/></svg>',
    profile: '<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="8" r="4" stroke="currentColor" stroke-width="1.6"/><path d="M3 19c0-4 4-6 8-6s8 2 8 6" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    bell: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 2c-3 0-5 2-5 5v3l-2 3h14l-2-3V7c0-3-2-5-5-5zM8 16a2 2 0 004 0" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    back: '<svg width="9" height="14" viewBox="0 0 9 14"><path d="M8 1L1 7l7 6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    plus: '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    chev: '<svg width="6" height="10" viewBox="0 0 6 10"><path d="M1 1l4 4-4 4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    check: '<svg width="12" height="10" viewBox="0 0 12 10"><path d="M1 5l3.5 3.5L11 1.5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pdf: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 1h6l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V2a1 1 0 011-1z" stroke="currentColor" stroke-width="1.4"/><text x="7" y="10" text-anchor="middle" font-size="4" font-weight="700" fill="currentColor">PDF</text></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M5 4V2h4v2M3 4l1 9h6l1-9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    copy: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="4" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.4"/><path d="M5 4V2a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1h-2" stroke="currentColor" stroke-width="1.4"/></svg>',
  };

  // ── state ─────────────────────────────────────────────────────────────
  const blankItem = () => ({
    name: 'Окно 1',
    layout: { width: 1500, height: 1400, rows: [{ sections: [{ opening: 'FIX' }, { opening: 'ПОП' }] }] },
    glazingId: 'g-4-10-4-10-4i',
    systemId: 'rehau-delight-70',
    colorId: 'c-white',
    hardwareKitId: 'hw-roto-nt',
    handleId: 'hnd-hoppe-atlanta',
    handleColorId: 'c-white',
    // installCost: { value, perM2 } — when set, overrides default INSTALL article price
    extras: { sill: true, ebb: true, mesh: true, install: true, installCost: null,
              sillId: 'sill-moeller-250', ebbId: 'ebb-zn-150', meshId: 'mesh-frame-std' },
    qty: 1,
  });
  const state = {
    me: null,
    notifUnread: 0,
    cache: { glazing: null, systems: null, openings: null, manus: null,
             colors: null, hwKits: null, handles: null, sills: null, ebbs: null, meshes: null },
    project: {
      id: null,
      name: '',
      clientName: '',
      clientPhone: '',
      clientAddress: '',
      manufacturerId: 'm-rehau',
      // Calculation scope — which categories to include in the price.
      // Defaults to "all". User can flip individual categories on/off.
      scope: ['profile', 'hardware', 'glazing', 'reinforcement', 'sealing', 'consumables', 'extras'],
      items: [],
      // ── Phase 5: factory/order fields
      objectName: '', responsible: '', warehouse: 'Центральный склад',
      orderNumber: '', clientCode: '', catalog: 'Logikal 12.6',
      assemblyFee: 0, assemblyPerM2: 0,
    },
    activeIdx: 0,            // currently edited item
    selected: { ri: 0, ci: 0 },
    lastResult: null,        // calcProject result
    lastKp: null,
  };
  // Catalog of scope categories with short labels for the chip UI
  const SCOPE_CATS = [
    { id: 'profile',       label: 'Профили',       hint: 'рама, створка, импост' },
    { id: 'hardware',      label: 'Фурнитура',     hint: 'Roto NT, доводчики' },
    { id: 'glazing',       label: 'Стеклопакеты',  hint: '4-10-4, энергосбер.' },
    { id: 'reinforcement', label: 'Армирование',   hint: 'оцинк. сталь' },
    { id: 'sealing',       label: 'Уплотнители',   hint: 'EPDM 2 контура' },
    { id: 'consumables',   label: 'Расходники',    hint: 'крепёж, герметик' },
    { id: 'extras',        label: 'Доп. (подок./сетка/монтаж)', hint: 'отлив, сетка, монтаж' },
  ];

  // ── routing ───────────────────────────────────────────────────────────
  const screens = {};
  const tabRoutes = new Set(['home', 'projects', 'catalog', 'documents', 'profile']);
  function go(route) { window.location.hash = '#/' + route; }
  function currentRoute() {
    const m = window.location.hash.match(/^#\/([^/]+)/);
    return (m && screens[m[1]]) ? m[1] : 'home';
  }
  function currentParam() {
    const parts = (window.location.hash.match(/^#\/[^/]+\/(.+)$/));
    return parts ? decodeURIComponent(parts[1]) : null;
  }
  window.addEventListener('hashchange', render);

  function setBackButton(handler) {
    if (!tg?.BackButton) return;
    if (handler) {
      tg.BackButton.show();
      if (window._bbHandler) tg.BackButton.offClick(window._bbHandler);
      tg.BackButton.onClick(handler);
      window._bbHandler = handler;
    } else {
      if (window._bbHandler) tg.BackButton.offClick(window._bbHandler);
      tg.BackButton.hide();
    }
  }
  function setMainButton(text, handler, color = '#b56b3a') {
    if (!tg?.MainButton) return;
    if (text && handler) {
      tg.MainButton.setText(text);
      tg.MainButton.setParams({ color });
      tg.MainButton.show();
      if (window._mbHandler) tg.MainButton.offClick(window._mbHandler);
      tg.MainButton.onClick(handler);
      window._mbHandler = handler;
    } else {
      tg.MainButton.hide();
    }
  }

  // ── shared layout pieces ─────────────────────────────────────────────
  function bar(title, opts = {}) {
    const { back, profileLink, bell } = opts;
    const right = h('div', { style: 'display:flex;align-items:center;gap:6px' }, [
      bell ? h('button', { class: 'icon-btn', onClick: () => go('notifications') }, [
        h('span', { html: icons.bell }),
        state.notifUnread > 0 ? h('span', { class: 'badge' }, String(state.notifUnread)) : null,
      ]) : null,
      profileLink ? h('button', { class: 'icon-btn', onClick: () => go('profile'), html: icons.profile }) : null,
    ]);
    return h('div', { class: 'bar' }, [
      back ? h('button', { class: 'back', onClick: back, html: icons.back }) : null,
      h('div', { class: 'title' }, title),
      right,
    ]);
  }

  function tabBar() {
    const cur = currentRoute();
    function tab(key, label, icon, badge) {
      return h('button', { class: cur === key ? 'active' : '', onClick: () => go(key) }, [
        h('span', { class: 'ico', html: icon }),
        h('span', {}, label),
        badge ? h('span', { class: 'badge' }, String(badge)) : null,
      ]);
    }
    return h('nav', { class: 'tabs' }, [
      tab('home',         'Главная',    icons.home),
      tab('projects',     'Проекты',    icons.calc),
      tab('catalog',      'Каталог',    icons.catalog),
      tab('documents',    'Документы',  icons.docs),
      tab('profile',      'Профиль',    icons.profile),
    ]);
  }

  // ── ONBOARDING ────────────────────────────────────────────────────────
  screens.onboarding = async function () {
    setBackButton(null); setMainButton(null);
    clear(root);
    root.appendChild(h('div', { class: 'bar' }, [h('div', { class: 'title' }, 'Добро пожаловать')]));
    const body = h('div', { class: 'body no-tabs' });
    root.appendChild(body);
    body.appendChild(h('div', { class: 'greet' }, [
      h('div', { class: 'hi' }, 'PLUR Solutions · Алматы'),
      h('div', { class: 'q' }, 'Кем вы пользуетесь ProfCalc?'),
    ]));
    body.appendChild(h('div', { style: 'color:var(--muted);font-size:13px;margin-bottom:22px;line-height:1.5' },
      'Выберите роль — это влияет на уровень цен и доступ к скидочной матрице.'));
    function role(opts) {
      return h('button', { class: 'role-card', onClick: opts.onClick }, [
        h('div', { class: 'ico', style: 'background:' + opts.bg }, opts.icon),
        h('div', { style: 'flex:1' }, [
          h('div', { class: 'name' }, opts.title),
          h('div', { class: 'sub' }, opts.sub),
          h('div', { class: 'level' }, opts.level),
        ]),
      ]);
    }
    body.appendChild(role({ icon: '🏠', bg: '#fef0e3', title: 'Розничный клиент', sub: 'Считаю окна для своей квартиры или дома. Розничные цены, отправка заявки оконщику.', level: 'РОЗНИЧНЫЕ ЦЕНЫ · бесплатно', onClick: () => go('register-client') }));
    body.appendChild(role({ icon: '🪟', bg: '#fbe4d3', title: 'Оконщик / Профильщик', sub: 'Делаю расчёты клиентам, продаю готовые окна. Дилерские цены + персональные скидки.', level: 'ДИЛЕРСКИЕ ЦЕНЫ · подписка', onClick: () => { state.regRole = 'okonshchik'; go('register'); } }));
    body.appendChild(role({ icon: '👷', bg: '#fbe4d3', title: 'Прораб', sub: 'Считаю окна для строительных объектов. Отдельная матрица скидок и условия.', level: 'ДИЛЕРСКИЕ ЦЕНЫ · подписка', onClick: () => { state.regRole = 'prorab'; go('register'); } }));
    body.appendChild(role({ icon: '🏭', bg: '#f5d8b8', title: 'Цех / завод', sub: 'Производственный участок. Расчёты в больших объёмах, прямые цены.', level: 'ЗАВОДСКИЕ ЦЕНЫ · подписка', onClick: () => { state.regRole = 'tsekh'; go('register'); } }));
  };

  screens['register-client'] = async function () {
    setBackButton(() => go('onboarding')); setMainButton(null);
    clear(root);
    root.appendChild(bar('Розничный клиент', { back: () => go('onboarding') }));
    const body = h('div', { class: 'body no-tabs' });
    root.appendChild(body);
    const tgu = state.me?.telegram || {};
    const fields = { name: tgu.first_name ? (tgu.first_name + (tgu.last_name ? ' ' + tgu.last_name : '')) : '', city: 'Алматы', phone: '' };
    body.appendChild(h('div', { style: 'color:var(--muted);font-size:13px;margin-bottom:18px;line-height:1.5' },
      'Контактные данные нужны, чтобы отправить вашу заявку оконщику.'));
    function tinp(key, ph, type = 'text') {
      const i = h('input', { class: 'tinp', type, placeholder: ph, value: fields[key] || '' });
      i.addEventListener('input', () => fields[key] = i.value);
      return i;
    }
    body.appendChild(tinp('name', 'Имя'));
    body.appendChild(tinp('city', 'Город'));
    body.appendChild(tinp('phone', 'Телефон (необязательно)', 'tel'));
    body.appendChild(h('button', { class: 'btn btn-accent', onClick: async () => {
      try {
        if (!fields.name || !fields.city) return toast('Заполните имя и город', 'error');
        const url = window.Telegram?.WebApp?.initData ? '/me/register-client' : '/me/register-client?devTgId=' + (tgu.id || Date.now());
        await api(url, { method: 'POST', body: JSON.stringify(fields) });
        state.me = await api('/me');
        toast('Готово!');
        go('home');
      } catch (e) { toast(e.message, 'error'); }
    } }, 'Начать пользоваться'));
  };

  screens.register = async function () {
    setBackButton(() => go('onboarding')); setMainButton(null);
    clear(root);
    const role = state.regRole || 'okonshchik';
    const titles = { okonshchik: 'Регистрация оконщика', prorab: 'Регистрация прораба', tsekh: 'Регистрация цеха' };
    const subs = {
      okonshchik: 'Дилерские цены + персональные скидки.',
      prorab: 'Профиль прораба для строительных объектов.',
      tsekh: 'Профиль производственного цеха / завода.',
    };
    const namePh = { okonshchik: 'Название (Окна Алматы ИП)', prorab: 'Имя или название бригады', tsekh: 'Название цеха / завода (ТОО)' };
    root.appendChild(bar(titles[role], { back: () => go('onboarding') }));
    const body = h('div', { class: 'body no-tabs' });
    root.appendChild(body);
    const tgu = state.me?.telegram || {};
    const tgName = [tgu.first_name, tgu.last_name].filter(Boolean).join(' ');
    const fields = {
      name: role === 'okonshchik' && tgName ? tgName : (state.me?.name || ''),
      city: state.me?.city || 'Алматы',
      bin: '',
      phone: state.me?.phone || '',
      role,
    };
    body.appendChild(h('div', { style: 'color:var(--muted);font-size:13px;margin-bottom:18px;line-height:1.5' }, subs[role]));
    body.appendChild(h('div', { class: 'role-pills' }, [
      ['okonshchik', 'Оконщик'], ['prorab', 'Прораб'], ['tsekh', 'Цех'],
    ].map(([key, label]) => h('button', { class: fields.role === key ? 'active' : '', onClick: () => { state.regRole = key; render(); } }, label))));
    function tinp(key, ph, type = 'text') {
      const i = h('input', { class: 'tinp', type, placeholder: ph, value: fields[key] || '' });
      i.addEventListener('input', () => fields[key] = i.value);
      return i;
    }
    body.appendChild(tinp('name', namePh[role]));
    body.appendChild(tinp('city', 'Город'));
    body.appendChild(tinp('bin', 'БИН (необязательно)'));
    body.appendChild(tinp('phone', 'Телефон', 'tel'));
    body.appendChild(h('button', { class: 'btn btn-accent', onClick: async () => {
      try {
        if (!fields.name || !fields.city) return toast('Заполните название и город', 'error');
        if (!window.Telegram?.WebApp?.initData) return toast('Регистрация оконщика — только в Telegram', 'error');
        await api('/me/register-installer', { method: 'POST', body: JSON.stringify(fields) });
        state.me = await api('/me');
        toast('Заявка принята');
        go('home');
      } catch (e) { toast(e.message, 'error'); }
    } }, 'Зарегистрироваться'));
  };

  // ── HOME ──────────────────────────────────────────────────────────────
  screens.home = async function () {
    setBackButton(null); setMainButton(null);
    const me = state.me;
    const meName = me?.kind === 'installer' ? me.name : (me?.name || me?.telegram?.first_name || 'друг');
    clear(root);
    root.appendChild(bar('ProfCalc', { profileLink: true, bell: true }));
    const body = h('div', { class: 'body' });
    root.appendChild(body);

    body.appendChild(h('div', { class: 'greet' }, [
      h('div', { class: 'hi' }, me?.kind === 'installer' ? me.roleLabel : 'Здравствуйте,'),
      h('div', { class: 'q' }, me?.kind === 'installer' ? 'Готовим расчёт?' : meName + ', что считаем?'),
    ]));

    body.appendChild(h('button', { class: 'big-action', onClick: startNewProject }, [
      h('div', { style: 'text-align:left' }, [
        h('div', { class: 'label' }, 'Новый замер / расчёт'),
        h('div', { class: 'sub' }, 'Несколько окон, дверей, проёмов — для одного клиента'),
      ]),
      h('div', { class: 'plus', html: icons.plus }),
    ]));

    if (me?.kind === 'installer') {
      body.appendChild(h('div', { class: 'stats' }, [
        statCard('Расчётов', me.calcs, '+12 за месяц'),
        statCard('Статус', me.verified ? '✓' : '○', me.verified ? 'верифицирован' : 'на модерации'),
      ]));
    }

    // Recent projects
    body.appendChild(h('div', { style: 'display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px;margin-top:6px' }, [
      h('div', { class: 'section-label', style: 'margin:0' }, 'Последние замеры'),
      h('a', { onClick: () => go('projects'), style: 'cursor:pointer' }, 'Все →'),
    ]));
    const listCard = h('div', { class: 'card list' });
    body.appendChild(listCard);
    try {
      const list = await api('/projects');
      const limit = list.slice(0, 5);
      if (!limit.length) {
        listCard.appendChild(h('div', { class: 'empty' }, 'Пока нет проектов. Создайте первый — тапните «Новый замер».'));
      } else {
        if (!state.cache.systems) state.cache.systems = await api('/profile-systems');
        for (const p of limit) listCard.appendChild(projectRow(p));
      }
    } catch {
      listCard.appendChild(h('div', { class: 'empty' }, 'Не удалось загрузить'));
    }

    body.appendChild(h('div', { class: 'footer' },
      'Платформа PLUR Solutions · 4 производителя · цены обновлены сегодня · ',
      h('a', { onClick: () => go('help'), style: 'cursor:pointer' }, 'Помощь'),
    ));
    body.appendChild(tabBar());
  };

  function statCard(label, value, delta) {
    return h('div', { class: 'stat' }, [
      h('div', { class: 'label' }, label),
      h('div', { class: 'value' }, String(value)),
      delta ? h('div', { class: 'delta' }, delta) : null,
    ]);
  }
  function projectRow(p) {
    const itemsCount = (p.items || []).length;
    const total = p.totals?.total || 0;
    return h('div', { class: 'row tap', onClick: () => loadProject(p.id) }, [
      h('div', { style: 'width:48px;height:36px;background:#f0ece4;border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0' },
        p.items?.length ? window.WindowSchema({ w: 44, h: 32, layout: p.items[0].layout, showDims: false }) : h('span')),
      h('div', { style: 'flex:1;min-width:0' }, [
        h('div', { style: 'font-size:13.5px;font-weight:600;letter-spacing:-.1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, p.client_name || p.name),
        h('div', { style: 'font-size:11px;color:var(--muted);font-family:var(--mono);margin-top:2px' },
          `${itemsCount} поз. · ${new Date(p.updated_at * 1000).toLocaleDateString('ru-RU')}`),
      ]),
      h('div', { class: 'right' }, [h('div', { style: 'font-size:13px;font-weight:600;font-family:var(--mono)' }, fmtKZT(total))]),
    ]);
  }
  async function loadProject(id) {
    const p = await api('/projects/' + id);
    state.project = {
      id: p.id, name: p.name,
      clientName: p.client_name || '', clientPhone: p.client_phone || '', clientAddress: p.client_address || '',
      manufacturerId: p.manufacturer_id || 'm-rehau',
      items: p.items || [],
      objectName: p.object_name || '', responsible: p.responsible || '',
      warehouse: p.warehouse || 'Центральный склад',
      orderNumber: p.order_number || '', clientCode: p.client_code || '',
      catalog: p.catalog || 'Logikal 12.6',
      assemblyFee: p.assembly_fee || 0, assemblyPerM2: p.assembly_per_m2 || 0,
    };
    state.activeIdx = 0;
    state.lastResult = p.totals || null;
    go('project');
  }
  function startNewProject() {
    state.project = {
      id: null,
      name: '',
      clientName: '', clientPhone: '', clientAddress: '',
      manufacturerId: 'm-rehau',
      items: [blankItem()],
      objectName: '', responsible: '', warehouse: 'Центральный склад',
      orderNumber: '', clientCode: '', catalog: 'Logikal 12.6',
      assemblyFee: 0, assemblyPerM2: 0,
    };
    state.activeIdx = 0;
    state.lastResult = null;
    state.lastKp = null;
    go('project');
  }

  // ── PROJECTS LIST ────────────────────────────────────────────────────
  screens.projects = async function () {
    setBackButton(null); setMainButton(null);
    clear(root);
    root.appendChild(bar('Мои замеры', { profileLink: true, bell: true }));
    const body = h('div', { class: 'body' });
    root.appendChild(body);

    body.appendChild(h('button', { class: 'btn btn-accent', style: 'margin-bottom:14px', onClick: startNewProject }, '+ Новый замер'));

    body.appendChild(h('div', { class: 'section-label' }, 'Замеры и расчёты'));
    body.appendChild(loader());
    try {
      const list = await api('/projects');
      body.lastChild.remove();
      if (!list.length) {
        body.appendChild(h('div', { class: 'empty' }, 'Пока пусто. Тапните «Новый замер».'));
      } else {
        if (!state.cache.systems) state.cache.systems = await api('/profile-systems');
        const card = h('div', { class: 'card list' });
        list.forEach(p => card.appendChild(projectRow(p)));
        body.appendChild(card);
      }
    } catch (e) { body.lastChild.replaceWith(h('div', { class: 'empty' }, 'Ошибка: ' + e.message)); }
    body.appendChild(tabBar());
  };

  // ── PROJECT (overview of current project) ────────────────────────────
  screens.project = async function () {
    setBackButton(() => go('projects'));
    if (!state.project.items.length) startNewProject();
    if (!state.cache.glazing) state.cache.glazing = await api('/glazing');
    if (!state.cache.systems) state.cache.systems = await api('/profile-systems');
    if (!state.cache.openings) state.cache.openings = await api('/opening-types');

    function paint() {
      clear(root);
      root.appendChild(bar(state.project.clientName || 'Замер', { back: () => go('projects'), profileLink: true, bell: true }));
      const body = h('div', { class: 'body' });
      root.appendChild(body);

      // Client info card (always visible — required for КП)
      body.appendChild(clientCard());

      // ── Phase 5: factory order card (object/responsible/warehouse/orderNumber + assembly fee)
      body.appendChild(orderCard());

      // Items
      body.appendChild(h('div', { class: 'section-label', style: 'display:flex;justify-content:space-between;align-items:baseline' }, [
        h('span', {}, `Позиции (${state.project.items.length})`),
        h('a', { onClick: addItem, style: 'cursor:pointer' }, '+ Добавить'),
      ]));

      const list = h('div', { style: 'display:flex;flex-direction:column;gap:10px;margin-bottom:18px' });
      body.appendChild(list);
      state.project.items.forEach((it, idx) => list.appendChild(itemCard(it, idx)));

      body.appendChild(h('div', { class: 'btn-row', style: 'margin-bottom:18px' }, [
        h('button', { class: 'btn btn-secondary', style: 'flex:1', onClick: addItem }, '+ Окно'),
        h('button', { class: 'btn btn-secondary', style: 'flex:1', onClick: openDoorPicker }, '+ Дверь'),
      ]));

      // Scope picker — choose which categories to include in the price
      body.appendChild(scopeCard());

      // Calculate + summary
      body.appendChild(h('button', { class: 'btn btn-accent', onClick: calcAll }, 'Рассчитать проект'));

      if (state.lastResult) {
        const r = state.lastResult;
        body.appendChild(h('div', { class: 'total', style: 'margin-top:14px' }, [
          h('div', { class: 'label' }, 'Итого по проекту'),
          h('div', { class: 'value' }, fmtKZT(r.total)),
          h('div', { class: 'meta' }, [
            h('span', {}, 'Подытог ' + fmtNum(r.subtotal)),
            r.discount > 0 ? h('span', {}, '· Скидка −' + fmtNum(r.discount)) : null,
            h('span', {}, '· НДС 12% включён'),
          ]),
        ]));

        // Per-category breakdown (only categories that actually contributed)
        if (state.lastResult.byCategory) {
          const bc = state.lastResult.byCategory;
          const rows = SCOPE_CATS.filter(c => (bc[c.id] || 0) > 0);
          if (rows.length) {
            body.appendChild(h('div', { class: 'card pad', style: 'margin-top:10px' }, [
              h('div', { style: 'font-size:12px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px' }, 'Разбивка по разделам'),
              h('div', { style: 'display:flex;flex-direction:column;gap:8px' },
                rows.map(c => h('div', { style: 'display:flex;justify-content:space-between;font-size:13px;align-items:baseline' }, [
                  h('span', {}, c.label),
                  h('span', { class: 'mono', style: 'font-weight:600' }, fmtKZT(bc[c.id])),
                ]))),
            ]));
          }
        }

        body.appendChild(h('div', { class: 'btn-row', style: 'margin-top:12px' }, [
          h('button', { class: 'btn btn-secondary', style: 'flex:1', onClick: saveProject }, 'Сохранить'),
          h('button', { class: 'btn btn-accent', style: 'flex:1.4', onClick: makeKp }, 'Сформировать КП'),
        ]));
      } else {
        body.appendChild(h('div', { class: 'btn-row', style: 'margin-top:12px' }, [
          h('button', { class: 'btn btn-secondary', style: 'flex:1', onClick: saveProject }, 'Сохранить как черновик'),
        ]));
      }

      body.appendChild(tabBar());
    }

    function scopeCard() {
      const sel = new Set(state.project.scope || []);
      const allOn = sel.size === SCOPE_CATS.length;
      const presets = [
        { id: 'all',    label: 'Всё',           cats: SCOPE_CATS.map(c => c.id) },
        { id: 'profile-only',  label: 'Только профиль',  cats: ['profile'] },
        { id: 'glass-only',    label: 'Только стекло',   cats: ['glazing'] },
        { id: 'hardware-only', label: 'Только фурнитура', cats: ['hardware'] },
        { id: 'no-extras',     label: 'Без доп.',        cats: SCOPE_CATS.filter(c => c.id !== 'extras').map(c => c.id) },
      ];
      function applyPreset(cats) {
        state.project.scope = cats.slice();
        state.lastResult = null;
        paint();
      }
      function toggleCat(id) {
        const s = new Set(state.project.scope || []);
        if (s.has(id)) s.delete(id); else s.add(id);
        if (!s.size) s.add(id); // never empty
        state.project.scope = [...s];
        state.lastResult = null;
        paint();
      }
      const card = h('div', { class: 'card pad', style: 'margin-bottom:14px' }, [
        h('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px' }, [
          h('div', { style: 'font-size:13px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.4px' }, 'Что считаем'),
          h('div', { style: 'font-size:11.5px;color:var(--muted)' }, allOn ? 'все разделы' : sel.size + ' из ' + SCOPE_CATS.length),
        ]),
        h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px' },
          presets.map(p => {
            const active = p.cats.length === sel.size && p.cats.every(c => sel.has(c));
            return h('button', {
              class: 'chip-sm' + (active ? ' active' : ''),
              style: `padding:5px 10px;border-radius:999px;border:1px solid ${active ? 'var(--accent)' : 'var(--rule)'};background:${active ? 'var(--accent)' : 'var(--panel)'};color:${active ? '#fff' : 'var(--text)'};font-size:11.5px;font-weight:500;cursor:pointer`,
              onClick: () => applyPreset(p.cats),
            }, p.label);
          })),
        h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px' },
          SCOPE_CATS.map(c => {
            const on = sel.has(c.id);
            return h('button', {
              style: `padding:7px 11px;border-radius:8px;border:1px solid ${on ? 'var(--accent)' : 'var(--rule)'};background:${on ? 'var(--accent-bg, #fbeede)' : 'var(--panel)'};color:${on ? 'var(--accent-dark, #8a4d24)' : 'var(--muted)'};font-size:12px;font-weight:${on ? 600 : 500};cursor:pointer;display:flex;align-items:center;gap:6px`,
              onClick: () => toggleCat(c.id),
            }, [
              h('span', { style: `width:14px;height:14px;border-radius:4px;border:1.5px solid ${on ? 'var(--accent-dark)' : 'var(--rule)'};background:${on ? 'var(--accent)' : 'transparent'};display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;line-height:1` }, on ? '✓' : ''),
              c.label,
            ]);
          })),
      ]);
      return card;
    }

    // ── Phase 5: order card — Logikal-style metadata block
    function orderCard() {
      const p = state.project;
      const filled = p.objectName || p.responsible || p.orderNumber;
      return h('div', { class: 'card pad', style: 'margin-bottom:14px' }, [
        h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px' }, [
          h('div', { style: 'font-size:13px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.4px' }, 'Заказ-накладная'),
          h('button', { class: 'btn-ghost', style: 'background:none;border:none;font-size:13px;font-weight:600;color:var(--accent);padding:0', onClick: editOrderSheet }, filled ? 'Изменить' : 'Заполнить'),
        ]),
        filled
          ? h('div', { style: 'font-size:13px;font-family:var(--mono);color:var(--text);line-height:1.55' }, [
              p.objectName ? h('div', {}, 'Объект: ' + p.objectName) : null,
              p.responsible ? h('div', {}, 'Отв.: ' + p.responsible) : null,
              p.orderNumber ? h('div', {}, '№ ' + p.orderNumber + ' · ' + (p.warehouse || '—')) : null,
              (p.assemblyFee > 0 || p.assemblyPerM2 > 0)
                ? h('div', { style: 'color:var(--accent-dark);font-weight:600;margin-top:4px' },
                    'Сборка: ' + (p.assemblyPerM2 > 0 ? fmtNum(p.assemblyPerM2) + ' ₸/м²' : fmtKZT(p.assemblyFee)))
                : null,
            ])
          : h('div', { style: 'color:var(--muted);font-size:13.5px;font-style:italic' }, 'Объект, отв. лицо, склад, № заказа, сборка — для накладной'),
        p.id ? h('button', {
          class: 'btn btn-secondary', style: 'width:100%;margin-top:10px;font-size:12px',
          onClick: () => {
            const url = window.location.origin + '/api/projects/' + p.id + '/invoice.pdf';
            if (tg?.openLink) tg.openLink(url, { try_instant_view: false }); else window.open(url, '_blank');
          },
        }, '📥 Скачать заявку-накладную PDF') : null,
      ]);
    }
    function editOrderSheet() {
      const p = state.project;
      const f = {
        objectName: p.objectName || '', responsible: p.responsible || '',
        warehouse: p.warehouse || 'Центральный склад', orderNumber: p.orderNumber || '',
        clientCode: p.clientCode || '', catalog: p.catalog || 'Logikal 12.6',
        assemblyFee: p.assemblyFee || 0, assemblyPerM2: p.assemblyPerM2 || 0,
      };
      sheet({
        title: 'Поля заказа-накладной',
        body: [
          h('div', { class: 'label-line' }, 'Объект (название)'),
          h('input', { class: 'tinp', value: f.objectName, oninput: e => f.objectName = e.target.value }),
          h('div', { class: 'label-line' }, 'Ответственное лицо'),
          h('input', { class: 'tinp', value: f.responsible, oninput: e => f.responsible = e.target.value }),
          h('div', { class: 'label-line' }, 'Склад'),
          h('input', { class: 'tinp', value: f.warehouse, oninput: e => f.warehouse = e.target.value }),
          h('div', { class: 'label-line' }, '№ заказа'),
          h('input', { class: 'tinp', value: f.orderNumber, oninput: e => f.orderNumber = e.target.value, placeholder: 'auto-сгенерируется' }),
          h('div', { class: 'label-line' }, 'Код клиента'),
          h('input', { class: 'tinp', value: f.clientCode, oninput: e => f.clientCode = e.target.value, placeholder: '120-100-0001' }),
          h('div', { class: 'label-line' }, 'Каталог'),
          h('input', { class: 'tinp', value: f.catalog, oninput: e => f.catalog = e.target.value }),
          h('div', { class: 'label-line', style: 'margin-top:10px' }, 'Сборка — фикс. сумма (₸)'),
          h('input', { class: 'tinp', type: 'number', value: f.assemblyFee, oninput: e => f.assemblyFee = parseInt(e.target.value, 10) || 0 }),
          h('div', { class: 'label-line' }, 'Сборка — за м² (₸/м²)'),
          h('input', { class: 'tinp', type: 'number', value: f.assemblyPerM2, oninput: e => f.assemblyPerM2 = parseInt(e.target.value, 10) || 0 }),
          h('div', { style: 'font-size:11px;color:var(--muted);margin-top:8px;line-height:1.4' },
            'Если задан "за м²" — он перебивает фикс. сумму.'),
        ],
        submit: 'Сохранить',
        onSubmit: () => {
          Object.assign(p, f);
          paint();
        },
      });
    }

    function clientCard() {
      return h('div', { class: 'card pad', style: 'margin-bottom:14px' }, [
        h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px' }, [
          h('div', { style: 'font-size:13px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.4px' }, 'Клиент'),
          h('button', { class: 'btn-ghost', style: 'background:none;border:none;font-size:13px;font-weight:600;color:var(--accent);padding:0', onClick: editClientSheet }, state.project.clientName ? 'Изменить' : 'Заполнить'),
        ]),
        state.project.clientName
          ? h('div', {}, [
              h('div', { style: 'font-size:15px;font-weight:600' }, state.project.clientName),
              h('div', { style: 'font-size:12.5px;color:var(--muted);margin-top:3px;font-family:var(--mono)' },
                [state.project.clientPhone, state.project.clientAddress].filter(Boolean).join(' · ')),
            ])
          : h('div', { style: 'color:var(--muted);font-size:13.5px;font-style:italic' }, 'Не указан — нажмите «Заполнить» (нужно для КП)'),
      ]);
    }

    function itemCard(it, idx) {
      const sys = state.cache.systems.find(s => s.id === it.systemId);
      const card = h('div', { class: 'card pad', style: 'cursor:pointer;' + (idx === state.activeIdx ? 'border-color:var(--accent);background:var(--accent-soft)' : '') }, [
        h('div', { style: 'display:flex;gap:12px;align-items:flex-start' }, [
          h('div', { style: 'width:80px;height:60px;background:#f0ece4;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:4px;flex-shrink:0' }),
          h('div', { style: 'flex:1;min-width:0' }, [
            h('div', { style: 'display:flex;justify-content:space-between;align-items:baseline' }, [
              h('div', { style: 'font-size:14px;font-weight:600' }, it.name),
              it.qty > 1 ? h('span', { style: 'font-size:11px;color:var(--muted);font-family:var(--mono)' }, '×' + it.qty) : null,
            ]),
            h('div', { style: 'font-size:11px;color:var(--muted);font-family:var(--mono);margin-top:2px' },
              `${it.layout.width} × ${it.layout.height} мм · ${sys?.name || it.systemId}`),
            h('div', { style: 'display:flex;gap:6px;margin-top:8px' }, [
              h('button', { class: 'btn-ghost', style: 'border:1px solid var(--rule);padding:5px 10px;font-size:12px;border-radius:7px;background:#fff', onClick: e => { e.stopPropagation(); state.activeIdx = idx; go('edit-item'); } }, 'Изменить'),
              h('button', { class: 'btn-ghost', style: 'border:1px solid var(--rule);padding:5px 10px;font-size:12px;border-radius:7px;background:#fff;color:var(--text)', onClick: e => { e.stopPropagation(); duplicateItem(idx); } }, [h('span', { html: icons.copy }), ' Копия']),
              h('button', { class: 'btn-ghost', style: 'border:1px solid var(--rule);padding:5px 10px;font-size:12px;border-radius:7px;background:#fff;color:var(--bad)', onClick: e => { e.stopPropagation(); removeItem(idx); } }, [h('span', { html: icons.trash })]),
            ]),
          ]),
        ]),
      ]);
      card.querySelector('div > div').appendChild(window.WindowSchema({ w: 76, h: 56, layout: it.layout, showDims: false }));
      card.addEventListener('click', () => { state.activeIdx = idx; go('edit-item'); });
      return card;
    }

    function addItem() {
      const next = blankItem();
      next.name = 'Окно ' + (state.project.items.length + 1);
      state.project.items.push(next);
      state.activeIdx = state.project.items.length - 1;
      state.lastResult = null;
      go('edit-item');
    }
    // ── Phase 7: dedicated door picker — opens a sheet with all door templates
    function openDoorPicker() {
      const doorTpls = (window.WINDOW_TEMPLATES || []).filter(t => t.category === 'door');
      const doorTypes = state.cache.doorTypes || [];
      sheet({
        title: 'Выберите тип двери',
        body: [
          h('div', { style: 'font-size:12.5px;color:var(--muted);margin-bottom:10px;line-height:1.5' },
            'Выберите дверь — фурнитура и комплектующие подберутся автоматически по типу (входная / балконная / штульповая / противопожарная / антипаника / французская / портал).'),
          h('div', { class: 'templates-grid' },
            doorTpls.map(t => {
              const dt = doorTypes.find(d => d.id === t.doorType);
              const card = h('div', { class: 'tpl', onClick: () => { closeSheet(); addDoorWithType(t); } }, [
                h('div', { class: 'preview' }),
                h('div', { class: 'name' }, t.name),
                h('div', { class: 'sub' }, t.sub),
                h('div', { class: 'dim' }, t.width + ' × ' + t.height + ' мм'),
                dt && Number(dt.reinforcement_factor) > 1 ? h('div', { style: 'font-size:10px;color:var(--accent);font-weight:600;margin-top:3px' }, `Армирование ×${dt.reinforcement_factor}`) : null,
              ]);
              card.querySelector('.preview').appendChild(window.WindowSchema({ w: 130, h: 130, layout: t.build(), showDims: false }));
              return card;
            })),
        ],
      });
    }
    function addDoorWithType(tpl) {
      const next = blankItem();
      next.name = tpl.name + ' ' + (state.project.items.filter(i => (i.doorTypeId || (i.layout?.rows || []).some(r => r.sections.some(s => (s.opening || '').startsWith('ДВЕРЬ'))))).length + 1);
      next.layout = tpl.build();
      next.doorTypeId = tpl.doorType || null;
      // Auto-clear doorKit so calc.js fills it from door_type.required_components
      next.doorKit = {};
      // Door-rated handle by default
      const dt = (state.cache.doorTypes || []).find(d => d.id === tpl.doorType);
      if (dt && dt.code === 'antipanic') {
        next.handleId = 'hnd-antipanic';
      } else {
        next.handleId = 'hnd-dorma-klong';
      }
      next.handleColorId = 'c-7024';
      // Door-rated hardware kit
      next.hardwareKitId = tpl.doorType === 'dt-portal' ? 'hw-sliding-portal' : 'hw-roto-door';
      state.project.items.push(next);
      state.activeIdx = state.project.items.length - 1;
      state.lastResult = null;
      go('edit-item');
    }
    function duplicateItem(idx) {
      const copy = JSON.parse(JSON.stringify(state.project.items[idx]));
      copy.name = copy.name + ' (копия)';
      state.project.items.splice(idx + 1, 0, copy);
      state.lastResult = null;
      paint();
    }
    function removeItem(idx) {
      if (state.project.items.length === 1) return toast('Хотя бы одна позиция должна быть', 'error');
      if (!confirm('Удалить позицию «' + state.project.items[idx].name + '»?')) return;
      state.project.items.splice(idx, 1);
      state.activeIdx = Math.max(0, state.activeIdx - 1);
      state.lastResult = null;
      paint();
    }
    function editClientSheet() {
      const f = { name: state.project.clientName, phone: state.project.clientPhone, address: state.project.clientAddress };
      sheet({
        title: 'Данные клиента',
        body: [
          h('div', { class: 'label-line' }, 'Имя клиента'),
          h('input', { class: 'tinp', value: f.name, oninput: e => f.name = e.target.value }),
          h('div', { class: 'label-line' }, 'Телефон'),
          h('input', { class: 'tinp', type: 'tel', value: f.phone, oninput: e => f.phone = e.target.value }),
          h('div', { class: 'label-line' }, 'Адрес объекта'),
          h('input', { class: 'tinp', value: f.address, oninput: e => f.address = e.target.value }),
        ],
        submit: 'Сохранить',
        onSubmit: () => {
          if (!f.name) throw new Error('Имя клиента обязательно');
          state.project.clientName = f.name; state.project.clientPhone = f.phone; state.project.clientAddress = f.address;
          if (!state.project.name) state.project.name = f.name;
          paint();
        },
      });
    }
    async function calcAll() {
      try {
        const r = await api('/projects/calc', { method: 'POST', body: JSON.stringify({
          items: state.project.items, manufacturerId: state.project.manufacturerId,
          scope: state.project.scope,
        }) });
        state.lastResult = r;
        const scopeText = (state.project.scope || []).length === SCOPE_CATS.length ? '' : ` · ${(state.project.scope || []).length} разд.`;
        toast('Рассчитано: ' + fmtKZT(r.total) + scopeText);
        paint();
      } catch (e) { toast(e.message, 'error'); }
    }
    async function saveProject() {
      try {
        if (!state.project.clientName) { editClientSheet(); return; }
        const body = {
          name: state.project.name || state.project.clientName,
          clientName: state.project.clientName, clientPhone: state.project.clientPhone, clientAddress: state.project.clientAddress,
          manufacturerId: state.project.manufacturerId,
          items: state.project.items,
          objectName: state.project.objectName, responsible: state.project.responsible,
          warehouse: state.project.warehouse, orderNumber: state.project.orderNumber,
          clientCode: state.project.clientCode, catalog: state.project.catalog,
          assemblyFee: state.project.assemblyFee, assemblyPerM2: state.project.assemblyPerM2,
        };
        if (state.project.id) {
          await api('/projects/' + state.project.id, { method: 'PUT', body: JSON.stringify(body) });
        } else {
          const r = await api('/projects', { method: 'POST', body: JSON.stringify(body) });
          state.project.id = r.id;
        }
        toast('Сохранено');
        paint();
      } catch (e) { toast(e.message, 'error'); }
    }
    async function makeKp() {
      try {
        if (!state.project.clientName) { editClientSheet(); return; }
        if (!state.project.id) await saveProject();
        if (!state.project.id) return;
        const kp = await api('/kp', { method: 'POST', body: JSON.stringify({
          projectId: state.project.id,
          clientName: state.project.clientName,
          clientAddress: state.project.clientAddress,
          clientPhone: state.project.clientPhone,
        }) });
        state.lastKp = kp;
        go('kp');
      } catch (e) { toast(e.message, 'error'); }
    }

    paint();
  };

  // ── EDIT ITEM (constructor) ──────────────────────────────────────────
  screens['edit-item'] = async function () {
    setBackButton(() => go('project'));
    if (!state.project.items.length) { go('project'); return; }
    if (!state.cache.glazing) state.cache.glazing = await api('/glazing');
    if (!state.cache.systems) state.cache.systems = await api('/profile-systems');
    if (!state.cache.openings) state.cache.openings = await api('/opening-types');
    if (!state.cache.colors)  state.cache.colors  = await api('/colors').catch(() => []);
    if (!state.cache.hwKits)  state.cache.hwKits  = await api('/hardware_kits').catch(() => []);
    if (!state.cache.handles) state.cache.handles = await api('/handles').catch(() => []);
    if (!state.cache.sills)   state.cache.sills   = await api('/sills').catch(() => []);
    if (!state.cache.ebbs)    state.cache.ebbs    = await api('/ebbs').catch(() => []);
    if (!state.cache.meshes)  state.cache.meshes  = await api('/meshes').catch(() => []);
    if (!state.cache.doorHw)  state.cache.doorHw  = await api('/door_hardware').catch(() => []);
    if (!state.cache.doorTypes) state.cache.doorTypes = await api('/door_types').catch(() => []);

    const item = state.project.items[state.activeIdx];
    // backfill defaults for older items
    if (!item.colorId)        item.colorId = 'c-white';
    if (!item.hardwareKitId)  item.hardwareKitId = 'hw-roto-nt';
    if (!item.handleId)       item.handleId = 'hnd-hoppe-atlanta';
    if (!item.handleColorId)  item.handleColorId = item.colorId;
    if (!item.extras.sillId)  item.extras.sillId = 'sill-moeller-250';
    if (!item.extras.ebbId)   item.extras.ebbId = 'ebb-zn-150';
    if (!item.extras.meshId)  item.extras.meshId = 'mesh-frame-std';

    function paint() {
      clear(root);
      root.appendChild(bar('Позиция: ' + item.name, { back: () => go('project'), profileLink: true, bell: true }));
      const body = h('div', { class: 'body' });
      root.appendChild(body);

      // Item name + qty
      body.appendChild(h('div', { class: 'card pad', style: 'margin-bottom:14px' }, [
        h('div', { style: 'display:flex;gap:8px' }, [
          (() => { const i = h('input', { class: 'tinp', style: 'flex:2;margin:0', value: item.name, placeholder: 'Название (Гостиная, Спальня)' }); i.addEventListener('input', () => item.name = i.value); return i; })(),
          (() => { const i = h('input', { class: 'tinp', style: 'flex:1;margin:0', type: 'number', value: item.qty || 1, min: 1, max: 99, placeholder: 'кол-во' }); i.addEventListener('input', () => item.qty = parseInt(i.value, 10) || 1); return i; })(),
        ]),
      ]));

      // Templates (compact strip — full picker via sheet)
      body.appendChild(h('div', { style: 'display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px' }, [
        h('div', { class: 'section-label', style: 'margin:0' }, 'Шаблон'),
        h('a', { onClick: openTemplatePicker, style: 'cursor:pointer' }, 'Все 18 →'),
      ]));
      body.appendChild(h('div', { class: 'templates-grid', style: 'margin-bottom:18px' },
        window.WINDOW_TEMPLATES.slice(0, 6).map(t => {
          const card = h('div', { class: 'tpl', onClick: () => { item.layout = t.build(); state.selected = { ri: 0, ci: 0 }; paint(); } }, [
            h('div', { class: 'preview' }),
            h('div', { class: 'name' }, t.name),
            h('div', { class: 'sub' }, t.sub),
          ]);
          card.querySelector('.preview').appendChild(window.WindowSchema({ w: 130, h: 90, layout: t.build(), showDims: false }));
          return card;
        }),
      ));

      // Drawing surface
      body.appendChild(h('div', { class: 'section-label' }, 'Конструкция'));
      const drawCard = h('div', { class: 'card pad', style: 'margin-bottom:14px' });
      drawCard.appendChild(h('div', { class: 'size-line' }, [
        h('div', { class: 'dims' }, `${item.layout.width} × ${item.layout.height} мм`),
        h('button', { class: 'edit', onClick: openTotalSizeSheet }, 'Размер ✎'),
      ]));
      const drawWrap = h('div', { class: 'draw' });
      drawWrap.appendChild(window.WindowSchema({
        w: 320, h: 240, layout: item.layout, showDims: true,
        highlight: state.selected ? `${state.selected.ri}:${state.selected.ci}` : null,
        onPick: (ri, ci) => { state.selected = { ri, ci }; openSectionSheet(ri, ci); paint(); },
      }));
      drawCard.appendChild(drawWrap);
      body.appendChild(drawCard);

      // Layout actions
      body.appendChild(h('div', { class: 'quick-row' }, [
        h('button', { class: 'quick', onClick: addRowAbove }, '+ Ряд сверху'),
        h('button', { class: 'quick', onClick: addRowBelow }, '+ Ряд снизу'),
        h('button', { class: 'quick', onClick: addSectionLeft }, '+ Слева'),
        h('button', { class: 'quick', onClick: addSectionRight }, '+ Справа'),
      ]));

      // Sections summary
      body.appendChild(h('div', { class: 'section-label' }, 'Секции'));
      const sectionsCard = h('div', { class: 'card list', style: 'margin-bottom:18px' });
      item.layout.rows.forEach((row, ri) => {
        row.sections.forEach((sec, ci) => {
          const sel = state.selected.ri === ri && state.selected.ci === ci;
          const op = sec.opening || 'FIX';
          const opLabel = state.cache.openings.find(o => o.code === op)?.label || op;
          sectionsCard.appendChild(h('div', { class: 'row tap', style: sel ? 'background:var(--accent-soft)' : '', onClick: () => { state.selected = { ri, ci }; openSectionSheet(ri, ci); } }, [
            h('div', { style: 'width:36px;height:30px;background:#f0ece4;border-radius:5px;display:flex;align-items:center;justify-content:center;flex-shrink:0' }, window.MiniOpeningGlyph(op, '#1f1d1a')),
            h('div', { style: 'flex:1;min-width:0' }, [
              h('div', { style: 'font-size:13px;font-weight:500' }, `Ряд ${ri + 1} · Секция ${ci + 1}`),
              h('div', { style: 'font-size:11px;color:var(--muted);font-family:var(--mono)' }, opLabel + ' · ' + (sec.width_mm ? sec.width_mm + 'мм' : '~') + ' × ' + (row.height_mm ? row.height_mm + 'мм' : '~')),
            ]),
            h('div', { class: 'mono', style: 'color:var(--faint);font-size:11px' }, op),
            h('div', { html: icons.chev, style: 'color:var(--faint)' }),
          ]));
        });
      });
      body.appendChild(sectionsCard);

      // System picker
      body.appendChild(h('div', { class: 'section-label' }, 'Профильная система'));
      const sysCard = h('div', { class: 'card list', style: 'margin-bottom:14px' });
      state.cache.systems.forEach(sys => {
        const sel = sys.id === item.systemId;
        sysCard.appendChild(h('div', { class: 'glaz-row' + (sel ? ' sel' : ''), onClick: () => { item.systemId = sys.id; paint(); } }, [
          h('div', { class: 'radio' }),
          h('div', { class: 'meta' }, [
            h('div', { class: 'label' }, sys.name),
            h('div', { class: 'sub' }, `${sys.vendor} · ${sys.chambers} камер · ${sys.depth} мм`),
          ]),
        ]));
      });
      body.appendChild(sysCard);

      // Glazing picker
      body.appendChild(h('div', { class: 'section-label' }, 'Стеклопакет'));
      const glCard = h('div', { class: 'card list', style: 'margin-bottom:14px' });
      state.cache.glazing.forEach(g => {
        const sel = g.id === item.glazingId;
        glCard.appendChild(h('div', { class: 'glaz-row' + (sel ? ' sel' : ''), onClick: () => { item.glazingId = g.id; paint(); } }, [
          h('div', { class: 'radio' }),
          h('div', { class: 'meta' }, [
            h('div', { class: 'label' }, g.label),
            h('div', { class: 'sub' }, `${g.formula} · ${g.thickness} мм`),
          ]),
          h('div', { class: 'price' }, [fmtKZT(g.price), h('span', { class: 'muted', style: 'font-size:10px;font-weight:500' }, '/м²')]),
        ]));
      });
      body.appendChild(glCard);

      // ── Phase 1: Color of profile
      body.appendChild(h('div', { class: 'section-label' }, 'Цвет профиля'));
      const colorWrap = h('div', { class: 'card pad', style: 'margin-bottom:14px;display:flex;flex-wrap:wrap;gap:8px' });
      state.cache.colors.forEach(c => {
        const sel = c.id === item.colorId;
        const swatch = h('button', {
          onClick: () => { item.colorId = c.id; paint(); },
          style: `display:flex;align-items:center;gap:8px;padding:6px 10px 6px 6px;border-radius:8px;border:1.5px solid ${sel ? 'var(--accent)' : 'var(--rule)'};background:${sel ? 'var(--accent-soft, #fbeede)' : '#fff'};cursor:pointer;font-size:12.5px;font-weight:${sel ? 600 : 500}`,
        }, [
          h('span', { style: `width:22px;height:22px;border-radius:4px;background:${c.hex || '#ccc'};border:1px solid rgba(0,0,0,.15);flex-shrink:0` }),
          h('span', {}, [c.ral, c.surcharge_pct ? h('span', { style: 'color:var(--accent);font-family:var(--mono);font-size:10px;margin-left:4px' }, '+' + c.surcharge_pct + '%') : null]),
        ]);
        colorWrap.appendChild(swatch);
      });
      body.appendChild(colorWrap);

      // ── Phase 1: Hardware kit
      body.appendChild(h('div', { class: 'section-label' }, 'Фурнитура'));
      const hwCard = h('div', { class: 'card list', style: 'margin-bottom:14px' });
      const isDoor = (item.layout.rows || []).some(r => (r.sections || []).some(s => (s.opening || '').startsWith('ДВЕРЬ')));
      const hasSliding = (item.layout.rows || []).some(r => (r.sections || []).some(s => (s.opening || '').startsWith('РАЗД')));
      const hwFiltered = state.cache.hwKits.filter(k => isDoor ? true : (hasSliding ? true : k.kind === 'window'));
      hwFiltered.forEach(k => {
        const sel = k.id === item.hardwareKitId;
        hwCard.appendChild(h('div', { class: 'glaz-row' + (sel ? ' sel' : ''), onClick: () => { item.hardwareKitId = k.id; paint(); } }, [
          h('div', { class: 'radio' }),
          h('div', { class: 'meta' }, [
            h('div', { class: 'label' }, k.vendor + ' · ' + k.name),
            h('div', { class: 'sub' }, ({ window: 'Оконная', door: 'Дверная', sliding: 'Раздвижная' })[k.kind] + (k.notes ? ' · ' + k.notes : '')),
          ]),
          h('div', { class: 'price' }, [fmtKZT(k.price_per_sash), h('span', { class: 'muted', style: 'font-size:10px;font-weight:500' }, '/створка')]),
        ]));
      });
      body.appendChild(hwCard);

      // ── Phase 1: Handle (model + color)
      body.appendChild(h('div', { class: 'section-label' }, 'Ручка'));
      const handleCard = h('div', { class: 'card list', style: 'margin-bottom:8px' });
      const handlesFiltered = state.cache.handles.filter(hd => isDoor ? true : hd.kind === 'window');
      handlesFiltered.forEach(hd => {
        const sel = hd.id === item.handleId;
        handleCard.appendChild(h('div', { class: 'glaz-row' + (sel ? ' sel' : ''), onClick: () => { item.handleId = hd.id; paint(); } }, [
          h('div', { class: 'radio' }),
          h('div', { class: 'meta' }, [
            h('div', { class: 'label' }, hd.vendor + ' · ' + hd.name),
            h('div', { class: 'sub' }, ({ window: 'Оконная', door: 'Дверная' })[hd.kind]),
          ]),
          h('div', { class: 'price' }, fmtKZT(hd.price)),
        ]));
      });
      body.appendChild(handleCard);
      // handle color picker
      body.appendChild(h('div', { class: 'card pad', style: 'margin-bottom:14px;display:flex;flex-wrap:wrap;gap:6px;align-items:center' }, [
        h('div', { style: 'font-size:12px;color:var(--muted);margin-right:6px' }, 'Цвет ручки:'),
        ...state.cache.colors.map(c => {
          const sel = c.id === item.handleColorId;
          return h('button', {
            onClick: () => { item.handleColorId = c.id; paint(); },
            title: c.ral,
            style: `width:24px;height:24px;border-radius:50%;background:${c.hex || '#ccc'};border:${sel ? '2.5px solid var(--accent)' : '1.5px solid rgba(0,0,0,.15)'};cursor:pointer;padding:0`,
          });
        }),
      ]));

      // ── Phase 7: Door type picker (entrance/balcony/shtulp/french/firedoor/antipanic/portal)
      if (isDoor && (state.cache.doorTypes || []).length) {
        body.appendChild(h('div', { class: 'section-label' }, 'Тип двери'));
        const dtCard = h('div', { class: 'card list', style: 'margin-bottom:14px' });
        // "Не задан" option
        const none = h('div', { class: 'glaz-row' + (!item.doorTypeId ? ' sel' : ''), onClick: () => { item.doorTypeId = null; paint(); } }, [
          h('div', { class: 'radio' }),
          h('div', { class: 'meta' }, [
            h('div', { class: 'label' }, 'Универсальная'),
            h('div', { class: 'sub' }, 'Без специализации — стандартный комплект'),
          ]),
        ]);
        dtCard.appendChild(none);
        state.cache.doorTypes.forEach(dt => {
          const sel = dt.id === item.doorTypeId;
          dtCard.appendChild(h('div', { class: 'glaz-row' + (sel ? ' sel' : ''), onClick: () => {
            item.doorTypeId = dt.id;
            // Reset doorKit so calc.js applies door_type defaults on next calc
            item.doorKit = {};
            state._dkExpanded = false;
            paint();
          } }, [
            h('div', { class: 'radio' }),
            h('div', { class: 'meta' }, [
              h('div', { class: 'label' }, dt.name),
              h('div', { class: 'sub' }, dt.description || ''),
            ]),
            Number(dt.reinforcement_factor) > 1 ? h('div', { style: 'font-size:10.5px;color:var(--accent);font-weight:600;font-family:var(--mono)' }, '×' + dt.reinforcement_factor) : null,
          ]));
        });
        body.appendChild(dtCard);
      }

      // ── Phase 2 + improvement: Door hardware kit with presets (Базовый / Расширенный / Все)
      if (isDoor) {
        if (!item.doorKit) item.doorKit = {};
        const dk = item.doorKit;
        const dhByCat = {};
        state.cache.doorHw.forEach(d => { (dhByCat[d.category] = dhByCat[d.category] || []).push(d); });
        const catKey = {
          lock: 'lockId', lock_tongue: 'lockTongueId', cylinder: 'cylinderId',
          hinge: 'hingeId', closer: 'closerId', threshold: 'thresholdId',
          strike: 'strikeId', rosette: 'rosetteId', fixator: 'fixatorId', handle_kit: 'handleKitId',
        };
        const catLabel = {
          lock: 'Замок основной', lock_tongue: 'Замок язычковый', cylinder: 'Личинка',
          hinge: 'Петли (3 шт)', closer: 'Доводчик', threshold: 'Порог (по ширине двери)',
          strike: 'Ответная планка', rosette: 'Розетка', fixator: 'Фиксатор', handle_kit: 'Фурнитура для ручки',
        };
        // Preset definitions
        const presets = {
          minimal: {
            label: 'Минимум', desc: '5 позиций — замок, личинка, петли, ручка, порог',
            cats: ['lock', 'cylinder', 'hinge', 'handle_kit', 'threshold'],
            values: { lock: 'dh-lock-bachok-dorma', cylinder: 'dh-cyl-kale', hinge: 'dh-hinge-hn3303-sk', handle_kit: 'dh-handle-kit-sk', threshold: 'dh-thresh-pvc' },
          },
          basic: {
            label: 'Базовый', desc: '7 позиций — стандарт DORMA + K-LONG',
            cats: ['lock', 'cylinder', 'hinge', 'closer', 'handle_kit', 'strike', 'threshold'],
            values: { lock: 'dh-lock-bachok-dorma', cylinder: 'dh-cyl-dorma', hinge: 'dh-hinge-hn3303-sk', closer: 'dh-closer-ts73-dorma', handle_kit: 'dh-handle-kit-sk', strike: 'dh-strike-klong', threshold: 'dh-thresh-55gold' },
          },
          full: {
            label: 'Расширенный', desc: '10 позиций — всё из накладной (DORMA TS77 + 2 замка + фиксатор + розетка)',
            cats: ['lock', 'lock_tongue', 'cylinder', 'hinge', 'closer', 'threshold', 'strike', 'rosette', 'fixator', 'handle_kit'],
            values: { lock: 'dh-lock-bachok-dorma', lock_tongue: 'dh-lock-tongue-dorma', cylinder: 'dh-cyl-dorma', hinge: 'dh-hinge-hn3303-sk', closer: 'dh-closer-ts77-dorma', threshold: 'dh-thresh-55gold', strike: 'dh-strike-klong', rosette: 'dh-rosette-sk', fixator: 'dh-fixator-klong', handle_kit: 'dh-handle-kit-sk' },
          },
        };
        // Detect current preset
        function detectPreset() {
          for (const [name, p] of Object.entries(presets)) {
            const enabledCats = Object.entries(catKey).filter(([cat]) => dk[catKey[cat]] !== null && dk[catKey[cat]] !== undefined ? dk[catKey[cat]] : true);
            // Simple check: count enabled (non-null) keys equals preset.cats.length AND every preset.cat key is set
            const presetSet = new Set(p.cats.map(c => catKey[c]));
            const liveSet = new Set(Object.keys(catKey).filter(c => {
              const v = dk[catKey[c]];
              return v !== null;  // null = explicitly disabled
            }).map(c => catKey[c]));
            if (presetSet.size === liveSet.size && [...presetSet].every(k => liveSet.has(k))) return name;
          }
          return 'custom';
        }
        function applyPreset(name) {
          const p = presets[name];
          if (!p) return;
          // Set all 10 cats: enable preset.cats with their default values, null the rest
          Object.keys(catKey).forEach(cat => {
            dk[catKey[cat]] = p.cats.includes(cat) ? (p.values[cat] || dhByCat[cat]?.[0]?.id || null) : null;
          });
          state._dkExpanded = false;
          paint();
        }
        const curPreset = detectPreset();
        if (state._dkExpanded == null) state._dkExpanded = curPreset === 'custom';

        body.appendChild(h('div', { class: 'section-label' }, 'Дверной комплект'));

        // Preset chips
        body.appendChild(h('div', { class: 'card pad', style: 'margin-bottom:8px;display:flex;flex-direction:column;gap:8px' }, [
          h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
            Object.entries(presets).map(([name, p]) => {
              const sel = curPreset === name && !state._dkExpanded;
              return h('button', {
                onClick: () => applyPreset(name),
                style: `padding:8px 14px;border-radius:8px;border:1.5px solid ${sel ? 'var(--accent)' : 'var(--rule)'};background:${sel ? 'var(--accent)' : '#fff'};color:${sel ? '#fff' : 'var(--text)'};font-size:12.5px;font-weight:${sel ? 600 : 500};cursor:pointer;display:flex;flex-direction:column;align-items:flex-start;gap:2px;flex:1;min-width:130px`,
              }, [
                h('span', { style: 'font-weight:600' }, p.label),
                h('span', { style: `font-size:10.5px;font-weight:500;color:${sel ? 'rgba(255,255,255,.85)' : 'var(--muted)'}` }, p.desc),
              ]);
            })),
          h('button', {
            onClick: () => { state._dkExpanded = !state._dkExpanded; paint(); },
            style: 'background:none;border:none;color:var(--accent);font-size:12.5px;font-weight:600;text-align:left;cursor:pointer;padding:4px 0',
          }, state._dkExpanded ? '▾ Скрыть индивидуальную настройку' : (curPreset === 'custom' ? '⚙ Кастомный набор' : '⚙ Настроить вручную (10 параметров)')),
        ]));

        // Detailed dropdowns (only when expanded)
        if (state._dkExpanded) {
          const dCard = h('div', { class: 'card pad', style: 'margin-bottom:14px;display:flex;flex-direction:column;gap:10px' });
          Object.keys(catLabel).forEach(cat => {
            const opts = dhByCat[cat] || [];
            if (!opts.length) return;
            const curId = dk[catKey[cat]] !== undefined ? dk[catKey[cat]] : (presets.full.values[cat] || null);
            const sel = h('select', { style: 'flex:1;padding:7px 9px;border:1px solid var(--rule);border-radius:7px;font-size:12.5px;background:#fff' }, [
              h('option', { value: '' }, '— не нужно —'),
              ...opts.map(o => h('option', { value: o.id, selected: o.id === curId ? 'selected' : null },
                `${o.vendor} · ${o.name} · ${fmtNum(o.price)} ₸/${o.unit}`)),
            ]);
            sel.value = curId || '';
            sel.addEventListener('change', () => { dk[catKey[cat]] = sel.value || null; paint(); });
            dCard.appendChild(h('div', { style: 'display:flex;align-items:center;gap:8px' }, [
              h('div', { style: 'width:130px;font-size:12px;color:var(--muted);font-weight:500' }, catLabel[cat]),
              sel,
            ]));
          });
          body.appendChild(dCard);
        } else {
          // Compact summary of active components when collapsed
          const activeCats = Object.keys(catLabel).filter(cat => {
            const v = dk[catKey[cat]];
            return v !== null && v !== '';
          });
          body.appendChild(h('div', { class: 'card pad', style: 'margin-bottom:14px;font-size:12px;color:var(--muted);line-height:1.5' },
            'Включено: ' + activeCats.length + ' компонентов · ' +
            activeCats.map(c => catLabel[c].split(' ')[0]).join(', ')));
        }
      }

      // ── Phase 3: special profile additions
      body.appendChild(h('div', { class: 'section-label' }, 'Спец. профили'));
      const specCard = h('div', { class: 'card list', style: 'margin-bottom:14px' });
      [
        ['turnProfile',  'Разворотный профиль', 'для дверей с поворотным открыванием'],
        ['frameAdapter', 'Адаптер рамы',         'для наружного открывания двери'],
      ].forEach(([key, label, hint]) => {
        const sel = !!item[key];
        specCard.appendChild(h('div', { class: 'label-row' + (sel ? ' sel' : ''), onClick: () => { item[key] = !item[key]; paint(); } }, [
          h('div', { class: 'ck', html: sel ? icons.check : '' }),
          h('div', { class: 'l', style: 'flex:1' }, [
            h('div', { style: 'font-size:14px' }, label),
            h('div', { style: 'font-size:11px;color:var(--muted);margin-top:2px' }, hint),
          ]),
        ]));
      });
      body.appendChild(specCard);

      // Extras
      body.appendChild(h('div', { class: 'section-label' }, 'Дополнительно'));
      const extrasCard = h('div', { class: 'card list', style: 'margin-bottom:14px' });
      [
        ['sill', 'Подоконник'], ['ebb', 'Отлив'], ['mesh', 'Москитная сетка'], ['install', 'Монтаж'],
      ].forEach(([key, label]) => {
        const sel = !!item.extras[key];
        extrasCard.appendChild(h('div', { class: 'label-row' + (sel ? ' sel' : ''), onClick: () => { item.extras[key] = !item.extras[key]; paint(); } }, [
          h('div', { class: 'ck', html: sel ? icons.check : '' }),
          h('div', { class: 'l', style: 'font-size:14px' }, label),
        ]));
      });
      body.appendChild(extrasCard);

      // ── Phase 1: Sill / Ebb / Mesh model selectors — grouped by vendor/material/kind
      function groupedPicker(titleStr, list, itemKey, groupKey, groupLabel, fmt) {
        if (!list.length) return null;
        // Group items by groupKey
        const groups = {};
        list.forEach(rec => {
          const k = rec[groupKey] || '—';
          (groups[k] = groups[k] || []).push(rec);
        });
        const groupNames = Object.keys(groups).sort();
        // Track which group is expanded — find the group that contains the currently selected item
        const curId = item.extras[itemKey];
        const curRec = list.find(r => r.id === curId);
        const stateKey = '_pickerExpand_' + itemKey;
        if (state[stateKey] == null) state[stateKey] = curRec ? curRec[groupKey] : groupNames[0];
        const card = h('div', { class: 'card', style: 'margin-bottom:10px;overflow:hidden' });
        groupNames.forEach(gn => {
          const expanded = state[stateKey] === gn;
          const items = groups[gn];
          const hasSel = items.some(r => r.id === curId);
          // Group header
          card.appendChild(h('div', {
            style: `display:flex;align-items:center;justify-content:space-between;padding:10px 14px;cursor:pointer;background:${expanded ? 'var(--accent-soft, #fbeede)' : '#faf7f1'};border-bottom:1px solid var(--rule);font-size:12.5px;font-weight:600`,
            onClick: () => { state[stateKey] = expanded ? null : gn; paint(); },
          }, [
            h('div', { style: 'display:flex;align-items:center;gap:8px' }, [
              h('span', { html: expanded ? '▾' : '▸', style: 'font-size:10px;color:var(--muted)' }),
              h('span', {}, groupLabel(gn)),
              hasSel ? h('span', { style: 'font-size:10px;color:var(--accent);font-weight:600' }, '● выбрано') : null,
            ]),
            h('span', { style: 'font-size:11px;color:var(--muted);font-weight:500' }, items.length + ' моделей'),
          ]));
          if (expanded) {
            items.forEach(rec => {
              const sel = rec.id === curId;
              card.appendChild(h('div', { class: 'glaz-row' + (sel ? ' sel' : ''), style: 'border-bottom:1px solid var(--rule)', onClick: () => { item.extras[itemKey] = rec.id; paint(); } }, [
                h('div', { class: 'radio' }),
                h('div', { class: 'meta' }, fmt(rec)),
                h('div', { class: 'price' }, fmt.price ? fmt.price(rec) : ''),
              ]));
            });
          }
        });
        return h('div', {}, [
          h('div', { class: 'section-label', style: 'margin-top:6px' }, titleStr),
          card,
        ]);
      }
      if (item.extras.sill) {
        const fmt = (s) => [
          h('div', { class: 'label' }, s.name + ' · ' + s.width_mm + ' мм'),
          h('div', { class: 'sub' }, s.color || ''),
        ];
        fmt.price = (s) => [fmtKZT(s.price_per_m), h('span', { class: 'muted', style: 'font-size:10px;font-weight:500' }, '/м')];
        body.appendChild(groupedPicker('Подоконник', state.cache.sills, 'sillId', 'vendor', v => v, fmt));
      }
      if (item.extras.ebb) {
        const fmt = (e) => [
          h('div', { class: 'label' }, e.width_mm + ' мм'),
          h('div', { class: 'sub' }, e.color || ''),
        ];
        fmt.price = (e) => [fmtKZT(e.price_per_m), h('span', { class: 'muted', style: 'font-size:10px;font-weight:500' }, '/м')];
        body.appendChild(groupedPicker('Отлив', state.cache.ebbs, 'ebbId', 'material', m => m, fmt));
      }
      if (item.extras.mesh) {
        const kindL = { frame: 'Рамочная', sliding: 'Раздвижная', pleated: 'Плиссе', antikoshka: 'Антикошка', roll: 'Рулонная' };
        const fmt = (m) => [
          h('div', { class: 'label' }, m.name),
          h('div', { class: 'sub' }, m.color || ''),
        ];
        fmt.price = (m) => [fmtKZT(m.price_per_unit), h('span', { class: 'muted', style: 'font-size:10px;font-weight:500' }, '/' + m.unit)];
        body.appendChild(groupedPicker('Москитная сетка', state.cache.meshes, 'meshId', 'kind', k => kindL[k] || k, fmt));
      }

      // Install cost editor — visible only when install is enabled
      if (item.extras.install) {
        const ic = item.extras.installCost;
        const isCustom = ic && typeof ic === 'object';
        const valInp = h('input', {
          type: 'number', min: 0, step: 100,
          value: isCustom ? (ic.value || '') : '',
          placeholder: 'по умолчанию',
          style: 'flex:1;padding:8px 10px;border:1px solid var(--rule);border-radius:8px;font-family:var(--mono);font-size:14px;text-align:right',
        });
        const perM2 = h('input', { type: 'checkbox' });
        if (isCustom && ic.perM2) perM2.checked = true;
        valInp.addEventListener('change', () => {
          const v = parseFloat(valInp.value);
          if (!v || v <= 0) { item.extras.installCost = null; }
          else item.extras.installCost = { value: Math.round(v), perM2: perM2.checked };
          paint();
        });
        perM2.addEventListener('change', () => {
          const v = parseFloat(valInp.value);
          if (!v || v <= 0) return;
          item.extras.installCost = { value: Math.round(v), perM2: perM2.checked };
          paint();
        });
        body.appendChild(h('div', { class: 'card pad', style: 'margin-bottom:22px' }, [
          h('div', { style: 'font-size:13px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px' }, 'Стоимость монтажа'),
          h('div', { style: 'display:flex;align-items:center;gap:10px;margin-bottom:8px' }, [
            valInp,
            h('span', { style: 'font-size:13px;color:var(--muted)' }, '₸'),
          ]),
          h('label', { style: 'display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted);cursor:pointer' }, [
            perM2, 'считать за м² (иначе за весь объект)',
          ]),
          h('div', { style: 'font-size:11px;color:var(--muted);margin-top:8px' },
            isCustom ? `Своя цена: ${fmtNum(ic.value)} ₸ ${ic.perM2 ? '/м²' : '/объект'}` : 'Оставьте пустым, чтобы использовать прайс-лист.'),
        ]));
      }

      body.appendChild(h('button', { class: 'btn btn-accent', onClick: () => { state.lastResult = null; go('project'); } }, 'Готово'));

      body.appendChild(tabBar());
    }

    function openTotalSizeSheet() {
      const f = { width: item.layout.width, height: item.layout.height };
      sheet({
        title: 'Общий размер, мм',
        body: [
          h('div', { class: 'grid', style: 'grid-template-columns:1fr 1fr' }, [
            h('div', {}, [h('div', { class: 'label-line' }, 'Ширина'), numInput(f, 'width', 300, 8000)]),
            h('div', {}, [h('div', { class: 'label-line' }, 'Высота'), numInput(f, 'height', 300, 4000)]),
          ]),
          h('div', { style: 'font-size:11px;color:var(--muted);margin-top:8px;line-height:1.4' }, 'Допустимо: 300–8000 мм по ширине, 300–4000 мм по высоте (для витражей и панорам).'),
        ],
        submit: 'OK',
        onSubmit: () => {
          item.layout.width = clampInt(f.width, 300, 8000);
          item.layout.height = clampInt(f.height, 300, 4000);
          paint();
        },
      });
    }
    function openSectionSheet(ri, ci) {
      const row = item.layout.rows[ri];
      const sec = row.sections[ci];
      const f = { opening: sec.opening || 'FIX', width_mm: sec.width_mm || '', height_mm: row.height_mm || '' };
      sheet({
        title: `Ряд ${ri + 1} · Секция ${ci + 1}`,
        body: [
          h('div', { class: 'label-line' }, 'Тип открывания'),
          (function () {
            const grid = h('div', { class: 'opening-grid', style: 'margin-top:6px' });
            function refresh() {
              clear(grid);
              state.cache.openings.forEach(o => {
                const sel = o.code === f.opening;
                const btn = h('button', { class: 'opt' + (sel ? ' sel' : ''), onClick: () => { f.opening = o.code; refresh(); } }, [
                  h('div', { class: 'glyph' }), h('div', { class: 'code' }, o.code),
                ]);
                btn.querySelector('.glyph').appendChild(window.MiniOpeningGlyph(o.code, sel ? '#fff' : '#1f1d1a'));
                grid.appendChild(btn);
              });
            }
            refresh();
            return grid;
          })(),
          h('div', { style: 'margin-top:14px' }, [h('div', { class: 'label-line' }, 'Ширина секции, мм (пусто = авто)'), numInputOpt(f, 'width_mm', 0, 8000)]),
          h('div', { style: 'margin-top:14px' }, [h('div', { class: 'label-line' }, 'Высота ряда, мм (пусто = авто)'), numInputOpt(f, 'height_mm', 0, 4000)]),
          h('div', { style: 'margin-top:18px;display:flex;gap:8px' }, [
            h('button', { class: 'btn btn-secondary', style: 'flex:1', onClick: () => { closeSheet(); deleteSection(); } }, 'Удалить секцию'),
            h('button', { class: 'btn btn-secondary', style: 'flex:1', onClick: () => { closeSheet(); deleteRow(ri); } }, 'Удалить ряд'),
          ]),
        ],
        submit: 'Сохранить',
        onSubmit: () => {
          sec.opening = f.opening;
          sec.width_mm = f.width_mm ? clampInt(f.width_mm, 100, 8000) : null;
          row.height_mm = f.height_mm ? clampInt(f.height_mm, 100, 4000) : null;
          paint();
        },
      });
    }
    function addRowAbove() { item.layout.rows.splice(state.selected.ri, 0, { sections: [{ opening: 'FIX' }] }); paint(); }
    function addRowBelow() { item.layout.rows.splice(state.selected.ri + 1, 0, { sections: [{ opening: 'FIX' }] }); state.selected.ri++; paint(); }
    function addSectionLeft() { item.layout.rows[state.selected.ri].sections.splice(state.selected.ci, 0, { opening: 'FIX' }); paint(); }
    function addSectionRight() { item.layout.rows[state.selected.ri].sections.splice(state.selected.ci + 1, 0, { opening: 'FIX' }); state.selected.ci++; paint(); }
    function deleteSection() {
      const row = item.layout.rows[state.selected.ri];
      if (row.sections.length === 1) {
        if (item.layout.rows.length === 1) return toast('Нельзя удалить последнюю', 'error');
        item.layout.rows.splice(state.selected.ri, 1);
        state.selected = { ri: 0, ci: 0 };
      } else {
        row.sections.splice(state.selected.ci, 1);
        state.selected.ci = Math.max(0, state.selected.ci - 1);
      }
      paint();
    }
    function deleteRow(ri) {
      if (item.layout.rows.length === 1) return toast('Нельзя удалить последний ряд', 'error');
      item.layout.rows.splice(ri, 1);
      state.selected = { ri: 0, ci: 0 };
      paint();
    }
    function openTemplatePicker() {
      const filter = state._tplFilter || 'all';
      const counts = { all: 0, window: 0, door: 0, mixed: 0 };
      window.WINDOW_TEMPLATES.forEach(t => { counts.all++; counts[t.category]++; });
      const tabs = [
        ['all',    'Все',     counts.all],
        ['window', 'Окна',    counts.window],
        ['door',   'Двери',   counts.door],
        ['mixed',  'Смешанные', counts.mixed],
      ];
      function chipBar() {
        return h('div', { style: 'display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap' },
          tabs.map(([k, lbl, c]) => h('button', {
            onClick: () => { state._tplFilter = k; openTemplatePicker(); },
            style: `padding:6px 12px;border-radius:6px;border:1.5px solid ${filter === k ? 'var(--accent)' : 'var(--rule)'};background:${filter === k ? 'var(--accent)' : '#fff'};color:${filter === k ? '#fff' : 'var(--text)'};font-size:12px;font-weight:${filter === k ? 600 : 500};cursor:pointer`,
          }, lbl + ' (' + c + ')')));
      }
      const list = window.WINDOW_TEMPLATES.filter(t => filter === 'all' || t.category === filter);
      sheet({
        title: 'Выберите шаблон',
        body: [
          chipBar(),
          h('div', { class: 'templates-grid', style: 'margin-top:6px' },
            list.map(t => {
              const isDoor = t.category === 'door';
              const card = h('div', { class: 'tpl', onClick: () => {
                item.layout = t.build();
                state.selected = { ri: 0, ci: 0 };
                if (isDoor && t.doorType) {
                  item.doorTypeId = t.doorType;
                  item.doorKit = {};
                  item.handleId = (t.doorType === 'dt-antipanic') ? 'hnd-antipanic' : 'hnd-dorma-klong';
                  item.handleColorId = 'c-7024';
                  item.hardwareKitId = t.doorType === 'dt-portal' ? 'hw-sliding-portal' : 'hw-roto-door';
                }
                closeSheet(); paint();
              } }, [
                h('div', { class: 'preview' }),
                h('div', { class: 'name' }, t.name),
                h('div', { class: 'sub' }, t.sub),
                h('div', { class: 'dim' }, t.width + ' × ' + t.height + ' мм'),
                isDoor ? h('div', { style: 'font-size:10px;color:var(--accent);font-weight:600;margin-top:2px' }, '🚪 ДВЕРЬ') : null,
              ]);
              card.querySelector('.preview').appendChild(window.WindowSchema({ w: 130, h: 90, layout: t.build(), showDims: false }));
              return card;
            }),
          ),
        ],
      });
    }

    paint();
  };

  function clampInt(v, lo, hi) {
    const n = parseInt(v, 10);
    if (Number.isNaN(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
  }
  function numInput(fields, key, min, max) {
    const i = h('input', { type: 'number', class: 'num', value: fields[key], min, max });
    i.addEventListener('input', () => fields[key] = i.value);
    return i;
  }
  function numInputOpt(fields, key, min, max) {
    const i = h('input', { type: 'number', class: 'num', value: fields[key] || '', min, max, placeholder: 'авто' });
    i.addEventListener('input', () => fields[key] = i.value);
    return i;
  }

  // ── BOTTOM SHEET ─────────────────────────────────────────────────────
  function sheet(opts) {
    closeSheet();
    const bg = h('div', { class: 'sheet-bg', onClick: e => { if (e.target === bg) closeSheet(); } });
    const s = h('div', { class: 'sheet' });
    bg.appendChild(s);
    s.appendChild(h('h3', {}, opts.title));
    if (Array.isArray(opts.body)) opts.body.forEach(c => s.appendChild(c));
    else if (opts.body) s.appendChild(opts.body);
    if (opts.onSubmit) {
      s.appendChild(h('div', { class: 'row' }, [
        h('button', { class: 'btn btn-secondary', style: 'flex:1', onClick: closeSheet }, 'Отмена'),
        h('button', { class: 'btn btn-accent', style: 'flex:1.4', onClick: () => { try { opts.onSubmit(); closeSheet(); } catch (e) { toast(e.message, 'error'); } } }, opts.submit || 'OK'),
      ]));
    }
    document.body.appendChild(bg);
    window._sheet = bg;
  }
  function closeSheet() { if (window._sheet) { window._sheet.remove(); window._sheet = null; } }

  // ── KP (commercial offer for project) ─────────────────────────────────
  screens.kp = async function () {
    setBackButton(() => go('project'));
    if (!state.lastKp) {
      try {
        if (!state.project.id) return toast('Сначала сохраните проект', 'error');
        state.lastKp = await api('/kp', { method: 'POST', body: JSON.stringify({
          projectId: state.project.id,
          clientName: state.project.clientName, clientPhone: state.project.clientPhone, clientAddress: state.project.clientAddress,
        }) });
      } catch (e) { clear(root); root.appendChild(bar('КП', { back: () => go('project') })); root.appendChild(h('div', { class: 'body no-tabs' }, h('div', { class: 'empty' }, 'Ошибка: ' + e.message))); return; }
    }
    setMainButton('Скачать PDF', () => downloadPdf());

    clear(root);
    root.appendChild(bar('Коммерческое предложение', { back: () => go('project'), profileLink: true, bell: true }));
    const body = h('div', { class: 'body' });
    root.appendChild(body);

    body.appendChild(h('div', { class: 'card pad', style: 'margin-bottom:14px;text-align:center' }, [
      h('div', { style: 'font-size:13px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.4px' }, 'КП №'),
      h('div', { style: 'font-size:28px;font-weight:700;font-family:var(--mono);color:var(--accent-dark);letter-spacing:-.5px;margin-top:4px' }, state.lastKp.number),
      h('div', { style: 'font-size:13px;color:var(--muted);margin-top:4px' }, new Date().toLocaleDateString('ru-RU')),
    ]));

    body.appendChild(h('div', { class: 'card pad', style: 'margin-bottom:14px' }, [
      h('div', { class: 'section-label', style: 'margin-top:0' }, 'Заказчик'),
      h('div', { style: 'font-size:15px;font-weight:600' }, state.project.clientName),
      h('div', { style: 'font-size:12.5px;color:var(--muted);margin-top:4px;font-family:var(--mono)' },
        [state.project.clientPhone, state.project.clientAddress].filter(Boolean).join(' · ')),
    ]));

    body.appendChild(h('div', { class: 'total' }, [
      h('div', { class: 'label' }, 'Итого по проекту'),
      h('div', { class: 'value' }, fmtKZT(state.lastKp.total)),
      h('div', { class: 'meta' }, [h('span', {}, state.project.items.length + ' позиций · НДС включён')]),
    ]));

    body.appendChild(h('div', { class: 'section-label' }, 'Позиции'));
    const list = h('div', { style: 'display:flex;flex-direction:column;gap:10px;margin-bottom:18px' });
    state.project.items.forEach((it, idx) => {
      const card = h('div', { class: 'card pad' }, [
        h('div', { style: 'display:flex;gap:10px' }, [
          h('div', { style: 'width:80px;height:60px;background:#f0ece4;border-radius:6px;display:flex;align-items:center;justify-content:center;padding:4px' }),
          h('div', { style: 'flex:1' }, [
            h('div', { style: 'font-size:14px;font-weight:600' }, (idx + 1) + '. ' + it.name),
            h('div', { style: 'font-size:11px;color:var(--muted);font-family:var(--mono);margin-top:2px' }, `${it.layout.width} × ${it.layout.height} мм` + (it.qty > 1 ? ' · ×' + it.qty : '')),
          ]),
        ]),
      ]);
      card.querySelector('div > div').appendChild(window.WindowSchema({ w: 76, h: 56, layout: it.layout, showDims: false }));
      list.appendChild(card);
    });
    body.appendChild(list);

    body.appendChild(h('div', { class: 'btn-row' }, [
      h('button', { class: 'btn btn-accent', style: 'flex:1', onClick: downloadPdf }, [h('span', { html: icons.pdf }), ' Скачать PDF']),
      h('button', { class: 'btn btn-secondary', style: 'flex:1', onClick: () => {
        const url = window.location.origin + '/api/kp/' + state.lastKp.id + '.pdf';
        if (tg?.shareMessage) tg.shareMessage(`КП №${state.lastKp.number} · ${fmtKZT(state.lastKp.total)} — ${url}`);
        else navigator.clipboard?.writeText(`КП №${state.lastKp.number} · ${url}`);
        toast('Ссылка скопирована');
      } }, 'Поделиться'),
    ]));

    body.appendChild(tabBar());
  };

  function downloadPdf() {
    if (!state.lastKp) return;
    const url = window.location.origin + '/api/kp/' + state.lastKp.id + '.pdf';
    if (tg?.openLink) {
      tg.openLink(url, { try_instant_view: false });
    } else {
      window.open(url, '_blank');
    }
  }

  // ── CATALOG ──────────────────────────────────────────────────────────
  screens.catalog = async function () {
    setBackButton(null); setMainButton(null);
    clear(root);
    root.appendChild(bar('Каталог', { profileLink: true, bell: true }));
    const body = h('div', { class: 'body' });
    root.appendChild(body);

    body.appendChild(h('div', { class: 'section-label' }, 'Производители'));
    body.appendChild(loader());
    try {
      const manus = await api('/manufacturers');
      body.lastChild.remove();
      manus.forEach(m => {
        body.appendChild(h('div', { class: 'cat-card', onClick: () => go('manufacturer/' + m.id) }, [
          h('div', { class: 'logo' }, m.name.split(' ')[0].slice(0, 3).toUpperCase()),
          h('div', { class: 'l' }, [
            h('div', { class: 'name' }, m.name),
            h('div', { class: 'meta' }, m.region + ' · ' + m.systems.length + ' систем'),
            h('div', { class: 'star' }, '★ ' + m.rating),
          ]),
          h('div', { html: icons.chev, style: 'color:var(--faint)' }),
        ]));
      });
    } catch (e) { body.lastChild.replaceWith(h('div', { class: 'empty' }, 'Ошибка')); }

    body.appendChild(h('div', { class: 'section-label', style: 'margin-top:18px' }, 'Профильные системы'));
    try {
      const sys = await api('/profile-systems');
      const card = h('div', { class: 'card list' });
      sys.forEach(s => card.appendChild(h('div', { class: 'row' }, [
        h('div', { style: 'flex:1' }, [
          h('div', { style: 'font-size:14px;font-weight:600' }, s.name),
          h('div', { style: 'font-size:11px;color:var(--muted);font-family:var(--mono);margin-top:2px' }, `${s.vendor} · ${s.chambers} камер · ${s.depth} мм`),
        ]),
      ])));
      body.appendChild(card);
    } catch {}

    body.appendChild(h('div', { class: 'section-label', style: 'margin-top:18px' }, 'Стеклопакеты'));
    try {
      const gl = await api('/glazing');
      const card = h('div', { class: 'card list' });
      gl.forEach(g => card.appendChild(h('div', { class: 'row' }, [
        h('div', { style: 'flex:1' }, [
          h('div', { style: 'font-size:14px;font-weight:600' }, g.label),
          h('div', { style: 'font-size:11px;color:var(--muted);font-family:var(--mono);margin-top:2px' }, `${g.formula} · ${g.thickness} мм`),
        ]),
        h('div', { class: 'mono', style: 'font-weight:600' }, fmtKZT(g.price) + '/м²'),
      ])));
      body.appendChild(card);
    } catch {}

    body.appendChild(h('div', { class: 'section-label', style: 'margin-top:18px' }, 'Шаблоны окон'));
    body.appendChild(h('div', { class: 'templates-grid' },
      window.WINDOW_TEMPLATES.map(t => {
        const card = h('div', { class: 'tpl' }, [h('div', { class: 'preview' }), h('div', { class: 'name' }, t.name), h('div', { class: 'sub' }, t.sub), h('div', { class: 'dim' }, t.width + '×' + t.height)]);
        card.querySelector('.preview').appendChild(window.WindowSchema({ w: 130, h: 90, layout: t.build(), showDims: false }));
        return card;
      }),
    ));

    body.appendChild(tabBar());
  };

  screens.manufacturer = async function () {
    const id = currentParam();
    setBackButton(() => go('catalog'));
    clear(root);
    root.appendChild(bar('Производитель', { back: () => go('catalog'), profileLink: true }));
    const body = h('div', { class: 'body' });
    root.appendChild(body);
    try {
      const [manus, sys] = await Promise.all([api('/manufacturers'), api('/profile-systems')]);
      const m = manus.find(x => x.id === id);
      if (!m) { body.appendChild(h('div', { class: 'empty' }, 'Не найден')); body.appendChild(tabBar()); return; }
      body.appendChild(h('div', { class: 'card pad', style: 'margin-bottom:14px' }, [
        h('div', { style: 'font-size:18px;font-weight:700' }, m.name),
        h('div', { style: 'color:var(--muted);font-size:13px;margin-top:4px' }, m.region),
        h('div', { style: 'color:var(--accent);font-size:13px;margin-top:6px;font-weight:600' }, '★ ' + m.rating + ' · ' + m.status),
      ]));
      body.appendChild(h('div', { class: 'section-label' }, 'Профильные системы'));
      const card = h('div', { class: 'card list' });
      m.systems.forEach(sid => {
        const s = sys.find(x => x.id === sid);
        if (!s) return;
        card.appendChild(h('div', { class: 'row' }, [
          h('div', { style: 'flex:1' }, [
            h('div', { style: 'font-size:14px;font-weight:600' }, s.name),
            h('div', { style: 'font-size:11px;color:var(--muted);font-family:var(--mono)' }, `${s.chambers} камер · ${s.depth} мм`),
          ]),
        ]));
      });
      body.appendChild(card);
    } catch (e) { body.appendChild(h('div', { class: 'empty' }, e.message)); }
    body.appendChild(tabBar());
  };

  // ── DOCUMENTS ────────────────────────────────────────────────────────
  screens.documents = async function () {
    setBackButton(null); setMainButton(null);
    clear(root);
    root.appendChild(bar('Документы', { profileLink: true, bell: true }));
    const body = h('div', { class: 'body' });
    root.appendChild(body);

    body.appendChild(h('div', { class: 'section-label' }, 'Заявки от клиентов'));
    try {
      const orders = await api('/orders');
      if (!orders.length) {
        body.appendChild(h('div', { class: 'card pad', style: 'margin-bottom:14px;text-align:center;color:var(--muted);font-size:13px' }, 'Заявок нет'));
      } else {
        const card = h('div', { class: 'card list', style: 'margin-bottom:14px' });
        orders.forEach(o => card.appendChild(h('div', { class: 'row tap', onClick: () => go('order/' + o.id) }, [
          h('div', { style: 'flex:1' }, [
            h('div', { style: 'font-size:13.5px;font-weight:500' }, o.client_name),
            h('div', { style: 'font-size:11px;color:var(--muted);margin-top:2px' }, new Date(o.created_at * 1000).toLocaleString('ru-RU')),
          ]),
          h('span', { class: 'pill pill-' + o.status }, statusLabel(o.status)),
          h('div', { html: icons.chev, style: 'color:var(--faint)' }),
        ])));
        body.appendChild(card);
      }
    } catch {}

    body.appendChild(h('div', { class: 'section-label' }, 'Мои КП'));
    try {
      const kps = await api('/my/kps');
      if (!kps.length) {
        body.appendChild(h('div', { class: 'card pad', style: 'margin-bottom:14px;text-align:center;color:var(--muted);font-size:13px' }, 'КП ещё не сформированы'));
      } else {
        const card = h('div', { class: 'card list', style: 'margin-bottom:14px' });
        kps.forEach(k => card.appendChild(h('div', { class: 'row tap', onClick: () => { state.lastKp = { id: k.id, number: k.number, total: k.total }; downloadPdf(); } }, [
          h('div', { style: 'flex:1' }, [
            h('div', { style: 'font-size:13.5px;font-weight:600;font-family:var(--mono)' }, '№ ' + k.number),
            h('div', { style: 'font-size:11px;color:var(--muted);margin-top:2px' }, k.client_name + ' · ' + new Date(k.created_at * 1000).toLocaleDateString('ru-RU')),
          ]),
          h('div', { class: 'mono', style: 'font-weight:600' }, fmtKZT(k.total)),
          h('div', { html: icons.pdf, style: 'color:var(--accent);margin-left:6px' }),
        ])));
        body.appendChild(card);
      }
    } catch {}

    body.appendChild(h('div', { class: 'section-label' }, 'Мои проекты'));
    try {
      const projects = await api('/projects');
      if (!projects.length) {
        body.appendChild(h('div', { class: 'card pad', style: 'text-align:center;color:var(--muted);font-size:13px' }, 'Пока пусто'));
      } else {
        if (!state.cache.systems) state.cache.systems = await api('/profile-systems');
        const card = h('div', { class: 'card list' });
        projects.slice(0, 20).forEach(p => card.appendChild(projectRow(p)));
        body.appendChild(card);
      }
    } catch {}

    body.appendChild(tabBar());
  };
  function statusLabel(st) {
    return ({ new: 'Новая', contacted: 'Связались', measuring: 'Замер', production: 'Производство', installation: 'Монтаж', done: 'Готово', cancelled: 'Отменена' })[st] || st;
  }

  screens.order = async function () {
    const id = currentParam();
    setBackButton(() => go('documents'));
    clear(root);
    root.appendChild(bar('Заявка', { back: () => go('documents'), profileLink: true }));
    const body = h('div', { class: 'body' });
    root.appendChild(body);
    try {
      const o = await api('/orders/' + id);
      body.appendChild(h('div', { class: 'card pad', style: 'margin-bottom:14px' }, [
        h('div', { style: 'display:flex;align-items:center;justify-content:space-between' }, [
          h('div', { style: 'font-size:16px;font-weight:600' }, o.client_name),
          h('span', { class: 'pill pill-' + o.status }, statusLabel(o.status)),
        ]),
        h('div', { style: 'color:var(--muted);font-size:12.5px;margin-top:8px;font-family:var(--mono)' },
          (o.client_phone || '') + (o.client_address ? ' · ' + o.client_address : '')),
        o.comment ? h('div', { style: 'background:#faf7f1;padding:10px;border-radius:8px;margin-top:10px;font-size:13px' }, o.comment) : null,
      ]));
      if (o.calc) {
        const card = h('div', { class: 'card pad', style: 'margin-bottom:14px;text-align:center' });
        card.appendChild(window.WindowSchema({ w: 280, h: 200, layout: o.calc.layout || { width: o.calc.width, height: o.calc.height, rows: [{ sections: o.calc.sections.map(op => ({ opening: op })) }] } }));
        card.appendChild(h('div', { style: 'margin-top:8px;font-family:var(--mono);font-size:13px;font-weight:600' }, fmtKZT(o.calc.total)));
        body.appendChild(card);
      }
      if (state.me?.kind === 'installer' && o.installer_id === state.me.id) {
        body.appendChild(h('div', { class: 'section-label' }, 'Обновить статус'));
        const statusCard = h('div', { class: 'card pad', style: 'display:flex;flex-wrap:wrap;gap:6px' });
        ['new', 'contacted', 'measuring', 'production', 'installation', 'done', 'cancelled'].forEach(s => {
          statusCard.appendChild(h('button', { class: 'pill pill-' + s, style: 'border:1px solid ' + (s === o.status ? 'var(--accent)' : 'transparent') + ';cursor:pointer;padding:6px 10px', onClick: async () => { await api('/orders/' + o.id, { method: 'PUT', body: JSON.stringify({ status: s }) }); toast('Обновлено'); render(); } }, statusLabel(s)));
        });
        body.appendChild(statusCard);
      }
    } catch (e) { body.appendChild(h('div', { class: 'empty' }, e.message)); }
    body.appendChild(tabBar());
  };

  // ── PROFILE ──────────────────────────────────────────────────────────
  screens.profile = async function () {
    setBackButton(null); setMainButton(null);
    state.me = await api('/me');
    const me = state.me;
    clear(root);
    root.appendChild(bar('Профиль', { profileLink: false, bell: true }));
    const body = h('div', { class: 'body' });
    root.appendChild(body);

    let avatar = '🏠', subtitle = 'Гость';
    if (me.kind === 'installer') {
      avatar = ({ okonshchik: '🪟', prorab: '👷', tsekh: '🏭' })[me.role] || '🪟';
      subtitle = me.roleLabel + ' · ' + me.city;
    } else if (me.kind === 'client') {
      avatar = '🏠'; subtitle = 'Розничный клиент · ' + (me.city || 'Алматы');
    }
    body.appendChild(h('div', { class: 'profile-card' }, [
      h('div', { class: 'avatar' }, avatar),
      h('div', { style: 'flex:1;min-width:0' }, [
        h('div', { class: 'name' }, me.name || me.telegram?.first_name || 'Гость'),
        h('div', { class: 'role' }, subtitle),
      ]),
    ]));

    if (me.kind === 'installer') {
      body.appendChild(h('div', { class: 'stats' }, [
        statCard('Расчётов', me.calcs, ''),
        statCard('Статус', me.verified ? '✓' : '○', me.verified ? 'верифицирован' : 'не верифицирован'),
      ]));

      // Personal markup — applied silently to every calculation
      const cur = Number(me.markupPct) || 0;
      async function saveMarkup(pct) {
        try {
          const r = await api('/me', { method: 'PUT', body: JSON.stringify({ markupPct: pct }) });
          state.me = { ...state.me, markupPct: r.markupPct };
          toast('Наценка обновлена: ' + pct + '%');
          render();
        } catch (e) { toast(e.message, 'error'); }
      }
      const inp = h('input', {
        type: 'number', min: 0, max: 200, step: 1, value: cur,
        style: 'width:90px;padding:9px 12px;border:1px solid var(--rule);border-radius:9px;font-family:var(--mono);font-size:15px;text-align:right;font-weight:600',
      });
      inp.addEventListener('change', () => {
        const v = Math.max(0, Math.min(200, parseFloat(inp.value) || 0));
        saveMarkup(v);
      });
      const presets = [0, 5, 10, 15, 20, 25, 30];
      body.appendChild(h('div', { class: 'card pad', style: 'margin-bottom:14px' }, [
        h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px' }, [
          h('div', {}, [
            h('div', { style: 'font-size:13px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.4px' }, 'Моя наценка'),
            h('div', { style: 'font-size:11px;color:var(--muted);margin-top:3px' }, 'применяется автоматически ко всем расчётам'),
          ]),
          h('div', { style: 'display:flex;align-items:center;gap:6px' }, [
            inp,
            h('span', { style: 'font-size:15px;color:var(--muted);font-weight:600' }, '%'),
          ]),
        ]),
        h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px' },
          presets.map(p => {
            const active = cur === p;
            return h('button', {
              style: `padding:6px 12px;border-radius:999px;border:1px solid ${active ? 'var(--accent)' : 'var(--rule)'};background:${active ? 'var(--accent)' : 'var(--panel)'};color:${active ? '#fff' : 'var(--text)'};font-size:12px;font-weight:500;cursor:pointer`,
              onClick: () => saveMarkup(p),
            }, p === 0 ? 'без наценки' : '+' + p + '%');
          })),
      ]));
    }

    body.appendChild(h('div', { class: 'menu' }, [
      menuItem('🔔', 'Уведомления', state.notifUnread > 0 ? state.notifUnread + ' новых' : null, () => go('notifications')),
      menuItem('📊', 'Все мои замеры', null, () => go('projects')),
      menuItem('💼', 'Заявки и КП', null, () => go('documents')),
      me.kind === 'installer' ? menuItem('👥', 'Клиенты (CRM)', null, () => go('clients')) : null,
      menuItem('📚', 'Каталог', null, () => go('catalog')),
    ]));

    body.appendChild(h('div', { class: 'menu' }, [
      menuItem('🔄', 'Сменить роль', null, () => go('onboarding')),
      menuItem('💬', 'Поддержка', null, () => go('support')),
      menuItem('❓', 'Помощь и FAQ', null, () => go('help')),
    ]));

    body.appendChild(h('div', { style: 'text-align:center;margin-top:14px;color:var(--muted);font-size:11px;font-family:var(--mono)' },
      'ProfCalc v2.0 · PLUR Solutions'));

    body.appendChild(tabBar());
  };
  function menuItem(icon, label, meta, onClick) {
    return h('div', { class: 'item', onClick }, [
      h('div', { class: 'ico' }, icon),
      h('div', { class: 'label' }, label),
      meta ? h('div', { class: 'meta' }, meta) : null,
      h('div', { class: 'chev', html: icons.chev }),
    ]);
  }

  // ── CRM CLIENTS ──────────────────────────────────────────────────────
  screens.clients = async function () {
    setBackButton(() => go('profile'));
    clear(root);
    root.appendChild(bar('Мои клиенты', { back: () => go('profile'), profileLink: true }));
    const body = h('div', { class: 'body' });
    root.appendChild(body);
    body.appendChild(h('button', { class: 'btn btn-accent', style: 'margin-bottom:14px', onClick: () => addClientSheet(render) }, '+ Добавить клиента'));
    try {
      const list = await api('/crm/clients');
      if (!list.length) body.appendChild(h('div', { class: 'empty' }, 'Пока нет клиентов'));
      else {
        const card = h('div', { class: 'card list' });
        list.forEach(c => card.appendChild(h('div', { class: 'row tap', onClick: () => editClientSheet(c, render) }, [
          h('div', { style: 'width:36px;height:36px;border-radius:18px;background:#f0ece4;display:flex;align-items:center;justify-content:center;font-weight:700;font-family:var(--mono)' },
            c.name.split(' ')[0].slice(0, 2).toUpperCase()),
          h('div', { style: 'flex:1' }, [
            h('div', { style: 'font-size:14px;font-weight:600' }, c.name),
            h('div', { style: 'font-size:11.5px;color:var(--muted);font-family:var(--mono);margin-top:2px' },
              [c.phone, c.address].filter(Boolean).join(' · ')),
          ]),
          h('div', { html: icons.chev, style: 'color:var(--faint)' }),
        ])));
        body.appendChild(card);
      }
    } catch (e) { body.appendChild(h('div', { class: 'empty' }, e.message)); }
    body.appendChild(tabBar());
  };
  function addClientSheet(onDone) {
    const f = { name: '', phone: '', address: '', email: '', notes: '' };
    sheet({
      title: 'Новый клиент',
      body: [
        h('div', { class: 'label-line' }, 'Имя'), h('input', { class: 'tinp', oninput: e => f.name = e.target.value }),
        h('div', { class: 'label-line' }, 'Телефон'), h('input', { class: 'tinp', type: 'tel', oninput: e => f.phone = e.target.value }),
        h('div', { class: 'label-line' }, 'Адрес'), h('input', { class: 'tinp', oninput: e => f.address = e.target.value }),
        h('div', { class: 'label-line' }, 'Email'), h('input', { class: 'tinp', type: 'email', oninput: e => f.email = e.target.value }),
        h('div', { class: 'label-line' }, 'Заметки'), h('textarea', { class: 'tinp', rows: 3, oninput: e => f.notes = e.target.value }),
      ],
      submit: 'Добавить',
      onSubmit: async () => {
        if (!f.name) throw new Error('Имя обязательно');
        await api('/crm/clients', { method: 'POST', body: JSON.stringify(f) });
        toast('Добавлено'); onDone();
      },
    });
  }
  function editClientSheet(c, onDone) {
    const f = { name: c.name, phone: c.phone || '', address: c.address || '', email: c.email || '', notes: c.notes || '' };
    sheet({
      title: 'Клиент: ' + c.name,
      body: [
        h('div', { class: 'label-line' }, 'Имя'), h('input', { class: 'tinp', value: f.name, oninput: e => f.name = e.target.value }),
        h('div', { class: 'label-line' }, 'Телефон'), h('input', { class: 'tinp', type: 'tel', value: f.phone, oninput: e => f.phone = e.target.value }),
        h('div', { class: 'label-line' }, 'Адрес'), h('input', { class: 'tinp', value: f.address, oninput: e => f.address = e.target.value }),
        h('div', { class: 'label-line' }, 'Email'), h('input', { class: 'tinp', type: 'email', value: f.email, oninput: e => f.email = e.target.value }),
        h('div', { class: 'label-line' }, 'Заметки'), h('textarea', { class: 'tinp', rows: 3, oninput: e => f.notes = e.target.value }, f.notes),
        h('div', { style: 'display:flex;gap:8px;margin-top:14px' }, [
          h('button', { class: 'btn btn-secondary', style: 'flex:1', onClick: async () => { if (confirm('Удалить?')) { await api('/crm/clients/' + c.id, { method: 'DELETE' }); toast('Удалено'); closeSheet(); onDone(); } } }, 'Удалить'),
          h('button', { class: 'btn btn-accent', style: 'flex:1.4', onClick: async () => {
            const start = state.project;
            state.project = { id: null, name: c.name, clientName: c.name, clientPhone: c.phone, clientAddress: c.address, manufacturerId: 'm-rehau', items: [blankItem()] };
            state.activeIdx = 0; state.lastResult = null; state.lastKp = null;
            closeSheet(); go('project');
          } }, 'Новый замер'),
        ]),
      ],
      submit: 'Сохранить',
      onSubmit: async () => {
        await api('/crm/clients/' + c.id, { method: 'PUT', body: JSON.stringify(f) });
        toast('Сохранено'); onDone();
      },
    });
  }

  // ── NOTIFICATIONS ────────────────────────────────────────────────────
  screens.notifications = async function () {
    setBackButton(() => history.back());
    clear(root);
    root.appendChild(bar('Уведомления', { back: () => history.back(), profileLink: true }));
    const body = h('div', { class: 'body' });
    root.appendChild(body);
    body.appendChild(loader());
    try {
      const { items, unread } = await api('/notifications');
      body.lastChild.remove();
      if (unread > 0) {
        body.appendChild(h('div', { style: 'display:flex;justify-content:flex-end;margin-bottom:8px' }, [
          h('button', { class: 'btn-ghost', style: 'background:none;border:none;color:var(--accent);font-weight:600', onClick: async () => { await api('/notifications/read-all', { method: 'POST' }); state.notifUnread = 0; render(); } }, 'Прочитать всё'),
        ]));
      }
      if (!items.length) body.appendChild(h('div', { class: 'empty' }, 'Уведомлений пока нет'));
      else {
        const card = h('div', { class: 'card', style: 'overflow:hidden' });
        items.forEach(n => {
          const icon = ({ 'order.new': '📩', 'order.update': '🔄', 'order.confirm': '✅', 'kp.created': '📄', 'discount.changed': '%', 'system': 'ℹ️' })[n.kind] || '🔔';
          card.appendChild(h('div', { class: 'notif' + (n.read ? '' : ' unread'), onClick: async () => {
            if (!n.read) await api('/notifications/' + n.id + '/read', { method: 'PUT' });
            if (n.link && n.link.startsWith('#/')) window.location.hash = n.link;
          } }, [
            h('div', { class: 'ico' }, icon),
            h('div', { class: 'l' }, [
              h('div', { class: 'title' }, n.title),
              n.body ? h('div', { class: 'body' }, n.body) : null,
              h('div', { class: 'time' }, new Date(n.ts * 1000).toLocaleString('ru-RU')),
            ]),
          ]));
        });
        body.appendChild(card);
      }
      const fresh = await api('/notifications');
      state.notifUnread = fresh.unread;
    } catch (e) { body.lastChild?.replaceWith(h('div', { class: 'empty' }, e.message)); }
    body.appendChild(tabBar());
  };

  // ── HELP ─────────────────────────────────────────────────────────────
  screens.help = async function () {
    setBackButton(() => go('profile'));
    clear(root);
    root.appendChild(bar('Помощь', { back: () => history.back(), profileLink: true }));
    const body = h('div', { class: 'body' });
    root.appendChild(body);
    body.appendChild(h('div', { class: 'card pad', style: 'margin-bottom:14px' }, [
      h('div', { style: 'font-size:15px;font-weight:600;margin-bottom:8px' }, 'Что такое ProfCalc?'),
      h('div', { style: 'color:var(--muted);font-size:13.5px;line-height:1.55' }, 'SaaS-платформа для расчёта оконных, дверных и витражных конструкций. Замер на одного клиента может содержать множество окон/дверей/проёмов разной конструкции.'),
    ]));
    [
      ['Что такое замер/проект?', 'Это расчёт для одного клиента, который может содержать несколько окон, дверей, балконных блоков и витражей разных размеров. Все позиции суммируются в одном КП.'],
      ['Как добавить позицию?', 'На экране проекта тапните «+ Добавить позицию». Откроется конструктор для новой позиции — выберите шаблон или настройте с нуля.'],
      ['Какие конструкции поддерживаются?', 'Окна, двери, балконные блоки, Т-/П-образные, панорамные стены, витражи, раздвижные двери и порталы, французские окна. Размеры до 8000 × 4000 мм.'],
      ['Как сделать раздвижную дверь?', 'Выберите шаблон «Раздвижная дверь» или добавьте секции с типами РАЗД-Л / РАЗД-П. Фурнитура раздвижная (рельсы + каретки) считается автоматически.'],
      ['Как добавить горизонтальный импост?', 'В конструкторе тапните «+ Ряд сверху» или «+ Ряд снизу». Каждый ряд — независимая полоса.'],
      ['Как задать точные мм?', 'Тапните на секцию — откроется панель: ширина секции (мм) и высота ряда (мм). Пусто = авто-распределение.'],
      ['Как скачать PDF КП?', 'На экране КП — кнопка «Скачать PDF». Откроется PDF, который можно сохранить, переслать клиенту, распечатать.'],
      ['Что такое CRM клиентов?', 'Книга клиентов оконщика. Из карточки клиента можно сразу запустить новый замер — данные автоматически подставятся.'],
    ].forEach(([q, a]) => body.appendChild(h('div', { class: 'card pad', style: 'margin-bottom:8px' }, [
      h('div', { style: 'font-size:14px;font-weight:600;margin-bottom:6px' }, q),
      h('div', { style: 'color:var(--muted);font-size:13px;line-height:1.5' }, a),
    ])));
    body.appendChild(h('button', { class: 'btn btn-accent', style: 'margin-top:14px', onClick: () => go('support') }, 'Связаться с поддержкой'));
    body.appendChild(tabBar());
  };

  screens.support = async function () {
    setBackButton(() => go('help'));
    clear(root);
    root.appendChild(bar('Поддержка', { back: () => history.back() }));
    const body = h('div', { class: 'body no-tabs' });
    root.appendChild(body);
    const f = { subject: '', body: '' };
    body.appendChild(h('div', { style: 'color:var(--muted);font-size:13px;margin-bottom:14px;line-height:1.5' },
      'Опишите проблему. Команда PLUR ответит в течение 24ч.'));
    body.appendChild(h('div', { class: 'label-line' }, 'Тема'));
    body.appendChild((function () { const i = h('input', { class: 'tinp' }); i.addEventListener('input', () => f.subject = i.value); return i; })());
    body.appendChild(h('div', { class: 'label-line' }, 'Сообщение'));
    body.appendChild((function () { const t = h('textarea', { class: 'tinp', rows: 5 }); t.addEventListener('input', () => f.body = t.value); return t; })());
    body.appendChild(h('button', { class: 'btn btn-accent', style: 'margin-top:14px', onClick: async () => {
      if (!f.subject || !f.body) return toast('Заполните', 'error');
      try { await api('/support', { method: 'POST', body: JSON.stringify(f) }); toast('Отправлено'); go('profile'); }
      catch (e) { toast(e.message, 'error'); }
    } }, 'Отправить'));
  };

  // ── ROUTER + GATE ────────────────────────────────────────────────────
  function isOnboardingRoute(r) { return r === 'onboarding' || r === 'register' || r === 'register-client'; }

  async function render() {
    const r = currentRoute();
    if (state.me && (state.me.kind === 'guest' || state.me.kind === 'unregistered') && !isOnboardingRoute(r)) {
      window.location.hash = '#/onboarding';
      return;
    }
    const fn = screens[r];
    if (!fn) { window.location.hash = '#/home'; return; }
    try { await fn(); } catch (e) { console.error(e); toast('Ошибка: ' + e.message, 'error'); }
    refreshUnread();
  }
  let lastUnreadFetch = 0;
  async function refreshUnread() {
    if (Date.now() - lastUnreadFetch < 10000) return;
    lastUnreadFetch = Date.now();
    try {
      const r = await api('/notifications');
      if (r.unread !== state.notifUnread) state.notifUnread = r.unread;
    } catch {}
  }

  (async () => {
    try { state.me = await api('/me'); } catch {}
    if (!window.location.hash) {
      window.location.hash = (state.me?.kind === 'guest' || state.me?.kind === 'unregistered') ? '#/onboarding' : '#/home';
    }
    render();
  })();
})();
