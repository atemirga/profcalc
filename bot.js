// bot.js — Telegram bot for ProfCalc
// Run: BOT_TOKEN=… MINIAPP_URL=https://… node bot.js
//
// Commands:
//   /start  — welcome + open mini-app button
//   /app    — re-send mini-app button
//   /help   — list commands
//   /me     — show current installer
//   /stats  — basic platform stats (admin)
//
// Also sets the persistent menu button to the mini-app.
import TelegramBot from 'node-telegram-bot-api';
import db, { logEvent } from './server/db.js';

const BOT_TOKEN = process.env.BOT_TOKEN || '8674981496:AAFCDyX7K_oW9WvHO36Mo8cSadeUSeIIkbI';
const MINIAPP_URL = process.env.MINIAPP_URL || 'https://t.me'; // overridden in production
const ADMIN_TG_IDS = (process.env.ADMIN_TG_IDS || '').split(',').filter(Boolean).map(s => parseInt(s, 10));

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN missing');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log('ProfCalc bot started · token ends with …' + BOT_TOKEN.slice(-6));
console.log('MINIAPP_URL =', MINIAPP_URL);

// Set persistent menu button (Mini App launcher) globally
(async () => {
  try {
    await bot.setMyCommands([
      { command: 'start',  description: 'Открыть ProfCalc' },
      { command: 'app',    description: 'Запустить Mini App' },
      { command: 'me',     description: 'Мой профиль' },
      { command: 'stats',  description: 'Статистика платформы' },
      { command: 'help',   description: 'Помощь' },
    ]);
    if (MINIAPP_URL.startsWith('https://')) {
      await bot.setChatMenuButton({
        menu_button: { type: 'web_app', text: 'ProfCalc', web_app: { url: MINIAPP_URL } },
      });
      console.log('Menu button set to', MINIAPP_URL);
    } else {
      console.log('MINIAPP_URL is not HTTPS — menu button skipped (Telegram requires HTTPS for Mini Apps).');
    }
  } catch (e) {
    console.error('Setup error:', e.message);
  }
})();

function appKeyboard() {
  if (MINIAPP_URL.startsWith('https://')) {
    return {
      reply_markup: {
        inline_keyboard: [[{ text: '🪟 Открыть ProfCalc', web_app: { url: MINIAPP_URL } }]],
      },
    };
  }
  return {
    reply_markup: {
      inline_keyboard: [[{ text: '🪟 Открыть ProfCalc', url: MINIAPP_URL }]],
    },
  };
}

bot.onText(/\/start(.*)/, async (msg) => {
  const userName = msg.from.first_name || 'друг';
  const text = `Здравствуйте, ${userName}!

ProfCalc — расчёт оконных, дверных и витражных конструкций. Конструктор, сравнение производителей, формирование КП.

Откройте Mini App ниже, чтобы начать.`;
  await bot.sendMessage(msg.chat.id, text, appKeyboard());
  logEvent(msg.from.id, 'bot.start', userName);
});

bot.onText(/\/app/, async (msg) => {
  await bot.sendMessage(msg.chat.id, 'Откройте ProfCalc:', appKeyboard());
});

bot.onText(/\/help/, async (msg) => {
  await bot.sendMessage(msg.chat.id,
    'Команды:\n' +
    '/start — приветствие и Mini App\n' +
    '/app — запустить Mini App\n' +
    '/me — мой профиль\n' +
    '/stats — статистика (для админов)\n' +
    '/help — эта подсказка',
  );
});

bot.onText(/\/me/, async (msg) => {
  const inst = db.prepare('SELECT * FROM installers WHERE telegram_id = ?').get(msg.from.id);
  if (inst) {
    await bot.sendMessage(msg.chat.id,
      `Ваш профиль оконщика:\n\n` +
      `Название: ${inst.name}\n` +
      `Город: ${inst.city}\n` +
      `Расчётов: ${inst.calcs}\n` +
      `Верифицирован: ${inst.verified ? '✓ да' : 'нет'}\n` +
      `${inst.bin ? 'БИН: ' + inst.bin + '\n' : ''}` +
      `${inst.phone ? 'Телефон: ' + inst.phone : ''}`,
    );
  } else {
    await bot.sendMessage(msg.chat.id,
      'Вы пока не зарегистрированы как оконщик. Откройте Mini App и пройдите регистрацию.',
      appKeyboard(),
    );
  }
});

bot.onText(/\/stats/, async (msg) => {
  if (ADMIN_TG_IDS.length && !ADMIN_TG_IDS.includes(msg.from.id)) {
    await bot.sendMessage(msg.chat.id, 'Команда доступна только администраторам.');
    return;
  }
  const totalCalcs = db.prepare('SELECT COUNT(*) AS c FROM calculations').get().c;
  const totalIns = db.prepare('SELECT COUNT(*) AS c FROM installers').get().c;
  const totalManu = db.prepare('SELECT COUNT(*) AS c FROM manufacturers').get().c;
  const seedCalcs = db.prepare('SELECT SUM(calcs) AS c FROM installers').get().c || 0;
  await bot.sendMessage(msg.chat.id,
    'Статистика ProfCalc:\n\n' +
    `Всего расчётов: ${totalCalcs + seedCalcs}\n` +
    `Производителей: ${totalManu}\n` +
    `Оконщиков: ${totalIns}\n`,
  );
});

// Receive web_app_data (from Mini App tg.sendData())
bot.on('message', async (msg) => {
  if (msg.web_app_data) {
    try {
      const data = JSON.parse(msg.web_app_data.data);
      logEvent(msg.from.id, 'bot.webapp-data', JSON.stringify(data).slice(0, 200));
      if (data.type === 'kp.shared') {
        await bot.sendMessage(msg.chat.id,
          `Коммерческое предложение №${data.number} на сумму ${data.total} ₸ сформировано. Документ доступен в Mini App.`,
        );
      }
    } catch {
      logEvent(msg.from.id, 'bot.webapp-data.invalid', String(msg.web_app_data.data).slice(0, 200));
    }
  }
});

bot.on('polling_error', (err) => {
  console.error('polling_error:', err.message);
});
