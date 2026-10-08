const { many, query } = require('../db');
const { notify } = require('../services/notify');
const { retentionDays } = require('../config');

// Expire shares whose time is up and tell both people
async function expireShares() {
  const rows = await many(
    `UPDATE shares SET status='expired', ended_at=expires_at, updated_at=now()
     WHERE status='active' AND expires_at IS NOT NULL AND expires_at <= now() RETURNING *`);
  for (const s of rows) {
    await notify(s.sharer_id, { type: 'share_expired', title: 'Location sharing ended', body: 'Your timed location share has finished.', data: { shareId: s.id } });
    if (s.viewer_id) await notify(s.viewer_id, { type: 'share_expired', title: 'Location sharing ended', body: 'A location share you were viewing has finished.', data: { shareId: s.id } });
  }
  // Pending requests older than 7 days are cleaned up
  await query(`UPDATE shares SET status='expired', updated_at=now() WHERE status='pending' AND created_at < now() - interval '7 days'`);
}

// Data-retention: delete raw history older than N days
const purgeOld = () => query(`DELETE FROM locations WHERE recorded_at < now() - ($1 || ' days')::interval`, [String(retentionDays)]);

function start() {
  setInterval(() => expireShares().catch((e) => console.warn('[jobs] expire', e.message)), 60 * 1000);
  setInterval(() => purgeOld().catch((e) => console.warn('[jobs] purge', e.message)), 6 * 60 * 60 * 1000);
}

module.exports = { start, expireShares };
