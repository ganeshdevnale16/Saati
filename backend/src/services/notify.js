const { one } = require('../db');
const { sendPush } = require('./push');

let io = null;
const setIO = (i) => { io = i; };
const emitTo = (userId, event, payload) => io && io.to(`user:${userId}`).emit(event, payload);

// In-app notification + realtime socket event + mobile push
async function notify(userId, { type, title, body, data = {}, urgent = false }) {
  if (!userId) return;
  const row = await one(
    'INSERT INTO notifications(user_id,type,title,body,data) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [userId, type, title, body, data]);
  emitTo(userId, 'notification', row);
  const u = await one('SELECT push_token FROM users WHERE id=$1', [userId]);
  if (u?.push_token) {
    await sendPush(u.push_token, {
      title, body, data: { ...data, type },
      priority: urgent ? 'high' : 'default',
      channelId: urgent ? 'sos' : 'default',
    });
  }
}

module.exports = { setIO, emitTo, notify };
