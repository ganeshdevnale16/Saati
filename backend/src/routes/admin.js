// Admin tools for Devnale Globals. Protected by the ADMIN_KEY environment variable.
const router = require('express').Router();
const crypto = require('crypto');
const { z } = require('zod');
const { many, one } = require('../db');
const { wrap, httpError } = require('../middleware/errors');
const { notify } = require('../services/notify');
const { adminKey } = require('../config');
const audit = require('../services/audit');

router.use((req, res, next) => {
  const given = String(req.get('x-admin-key') || '');
  if (!adminKey || adminKey.length < 12) return next(httpError(403, 'Set ADMIN_KEY (12+ characters) in Render first'));
  const a = Buffer.from(given), b = Buffer.from(adminKey);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return next(httpError(403, 'Wrong admin key'));
  next();
});

// Quick numbers
router.get('/stats', wrap(async (req, res) => {
  res.json(await one(`SELECT
    (SELECT count(*) FROM users)::int AS users,
    (SELECT count(*) FROM users WHERE created_at > now() - interval '7 days')::int AS new_users_7d,
    (SELECT count(*) FROM shares WHERE status='active' AND (expires_at IS NULL OR expires_at > now()))::int AS active_shares,
    (SELECT count(*) FROM sos_events WHERE status='active')::int AS active_sos,
    (SELECT count(*) FROM audit_logs WHERE action='app_download')::int AS app_downloads`));
}));

// Send an alert to every user (in-app, web push, mobile push)
router.post('/broadcast', wrap(async (req, res) => {
  const b = z.object({ title: z.string().min(3).max(80), body: z.string().max(240).default(''), type: z.string().max(30).default('announcement') }).parse(req.body);
  const users = await many('SELECT id FROM users');
  for (let i = 0; i < users.length; i += 20) {
    await Promise.all(users.slice(i, i + 20).map((u) => notify(u.id, { type: b.type, title: b.title, body: b.body, data: { url: '/download' } })));
  }
  audit(req, 'admin_broadcast', { title: b.title, count: users.length });
  res.json({ sent: users.length });
}));

module.exports = router;
