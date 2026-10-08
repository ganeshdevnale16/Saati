const { one, query } = require('../db');
const { distanceM } = require('../utils/geo');
const { notify } = require('./notify');
const { activeViewersOf, activeSharesWhereViewer } = require('./shares');

// Checks one share: is the sharer within the viewer's alert radius?
// Uses 10% hysteresis so a person on the edge doesn't trigger repeated alerts.
async function checkShare(share, sharerLoc, sharerName) {
  if (!share.alert_enabled || !sharerLoc) return;
  let center = null;
  if (share.alert_center === 'fixed' && share.alert_lat != null) center = { lat: share.alert_lat, lng: share.alert_lng };
  else center = await one('SELECT lat, lng FROM latest_locations WHERE user_id=$1', [share.viewer_id]);
  if (!center) return;

  const d = distanceM(center, sharerLoc);
  const r = share.alert_radius_m;
  let inside = share.alert_inside;
  if (d <= r && inside !== true) inside = true;
  else if (d > r * 1.1 && inside !== false) inside = false;
  else return;

  const wasKnown = share.alert_inside !== null;
  await query('UPDATE shares SET alert_inside=$1 WHERE id=$2', [inside, share.id]);
  if (!wasKnown && !inside) return; // first reading outside: nothing to announce

  const km = (r / 1000).toFixed(r % 1000 ? 1 : 0);
  const where = share.alert_center === 'fixed' ? (share.alert_label || 'your saved place') : 'you';
  await notify(share.viewer_id, inside
    ? { type: 'proximity_enter', title: `${sharerName} is nearby`, body: `${sharerName} is within ${km} km of ${where} (${(d / 1000).toFixed(1)} km away).`, data: { shareId: share.id, userId: share.sharer_id } }
    : { type: 'proximity_exit', title: `${sharerName} moved away`, body: `${sharerName} is now outside ${km} km of ${where}.`, data: { shareId: share.id, userId: share.sharer_id } });
}

// Called when user `userId` sends a new location
async function onLocation(userId, loc) {
  const me = await one('SELECT full_name FROM users WHERE id=$1', [userId]);
  // 1) I am a sharer: check each viewer's radius around them
  for (const s of await activeViewersOf(userId)) await checkShare(s, loc, me.full_name);
  // 2) I am a viewer with radius centred on me: re-check people I track
  for (const s of await activeSharesWhereViewer(userId)) {
    if (s.alert_center !== 'me') continue;
    const other = await one(
      `SELECT l.lat, l.lng, u.full_name FROM latest_locations l JOIN users u ON u.id=l.user_id WHERE l.user_id=$1`, [s.sharer_id]);
    if (other) await checkShare(s, other, other.full_name);
  }
}

module.exports = { onLocation };
