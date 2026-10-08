const router = require('express').Router();
const { many, query } = require('../db');
const { wrap } = require('../middleware/errors');

router.get('/', wrap(async (req, res) => {
  res.json({ items: await many('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [req.user.id]) });
}));

router.post('/read-all', wrap(async (req, res) => {
  await query('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL', [req.user.id]);
  res.json({ ok: true });
}));

module.exports = router;
