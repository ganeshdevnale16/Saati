const router = require('express').Router();
const { z } = require('zod');
const { one, many, query } = require('../db');
const { wrap, httpError } = require('../middleware/errors');
const { notify } = require('../services/notify');
const { ACTIVE } = require('../services/shares');
const audit = require('../services/audit');

// Who receives my SOS: everyone in an active share with me (either direction) + my emergency contact if registered
async function sosRecipients(userId) {
  return many(
    `SELECT DISTINCT uid FROM (
        SELECT s.viewer_id AS uid FROM shares s WHERE s.sharer_id=$1 AND ${ACTIVE}
        UNION SELECT s.sharer_id FROM shares s WHERE s.viewer_id=$1 AND ${ACTIVE}
        UNION SELECT e.id FROM users me JOIN users e ON e.mobile = me.emergency_mobile WHERE me.id=$1
     ) x WHERE uid IS NOT NULL AND uid <> $1`, [userId]);
}

router.post('/', wrap(async (req, res) => {
  const b = z.object({ lat: z.number().optional(), lng: z.number().optional(), message: z.string().max(200).optional() }).parse(req.body);
  const me = await one('SELECT full_name, mobile FROM users WHERE id=$1', [req.user.id]);
  let loc = b.lat != null ? { lat: b.lat, lng: b.lng } : await one('SELECT lat, lng FROM latest_locations WHERE user_id=$1', [req.user.id]);
  const ev = await one(
    `INSERT INTO sos_events(user_id, lat, lng, message) VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.user.id, loc?.lat ?? null, loc?.lng ?? null, b.message || null]);
  const recipients = await sosRecipients(req.user.id);
  const maps = loc ? ` https://maps.google.com/?q=${loc.lat},${loc.lng}` : '';
  await Promise.all(recipients.map((r) => notify(r.uid, {
    type: 'sos', urgent: true,
    title: `SOS from ${me.full_name}`,
    body: `${b.message || 'Needs help now.'} Call ${me.mobile}.${maps}`,
    data: { sosId: ev.id, userId: req.user.id, lat: loc?.lat, lng: loc?.lng, mobile: me.mobile },
  })));
  audit(req, 'sos_trigger', { sosId: ev.id, recipients: recipients.length });
  res.status(201).json({ sos: ev, notified: recipients.length });
}));

router.post('/:id/resolve', wrap(async (req, res) => {
  const ev = await one('SELECT * FROM sos_events WHERE id=$1', [req.params.id]);
  if (!ev || ev.user_id !== req.user.id) throw httpError(404, 'SOS not found');
  await query(`UPDATE sos_events SET status='resolved', resolved_at=now() WHERE id=$1`, [ev.id]);
  const me = await one('SELECT full_name FROM users WHERE id=$1', [req.user.id]);
  const recipients = await sosRecipients(req.user.id);
  await Promise.all(recipients.map((r) => notify(r.uid, { type: 'sos_resolved', title: `${me.full_name} is safe`, body: 'The SOS alert was marked resolved.', data: { sosId: ev.id } })));
  audit(req, 'sos_resolve', { sosId: ev.id });
  res.json({ ok: true });
}));

// My own active SOS + active SOS from people connected to me
router.get('/active', wrap(async (req, res) => {
  res.json({
    mine: await one(`SELECT * FROM sos_events WHERE user_id=$1 AND status='active' ORDER BY created_at DESC LIMIT 1`, [req.user.id]),
    others: await many(
      `SELECT e.*, u.full_name, u.mobile FROM sos_events e JOIN users u ON u.id=e.user_id
       WHERE e.status='active' AND e.user_id IN (
         SELECT s.sharer_id FROM shares s WHERE s.viewer_id=$1 AND ${ACTIVE}
         UNION SELECT s.viewer_id FROM shares s WHERE s.sharer_id=$1 AND ${ACTIVE})
       ORDER BY e.created_at DESC`, [req.user.id]),
  });
}));

module.exports = router;
