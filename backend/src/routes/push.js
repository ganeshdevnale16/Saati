const router = require('express').Router();
const { z } = require('zod');
const { query } = require('../db');
const { wrap } = require('../middleware/errors');
const { requireAuth } = require('../middleware/auth');
const webpush = require('../services/webpush');

router.get('/vapid-public-key', (req, res) => res.json({ key: webpush.getPublicKey() }));

router.post('/subscribe', requireAuth, wrap(async (req, res) => {
  const b = z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) }).parse(req.body);
  await query(
    `INSERT INTO web_push_subs(user_id, endpoint, p256dh, auth) VALUES ($1,$2,$3,$4)
     ON CONFLICT (endpoint) DO UPDATE SET user_id=$1, p256dh=$3, auth=$4`,
    [req.user.id, b.endpoint, b.keys.p256dh, b.keys.auth]);
  res.json({ ok: true });
}));

router.post('/unsubscribe', requireAuth, wrap(async (req, res) => {
  const { endpoint } = z.object({ endpoint: z.string() }).parse(req.body);
  await query('DELETE FROM web_push_subs WHERE endpoint=$1 AND user_id=$2', [endpoint, req.user.id]);
  res.json({ ok: true });
}));

// Lets a user check that alerts reach this device
router.post('/test', requireAuth, wrap(async (req, res) => {
  await require('../services/notify').notify(req.user.id, { type: 'test', title: 'Saathi alerts are working', body: 'You will get SOS and nearby alerts on this device.' });
  res.json({ ok: true });
}));

module.exports = router;
