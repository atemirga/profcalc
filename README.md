# ProfCalc

SaaS-платформа для расчёта оконных, дверных и витражных конструкций.
Telegram Mini App + веб-суперадминка PLUR Solutions.

## Структура

```
profcalc/
├── server.js            # Express сервер: API + статика
├── bot.js               # Telegram бот (long-polling)
├── server/
│   ├── db.js            # SQLite + сид данных
│   ├── calc.js          # движок расчёта окон
│   ├── routes.js        # REST API
│   └── telegram-auth.js # верификация initData
├── public/
│   ├── index.html       # лендинг (выбор admin/miniapp)
│   ├── shared/          # общие window-svg.js + api.js
│   ├── admin/           # суперадминка (vanilla SPA)
│   └── miniapp/         # Telegram Mini App (vanilla SPA)
├── tests/               # node:test (calc + API + auth)
└── data/profcalc.db     # SQLite (создаётся при первом запуске)
```

## Запуск

```bash
npm install

# веб-сервер (admin + miniapp + API)
npm start
# → http://localhost:3000/         — лендинг
# → http://localhost:3000/admin/   — суперадминка
# → http://localhost:3000/miniapp/ — Mini App

# Telegram бот (отдельный процесс, long-polling)
BOT_TOKEN=... MINIAPP_URL=https://your-public-host/miniapp/ npm run bot
```

`MINIAPP_URL` должен быть HTTPS, чтобы Telegram Mini App открывалась через
кнопку меню. Локально для разработки можно использовать ngrok / cloudflared
для туннеля.

## Тесты

```bash
npm test
```

30+ тестов: движок расчёта, REST API, Telegram initData auth.

## API

| Endpoint | Метод | Описание |
|---|---|---|
| `/api/me` | GET | Текущий пользователь (guest / unregistered / client / installer) |
| `/api/me/register-client` | POST | Регистрация розничного клиента |
| `/api/me/register-installer` | POST | Регистрация оконщика/прораба/цеха |
| `/api/manufacturers` | GET/POST/PUT/DELETE | CRUD производителей |
| `/api/installers` | GET/POST/PUT/DELETE | CRUD оконщиков |
| `/api/articles` | GET/POST/PUT/DELETE | CRUD прайс-листа (3 уровня цен) |
| `/api/articles/bulk-bump` | POST | Массовое изменение цен по группе |
| `/api/discounts` | GET | Скидочная матрица |
| `/api/discounts/:i/:m` | PUT | Назначить скидку (потолок 25%) |
| `/api/calc` | POST | Рассчитать без сохранения |
| `/api/calculations` | POST/GET | Сохранённые расчёты |
| `/api/calculations/:id` | GET | Один расчёт |
| `/api/compare` | POST | Сравнить производителей |
| `/api/kp` | POST | Создать КП |
| `/api/kp/:id` | GET | Получить КП |
| `/api/analytics` | GET | KPI + графики для дашборда |
| `/api/log` | GET | Журнал событий |
| `/api/profile-systems` | GET | Каталог профилей |
| `/api/glazing` | GET | Каталог стеклопакетов |
| `/api/opening-types` | GET | Типы открывания |

### Аутентификация

- Mini App: автоматически отправляет `X-Telegram-Init-Data` (валидируется HMAC-SHA256 по схеме Telegram).
- Dev/админка: query-параметр `?as=<installer_id>` имитирует оконщика для разработки.

## Роли (mini-app)

1. **Розничный клиент** — видит розничные цены, без скидок
2. **Оконщик** — дилерские цены + персональные скидки
3. **Прораб** — дилерские цены, отдельная политика скидок
4. **Цех / завод** — заводские цены, прямой доступ к каталогам

Скидки настраиваются в админке (`/admin/#/discounts`), потолок 25% (см. ТЗ §11).

## Telegram бот

Команды:
- `/start` — приветствие + кнопка открытия Mini App
- `/app` — повторная отправка кнопки
- `/me` — мой профиль оконщика (если зарегистрирован)
- `/stats` — статистика платформы (для админов: `ADMIN_TG_IDS=...`)
- `/help` — справка

Бот: [@profcalckz_bot](https://t.me/profcalckz_bot)
