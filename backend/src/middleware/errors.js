const { ZodError } = require('zod');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return res.status(400).json({ error: `${first.path.join('.') || 'input'}: ${first.message}` });
  }
  if (err.code === '23505') return res.status(409).json({ error: 'This mobile number or email is already registered' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server. Try again.' : err.message });
}

const httpError = (status, message) => Object.assign(new Error(message), { status });

module.exports = { wrap, errorHandler, httpError };
