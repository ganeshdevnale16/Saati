const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

function distanceM(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Builds a readable timeline: stays ("at this place 10:05-11:40") and moves between them
function buildTimeline(points, { stayRadiusM = 150, minStayMin = 10 } = {}) {
  const out = [];
  let i = 0;
  while (i < points.length) {
    const anchor = points[i];
    let j = i;
    while (j + 1 < points.length && distanceM(anchor, points[j + 1]) <= stayRadiusM) j++;
    const start = new Date(points[i].recorded_at);
    const end = new Date(points[j].recorded_at);
    const minutes = (end - start) / 60000;
    if (minutes >= minStayMin) {
      const slice = points.slice(i, j + 1);
      out.push({
        type: 'stay',
        lat: slice.reduce((s, p) => s + p.lat, 0) / slice.length,
        lng: slice.reduce((s, p) => s + p.lng, 0) / slice.length,
        from: start, to: end, minutes: Math.round(minutes),
      });
    } else {
      const prev = points[i - 1] || points[i];
      const d = distanceM(prev, points[j]);
      const last = out[out.length - 1];
      if (last && last.type === 'move') { last.to = end; last.distanceM += d; }
      else out.push({ type: 'move', from: i ? new Date(prev.recorded_at) : start, to: end, distanceM: d });
    }
    i = j + 1;
  }
  out.forEach((s) => { if (s.distanceM !== undefined) s.distanceM = Math.round(s.distanceM); });
  return out;
}

module.exports = { distanceM, buildTimeline };
