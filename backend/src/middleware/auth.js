const jwt = require('jsonwebtoken');
const { jwtSecret, jwtExpiresIn } = require('../config');

const sign = (user) => jwt.sign({ sub: user.id, mobile: user.mobile }, jwtSecret, { expiresIn: jwtExpiresIn });

function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Sign in to continue' });
  try {
    const p = jwt.verify(token, jwtSecret);
    req.user = { id: p.sub, mobile: p.mobile };
    next();
  } catch {
    res.status(401).json({ error: 'Your session has expired. Sign in again.' });
  }
}

function verifySocketToken(token) {
  const p = jwt.verify(token, jwtSecret);
  return { id: p.sub, mobile: p.mobile };
}

module.exports = { sign, requireAuth, verifySocketToken };
