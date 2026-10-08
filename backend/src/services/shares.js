const { one, many } = require('../db');

// SQL fragment: share is currently live
const ACTIVE = `s.status = 'active' AND (s.expires_at IS NULL OR s.expires_at > now())`;

const activeViewersOf = (sharerId) =>
  many(`SELECT s.*, u.full_name AS viewer_name FROM shares s JOIN users u ON u.id = s.viewer_id
        WHERE s.sharer_id = $1 AND ${ACTIVE}`, [sharerId]);

const activeSharesWhereViewer = (viewerId) =>
  many(`SELECT s.* FROM shares s WHERE s.viewer_id = $1 AND ${ACTIVE}`, [viewerId]);

const canView = (viewerId, sharerId) =>
  one(`SELECT s.id FROM shares s WHERE s.viewer_id=$1 AND s.sharer_id=$2 AND ${ACTIVE} LIMIT 1`, [viewerId, sharerId]);

module.exports = { ACTIVE, activeViewersOf, activeSharesWhereViewer, canView };
