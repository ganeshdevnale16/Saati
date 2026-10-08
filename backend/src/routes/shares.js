const router = require('express').Router();
const { z } = require('zod');
const { one, many, query } = require('../db');
const { wrap, httpError } = require('../middleware/errors');
const { parseContact } = require('../utils/contact');
const { computeExpiry } = require('../utils/duration');
const { notify, emitTo } = require('../services/notify');
const { ACTIVE } = require('../services/shares');
const audit = require('../services/audit');

const durationSchema = {
  duration: z.enum(['1h', '1d', '1w', '1m', 'custom', 'until_cancel']),
  durationMinutes: z.number().int().positive().optional(),
};
const LABEL = { '1h': '1 hour', '1d': '1 day', '1w': '1 week', '1m': '1 month', until_cancel: 'until stopped' };
const label = (d, m) => LABEL[d] || (m >= 1440 ? `${Math.round(m / 1440)} days` : m >= 60 ? `${Math.round(m / 60)} hours` : `${m} minutes`);

async function findTarget(to, myId) {
  const c = parseContact(to);
  if (!c) throw httpError(400, 'Enter a valid mobile number or email');
  const u = await one('SELECT id, full_name, mobile, email FROM users WHERE mobile=$1 OR email=$2', [c.mobile || null, c.email || null]);
  if (u && u.id === myId) throw httpError(400, "You can't share with yourself");
  return { contact: c, user: u };
}

// Shares list, grouped the way the app shows them
router.get('/', wrap(async (req, res) => {
  const me = req.user.id;
  const rows = await many(
    `SELECT s.*,
       sh.full_name AS sharer_name, sh.mobile AS sharer_mobile,
       vw.full_name AS viewer_name, vw.mobile AS viewer_mobile,
       ll.lat, ll.lng, ll.recorded_at AS last_seen, ll.battery,
       (${ACTIVE}) AS is_live
     FROM shares s
     LEFT JOIN users sh ON sh.id = s.sharer_id
     LEFT JOIN users vw ON vw.id = s.viewer_id
     LEFT JOIN latest_locations ll ON ll.user_id = s.sharer_id AND s.viewer_id = $1 AND (${ACTIVE})
     WHERE (s.sharer_id = $1 OR s.viewer_id = $1) AND s.status IN ('pending','active')
     ORDER BY s.updated_at DESC`, [me]);
  const live = rows.filter((r) => r.is_live);
  res.json({
    sharing: live.filter((r) => r.sharer_id === me),          // people who can see me
    tracking: live.filter((r) => r.viewer_id === me),         // people I can see
    incoming: rows.filter((r) => r.status === 'pending' && r.sharer_id === me && r.initiated_by === 'viewer'),
    outgoing: rows.filter((r) => r.status === 'pending' && r.viewer_id === me && r.initiated_by === 'viewer'),
  });
}));

// I share my location with someone (active immediately - I am giving consent)
router.post('/offer', wrap(async (req, res) => {
  const b = z.object({ to: z.string(), note: z.string().max(140).optional(), ...durationSchema }).parse(req.body);
  const { contact, user } = await findTarget(b.to, req.user.id);
  const expires = computeExpiry(b.duration, b.durationMinutes);
  if (user) {
    await query(`UPDATE shares SET status='cancelled', ended_at=now(), updated_at=now()
                 WHERE sharer_id=$1 AND viewer_id=$2 AND status IN ('active','pending')`, [req.user.id, user.id]);
  }
  const share = await one(
    `INSERT INTO shares(sharer_id, viewer_id, invite_mobile, invite_email, initiated_by, status, duration, duration_minutes, note, starts_at, expires_at)
     VALUES ($1,$2,$3,$4,'sharer','active',$5,$6,$7,now(),$8) RETURNING *`,
    [req.user.id, user?.id || null, contact.mobile || null, contact.email || null, b.duration, b.durationMinutes || null, b.note || null, expires]);
  const me = await one('SELECT full_name FROM users WHERE id=$1', [req.user.id]);
  if (user) {
    await notify(user.id, { type: 'share_started', title: `${me.full_name} is sharing their location`, body: `You can see them for ${label(b.duration, b.durationMinutes)}.`, data: { shareId: share.id } });
  }
  audit(req, 'share_offer', { shareId: share.id, to: contact });
  res.status(201).json({ share, invited: !user });
}));

// I ask someone for their location (they must approve)
router.post('/request', wrap(async (req, res) => {
  const b = z.object({ to: z.string(), note: z.string().max(140).optional(), ...durationSchema }).parse(req.body);
  const { contact, user } = await findTarget(b.to, req.user.id);
  computeExpiry(b.duration, b.durationMinutes); // validate
  if (user) {
    const dup = await one(`SELECT id FROM shares WHERE sharer_id=$1 AND viewer_id=$2 AND status='pending'`, [user.id, req.user.id]);
    if (dup) throw httpError(409, 'You already have a pending request with this person');
  }
  const share = await one(
    `INSERT INTO shares(sharer_id, viewer_id, invite_mobile, invite_email, initiated_by, status, duration, duration_minutes, note)
     VALUES ($1,$2,$3,$4,'viewer','pending',$5,$6,$7) RETURNING *`,
    [user?.id || null, req.user.id, contact.mobile || null, contact.email || null, b.duration, b.durationMinutes || null, b.note || null]);
  const me = await one('SELECT full_name, mobile FROM users WHERE id=$1', [req.user.id]);
  if (user) {
    await notify(user.id, { type: 'share_request', title: `${me.full_name} wants to see your location`, body: `For ${label(b.duration, b.durationMinutes)}${b.note ? ` - "${b.note}"` : ''}. Approve or decline in Requests.`, data: { shareId: share.id } });
  }
  audit(req, 'share_request', { shareId: share.id, to: contact });
  res.status(201).json({ share, invited: !user });
}));

async function loadShare(id) {
  const s = await one('SELECT * FROM shares WHERE id=$1', [id]);
  if (!s) throw httpError(404, 'This request no longer exists');
  return s;
}

// Sharer approves a request (may change the duration)
router.post('/:id/approve', wrap(async (req, res) => {
  const b = z.object({ duration: durationSchema.duration.optional(), durationMinutes: durationSchema.durationMinutes }).parse(req.body || {});
  const s = await loadShare(req.params.id);
  if (s.sharer_id !== req.user.id || s.status !== 'pending') throw httpError(403, 'Only the person sharing can approve this request');
  const duration = b.duration || s.duration;
  const mins = b.duration ? b.durationMinutes : s.duration_minutes;
  const share = await one(
    `UPDATE shares SET status='active', duration=$2, duration_minutes=$3, starts_at=now(), expires_at=$4, updated_at=now() WHERE id=$1 RETURNING *`,
    [s.id, duration, mins || null, computeExpiry(duration, mins)]);
  const me = await one('SELECT full_name FROM users WHERE id=$1', [req.user.id]);
  await notify(s.viewer_id, { type: 'share_approved', title: `${me.full_name} approved your request`, body: `You can see their location for ${label(duration, mins)}.`, data: { shareId: s.id } });
  emitTo(req.user.id, 'shares:changed', {});
  audit(req, 'share_approve', { shareId: s.id });
  res.json({ share });
}));

router.post('/:id/reject', wrap(async (req, res) => {
  const s = await loadShare(req.params.id);
  if (s.sharer_id !== req.user.id || s.status !== 'pending') throw httpError(403, 'You can only decline requests sent to you');
  await query(`UPDATE shares SET status='rejected', ended_at=now(), updated_at=now() WHERE id=$1`, [s.id]);
  await notify(s.viewer_id, { type: 'share_rejected', title: 'Location request declined', body: 'Your request was declined.', data: { shareId: s.id } });
  audit(req, 'share_reject', { shareId: s.id });
  res.json({ ok: true });
}));

// Either side can stop a share or withdraw a request at any time
router.post('/:id/stop', wrap(async (req, res) => {
  const s = await loadShare(req.params.id);
  if (![s.sharer_id, s.viewer_id].includes(req.user.id)) throw httpError(403, 'Not your share');
  await query(`UPDATE shares SET status='cancelled', ended_at=now(), updated_at=now() WHERE id=$1`, [s.id]);
  const other = s.sharer_id === req.user.id ? s.viewer_id : s.sharer_id;
  const me = await one('SELECT full_name FROM users WHERE id=$1', [req.user.id]);
  if (other) await notify(other, { type: 'share_stopped', title: 'Location sharing stopped', body: `${me.full_name} stopped this location share.`, data: { shareId: s.id } });
  emitTo(req.user.id, 'shares:changed', {});
  audit(req, 'share_stop', { shareId: s.id });
  res.json({ ok: true });
}));

// Viewer's nearby-alert settings for this person
router.patch('/:id/alert', wrap(async (req, res) => {
  const b = z.object({
    enabled: z.boolean(),
    radiusKm: z.number().min(0.2).max(500),
    center: z.enum(['me', 'fixed']).default('me'),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    label: z.string().max(40).optional(),
  }).parse(req.body);
  const s = await loadShare(req.params.id);
  if (s.viewer_id !== req.user.id) throw httpError(403, 'Only the person tracking can change alerts');
  if (b.center === 'fixed' && (b.lat == null || b.lng == null)) throw httpError(400, 'Pick a place on the map for the alert centre');
  const share = await one(
    `UPDATE shares SET alert_enabled=$2, alert_radius_m=$3, alert_center=$4, alert_lat=$5, alert_lng=$6, alert_label=$7, alert_inside=NULL, updated_at=now()
     WHERE id=$1 RETURNING *`,
    [s.id, b.enabled, Math.round(b.radiusKm * 1000), b.center, b.lat ?? null, b.lng ?? null, b.label || null]);
  res.json({ share });
}));

module.exports = router;
