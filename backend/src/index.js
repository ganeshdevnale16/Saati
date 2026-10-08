const path = require('path');
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');

const config = require('./config');
const migrate = require('./migrate');
const { requireAuth, verifySocketToken } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errors');
const { setIO } = require('./services/notify');
const jobs = require('./jobs/maintenance');

const app = express();
app.set('trust proxy', 1);
// referrerPolicy: map tile servers require a Referer header, helmet's default "no-referrer" gets tiles blocked
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, referrerPolicy: { policy: 'strict-origin-when-cross-origin' } }));
app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',') }));
app.use(express.json({ limit: '1mb' }));

app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false }));
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

app.get('/api/health', (req, res) => res.json({ ok: true, app: config.brand.app, by: config.brand.company }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/shares', requireAuth, require('./routes/shares'));
app.use('/api/locations', requireAuth, require('./routes/locations'));
app.use('/api/sos', requireAuth, require('./routes/sos'));
app.use('/api/notifications', requireAuth, require('./routes/notifications'));
app.use('/api/push', require('./routes/push'));

// ---------- App download ----------
const fs = require('fs');
const audit = require('./services/audit');
const WEB = path.join(__dirname, '..', '..', 'web');
const LOCAL_APK = path.join(WEB, 'downloads', 'saathi.apk');

app.get('/api/app-info', (req, res) => {
  const d = config.download;
  const hasApk = Boolean(d.apkUrl) || fs.existsSync(LOCAL_APK);
  let size = d.sizeMb;
  if (!size && !d.apkUrl && hasApk) size = (fs.statSync(LOCAL_APK).size / 1048576).toFixed(1);
  res.json({
    app: config.brand.app, company: config.brand.company, version: d.version,
    android: { available: hasApk, url: '/download/android', sizeMb: size || null, playStoreUrl: d.playStoreUrl || null },
    ios: { available: Boolean(d.iosUrl), url: d.iosUrl || null },
  });
});

// Stable link that never changes, even when you upload a new APK version
app.get('/download/android', (req, res) => {
  const d = config.download;
  audit(req, 'app_download', { platform: 'android', ua: req.get('user-agent'), version: d.version });
  if (d.playStoreUrl && req.query.direct !== '1') return res.redirect(302, d.playStoreUrl);
  if (d.apkUrl) return res.redirect(302, d.apkUrl);
  if (fs.existsSync(LOCAL_APK)) {
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    return res.download(LOCAL_APK, `Saathi-${d.version}.apk`);
  }
  res.status(404).send('The Android app is not uploaded yet. Please use the web version for now.');
});
app.get(['/download', '/get-app', '/app'], (req, res) => res.sendFile(path.join(WEB, 'download.html')));

// Web dashboard
app.use(express.static(WEB));
app.get(/^\/(?!api|socket\.io).*/, (req, res) => res.sendFile(path.join(WEB, 'index.html')));

app.use(errorHandler);

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });
io.use((socket, next) => {
  try { socket.user = verifySocketToken(socket.handshake.auth?.token); next(); }
  catch { next(new Error('unauthorized')); }
});
io.on('connection', (socket) => socket.join(`user:${socket.user.id}`));
setIO(io);

(async () => {
  if (config.autoMigrate) await migrate();
  await require('./services/webpush').init();
  jobs.start();
  server.listen(config.port, () => console.log(`${config.brand.app} API by ${config.brand.company} on :${config.port}`));
})().catch((e) => { console.error(e); process.exit(1); });
