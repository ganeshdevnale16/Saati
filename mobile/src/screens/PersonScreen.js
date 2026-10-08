import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View, StyleSheet, Switch, Alert, Linking, Pressable } from 'react-native';
import MapView, { Marker, Polyline, Circle } from 'react-native-maps';
import { api } from '../api';
import { getSocket } from '../socket';
import { C } from '../theme';
import { Button, Field, Card, Chips, Footer, ago, timeLeft } from '../components/ui';
import { currentPosition } from '../location/control';

const PERIODS = [
  { value: 'live', label: 'Live' }, { value: '1h', label: 'Last hour' }, { value: 'today', label: 'Today' },
  { value: '24h', label: '24 hours' }, { value: '7d', label: '7 days' },
];
const since = (p) => {
  const now = Date.now();
  if (p === 'today') { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  return new Date(now - ({ live: 3600e3, '1h': 3600e3, '24h': 864e5, '7d': 6048e5 }[p]));
};
const hhmm = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function PersonScreen({ route, navigation }) {
  const { userId } = route.params;
  const map = useRef(null);
  const [person, setPerson] = useState(null);
  const [period, setPeriod] = useState('live');
  const [hist, setHist] = useState({ points: [], timeline: [] });
  const [alert, setAlert] = useState({ enabled: true, km: '5', center: 'me', lat: null, lng: null, label: '' });
  const [myPos, setMyPos] = useState(null);

  const loadPerson = useCallback(async () => {
    const { people } = await api('/locations/live');
    const p = people.find((x) => x.user_id === userId);
    if (!p) { Alert.alert('Not available', 'This person is no longer sharing with you.'); navigation.goBack(); return; }
    setPerson(p);
    navigation.setOptions({ title: p.full_name });
    setAlert({ enabled: p.alert_enabled, km: String(p.alert_radius_m / 1000), center: p.alert_center, lat: p.alert_lat, lng: p.alert_lng, label: p.alert_label || '' });
  }, [userId, navigation]);

  const loadHistory = useCallback(async () => {
    const h = await api(`/locations/history/${userId}?from=${encodeURIComponent(since(period).toISOString())}`);
    setHist(h);
  }, [userId, period]);

  useEffect(() => { loadPerson().catch(() => {}); currentPosition().then(setMyPos).catch(() => {}); }, [loadPerson]);
  useEffect(() => { loadHistory().catch(() => {}); }, [loadHistory]);

  // Live updates
  useEffect(() => {
    const s = getSocket();
    const on = (p) => {
      if (p.userId !== userId) return;
      setPerson((x) => x && { ...x, lat: p.lat, lng: p.lng, recorded_at: p.recorded_at, battery: p.battery, speed: p.speed });
      if (period === 'live') setHist((h) => ({ ...h, points: [...h.points, ...p.points] }));
      if (period === 'live') map.current?.animateCamera({ center: { latitude: p.lat, longitude: p.lng } }, { duration: 600 });
    };
    s?.on('location:update', on);
    return () => s?.off('location:update', on);
  }, [userId, period]);

  const line = useMemo(() => hist.points.map((p) => ({ latitude: p.lat, longitude: p.lng })), [hist.points]);
  const center = alert.center === 'fixed' && alert.lat != null ? { latitude: alert.lat, longitude: alert.lng } : myPos ? { latitude: myPos.lat, longitude: myPos.lng } : null;

  const saveAlert = async () => {
    try {
      await api(`/shares/${person.share_id}/alert`, { method: 'PATCH', body: {
        enabled: alert.enabled, radiusKm: Number(alert.km), center: alert.center,
        lat: alert.center === 'fixed' ? alert.lat : undefined, lng: alert.center === 'fixed' ? alert.lng : undefined, label: alert.label || undefined,
      } });
      Alert.alert('Alert saved', alert.enabled ? `You'll be notified when ${person.full_name} comes within ${alert.km} km.` : 'Nearby alert is off.');
    } catch (e) { Alert.alert('Could not save', e.message); }
  };

  if (!person) return null;
  const has = person.lat != null;

  return (
    <ScrollView contentContainerStyle={{ padding: 18 }}>
      {person.sos_active && (
        <View style={st.sos}>
          <Text style={st.sosT}>{person.full_name} needs help</Text>
          <Pressable onPress={() => Linking.openURL(`tel:${person.mobile}`)}><Text style={st.sosCall}>Call now</Text></Pressable>
        </View>
      )}

      {has ? (
        <MapView ref={map} style={st.map}
          initialRegion={{ latitude: person.lat, longitude: person.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
          onLongPress={(e) => alert.center === 'fixed' && setAlert((a) => ({ ...a, lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude }))}>
          {line.length > 1 && <Polyline coordinates={line} strokeColor={C.indigo} strokeWidth={4} />}
          {hist.timeline.filter((t) => t.type === 'stay').map((t, i) => (
            <Marker key={i} coordinate={{ latitude: t.lat, longitude: t.lng }} pinColor={C.amber} title={`${hhmm(t.from)} – ${hhmm(t.to)}`} description={`Stayed ${t.minutes} min`} />
          ))}
          <Marker coordinate={{ latitude: person.lat, longitude: person.lng }} title={person.full_name} description={ago(person.recorded_at)} pinColor={person.sos_active ? C.red : C.indigo} />
          {alert.enabled && center && <Circle center={center} radius={Number(alert.km || 0) * 1000} strokeColor={C.teal} fillColor="rgba(15,124,126,0.08)" />}
        </MapView>
      ) : <Card><Text style={st.muted}>Waiting for their first location update.</Text></Card>}

      <View style={st.meta}>
        <Text style={st.metaT}>Seen {ago(person.recorded_at)}</Text>
        {person.battery != null && <Text style={st.metaT}>Battery {Math.round(person.battery * 100)}%</Text>}
        {person.speed > 1 && <Text style={st.metaT}>{Math.round(person.speed * 3.6)} km/h</Text>}
        <Text style={st.metaT}>{timeLeft(person.expires_at)}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
        <Button title="Call" variant="outline" tone="indigo" onPress={() => Linking.openURL(`tel:${person.mobile}`)} style={{ flex: 1 }} />
        <Button title="Directions" variant="outline" tone="indigo" onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${person.lat},${person.lng}`)} style={{ flex: 1 }} disabled={!has} />
      </View>

      <Text style={st.section}>Where they've been</Text>
      <Chips options={PERIODS} value={period} onChange={setPeriod} tone="indigo" />
      {hist.timeline.length === 0 && <Text style={st.muted}>No movement recorded in this period.</Text>}
      {hist.timeline.slice().reverse().map((t, i) => (
        <View key={i} style={st.tl}>
          <View style={[st.dot, { backgroundColor: t.type === 'stay' ? C.amber : C.indigo }]} />
          <View style={{ flex: 1 }}>
            <Text style={st.tlT}>{hhmm(t.from)} – {hhmm(t.to)}</Text>
            <Text style={st.muted}>{t.type === 'stay' ? `Stayed in one place for ${t.minutes} min` : `Travelled ${(t.distanceM / 1000).toFixed(1)} km`}</Text>
            {t.type === 'stay' && <Pressable onPress={() => map.current?.animateCamera({ center: { latitude: t.lat, longitude: t.lng }, zoom: 16 })}><Text style={st.link}>Show on map</Text></Pressable>}
          </View>
        </View>
      ))}

      <Card style={{ marginTop: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={st.h}>Nearby alert</Text>
          <Switch value={alert.enabled} onValueChange={(v) => setAlert((a) => ({ ...a, enabled: v }))} trackColor={{ true: C.teal }} />
        </View>
        <Text style={st.muted}>Get notified when {person.full_name} comes within this distance.</Text>
        <Field label="Distance in km" keyboardType="decimal-pad" value={alert.km} onChangeText={(km) => setAlert((a) => ({ ...a, km }))} />
        <Chips tone="teal" value={alert.center} onChange={(c) => setAlert((a) => ({ ...a, center: c }))}
          options={[{ value: 'me', label: 'Around me' }, { value: 'fixed', label: 'Around a place' }]} />
        {alert.center === 'fixed' && (
          <>
            <Text style={st.muted}>{alert.lat != null ? 'Place set. Long-press the map to move it.' : 'Long-press on the map to pick the place.'}</Text>
            <Field label="Place name" value={alert.label} onChangeText={(label) => setAlert((a) => ({ ...a, label }))} placeholder="Home" />
          </>
        )}
        <Button title="Save alert" onPress={saveAlert} />
      </Card>
      <Footer />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  map: { height: 340, borderRadius: 18 },
  sos: { backgroundColor: C.red, borderRadius: 14, padding: 14, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sosT: { color: '#fff', fontWeight: '900', fontSize: 17 },
  sosCall: { color: C.red, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, fontWeight: '800', overflow: 'hidden' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginVertical: 12 },
  metaT: { color: C.ink, fontWeight: '700' },
  section: { fontSize: 18, fontWeight: '800', color: C.ink, marginVertical: 10 },
  h: { fontSize: 18, fontWeight: '900', color: C.ink },
  muted: { color: C.slate, marginVertical: 4 },
  tl: { flexDirection: 'row', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 5 },
  tlT: { fontWeight: '800', color: C.ink },
  link: { color: C.indigo, fontWeight: '700', marginTop: 4 },
});
