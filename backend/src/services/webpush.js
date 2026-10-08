// Browser push notifications (work even when the Saathi tab is closed).
// VAPID keys are generated once and kept in the database, so no setup is needed.
const webpush = require('web-push');
const { one, many, query } = require('../db');

let publicKey = null;

async function init() {
  let pub = process.env.VAPID_PUBLIC_KEY;
  let priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    const row = await one(`SELECT value FROM app_settings WHERE key='vapid'`);
    if (row) ({ pub, priv } = JSON.parse(row.value));
    else {
      const k = webpush.generateVAPIDKeys();
      pub = k.publicKey; priv = k.privateKey;
      await query(`INSERT INTO app_settings(key, value) VALUES ('vapid', $1) ON CONFLICT (key) DO NOTHING`, [JSON.stringify({ pub, priv })]);
    }
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:support@devnaleglobals.com', pub, priv);
  publicKey = pub;
}

const getPublicKey = () => publicKey;

async function sendToUser(userId, { title, body, data, urgent }) {
  if (!publicKey) return;
  const subs = await many('SELECT * FROM web_push_subs WHERE user_id=$1', [userId]);
  const payload = JSON.stringify({ title, body, data, urgent });
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload,
        { TTL: urgent ? 3600 : 86400, urgency: urgent ? 'high' : 'normal' });
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await query('DELETE FROM web_push_subs WHERE id=$1', [s.id]);
    }
  }));
}

module.exports = { init, getPublicKey, sendToUser };
