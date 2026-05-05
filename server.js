// server.js — entry point: serves admin SPA, mini-app SPA, REST API
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from './server/routes.js';
import './server/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const app = express();

// Compact request log
app.use((req, _res, next) => {
  const t = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.log(`${t} ${req.method} ${req.url}`);
  next();
});

app.use('/api', api);

// No-cache headers for HTML/JS/CSS — Telegram WebApp aggressively caches static
// assets, so we force revalidation on every request to ensure users see the
// latest miniapp code without needing to reinstall the bot.
function noCacheStatic(dir) {
  return express.static(dir, {
    etag: false, lastModified: false,
    setHeaders: (res, p) => {
      if (/\.(html|js|css|svg)$/.test(p)) {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
      }
    },
  });
}

// Static SPAs
app.use('/admin',   noCacheStatic(path.join(__dirname, 'public/admin')));
app.use('/miniapp', noCacheStatic(path.join(__dirname, 'public/miniapp')));
app.use('/shared',  noCacheStatic(path.join(__dirname, 'public/shared')));

// Root → friendly index linking both surfaces
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// SPA fallback for admin / miniapp deep links
app.get('/admin/*', (_req, res) => res.sendFile(path.join(__dirname, 'public/admin/index.html')));
app.get('/miniapp/*', (_req, res) => res.sendFile(path.join(__dirname, 'public/miniapp/index.html')));

app.use((err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: err.message });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, HOST, () => {
    // eslint-disable-next-line no-console
    console.log(`ProfCalc listening on http://${HOST}:${PORT}`);
    console.log(`  Admin:    http://${HOST}:${PORT}/admin/`);
    console.log(`  Mini App: http://${HOST}:${PORT}/miniapp/`);
    console.log(`  API:      http://${HOST}:${PORT}/api/`);
  });
}

export default app;
