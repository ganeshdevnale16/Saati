const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { one, query } = require('../db');
const { wrap, httpError } = require('../middleware/errors');
const { sign, requireAuth } = require('../middleware/auth');
const { normalizeMobile } = require('../utils/contact');
const { sendOtp, verifyOtp } = require('../services/otp');
const { notify } = require('../services/notify');
const audit = require('../services/audit');

const PUBLIC_FIELDS = `id, full_name, mobile, email, to_char(dob, 'YYYY-MM-DD') AS dob, gender, city, emergency_name, emergency_mobile, mobile_verified, created_at`;
const mobileField = z.string().transform((v, ctx) => {
  const m = normalizeMobile(v);
  if (!m) ctx.addIssue({ code: 'custom', message: 'Enter a valid mobile number' });
  return m;
});

router.post('/otp', wrap(async (req, res) => {
  const { mobile, purpose } = z.object({ mobile: mobileField, purpose: z.enum(['register', 'reset']) }).parse(req.body);
  const exists = await one('SELECT id FROM users WHERE mobile=$1', [mobile]);
  if (purpose === 'register' && exists) throw httpError(409, 'This mobile number is already registered. Sign in instead.');
  if (purpose === 'reset' && !exists) throw httpError(404, 'No account uses this mobile number');
  const devCode = await sendOtp(mobile, purpose);
  res.json({ sent: true, devCode });
}));

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  mobile: mobileField,
  email: z.string().trim().toLowerCase().email().optional().or(z.literal('').transform(() => undefined)),
  password: z.string().min(8, 'Use at least 8 characters'),
  otp: z.string().length(6),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('').transform(() => undefined)),
  gender: z.enum(['male', 'female', 'other', 'prefer_not']).optional(),
  city: z.string().trim().max(60).optional(),
  emergencyName: z.string().trim().max(80).optional(),
  emergencyMobile: z.string().optional(),
  consent: z.literal(true, { errorMap: () => ({ message: 'Accept the privacy terms to continue' }) }),
});

router.post('/register', wrap(async (req, res) => {
  const b = registerSchema.parse(req.body);
  await verifyOtp(b.mobile, b.otp, 'register');
  const hash = await bcrypt.hash(b.password, 11);
  const user = await one(
    `INSERT INTO users(full_name, mobile, email, password_hash, dob, gender, city, emergency_name, emergency_mobile, mobile_verified, consent_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,now()) RETURNING ${PUBLIC_FIELDS}`,
    [b.fullName, b.mobile, b.email || null, hash, b.dob || null, b.gender || null, b.city || null,
     b.emergencyName || null, normalizeMobile(b.emergencyMobile) || null]);

  // Link invitations that were sent to this mobile/email before the person joined
  const linked = await query(
    `UPDATE shares SET viewer_id = $1, updated_at = now()
       WHERE viewer_id IS NULL AND (invite_mobile = $2 OR ($3::text IS NOT NULL AND invite_email = $3)) RETURNING id`,
    [user.id, user.mobile, user.email]);
  await query(
    `UPDATE shares SET sharer_id = $1, updated_at = now()
       WHERE sharer_id IS NULL AND (invite_mobile = $2 OR ($3::text IS NOT NULL AND invite_email = $3))`,
    [user.id, user.mobile, user.email]);
  if (linked.rowCount) await notify(user.id, { type: 'welcome', title: 'Someone is already sharing with you', body: 'Open Track to see their location.' });

  audit(req, 'register', { userId: user.id });
  res.status(201).json({ token: sign(user), user });
}));

router.post('/login', wrap(async (req, res) => {
  const { id, password } = z.object({ id: z.string().min(3), password: z.string().min(1) }).parse(req.body);
  const mobile = normalizeMobile(id);
  const row = await one('SELECT * FROM users WHERE mobile=$1 OR email=$2', [mobile, id.trim().toLowerCase()]);
  if (!row || !(await bcrypt.compare(password, row.password_hash))) throw httpError(401, 'Mobile/email or password is incorrect');
  const user = await one(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id=$1`, [row.id]);
  audit(req, 'login', { userId: user.id });
  res.json({ token: sign(user), user });
}));

router.post('/reset', wrap(async (req, res) => {
  const b = z.object({ mobile: mobileField, otp: z.string().length(6), password: z.string().min(8) }).parse(req.body);
  await verifyOtp(b.mobile, b.otp, 'reset');
  await query('UPDATE users SET password_hash=$1 WHERE mobile=$2', [await bcrypt.hash(b.password, 11), b.mobile]);
  audit(req, 'password_reset', { mobile: b.mobile });
  res.json({ ok: true });
}));

router.get('/me', requireAuth, wrap(async (req, res) => {
  res.json({ user: await one(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id=$1`, [req.user.id]) });
}));

const optText = (max) => z.string().trim().max(max).optional();
router.patch('/me', requireAuth, wrap(async (req, res) => {
  const b = z.object({
    fullName: z.string().trim().min(2).max(80).optional(),
    email: z.string().trim().toLowerCase().email().or(z.literal('')).optional(),
    dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).optional(),
    gender: z.enum(['male', 'female', 'other', 'prefer_not', '']).optional(),
    city: optText(60),
    emergencyName: optText(80),
    emergencyMobile: z.string().optional(),
  }).parse(req.body);
  if (b.emergencyMobile && !normalizeMobile(b.emergencyMobile)) throw httpError(400, 'Emergency contact mobile number is not valid');
  if (b.email) {
    const taken = await one('SELECT id FROM users WHERE email=$1 AND id<>$2', [b.email, req.user.id]);
    if (taken) throw httpError(409, 'This email is already used by another account');
  }
  // undefined = leave unchanged, '' = clear the field
  const set = [], vals = [req.user.id];
  const put = (col, v) => { if (v !== undefined) { vals.push(v === '' ? null : v); set.push(`${col}=$${vals.length}`); } };
  put('full_name', b.fullName); put('email', b.email); put('dob', b.dob); put('gender', b.gender);
  put('city', b.city); put('emergency_name', b.emergencyName);
  put('emergency_mobile', b.emergencyMobile === undefined ? undefined : (b.emergencyMobile === '' ? '' : normalizeMobile(b.emergencyMobile)));
  if (set.length) await query(`UPDATE users SET ${set.join(', ')} WHERE id=$1`, vals);
  audit(req, 'profile_update', { fields: Object.keys(b) });
  res.json({ user: await one(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id=$1`, [req.user.id]) });
}));

router.post('/password', requireAuth, wrap(async (req, res) => {
  const b = z.object({ current: z.string().min(1), password: z.string().min(8, 'Use at least 8 characters') }).parse(req.body);
  const row = await one('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
  if (!(await bcrypt.compare(b.current, row.password_hash))) throw httpError(400, 'Current password is incorrect');
  await query('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(b.password, 11), req.user.id]);
  audit(req, 'password_change');
  res.json({ ok: true });
}));

// Change mobile number: step 1, send OTP to the NEW number
router.post('/mobile/otp', requireAuth, wrap(async (req, res) => {
  const { mobile } = z.object({ mobile: mobileField }).parse(req.body);
  if (mobile === req.user.mobile) throw httpError(400, 'This is already your mobile number');
  if (await one('SELECT id FROM users WHERE mobile=$1', [mobile])) throw httpError(409, 'This mobile number is already registered');
  res.json({ sent: true, devCode: await sendOtp(mobile, 'change_mobile') });
}));

// Step 2: verify OTP + password, switch number, issue a new login token
router.post('/mobile/change', requireAuth, wrap(async (req, res) => {
  const b = z.object({ mobile: mobileField, otp: z.string().length(6), password: z.string().min(1) }).parse(req.body);
  const row = await one('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
  if (!(await bcrypt.compare(b.password, row.password_hash))) throw httpError(400, 'Password is incorrect');
  await verifyOtp(b.mobile, b.otp, 'change_mobile');
  const user = await one(`UPDATE users SET mobile=$1, mobile_verified=true WHERE id=$2 RETURNING ${PUBLIC_FIELDS}`, [b.mobile, req.user.id]);
  audit(req, 'mobile_change', { from: req.user.mobile, to: b.mobile });
  res.json({ token: sign(user), user });
}));

// Delete account and all data (DPDP: right to erasure)
router.delete('/me', requireAuth, wrap(async (req, res) => {
  const { password } = z.object({ password: z.string().min(1) }).parse(req.body);
  const row = await one('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
  if (!(await bcrypt.compare(password, row.password_hash))) throw httpError(400, 'Password is incorrect');
  audit(req, 'account_delete', { userId: req.user.id });
  await query('DELETE FROM users WHERE id=$1', [req.user.id]); // shares, locations, SOS, notifications cascade
  res.json({ ok: true });
}));

router.post('/push-token', requireAuth, wrap(async (req, res) => {
  const { token } = z.object({ token: z.string().max(200) }).parse(req.body);
  await query('UPDATE users SET push_token=$1 WHERE id=$2', [token, req.user.id]);
  res.json({ ok: true });
}));

module.exports = router;
