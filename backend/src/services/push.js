// Expo Push API - delivers to Android (FCM) and iOS (APNs).
async function sendPush(tokens, { title, body, data, priority = 'default', channelId = 'default' }) {
  const list = (Array.isArray(tokens) ? tokens : [tokens]).filter((t) => t && t.startsWith('ExponentPushToken'));
  if (!list.length) return;
  const messages = list.map((to) => ({ to, title, body, data, sound: 'default', priority, channelId }));
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
  } catch (e) {
    console.warn('[push] failed', e.message);
  }
}
module.exports = { sendPush };
