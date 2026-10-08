const router = require('express').Router();
const { z } = require('zod');
const { one, many, pool } = require('../db');
const { wrap, httpError } = require('../middleware/errors');
const { emitTo } = require('../services/notify');
const { activeViewersOf, canView, ACTIVE } = require('../services/shares');
const { onLocation } = require('../services/proximity');
const { buildTimeline } = require('../utils/geo');

const point = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().nullable().optional(),
  speed: z.number().nullable().optional(),
  heading: z.number().nullable().optional(),
  battery: z.number().min(0).max(1).nullable().optional(),
  recordedAt: z.string().datetime({ offset: true }).or(z.number()),
  clientId: z.string().min(4).max(64),
});

// Accepts live points AND offline-buffered points (up to 500 per call). Idempotent by clientId.
router.post('/batch', wrap(async (req, res) => {
  const { points } = z.object({ points: z.array(point).min(1).max(500) }).parse(req.body);
  const uid = req.user.id;
  const now = Date.now();
  const rows = points
    .map((p) => ({ ...p, t: new Date(p.recordedAt) }))
    .filter((p) => p.t.getTime() <= now + 5 * 60000)        // ignore clocks far in the future
    .sort((a, b) => a.t - b.t);

  const client = await pool.connect();
  let inserted = 0;
  try {
    await client.query('BEGIN');
    for (const p of rows) {
      const r = await client.query(
        `INSERT INTO locations(user_id, lat, lng, accuracy, speed, heading, battery, recorded_at, offline, client_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (user_id, client_id) DO NOTHING`,
        [uid, p.lat, p.lng, p.accuracy ?? null, p.speed ?? null, p.heading ?? null, p.battery ?? null, p.t,
         now - p.t.getTime() > 2 * 60000, p.clientId]);
      inserted += r.rowCount;
    }
    const last = rows[rows.length - 1];
    if (last) {
      await client.query(
        `INSERT INTO latest_locations(user_id, lat, lng, accuracy, speed, battery, recorded_at) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (user_id) DO UPDATE SET lat=EXCLUDED.lat, lng=EXCLUDED.lng, accuracy=EXCLUDED.accuracy,
           speed=EXCLUDED.speed, battery=EXCLUDED.battery, recorded_at=EXCLUDED.recorded_at
         WHERE latest_locations.recorded_at < EXCLUDED.recorded_at`,
        [uid, last.lat, last.lng, last.accuracy ?? null, last.speed ?? null, last.battery ?? null, last.t]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK'); throw e;
  } finally { client.release(); }

  const latest = await one('SELECT * FROM latest_locations WHERE user_id=$1', [uid]);
  const viewers = await activeViewersOf(uid);
  const payload = { userId: uid, ...latest, points: rows.map((p) => ({ lat: p.lat, lng: p.lng, recorded_at: p.t })) };
  viewers.forEach((v) => emitTo(v.viewer_id, 'location:update', payload));
  emitTo(uid, 'location:self', latest);
  onLocation(uid, latest).catch((e) => console.warn('[proximity]', e.message));

  res.json({ received: points.length, inserted, sharingWith: viewers.length });
}));

// Latest position of everyone I'm allowed to track
router.get('/live', wrap(async (req, res) => {
  res.json({
    people: await many(
      `SELECT s.id AS share_id, s.expires_at, s.alert_enabled, s.alert_radius_m, s.alert_center, s.alert_lat, s.alert_lng, s.alert_label,
              u.id AS user_id, u.full_name, u.mobile, l.lat, l.lng, l.accuracy, l.speed, l.battery, l.recorded_at,
              EXISTS (SELECT 1 FROM sos_events e WHERE e.user_id=u.id AND e.status='active') AS sos_active
       FROM shares s JOIN users u ON u.id = s.sharer_id
       LEFT JOIN latest_locations l ON l.user_id = s.sharer_id
       WHERE s.viewer_id = $1 AND ${ACTIVE}`, [req.user.id]),
  });
}));

// History + timeline. Viewers only see points recorded while their share was active.
router.get('/history/:userId', wrap(async (req, res) => {
  const q = z.object({ from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }).optional() }).parse(req.query);
  const target = req.params.userId === 'me' ? req.user.id : req.params.userId;
  const self = target === req.user.id;
  if (!self && !(await canView(req.user.id, target))) throw httpError(403, 'This person is not sharing their location with you');

  const params = [target, q.from, q.to || new Date().toISOString()];
  let sql = `SELECT lat, lng, accuracy, speed, battery, recorded_at, offline FROM locations l
             WHERE l.user_id=$1 AND l.recorded_at BETWEEN $2 AND $3`;
  if (!self) {
    params.push(req.user.id);
    sql += ` AND EXISTS (SELECT 1 FROM shares s WHERE s.sharer_id=$1 AND s.viewer_id=$4 AND s.starts_at IS NOT NULL
               AND l.recorded_at >= s.starts_at AND l.recorded_at <= COALESCE(s.ended_at, s.expires_at, now()))`;
  }
  sql += ' ORDER BY recorded_at ASC LIMIT 10000';
  const points = await many(sql, params);
  res.json({ points, timeline: buildTimeline(points) });
}));

module.exports = router;
