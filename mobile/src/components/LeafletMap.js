// Free map for the app (same as the website): Leaflet + CARTO/OpenStreetMap tiles.
// No Google Maps API key, no billing. Developed by Devnale Globals.
import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { API_URL } from '../config';

const HTML = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<style>html,body,#m{height:100%;margin:0;background:#E8ECEA;font-family:sans-serif}
.lbl{background:#3B4BA8;color:#fff;font:700 12px sans-serif;padding:3px 8px;border-radius:8px;white-space:nowrap;margin-bottom:3px;box-shadow:0 2px 6px rgba(0,0,0,.25)}
.dot{width:16px;height:16px;border-radius:50%;border:3px solid #fff}
#err{position:absolute;inset:0;display:none;align-items:center;justify-content:center;text-align:center;color:#5B6478;padding:20px}</style>
</head><body><div id="m"></div><div id="err">Map could not load. Check your internet.</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>
function post(o){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
if (!window.L) { document.getElementById('err').style.display='flex'; post({type:'error'}); }
else {
  var map = L.map('m', { zoomControl: true }).setView([18.5913, 73.7389], 12);
  var TILES = [
    ['https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }],
    ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '&copy; Esri' }]
  ];
  var ti = 0, tl = null, ok = 0, bad = 0;
  function useTiles(i){ if (tl) map.removeLayer(tl); ok = 0; bad = 0; tl = L.tileLayer(TILES[i][0], TILES[i][1]).addTo(map);
    tl.on('tileload', function(){ ok++; });
    tl.on('tileerror', function(){ bad++; if (!ok && bad >= 4 && ti < TILES.length - 1) { ti++; useTiles(ti); } }); }
  useTiles(0);
  window.setTiles = function(url, attribution){ TILES.unshift([url, { maxZoom: 19, attribution: attribution || '' }]); ti = 0; useTiles(0); };
  var layer = L.layerGroup().addTo(map), fitted = false;
  function pin(color, label){
    return L.divIcon({ className: '', iconSize: [120, 44], iconAnchor: [60, 40],
      html: '<div style="display:flex;flex-direction:column;align-items:center">' + (label ? '<div class="lbl" style="background:' + color + '">' + label + '</div>' : '') +
            '<div class="dot" style="background:' + color + ';box-shadow:0 0 0 2px ' + color + '"></div></div>' });
  }
  map.on('contextmenu', function(e){ post({ type: 'longpress', lat: e.latlng.lat, lng: e.latlng.lng }); });
  window.render = function(d){
    layer.clearLayers(); var b = [];
    (d.circles || []).forEach(function(c){ L.circle([c.lat, c.lng], { radius: c.radius, color: '#0F7C7E', weight: 2, fillOpacity: .07 }).addTo(layer); });
    (d.lines || []).forEach(function(l){ if (l.length > 1) L.polyline(l, { color: '#3B4BA8', weight: 4, opacity: .85 }).addTo(layer); });
    (d.stops || []).forEach(function(s){ L.circleMarker([s.lat, s.lng], { radius: 7, color: '#B87414', fillOpacity: .9 }).addTo(layer).bindPopup(s.label || ''); });
    (d.pins || []).forEach(function(p){ L.marker([p.lat, p.lng]).addTo(layer); });
    (d.markers || []).forEach(function(m){
      var mk = L.marker([m.lat, m.lng], { icon: pin(m.color || '#3B4BA8', m.label) }).addTo(layer);
      if (m.id) mk.on('click', function(){ post({ type: 'marker', id: m.id }); });
      b.push([m.lat, m.lng]);
    });
    if (d.focus) map.setView([d.focus.lat, d.focus.lng], d.focus.zoom || map.getZoom());
    else if (!fitted && b.length) { if (b.length === 1) map.setView(b[0], d.zoom || 14); else map.fitBounds(b, { padding: [50, 50], maxZoom: 15 }); fitted = true; }
  };
  post({ type: 'ready' });
}
</script></body></html>`;

export default function LeafletMap({ data, onMarkerPress, onLongPress, style }) {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ready || !data) return;
    ref.current?.injectJavaScript(`window.render && window.render(${JSON.stringify(data)}); true;`);
  }, [ready, data]);

  // Optional custom map provider set in Render (MAP_TILE_URL)
  useEffect(() => {
    if (!ready) return;
    fetch(API_URL + '/api/app-info').then((r) => r.json()).then((i) => {
      if (i.map && i.map.tileUrl) ref.current?.injectJavaScript(`window.setTiles(${JSON.stringify(i.map.tileUrl)}, ${JSON.stringify(i.map.attribution || '')}); true;`);
    }).catch(() => {});
  }, [ready]);

  const onMessage = (e) => {
    try {
      const m = JSON.parse(e.nativeEvent.data);
      if (m.type === 'ready') setReady(true);
      else if (m.type === 'marker') onMarkerPress?.(m.id);
      else if (m.type === 'longpress') onLongPress?.({ latitude: m.lat, longitude: m.lng });
    } catch {}
  };

  return (
    <View style={[st.wrap, style]}>
      <WebView
        ref={ref}
        originWhitelist={['*']}
        source={{ html: HTML, baseUrl: API_URL + '/' }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        nestedScrollEnabled
        style={{ flex: 1, backgroundColor: '#E8ECEA' }}
      />
    </View>
  );
}

const st = StyleSheet.create({ wrap: { overflow: 'hidden', backgroundColor: '#E8ECEA' } });
