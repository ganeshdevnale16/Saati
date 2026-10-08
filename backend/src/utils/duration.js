const PRESETS = { '1h': 60, '1d': 1440, '1w': 10080, '1m': 43200 };

// Returns expiry Date, or null for "until cancelled"
function computeExpiry(duration, durationMinutes, from = new Date()) {
  if (duration === 'until_cancel') return null;
  const mins = duration === 'custom' ? Number(durationMinutes) : PRESETS[duration];
  if (!mins || mins < 5 || mins > 525600) throw Object.assign(new Error('Choose a duration between 5 minutes and 1 year'), { status: 400 });
  return new Date(from.getTime() + mins * 60000);
}

module.exports = { computeExpiry, PRESETS };
