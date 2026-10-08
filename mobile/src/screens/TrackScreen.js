import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View, StyleSheet, Alert, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import LeafletMap from '../components/LeafletMap';
import { api } from '../api';
import { getSocket } from '../socket';
import { C } from '../theme';
import { Button, Field, Card, DurationPicker, durationBody, Footer, ago, timeLeft } from '../components/ui';

export default function TrackScreen({ navigation }) {
  const [people, setPeople] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [duration, setDuration] = useState('1d');
  const [hours, setHours] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [live, sh] = await Promise.all([api('/locations/live'), api('/shares')]);
    setPeople(live.people); setOutgoing(sh.outgoing);
  }, []);
  useFocusEffect(useCallback(() => { load().catch(() => {}); }, [load]));

  useEffect(() => {
    const s = getSocket();
    const onLoc = (p) => setPeople((prev) => prev.map((x) => (x.user_id === p.userId ? { ...x, lat: p.lat, lng: p.lng, recorded_at: p.recorded_at, battery: p.battery } : x)));
    s?.on('location:update', onLoc);
    return () => s?.off('location:update', onLoc);
  }, []);

  const request = async () => {
    setBusy(true);
    try {
      const r = await api('/shares/request', { method: 'POST', body: { to, note: note || undefined, ...durationBody(duration, hours) } });
      Alert.alert('Request sent', r.invited ? `${to} isn't on Saathi yet. They'll see your request after signing up.` : "You'll be notified when they approve.");
      setTo(''); setNote(''); load();
    } catch (e) { Alert.alert('Could not send request', e.message); }
    setBusy(false);
  };

  const located = people.filter((p) => p.lat != null);

  return (
    <ScrollView contentContainerStyle={{ padding: 18 }} keyboardShouldPersistTaps="handled">
      {located.length > 0 && (
        <LeafletMap
          style={st.map}
          data={{ markers: located.map((p) => ({ id: p.user_id, lat: p.lat, lng: p.lng, label: p.full_name.split(' ')[0], color: p.sos_active ? C.red : C.indigo })) }}
          onMarkerPress={(id) => { const p = located.find((x) => x.user_id === id); navigation.navigate('Person', { userId: id, name: p?.full_name }); }}
        />
      )}

      <Text style={st.section}>People you can see</Text>
      {people.length === 0 && <Text style={st.muted}>No one is sharing with you yet. Ask someone below.</Text>}
      {people.map((p) => (
        <Pressable key={p.user_id} onPress={() => navigation.navigate('Person', { userId: p.user_id, name: p.full_name })}>
          <Card style={p.sos_active && { borderColor: C.red, borderWidth: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={st.name}>{p.full_name}{p.sos_active ? '  · SOS' : ''}</Text>
              <Text style={st.muted}>{p.battery != null ? `${Math.round(p.battery * 100)}%` : ''}</Text>
            </View>
            <Text style={st.muted}>Seen {ago(p.recorded_at)} · {timeLeft(p.expires_at)}</Text>
            <Text style={st.muted}>{p.alert_enabled ? `Nearby alert at ${p.alert_radius_m / 1000} km` : 'Nearby alert off'}</Text>
          </Card>
        </Pressable>
      ))}

      <Card style={{ marginTop: 8 }}>
        <Text style={st.h}>Ask to see someone's location</Text>
        <Field label="Their mobile number or Gmail / email" value={to} onChangeText={setTo} autoCapitalize="none" keyboardType="email-address" />
        <Text style={st.label}>For how long</Text>
        <DurationPicker value={duration} onChange={setDuration} customHours={hours} onCustomHours={setHours} tone="indigo" />
        <Field label="Reason (they will see this)" value={note} onChangeText={setNote} placeholder="Let me know you reached safely" maxLength={140} />
        <Button title="Send request" tone="indigo" onPress={request} loading={busy} disabled={!to.trim()} />
        <Text style={st.fine}>They decide. Nothing is shared until they approve, and they can stop at any time.</Text>
      </Card>

      {outgoing.length > 0 && <Text style={st.muted}>{outgoing.length} request{outgoing.length > 1 ? 's' : ''} waiting for approval. See Requests.</Text>}
      <Footer />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  map: { height: 260, borderRadius: 18, marginBottom: 6 },
  section: { fontSize: 18, fontWeight: '800', color: C.ink, marginVertical: 10 },
  h: { fontSize: 18, fontWeight: '900', color: C.ink, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: C.slate, marginBottom: 6 },
  name: { fontSize: 17, fontWeight: '800', color: C.ink },
  muted: { color: C.slate, marginTop: 2 },
  fine: { color: C.slate, fontSize: 12, marginTop: 10 },
});
