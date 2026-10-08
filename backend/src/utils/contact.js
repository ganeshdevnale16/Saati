// Mobile number is the unique identity. Normalise everything to E.164 (+91 default).
function normalizeMobile(input) {
  if (!input) return null;
  let s = String(input).trim().replace(/[\s\-()]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (/^\d{10}$/.test(s)) return '+91' + s;
  if (/^91\d{10}$/.test(s)) return '+' + s;
  if (/^0\d{10}$/.test(s)) return '+91' + s.slice(1);
  if (/^\+\d{8,15}$/.test(s)) return s;
  return null;
}

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());

// "to" may be a mobile number or an email
function parseContact(to) {
  if (isEmail(to)) return { email: String(to).trim().toLowerCase() };
  const mobile = normalizeMobile(to);
  return mobile ? { mobile } : null;
}

const maskMobile = (m) => (m ? m.slice(0, 3) + '******' + m.slice(-3) : m);

module.exports = { normalizeMobile, isEmail, parseContact, maskMobile };
