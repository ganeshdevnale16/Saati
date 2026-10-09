const router = require('express').Router();
const { many, query } = require('../db');
const { wrap } = require('../middleware/errors');

router.get('/', wrap(async (req, res) => {
  const after = Number(req.query.after);
  if (Number.isFinite(after) && after >= 0) {
    // used by the phone app's background check: only alerts newer than the last one it showed
    return res.json({ items: await many('SELECT id, type, title, body, data, created_at FROM notifications WHERE user_id=$1 AND id > $2 ORDER BY id ASC LIMIT 20', [req.user.id, after]) });
  }
  res.json({ items: await many('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [req.user.id]) });
}));

router.post('/read-all', wrap(async (req, res) => {
  await query('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL', [req.user.id]);
  res.json({ ok: true });
}));

module.exports = router;
