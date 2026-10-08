const crypto = require('crypto');
const { query, one } = require('../db');
const { otpDevMode, smsProvider, msg91 } = require('../config');
const { httpError } = require('../middleware/errors');

const hash = (code) => crypto.createHash('sha256').update(code).digest('hex');

async function sendOtp(mobile, purpose) {
  const code = String(crypto.randomInt(100000, 999999));
  await query(
    `INSERT INTO otps(mobile, code_hash, purpose, expires_at, attempts) VALUES ($1,$2,$3, now() + interval '10 minutes', 0)
     ON CONFLICT (mobile) DO UPDATE SET code_hash=$2, purpose=$3, expires_at=now() + interval '10 minutes', attempts=0`,
    [mobile, hash(code), purpose]);

  if (smsProvider === 'msg91' && msg91.authKey) {
    await fetch('https://control.msg91.com/api/v5/otp?' + new URLSearchParams({
      template_id: msg91.templateId, mobile: mobile.replace('+', ''), otp: code,
    }), { method: 'POST', headers: { authkey: msg91.authKey } }).catch((e) => console.warn('[otp] sms failed', e.message));
  }
  if (otpDevMode) console.log(`[otp] ${mobile} (${purpose}): ${code}`);
  return otpDevMode ? code : undefined;
}

async function verifyOtp(mobile, code, purpose) {
  const row = await one('SELECT * FROM otps WHERE mobile=$1', [mobile]);
  if (!row || row.purpose !== purpose || new Date(row.expires_at) < new Date())
    throw httpError(400, 'The code has expired. Request a new one.');
  if (row.attempts >= 5) throw httpError(429, 'Too many wrong attempts. Request a new code.');
  if (row.code_hash !== hash(String(code))) {
    await query('UPDATE otps SET attempts = attempts + 1 WHERE mobile=$1', [mobile]);
    throw httpError(400, 'That code is incorrect');
  }
  await query('DELETE FROM otps WHERE mobile=$1', [mobile]);
}

module.exports = { sendOtp, verifyOtp };
