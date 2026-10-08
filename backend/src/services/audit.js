const { query } = require('../db');
module.exports = (req, action, meta = {}) =>
  query('INSERT INTO audit_logs(user_id, action, meta, ip) VALUES ($1,$2,$3,$4)',
    [req.user?.id || meta.userId || null, action, meta, req.ip]).catch(() => {});
