// admin.js — ProfCalc super-admin SPA (vanilla)
(function () {
  const { api, fmtKZT, fmtNum } = window;
  const app = document.getElementById('app');

  // ── tiny DOM helper ───────────────────────────────────────────────────
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
  }
  function modal({ title, body, onSubmit, submitText = 'Сохранить' }) {
    const bg = h('div', { class: 'modal-bg', onClick: e => { if (e.target === bg) bg.remove(); } });
    const m = h('div', { class: 'modal' }, [
      h('h3', {}, title),
      h('div', { class: 'body' }, body),
      h('div', { class: 'footer' }, [
        h('button', { class: 'btn', onClick: () => bg.remove() }, 'Отмена'),
        h('button', { class: 'btn btn-accent', onClick: async () => {
          try { await onSubmit(); bg.remove(); }
          catch (e) { toast(e.message, 'error'); }
        } }, submitText),
      ]),
    ]);
    bg.appendChild(m); document.body.appendChild(bg);
    return bg;
  }

  // ── router ────────────────────────────────────────────────────────────
  const routes = {
    'dashboard':    pageDashboard,
    'manufacturers': pageManufacturers,
    'pricing':      pagePricing,
    'catalogs':     pageCatalogs,            // ── Phase 6: new page
    'discounts':    pageDiscounts,
    'installers':   pageInstallers,
    'analytics':    pageAnalytics,
    'log':          pageLog,
  };
  function currentRoute() {
    const m = window.location.hash.match(/^#\/([^/]+)/);
    return (m && routes[m[1]]) ? m[1] : 'dashboard';
  }
  window.addEventListener('hashchange', render);

  // ── shared layout ────────────────────────────────────────────────────
  function layout(active, headerProps, content) {
    clear(app);
    const navItems = [
      ['Дашборд', 'dashboard'],
      ['Производители', 'manufacturers'],
      ['Цены', 'pricing'],
      ['Каталоги', 'catalogs'],
      ['Скидки', 'discounts'],
      ['Оконщики', 'installers'],
      ['Аналитика', 'analytics'],
      ['Журнал', 'log'],
    ];
    const sidebar = h('aside', { class: 'sidebar' }, [
      h('div', { class: 'brand' }, [
        h('div', { class: 'logo' }, 'P'),
        h('div', {}, [
          h('div', { class: 'name' }, 'ProfCalc'),
          h('div', { class: 'sub' }, 'PLUR · admin'),
        ]),
      ]),
      h('div', { class: 'nav-label' }, 'Управление'),
      h('nav', { class: 'nav' }, navItems.map(([label, key]) =>
        h('a', { href: '#/' + key, class: key === active ? 'active' : '' }, label),
      )),
      h('div', { class: 'user-card' }, [
        h('div', { class: 'avatar' }, 'МК'),
        h('div', { style: 'min-width:0;flex:1' }, [
          h('div', { style: 'font-size:12px;font-weight:600;letter-spacing:-.1px' }, 'Марат К.'),
          h('div', { style: 'font-size:10px;color:var(--muted)' }, 'Суперадмин'),
        ]),
      ]),
    ]);
    const header = h('div', { class: 'header' }, [
      h('div', {}, [
        h('h1', {}, headerProps.title),
        h('div', { class: 'subtitle' }, headerProps.subtitle || ''),
      ]),
      h('div', { class: 'actions' }, headerProps.actions || []),
    ]);
    app.appendChild(sidebar);
    app.appendChild(h('div', { class: 'main' }, [
      header,
      h('div', { class: 'content' }, content),
    ]));
  }

  function render() {
    const r = currentRoute();
    routes[r]().catch(e => {
      console.error(e);
      toast(e.message, 'error');
    });
  }

  // ── DASHBOARD ────────────────────────────────────────────────────────
  async function pageDashboard() {
    const [a, manus, ins, log] = await Promise.all([
      api('/analytics'), api('/manufacturers'), api('/installers'), api('/log?limit=8'),
    ]);
    layout('dashboard', {
      title: 'Дашборд',
      subtitle: 'Сводка по платформе · обновлено сейчас',
    }, [
      h('div', { class: 'kpi-row' }, [
        kpi('Расчётов всего', fmtNum(a.totalCalcs), a.calcsDelta, 'за 12 мес'),
        kpi('Конверсия', a.conversion + '%', '+2.4 п.п.', 'расчёт → КП → заказ'),
        kpi('Средний чек', fmtKZT(a.avgCheck), '+6%', 'по подтверждённым'),
        kpi('Активных оконщиков', String(a.activeInstallers), '+12', `из ${a.totalInstallers + 73} рег.`),
      ]),
      h('div', { style: 'display:grid;grid-template-columns:1.4fr 1fr;gap:14px;margin-bottom:14px' }, [
        h('div', { class: 'card pad' }, [
          h('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px' }, [
            h('div', {}, [
              h('div', { style: 'font-size:14px;font-weight:600;letter-spacing:-.2px' }, 'Производители'),
              h('div', { style: 'font-size:11px;color:var(--muted);margin-top:2px' }, manus.length + ' активных'),
            ]),
            h('a', { class: 'btn', href: '#/manufacturers' }, 'Все →'),
          ]),
          h('div', { style: 'display:grid;grid-template-columns:repeat(2,1fr);gap:10px' },
            manus.slice(0, 4).map(m => h('div', { style: 'padding:10px;border:1px solid var(--rule);border-radius:8px' }, [
              h('div', { style: 'font-size:13px;font-weight:600' }, m.name),
              h('div', { style: 'font-size:11px;color:var(--muted);margin-top:2px' }, m.region + ' · ★ ' + m.rating),
            ])),
          ),
        ]),
        h('div', { class: 'card pad' }, [
          h('div', { style: 'font-size:14px;font-weight:600;letter-spacing:-.2px' }, 'Последние события'),
          h('div', { style: 'font-size:11px;color:var(--muted);margin:2px 0 12px' }, 'журнал действий'),
          h('div', {}, log.map(e => h('div', { style: 'display:flex;gap:8px;padding:6px 0;border-top:1px solid var(--rule);font-size:12px' }, [
            h('span', { class: 'mono', style: 'color:var(--faint)' }, new Date(e.ts * 1000).toLocaleTimeString('ru-RU').slice(0, 5)),
            h('span', { style: 'color:var(--muted);min-width:60px' }, e.actor.slice(0, 14)),
            h('span', { style: 'flex:1' }, e.action + (e.detail ? ' · ' + e.detail : '')),
          ]))),
        ]),
      ]),
      h('div', { class: 'card pad' }, [
        h('div', { style: 'font-size:14px;font-weight:600;margin-bottom:10px' }, 'География запросов'),
        h('div', { style: 'display:flex;flex-direction:column;gap:9px' }, a.cities.map(c => {
          const max = Math.max(...a.cities.map(x => x.calcs));
          return h('div', { style: 'display:grid;grid-template-columns:110px 1fr 70px;align-items:center;gap:10px;font-size:12px' }, [
            h('div', {}, c.city),
            h('div', { style: 'height:8px;background:#f0ece4;border-radius:4px;overflow:hidden' }, [
              h('div', { style: `height:100%;width:${(c.calcs / max) * 100}%;background:var(--accent);border-radius:4px` }),
            ]),
            h('div', { class: 'mono', style: 'text-align:right;color:var(--muted)' }, fmtNum(c.calcs)),
          ]);
        })),
      ]),
    ]);
  }
  function kpi(label, value, delta, sub) {
    return h('div', { class: 'kpi' }, [
      h('div', { class: 'label' }, label),
      h('div', { style: 'display:flex;align-items:baseline' }, [
        h('div', { class: 'value' }, value),
        delta ? h('div', { class: 'delta' }, delta) : null,
      ]),
      h('div', { class: 'sub' }, sub),
    ]);
  }

  // ── MANUFACTURERS ────────────────────────────────────────────────────
  async function pageManufacturers() {
    const [list, systems] = await Promise.all([api('/manufacturers'), api('/profile-systems')]);
    layout('manufacturers', {
      title: 'Производители',
      subtitle: list.length + ' производителей · ' + list.filter(m => m.status === 'active').length + ' активных',
      actions: [
        h('button', { class: 'btn btn-primary', onClick: () => openManufacturerModal(null, systems, render) }, '+ Производитель'),
      ],
    }, [
      h('div', { class: 'table' }, [
        h('div', { class: 'table-head', style: 'grid-template-columns:1.6fr 1fr 1.4fr 80px 100px 110px' }, [
          h('div', {}, 'Название'),
          h('div', {}, 'Регион'),
          h('div', {}, 'Системы'),
          h('div', { class: 'right' }, 'Рейтинг'),
          h('div', { class: 'center' }, 'Статус'),
          h('div', { class: 'right' }, 'Действия'),
        ]),
        ...list.map(m => h('div', { class: 'table-row', style: 'grid-template-columns:1.6fr 1fr 1.4fr 80px 100px 110px' }, [
          h('div', {}, [
            h('div', { style: 'font-weight:600' }, m.name),
            h('div', { class: 'mono', style: 'font-size:11px;color:var(--faint);margin-top:1px' }, m.id),
          ]),
          h('div', { style: 'font-size:12px' }, m.region),
          h('div', { class: 'mono', style: 'font-size:11px;color:var(--muted)' }, m.systems.join(', ')),
          h('div', { class: 'right mono' }, '★ ' + m.rating),
          h('div', { class: 'center' }, [
            h('span', { class: 'status-pill ' + m.status }, m.status),
          ]),
          h('div', { class: 'right' }, [
            h('button', { class: 'btn', onClick: () => openManufacturerModal(m, systems, render) }, 'Изменить'),
          ]),
        ])),
      ]),
    ]);
  }
  function openManufacturerModal(m, systems, onDone) {
    const isNew = !m;
    const fields = {
      id: m?.id || '',
      name: m?.name || '',
      region: m?.region || '',
      rating: m?.rating ?? 4.5,
      status: m?.status || 'active',
      systems: m?.systems || [],
    };
    const sysList = h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:6px' },
      systems.map(s => {
        const checked = fields.systems.includes(s.id);
        const cb = h('input', { type: 'checkbox', onChange: e => {
          if (e.target.checked) fields.systems.push(s.id);
          else fields.systems = fields.systems.filter(x => x !== s.id);
        } });
        if (checked) cb.checked = true;
        return h('label', { style: 'display:flex;align-items:center;gap:6px;font-size:12px;padding:5px 8px;border:1px solid var(--rule);border-radius:6px' }, [cb, s.name]);
      }),
    );
    modal({
      title: isNew ? 'Новый производитель' : 'Редактирование: ' + m.name,
      submitText: isNew ? 'Создать' : 'Сохранить',
      body: [
        field('ID', isNew ? input(fields, 'id', { placeholder: 'm-новый' }) : h('div', { class: 'mono', style: 'color:var(--muted);font-size:13px' }, m.id)),
        field('Название', input(fields, 'name')),
        field('Регион', input(fields, 'region', { placeholder: 'Алматы, Шымкент' })),
        h('div', { class: 'field' }, [h('label', {}, 'Системы'), sysList]),
        h('div', { style: 'display:flex;gap:12px' }, [
          field('Рейтинг', input(fields, 'rating', { type: 'number', step: 0.1, min: 0, max: 5 })),
          field('Статус', selectF(fields, 'status', ['active', 'paused', 'blocked'])),
        ]),
        !isNew ? h('button', { class: 'btn btn-danger', style: 'align-self:flex-start;margin-top:8px', onClick: async () => {
          if (!confirm('Удалить производителя ' + m.name + '?')) return;
          await api('/manufacturers/' + m.id, { method: 'DELETE' });
          toast('Удалено'); document.querySelector('.modal-bg')?.remove(); onDone();
        } }, 'Удалить') : null,
      ],
      onSubmit: async () => {
        if (isNew) {
          await api('/manufacturers', { method: 'POST', body: JSON.stringify(fields) });
        } else {
          await api('/manufacturers/' + m.id, { method: 'PUT', body: JSON.stringify(fields) });
        }
        toast('Сохранено'); onDone();
      },
    });
  }

  // ── PRICING ──────────────────────────────────────────────────────────
  async function pagePricing() {
    const articles = await api('/articles');
    const systemsAll = [...new Set(articles.map(a => a.system))];
    const filter = window._pricingFilter || 'all';
    const filtered = filter === 'all' ? articles : articles.filter(a => a.system === filter);
    layout('pricing', {
      title: 'Управление ценами',
      subtitle: '3 уровня цен · ' + articles.length + ' артикулов · валюта KZT',
      actions: [
        h('button', { class: 'btn', onClick: bulkBumpDialog }, 'Поднять цены ▾'),
        h('button', { class: 'btn btn-primary', onClick: () => openArticleModal(null) }, '+ Артикул'),
      ],
    }, [
      h('div', { class: 'filters', style: 'padding:0 0 14px' }, [
        h('div', { class: 'chip ' + (filter === 'all' ? 'active' : ''), onClick: () => { window._pricingFilter = 'all'; render(); } }, 'Все'),
        ...systemsAll.map(s => h('div', { class: 'chip ' + (filter === s ? 'active' : ''), onClick: () => { window._pricingFilter = s; render(); } }, s)),
      ]),
      h('div', { class: 'table' }, [
        h('div', { class: 'table-head', style: 'grid-template-columns:170px 1.6fr 70px 1fr 1fr 1fr 110px 90px' }, [
          h('div', {}, 'Артикул'),
          h('div', {}, 'Наименование'),
          h('div', {}, 'Ед.'),
          h('div', { class: 'right' }, 'Закупочная'),
          h('div', { class: 'right' }, 'Дилерская'),
          h('div', { class: 'right' }, 'Розничная'),
          h('div', { class: 'right' }, 'Наценка Δ'),
          h('div', { class: 'right' }, ''),
        ]),
        ...filtered.map(renderArticleRow),
      ]),
      h('div', { style: 'margin-top:12px;font-size:11.5px;color:var(--muted);display:flex;justify-content:space-between' }, [
        h('span', {}, 'Показано ' + filtered.length + ' из ' + articles.length),
        h('span', {}, 'Δ — наценка платформы / наценка оконщика · клик по цене для редактирования'),
      ]),
    ]);
  }
  function renderArticleRow(a) {
    const dealerMargin = ((a.dealer / a.base - 1) * 100).toFixed(1);
    const retailMargin = ((a.retail / a.dealer - 1) * 100).toFixed(1);
    function priceCell(field) {
      const inp = h('input', {
        class: 'cell mono',
        type: 'number',
        value: a[field],
        onChange: async e => {
          const newVal = parseInt(e.target.value, 10);
          if (Number.isNaN(newVal)) return;
          try {
            await api('/articles/' + encodeURIComponent(a.article), { method: 'PUT', body: JSON.stringify({ [field]: newVal }) });
            a[field] = newVal;
            toast('Цена обновлена');
            render();
          } catch (err) { toast(err.message, 'error'); }
        },
      });
      return h('div', { class: 'right' }, [inp]);
    }
    return h('div', { class: 'table-row', style: 'grid-template-columns:170px 1.6fr 70px 1fr 1fr 1fr 110px 90px' }, [
      h('div', { class: 'mono', style: 'font-size:11.5px;color:var(--muted)' }, a.article),
      h('div', {}, [
        h('div', { style: 'font-weight:500;letter-spacing:-.1px' }, a.name),
        h('div', { style: 'font-size:11px;color:var(--faint);margin-top:1px' }, a.system),
      ]),
      h('div', { class: 'mono', style: 'color:var(--muted);font-size:12px' }, a.unit),
      priceCell('base'),
      priceCell('dealer'),
      priceCell('retail'),
      h('div', { class: 'right mono', style: 'font-size:11px;color:var(--accent)' }, '+' + dealerMargin + '% / +' + retailMargin + '%'),
      h('div', { class: 'right' }, h('button', { class: 'btn', style: 'padding:4px 10px;font-size:11px', onClick: () => openArticleModal(a) }, 'Ред.')),
    ]);
  }
  function openArticleModal(a) {
    const isNew = !a;
    const fields = a ? { ...a } : { article: '', name: '', unit: 'м', base: 0, dealer: 0, retail: 0, system: '' };
    modal({
      title: isNew ? 'Новый артикул' : 'Редактирование: ' + a.article,
      body: [
        isNew ? field('Артикул', input(fields, 'article', { placeholder: 'REH-NEW-XXX' })) : h('div', { class: 'mono', style: 'color:var(--muted)' }, a.article),
        field('Наименование', input(fields, 'name')),
        h('div', { style: 'display:flex;gap:12px' }, [
          field('Единица', input(fields, 'unit')),
          field('Группа', input(fields, 'system')),
        ]),
        h('div', { style: 'display:flex;gap:12px' }, [
          field('Закупочная', input(fields, 'base', { type: 'number' })),
          field('Дилерская', input(fields, 'dealer', { type: 'number' })),
          field('Розничная', input(fields, 'retail', { type: 'number' })),
        ]),
        !isNew ? h('button', { class: 'btn btn-danger', style: 'align-self:flex-start;margin-top:8px', onClick: async () => {
          if (!confirm('Удалить артикул ' + a.article + '?')) return;
          await api('/articles/' + encodeURIComponent(a.article), { method: 'DELETE' });
          toast('Удалено'); document.querySelector('.modal-bg')?.remove(); render();
        } }, 'Удалить') : null,
      ],
      onSubmit: async () => {
        if (isNew) {
          await api('/articles', { method: 'POST', body: JSON.stringify(fields) });
        } else {
          await api('/articles/' + encodeURIComponent(a.article), { method: 'PUT', body: JSON.stringify(fields) });
        }
        toast('Сохранено'); render();
      },
    });
  }
  function bulkBumpDialog() {
    const fields = { vendorPrefix: 'Rehau', pct: 5 };
    modal({
      title: 'Массовое изменение цен',
      submitText: 'Поднять',
      body: [
        field('Группа (системы LIKE …%)', input(fields, 'vendorPrefix', { placeholder: 'Rehau' })),
        field('Процент (+/-)', input(fields, 'pct', { type: 'number', step: 0.1 })),
      ],
      onSubmit: async () => {
        const r = await api('/articles/bulk-bump', { method: 'POST', body: JSON.stringify({ vendorPrefix: fields.vendorPrefix, pct: parseFloat(fields.pct) }) });
        toast('Обновлено артикулов: ' + r.changed); render();
      },
    });
  }

  // ── DISCOUNTS MATRIX ─────────────────────────────────────────────────
  async function pageDiscounts() {
    const [matrix, manus, ins] = await Promise.all([api('/discounts'), api('/manufacturers'), api('/installers')]);
    function color(v) {
      if (v == null || v === 0) return { bg: '#faf7f1', fg: 'var(--faint)' };
      if (v >= 8) return { bg: '#e8d4bf', fg: 'var(--accent-dark)', strong: true };
      if (v >= 5) return { bg: '#f0e0cf', fg: 'var(--accent-dark)' };
      return { bg: '#f7eadc', fg: 'var(--accent)' };
    }
    layout('discounts', {
      title: 'Скидочная матрица',
      subtitle: 'Производитель × Оконщик · потолок 25% · клик по ячейке для редактирования',
      actions: [
        h('button', { class: 'btn', onClick: () => exportCSV(matrix, manus, ins) }, 'Экспорт CSV'),
      ],
    }, [
      h('div', { class: 'card pad' }, [
        h('table', { class: 'matrix', style: 'border-collapse:separate;border-spacing:0;width:100%;font-size:13px' }, [
          h('thead', {}, [
            h('tr', {}, [
              h('th', { class: 'installer-cell' }, 'Оконщик'),
              ...manus.map(c => h('th', { style: 'text-align:center;padding:0 6px 16px' }, [
                h('div', {}, c.name.split(' ')[0]),
                h('div', { style: 'font-size:9px;color:var(--faint);margin-top:2px;font-family:var(--mono);font-weight:400;letter-spacing:0;text-transform:none' }, c.region),
              ])),
              h('th', { class: 'right' }, 'Макс'),
            ]),
          ]),
          h('tbody', {}, ins.map((r, ri) => {
            const ds = matrix[r.id] || {};
            const max = Math.max(0, ...manus.map(c => ds[c.id] || 0));
            return h('tr', {}, [
              h('td', { style: 'padding:8px 14px 8px 0;border-top:' + (ri ? '1px solid var(--rule)' : 'none') }, [
                h('div', { style: 'display:flex;align-items:center;gap:10px' }, [
                  h('div', { style: 'width:28px;height:28px;border-radius:14px;background:#f0ece4;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;font-family:var(--mono)' },
                    r.name.split(' ')[0].slice(0, 2).toUpperCase()),
                  h('div', {}, [
                    h('div', { style: 'font-weight:500;letter-spacing:-.1px' }, r.name),
                    h('div', { style: 'font-size:11px;color:var(--muted);margin-top:1px' }, r.city + ' · ' + r.calcs + ' расч.'),
                  ]),
                ]),
              ]),
              ...manus.map(c => {
                const v = ds[c.id];
                const col = color(v);
                return h('td', { style: 'padding:8px 6px;border-top:' + (ri ? '1px solid var(--rule)' : 'none') }, [
                  h('button', {
                    class: 'swatch',
                    style: `background:${col.bg};color:${col.fg};${col.strong ? 'border:1px solid var(--accent);' : ''}`,
                    onClick: () => promptDiscount(r, c, v ?? 0, render),
                  }, v == null || v === 0 ? '—' : '−' + v + '%'),
                ]);
              }),
              h('td', {
                class: 'right mono',
                style: 'padding:8px 0 8px 12px;font-weight:700;color:' + (max > 0 ? 'var(--accent-dark)' : 'var(--faint)') + ';border-top:' + (ri ? '1px solid var(--rule)' : 'none'),
              }, max > 0 ? '−' + max + '%' : '—'),
            ]);
          })),
        ]),
      ]),
      h('div', { style: 'margin-top:16px;display:flex;gap:16px;font-size:11.5px;color:var(--muted)' }, [
        legendDot('#faf7f1', 'нет скидки'),
        legendDot('#f7eadc', '1–4%'),
        legendDot('#f0e0cf', '5–7%'),
        legendDot('#e8d4bf', '8%+'),
      ]),
    ]);
  }
  function legendDot(bg, label) {
    return h('div', { style: 'display:flex;align-items:center;gap:6px' }, [
      h('div', { style: `width:12px;height:12px;border-radius:3px;background:${bg};border:1px solid var(--rule)` }),
      label,
    ]);
  }
  function promptDiscount(installer, manu, current, onDone) {
    const fields = { pct: current };
    modal({
      title: `Скидка: ${installer.name} × ${manu.name}`,
      body: [
        h('div', { style: 'color:var(--muted);font-size:13px' }, 'Текущая: ' + (current ? '−' + current + '%' : 'нет') + '. Потолок 25%.'),
        field('Скидка, %', input(fields, 'pct', { type: 'number', min: 0, max: 25, step: 1 })),
      ],
      onSubmit: async () => {
        const pct = Math.max(0, Math.min(25, parseInt(fields.pct, 10) || 0));
        await api(`/discounts/${installer.id}/${manu.id}`, { method: 'PUT', body: JSON.stringify({ pct }) });
        toast('Скидка обновлена'); onDone();
      },
    });
  }
  function exportCSV(matrix, manus, ins) {
    const head = ['installer', ...manus.map(m => m.name)].join(';');
    const rows = ins.map(r => {
      const ds = matrix[r.id] || {};
      return [r.name, ...manus.map(c => ds[c.id] || 0)].join(';');
    });
    const csv = [head, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'discounts.csv' });
    document.body.appendChild(a); a.click(); a.remove();
    toast('Скачивание начато');
  }

  // ── INSTALLERS ───────────────────────────────────────────────────────
  async function pageInstallers() {
    const list = await api('/installers');
    layout('installers', {
      title: 'Оконщики',
      subtitle: list.length + ' зарегистрировано · ' + list.filter(i => i.verified).length + ' верифицированы',
      actions: [h('button', { class: 'btn btn-primary', onClick: () => openInstallerModal(null) }, '+ Оконщик')],
    }, [
      h('div', { class: 'table' }, [
        h('div', { class: 'table-head', style: 'grid-template-columns:1.4fr 1fr 1fr 80px 80px 110px' }, [
          h('div', {}, 'Название'),
          h('div', {}, 'Город'),
          h('div', {}, 'БИН / телефон'),
          h('div', { class: 'right' }, 'Расчётов'),
          h('div', { class: 'center' }, 'Верифиц.'),
          h('div', { class: 'right' }, ''),
        ]),
        ...list.map(i => h('div', { class: 'table-row', style: 'grid-template-columns:1.4fr 1fr 1fr 80px 80px 110px' }, [
          h('div', {}, [
            h('div', { style: 'font-weight:600' }, i.name),
            h('div', { class: 'mono', style: 'font-size:11px;color:var(--faint);margin-top:1px' }, i.id),
          ]),
          h('div', {}, i.city),
          h('div', { class: 'mono', style: 'font-size:11.5px;color:var(--muted)' }, [
            i.bin ? h('div', {}, i.bin) : null,
            i.phone ? h('div', {}, i.phone) : null,
          ]),
          h('div', { class: 'right mono' }, String(i.calcs)),
          h('div', { class: 'center' }, i.verified ? '✓' : '—'),
          h('div', { class: 'right' }, [
            h('button', { class: 'btn', onClick: () => openInstallerModal(i) }, 'Изменить'),
          ]),
        ])),
      ]),
    ]);
  }
  function openInstallerModal(i) {
    const isNew = !i;
    const fields = i ? { ...i } : { id: '', name: '', city: '', verified: 0, bin: '', phone: '' };
    modal({
      title: isNew ? 'Новый оконщик' : 'Редактирование: ' + i.name,
      body: [
        isNew ? field('ID', input(fields, 'id', { placeholder: 'i-новый' })) : h('div', { class: 'mono muted', style: 'font-size:13px' }, i.id),
        field('Название', input(fields, 'name')),
        field('Город', input(fields, 'city')),
        h('div', { style: 'display:flex;gap:12px' }, [
          field('БИН', input(fields, 'bin')),
          field('Телефон', input(fields, 'phone')),
        ]),
        h('label', { style: 'display:flex;align-items:center;gap:6px;font-size:13px' }, [
          (() => {
            const cb = h('input', { type: 'checkbox', onChange: e => fields.verified = e.target.checked ? 1 : 0 });
            if (fields.verified) cb.checked = true;
            return cb;
          })(),
          'Верифицирован',
        ]),
        !isNew ? h('button', { class: 'btn btn-danger', style: 'align-self:flex-start;margin-top:8px', onClick: async () => {
          if (!confirm('Удалить ' + i.name + '?')) return;
          await api('/installers/' + i.id, { method: 'DELETE' });
          toast('Удалено'); document.querySelector('.modal-bg')?.remove(); render();
        } }, 'Удалить') : null,
      ],
      onSubmit: async () => {
        if (isNew) await api('/installers', { method: 'POST', body: JSON.stringify(fields) });
        else await api('/installers/' + i.id, { method: 'PUT', body: JSON.stringify(fields) });
        toast('Сохранено'); render();
      },
    });
  }

  // ── ANALYTICS ────────────────────────────────────────────────────────
  async function pageAnalytics() {
    const [a, ins] = await Promise.all([api('/analytics'), api('/installers')]);
    const maxMonthly = Math.max(...a.monthly, 1);
    const maxCity = Math.max(...a.cities.map(c => c.calcs), 1);
    layout('analytics', {
      title: 'Аналитика платформы',
      subtitle: 'Все производители · все регионы · последние 12 месяцев',
      actions: [
        h('button', { class: 'btn' }, 'За год ▾'),
        h('button', { class: 'btn' }, 'Экспорт'),
      ],
    }, [
      h('div', { class: 'kpi-row' }, [
        kpi('Расчётов', fmtNum(a.totalCalcs), a.calcsDelta, 'за 12 мес · к пред. периоду'),
        kpi('Конверсия → КП → заказ', a.conversion + '%', '+2.4 п.п.', 'расчёт → коммерческое → заказ'),
        kpi('Средний чек', fmtKZT(a.avgCheck), '+6%', 'по подтверждённым заказам'),
        kpi('Активных оконщиков', String(a.activeInstallers), '+12', `из ${a.totalInstallers + 73} зарегистрированных`),
      ]),
      h('div', { style: 'display:grid;grid-template-columns:1.4fr 1fr;gap:14px;margin-bottom:14px' }, [
        h('div', { class: 'card pad' }, [
          h('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;margin-bottom:16px' }, [
            h('div', {}, [
              h('div', { style: 'font-size:14px;font-weight:600;letter-spacing:-.2px' }, 'Расчёты по месяцам'),
              h('div', { style: 'font-size:11px;color:var(--muted);margin-top:2px' }, 'стабильный рост'),
            ]),
            h('div', { style: 'font-size:11px;color:var(--muted);display:flex;align-items:center;gap:5px' }, [
              h('div', { style: 'width:9px;height:9px;border-radius:2px;background:var(--accent)' }),
              ' расчёты',
            ]),
          ]),
          h('div', { style: 'display:flex;align-items:flex-end;gap:10px;height:180px;padding:0 4px' },
            a.monthly.map((v, i) => {
              const hgt = (v / maxMonthly) * 160;
              const isLast = i === a.monthly.length - 1;
              return h('div', { style: 'flex:1;display:flex;flex-direction:column;align-items:center;gap:6px' }, [
                h('div', { class: 'mono', style: `font-size:10px;color:${isLast ? 'var(--accent-dark)' : 'var(--faint)'};font-weight:600` }, String(v)),
                h('div', { style: `width:100%;height:${hgt}px;border-radius:4px 4px 1px 1px;background:${isLast ? 'var(--accent)' : '#d8c4ad'}` }),
                h('div', { class: 'mono', style: 'font-size:10px;color:var(--muted)' }, a.monthLabels[i]),
              ]);
            }),
          ),
        ]),
        h('div', { class: 'card pad' }, [
          h('div', { style: 'font-size:14px;font-weight:600;letter-spacing:-.2px' }, 'Доля профильных систем'),
          h('div', { style: 'font-size:11px;color:var(--muted);margin:2px 0 14px' }, 'популярность по числу расчётов'),
          h('div', { style: 'display:flex;align-items:center;gap:20px' }, [
            donut(a.topSystems, 130),
            h('div', { style: 'flex:1;display:flex;flex-direction:column;gap:6px' }, a.topSystems.map(s =>
              h('div', { style: 'display:flex;align-items:center;gap:8px;font-size:12px' }, [
                h('div', { style: `width:9px;height:9px;border-radius:2px;background:${s.color};flex-shrink:0` }),
                h('div', { style: 'flex:1' }, s.name),
                h('div', { class: 'mono', style: 'font-weight:600' }, s.share + '%'),
              ]),
            )),
          ]),
        ]),
      ]),
      h('div', { style: 'display:grid;grid-template-columns:1fr 1.2fr;gap:14px' }, [
        h('div', { class: 'card pad' }, [
          h('div', { style: 'font-size:14px;font-weight:600' }, 'География запросов'),
          h('div', { style: 'font-size:11px;color:var(--muted);margin:2px 0 14px' }, 'по числу расчётов'),
          h('div', { style: 'display:flex;flex-direction:column;gap:9px' }, a.cities.map(c =>
            h('div', { style: 'display:grid;grid-template-columns:110px 1fr 70px;align-items:center;gap:10px;font-size:12px' }, [
              h('div', {}, c.city),
              h('div', { style: 'height:8px;background:#f0ece4;border-radius:4px;overflow:hidden' }, [
                h('div', { style: `height:100%;width:${(c.calcs / maxCity) * 100}%;background:var(--accent);border-radius:4px` }),
              ]),
              h('div', { class: 'mono right muted' }, fmtNum(c.calcs)),
            ]),
          )),
        ]),
        h('div', { class: 'card pad' }, [
          h('div', { style: 'display:flex;justify-content:space-between;align-items:baseline' }, [
            h('div', {}, [
              h('div', { style: 'font-size:14px;font-weight:600' }, 'Топ оконщиков'),
              h('div', { style: 'font-size:11px;color:var(--muted);margin-top:2px' }, 'по объёму расчётов'),
            ]),
            h('a', { href: '#/installers', style: 'font-size:11px;color:var(--accent);font-weight:600' }, 'Все →'),
          ]),
          h('div', { style: 'margin-top:12px' }, ins.slice().sort((a, b) => b.calcs - a.calcs).slice(0, 5).map((inst, i) =>
            h('div', { style: 'display:grid;grid-template-columns:20px 1fr 80px 90px;align-items:center;gap:10px;font-size:12.5px;padding:10px 0;border-top:' + (i ? '1px solid var(--rule)' : 'none') }, [
              h('div', { class: 'mono', style: 'font-size:11px;color:var(--faint);font-weight:600' }, (i + 1) + '.'),
              h('div', {}, [
                h('div', { style: 'font-weight:500' }, inst.name),
                h('div', { style: 'font-size:10.5px;color:var(--muted)' }, inst.city + ' · ' + (inst.verified ? '✓ верифицирован' : 'без верификации')),
              ]),
              h('div', { class: 'right mono' }, inst.calcs + ' расч.'),
              h('div', { class: 'right mono', style: 'color:var(--accent-dark);font-weight:600' }, Math.round(inst.calcs * 187) + ' тыс ₸'),
            ]),
          )),
        ]),
      ]),
    ]);
  }
  function donut(data, size = 130) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', size); svg.setAttribute('height', size); svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    const r = size / 2 - 14, cx = size / 2, cy = size / 2, C = 2 * Math.PI * r;
    const bg = document.createElementNS(NS, 'circle');
    bg.setAttribute('cx', cx); bg.setAttribute('cy', cy); bg.setAttribute('r', r); bg.setAttribute('fill', 'none'); bg.setAttribute('stroke', '#f0ece4'); bg.setAttribute('stroke-width', 14);
    svg.appendChild(bg);
    let acc = 0;
    const total = data.reduce((s, d) => s + d.share, 0) || 1;
    for (const d of data) {
      const len = (d.share / total) * C;
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', r);
      c.setAttribute('fill', 'none'); c.setAttribute('stroke', d.color); c.setAttribute('stroke-width', 14);
      c.setAttribute('stroke-dasharray', `${len} ${C - len}`);
      c.setAttribute('stroke-dashoffset', -acc);
      c.setAttribute('transform', `rotate(-90 ${cx} ${cy})`);
      svg.appendChild(c);
      acc += len;
    }
    const t1 = document.createElementNS(NS, 'text');
    t1.setAttribute('x', cx); t1.setAttribute('y', cy - 2); t1.setAttribute('text-anchor', 'middle');
    t1.setAttribute('font-size', 11); t1.setAttribute('font-family', 'JetBrains Mono'); t1.setAttribute('fill', '#7a756c'); t1.setAttribute('font-weight', 600);
    t1.textContent = 'всего'; svg.appendChild(t1);
    const t2 = document.createElementNS(NS, 'text');
    t2.setAttribute('x', cx); t2.setAttribute('y', cy + 14); t2.setAttribute('text-anchor', 'middle');
    t2.setAttribute('font-size', 16); t2.setAttribute('font-family', 'JetBrains Mono'); t2.setAttribute('fill', '#1f1d1a'); t2.setAttribute('font-weight', 700);
    t2.textContent = '100%'; svg.appendChild(t2);
    return svg;
  }

  // ── LOG ──────────────────────────────────────────────────────────────
  async function pageLog() {
    const list = await api('/log?limit=200');
    layout('log', {
      title: 'Журнал событий',
      subtitle: list.length + ' последних записей',
    }, [
      h('div', { class: 'table' }, [
        h('div', { class: 'table-head', style: 'grid-template-columns:160px 180px 120px 1fr' }, [
          h('div', {}, 'Время'),
          h('div', {}, 'Актор'),
          h('div', {}, 'Действие'),
          h('div', {}, 'Детали'),
        ]),
        ...(list.length ? list : [{ ts: Date.now() / 1000, actor: '—', action: 'system.idle', detail: 'Журнал пуст' }]).map(e =>
          h('div', { class: 'table-row', style: 'grid-template-columns:160px 180px 120px 1fr' }, [
            h('div', { class: 'mono', style: 'font-size:12px;color:var(--muted)' }, new Date(e.ts * 1000).toLocaleString('ru-RU')),
            h('div', { class: 'mono', style: 'font-size:12px' }, e.actor),
            h('div', { class: 'mono', style: 'font-size:12px;color:var(--accent-dark)' }, e.action),
            h('div', { style: 'font-size:12.5px' }, e.detail),
          ]),
        ),
      ]),
    ]);
  }

  // ── tiny form helpers ────────────────────────────────────────────────
  function field(label, control) {
    return h('div', { class: 'field' }, [h('label', {}, label), control]);
  }
  function input(state, key, attrs = {}) {
    const i = h('input', { class: 'text', value: state[key] ?? '', ...attrs });
    i.addEventListener('input', () => { state[key] = (attrs.type === 'number') ? (i.value === '' ? null : parseFloat(i.value)) : i.value; });
    return i;
  }
  function selectF(state, key, options) {
    const s = h('select', { class: 'text' });
    for (const opt of options) {
      const o = document.createElement('option'); o.value = opt; o.textContent = opt;
      if (state[key] === opt) o.selected = true;
      s.appendChild(o);
    }
    s.addEventListener('change', () => state[key] = s.value);
    return s;
  }

  // ── Phase 6: Catalogs page — generic CRUD UI for all 9 new tables
  const CATALOGS = [
    { id: 'colors',         title: 'Цвета (RAL)',          fields: [
      { k: 'id',  l: 'ID' }, { k: 'ral', l: 'RAL код' }, { k: 'name', l: 'Название' },
      { k: 'hex', l: 'Hex (#RRGGBB)' }, { k: 'surcharge_pct', l: 'Наценка %', type: 'number' },
    ]},
    { id: 'hardware_kits',  title: 'Фурнитурные комплекты', fields: [
      { k: 'id', l: 'ID' }, { k: 'vendor', l: 'Бренд' }, { k: 'name', l: 'Модель' },
      { k: 'kind', l: 'Тип', opts: ['window','door','sliding'] },
      { k: 'price_per_sash', l: 'Цена/створка', type: 'number' }, { k: 'notes', l: 'Примечание' },
    ]},
    { id: 'handles',        title: 'Ручки',                 fields: [
      { k: 'id', l: 'ID' }, { k: 'vendor', l: 'Бренд' }, { k: 'name', l: 'Модель' },
      { k: 'kind', l: 'Тип', opts: ['window','door'] },
      { k: 'color_default', l: 'Цвет (id)' }, { k: 'price', l: 'Цена', type: 'number' },
    ]},
    { id: 'sills',          title: 'Подоконники',           fields: [
      { k: 'id', l: 'ID' }, { k: 'vendor', l: 'Бренд' }, { k: 'name', l: 'Модель' },
      { k: 'width_mm', l: 'Ширина мм', type: 'number' }, { k: 'color', l: 'Цвет' },
      { k: 'price_per_m', l: 'Цена/м', type: 'number' },
    ]},
    { id: 'ebbs',           title: 'Отливы',                fields: [
      { k: 'id', l: 'ID' }, { k: 'material', l: 'Материал' },
      { k: 'width_mm', l: 'Ширина мм', type: 'number' }, { k: 'color', l: 'Цвет' },
      { k: 'price_per_m', l: 'Цена/м', type: 'number' },
    ]},
    { id: 'meshes',         title: 'Сетки москитные',       fields: [
      { k: 'id', l: 'ID' },
      { k: 'kind', l: 'Тип', opts: ['frame','sliding','pleated','antikoshka','roll'] },
      { k: 'name', l: 'Название' }, { k: 'color', l: 'Цвет' },
      { k: 'price_per_unit', l: 'Цена/шт', type: 'number' }, { k: 'unit', l: 'Ед.' },
    ]},
    { id: 'door_hardware',  title: 'Дверной комплект',      fields: [
      { k: 'id', l: 'ID' },
      { k: 'category', l: 'Категория', opts: ['lock','lock_tongue','cylinder','hinge','closer','threshold','strike','rosette','fixator','handle_kit','bottom_bolt','top_bolt','roller','rail'] },
      { k: 'vendor', l: 'Бренд' }, { k: 'name', l: 'Название' },
      { k: 'unit', l: 'Ед.' }, { k: 'qty_per_door', l: 'Кол-во/дверь', type: 'number' },
      { k: 'price', l: 'Цена', type: 'number' }, { k: 'color_default', l: 'Цвет (id)' }, { k: 'notes', l: 'Прим.' },
    ]},
    { id: 'profile_parts',  title: 'Профильные части (Logikal)', fields: [
      { k: 'id', l: 'ID' }, { k: 'system_id', l: 'Система' },
      { k: 'kind', l: 'Тип', opts: ['frame','sash','mullion','bead','shtulp','turn','adapter','door_sash','threshold'] },
      { k: 'code', l: 'Код' }, { k: 'width_mm', l: 'Шир. мм', type: 'number' },
      { k: 'thickness_mm', l: 'Толщ. мм', type: 'number' }, { k: 'name', l: 'Название' },
      { k: 'price_per_m', l: 'Цена/м', type: 'number' },
    ]},
    { id: 'seals',          title: 'Уплотнители',           fields: [
      { k: 'id', l: 'ID' }, { k: 'code', l: 'Код' },
      { k: 'position', l: 'Позиция', opts: ['internal','external','central','bead','sash'] },
      { k: 'name', l: 'Название' }, { k: 'price_per_m', l: 'Цена/м', type: 'number' },
    ]},
    { id: 'brackets',       title: 'Уголки / сухари / соединители', fields: [
      { k: 'id', l: 'ID' },
      { k: 'category', l: 'Категория', opts: ['corner','mull_connector','sukhar','frame_anchor','consumable'] },
      { k: 'code', l: 'Код' }, { k: 'name', l: 'Название' },
      { k: 'unit', l: 'Ед.' }, { k: 'price_per_unit', l: 'Цена/шт', type: 'number' },
    ]},
    { id: 'shape_types',    title: 'Формы окон',            fields: [
      { k: 'id', l: 'ID' },
      { k: 'code', l: 'Код', opts: ['rectangle','arched','half_circle','triangle','trapezoid','gothic','pentagon','hexagon','oval','circle','quarter_circle','polygon','bay'] },
      { k: 'name', l: 'Название' }, { k: 'description', l: 'Описание' },
      { k: 'glass_factor', l: 'Наценка стекла', type: 'number' },
      { k: 'bend_fee', l: 'Гибка профиля, ₸', type: 'number' },
      { k: 'has_bent_profile', l: 'Гнутый профиль (1/0)', type: 'number' },
      { k: 'params_schema', l: 'Параметры (JSON)' },
    ]},
    { id: 'glass_attributes', title: 'Атрибуты стеклопакетов', fields: [
      { k: 'id', l: 'ID' },
      { k: 'code', l: 'Код', opts: ['tempered','triplex','tint','low_e','sun_control','self_clean','acoustic','shock_proof','georgian_bar'] },
      { k: 'name', l: 'Название' }, { k: 'description', l: 'Описание' },
      { k: 'multiplier', l: 'Множитель', type: 'number' },
      { k: 'surcharge_per_m2', l: 'Доплата ₸/м²', type: 'number' },
      { k: 'per_pane', l: 'За шт. (1/0)', type: 'number' },
      { k: 'notes', l: 'Прим.' },
    ]},
    { id: 'construction_types', title: 'Типы конструкций (фасады)', fields: [
      { k: 'id', l: 'ID' },
      { k: 'code', l: 'Код', opts: ['window','curtain_wall','structural_glazing','spider','winter_garden','glass_roof'] },
      { k: 'name', l: 'Название' }, { k: 'description', l: 'Описание' },
      { k: 'default_grid_w', l: 'Сетка W', type: 'number' },
      { k: 'default_grid_h', l: 'Сетка H', type: 'number' },
      { k: 'has_stoyka_rigel', l: 'Стойка/ригель', type: 'number' },
      { k: 'has_3d_planes', l: '3D плоск.', type: 'number' },
      { k: 'glass_factor', l: 'Наценка стекла', type: 'number' },
      { k: 'profile_factor', l: 'Наценка проф.', type: 'number' },
      { k: 'needs_anchoring', l: 'Анкеровка', type: 'number' },
      { k: 'notes', l: 'Прим.' },
    ]},
    { id: 'facade_profiles', title: 'Фасадные профили (стойки/ригели/спайдер)', fields: [
      { k: 'id', l: 'ID' }, { k: 'construction_id', l: 'Конструкция' },
      { k: 'category', l: 'Категория', opts: ['stoyka','rigel','spider','roof_rafter','roof_purlin'] },
      { k: 'vendor', l: 'Бренд' }, { k: 'name', l: 'Название' }, { k: 'code', l: 'Код' },
      { k: 'width_mm', l: 'Шир. мм', type: 'number' }, { k: 'unit', l: 'Ед.' },
      { k: 'price', l: 'Цена', type: 'number' }, { k: 'notes', l: 'Прим.' },
    ]},
    { id: 'door_types',     title: 'Типы дверей',           fields: [
      { k: 'id', l: 'ID' },
      { k: 'code', l: 'Код', opts: ['entrance','balcony','terrace','french','shtulp','storefront','swing','sliding_portal','double'] },
      { k: 'name', l: 'Название' }, { k: 'description', l: 'Описание' },
      { k: 'default_width', l: 'Ширина по умолч., мм', type: 'number' },
      { k: 'default_height', l: 'Высота по умолч., мм', type: 'number' },
      { k: 'reinforcement_factor', l: 'Коэф. армирования', type: 'number' },
      { k: 'required_components', l: 'Обязат. компоненты (JSON)' },
      { k: 'default_opening', l: 'Открывание по умолч.' },
    ]},
  ];

  async function pageCatalogs() {
    const params = (window.location.hash.match(/^#\/catalogs(?:\/(.+))?/) || [])[1];
    const activeId = params || 'all';
    if (activeId === 'all') return pageAllMaterials();
    const cat = CATALOGS.find(c => c.id === activeId) || CATALOGS[0];

    layout('catalogs', { title: 'Каталоги', subtitle: 'Цвета, фурнитура, профили, уплотнители, дверной комплект — всё в одном месте',
      actions: [h('button', { class: 'btn btn-accent', onClick: () => editRow(cat, {}, true) }, '+ Добавить запись')] },
      h('div', { class: 'card' }, [
        // tab strip
        h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;padding:14px;border-bottom:1px solid var(--rule)' }, [
          h('a', {
            href: '#/catalogs/all',
            style: `padding:6px 12px;border-radius:6px;font-size:12.5px;text-decoration:none;color:${activeId === 'all' ? '#fff' : 'var(--text)'};background:${activeId === 'all' ? 'var(--accent)' : '#f5f2ec'};font-weight:${activeId === 'all' ? 700 : 500}`,
          }, '★ Все материалы'),
          ...CATALOGS.map(c => h('a', {
            href: '#/catalogs/' + c.id,
            style: `padding:6px 12px;border-radius:6px;font-size:12.5px;text-decoration:none;color:${c.id === activeId ? '#fff' : 'var(--text)'};background:${c.id === activeId ? 'var(--accent)' : '#f5f2ec'};font-weight:${c.id === activeId ? 600 : 500}`,
          }, c.title)),
        ]),
        // table
        h('div', { id: 'catalog-tbl', style: 'padding:0' }, h('div', { class: 'empty' }, 'Загрузка...')),
      ]));

    try {
      const rows = await api('/' + cat.id);
      const tbl = document.getElementById('catalog-tbl');
      clear(tbl);
      const t = h('table', { class: 'tbl' }, [
        h('thead', {}, h('tr', {}, [...cat.fields.map(f => h('th', {}, f.l)), h('th', { style: 'width:120px' }, 'Действия')])),
        h('tbody', {}, rows.map(r => h('tr', {}, [
          ...cat.fields.map(f => h('td', { class: f.type === 'number' ? 'mono' : '' }, String(r[f.k] ?? '—'))),
          h('td', {}, [
            h('button', { class: 'btn btn-sm', onClick: () => editRow(cat, r, false), style: 'margin-right:4px' }, 'Изм.'),
            h('button', { class: 'btn btn-sm btn-danger', onClick: async () => {
              if (!confirm('Удалить ' + r.id + '?')) return;
              await api('/' + cat.id + '/' + r.id, { method: 'DELETE' });
              toast('Удалено'); pageCatalogs();
            } }, '✕'),
          ]),
        ]))),
      ]);
      tbl.appendChild(t);
    } catch (e) {
      document.getElementById('catalog-tbl').innerHTML = '<div class="empty">Ошибка: ' + e.message + '</div>';
    }
  }

  // ── Phase 14: unified all-materials page
  async function pageAllMaterials() {
    const search = window._matSearch || '';
    layout('catalogs', { title: 'Все материалы', subtitle: 'Сводный каталог всех SKU из 11 справочников' },
      h('div', { class: 'card' }, [
        h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;padding:14px;border-bottom:1px solid var(--rule);align-items:center' }, [
          h('a', { href: '#/catalogs/all', style: 'padding:6px 12px;border-radius:6px;font-size:12.5px;text-decoration:none;color:#fff;background:var(--accent);font-weight:700' }, '★ Все материалы'),
          ...CATALOGS.map(c => h('a', {
            href: '#/catalogs/' + c.id,
            style: 'padding:6px 12px;border-radius:6px;font-size:12.5px;text-decoration:none;color:var(--text);background:#f5f2ec;font-weight:500',
          }, c.title)),
          h('input', {
            type: 'text', placeholder: 'Поиск (название/код/бренд)…', value: search,
            style: 'flex:1;min-width:180px;margin-left:auto;padding:7px 12px;border:1px solid var(--rule);border-radius:6px;font-size:12.5px',
            oninput: (e) => { window._matSearch = e.target.value; clearTimeout(window._matSearchT); window._matSearchT = setTimeout(() => loadAllMaterials(), 300); },
          }),
        ]),
        h('div', { id: 'all-mat-body', style: 'padding:0' }, h('div', { class: 'empty' }, 'Загрузка…')),
      ]));
    loadAllMaterials();
  }
  async function loadAllMaterials() {
    const search = window._matSearch || '';
    try {
      const data = await api('/materials' + (search ? '?search=' + encodeURIComponent(search) : ''));
      const wrap = document.getElementById('all-mat-body');
      if (!wrap) return;
      clear(wrap);
      wrap.appendChild(h('div', { style: 'padding:10px 14px;background:#faf7f1;border-bottom:1px solid var(--rule);font-size:12px;color:var(--muted)' },
        `Найдено: ${data.totalItems} SKU в ${data.totalGroups} группах`));
      data.groups.forEach(g => {
        wrap.appendChild(h('div', { style: 'padding:10px 14px;background:#fdfbf6;border-top:1px solid var(--rule);font-weight:600;color:var(--accent-dark);font-size:13px;display:flex;justify-content:space-between;align-items:baseline' }, [
          h('span', {}, g.title),
          h('span', { style: 'font-size:11px;color:var(--muted);font-weight:500' }, g.count + ' шт.'),
        ]));
        const t = h('table', { class: 'tbl', style: 'border:none' }, [
          h('thead', {}, h('tr', {}, [
            h('th', {}, 'ID'), h('th', {}, 'Код'), h('th', {}, 'Название'),
            h('th', {}, 'Бренд / Тип'), h('th', { style: 'text-align:right' }, 'Цена'), h('th', {}, 'Ед.'),
          ])),
          h('tbody', {}, g.items.map(it => h('tr', {}, [
            h('td', { class: 'mono', style: 'font-size:11px' }, it.id),
            h('td', { class: 'mono' }, String(it.code || '—')),
            h('td', {}, it.name + (it.sub ? h('div', { style: 'font-size:11px;color:var(--muted);margin-top:2px' }, it.sub).outerHTML : '')),
            h('td', {}, (it.vendor && it.vendor !== '—' ? it.vendor + ' · ' : '') + (it.kind || '')),
            h('td', { class: 'mono', style: 'text-align:right' }, fmtNum(it.price || 0)),
            h('td', {}, it.unit || ''),
          ]))),
        ]);
        wrap.appendChild(t);
      });
    } catch (e) {
      const wrap = document.getElementById('all-mat-body');
      if (wrap) wrap.innerHTML = '<div class="empty">Ошибка: ' + e.message + '</div>';
    }
  }

  function editRow(cat, row, isNew) {
    const f = { ...row };
    const inputs = cat.fields.map(field => {
      let inp;
      if (field.opts) {
        inp = h('select', { class: 'text', style: 'width:100%' }, [
          ...field.opts.map(o => {
            const opt = document.createElement('option');
            opt.value = o; opt.textContent = o;
            if (f[field.k] === o) opt.selected = true;
            return opt;
          }),
        ]);
      } else {
        inp = h('input', { class: 'text', style: 'width:100%', type: field.type || 'text', value: f[field.k] != null ? f[field.k] : '' });
      }
      inp.addEventListener('input', () => f[field.k] = field.type === 'number' ? (parseFloat(inp.value) || 0) : inp.value);
      inp.addEventListener('change', () => f[field.k] = field.type === 'number' ? (parseFloat(inp.value) || 0) : inp.value);
      return h('div', { style: 'margin-bottom:10px' }, [
        h('label', { style: 'display:block;font-size:11px;color:var(--muted);margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:.4px' }, field.l + (field.k === 'id' ? ' (обязательно, уникально)' : '')),
        inp,
      ]);
    });
    modal({
      title: (isNew ? 'Новая запись · ' : 'Изменить · ') + cat.title,
      body: h('div', {}, inputs),
      submitText: isNew ? 'Создать' : 'Сохранить',
      onSubmit: async () => {
        if (isNew) {
          if (!f.id) throw new Error('ID обязателен');
          await api('/' + cat.id, { method: 'POST', body: JSON.stringify(f) });
        } else {
          await api('/' + cat.id + '/' + row.id, { method: 'PUT', body: JSON.stringify(f) });
        }
        toast(isNew ? 'Создано' : 'Сохранено');
        pageCatalogs();
      },
    });
  }

  // ── boot ─────────────────────────────────────────────────────────────
  if (!window.location.hash) window.location.hash = '#/dashboard';
  render();
})();
