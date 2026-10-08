import React, { useCallback, useState } from 'react';
import { ScrollView, Text, View, StyleSheet, Alert, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api';
import { C } from '../theme';
import { Button, Card, DurationPicker, durationBody, Footer, ago, DURATIONS } from '../components/ui';
import { startBackgroundSharing } from '../location/control';

const label = (d) => DURATIONS.find((x) => x.value === d)?.label || d;

function Incoming({ r, onDone }) {
  const [duration, setDuration] = useState(r.duration);
  const [hours, setHours] = useState(r.duration_minutes ? String(r.duration_minutes / 60) : '');
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);

  const approve = async () => {
    setBusy(true);
    try {
      const perm = await startBackgroundSharing();
      if (!perm.ok) throw new Error(perm.reason);
      await api(`/shares/${r.id}/approve`, { method: 'POST', body: durationBody(duration, hours) });
      onDone();
    } catch (e) { Alert.alert('Could not approve', e.message); }
    setBusy(false);
  };
  const decline = async () => { await api(`/shares/${r.id}/reject`, { method: 'POST' }); onDone(); };

  return (
    <Card>
      <Text style={st.name}>{r.viewer_name}</Text>
      <Text style={st.muted}>{r.viewer_mobile} · asked {ago(r.created_at)}</Text>
      <Text style={st.ask}>Wants to see your location for {label(r.duration)}{r.note ? `: "${r.note}"` : ''}</Text>
      {edit ? <DurationPicker value={duration} onChange={setDuration} customHours={hours} onCustomHours={setHours} /> :
        <Pressable onPress={() => setEdit(true)}><Text style={st.link}>Change duration</Text></Pressable>}
      <View style={st.actions}>
        <Button title="Decline" variant="outline" tone="slate" onPress={decline} style={{ flex: 1 }} />
        <Button title="Approve" onPress={approve} loading={busy} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

export default function RequestsScreen() {
  const [d, setD] = useState({ incoming: [], outgoing: [] });
  const load = useCallback(async () => setD(await api('/shares')), []);
  useFocusEffect(useCallback(() => { load().catch(() => {}); }, [load]));
  const withdraw = async (id) => { await api(`/shares/${id}/stop`, { method: 'POST' }); load(); };

  return (
    <ScrollView contentContainerStyle={{ padding: 18 }}>
      <Text style={st.section}>Waiting for your approval</Text>
      {d.incoming.length === 0 && <Text style={st.muted}>No requests right now.</Text>}
      {d.incoming.map((r) => <Incoming key={r.id} r={r} onDone={load} />)}

      <Text style={st.section}>Requests you sent</Text>
      {d.outgoing.length === 0 && <Text style={st.muted}>You haven't asked anyone yet.</Text>}
      {d.outgoing.map((r) => (
        <Card key={r.id}>
          <Text style={st.name}>{r.sharer_name || r.invite_mobile || r.invite_email}</Text>
          <Text style={st.muted}>{r.sharer_id ? 'Waiting for them to approve' : 'Not on Saathi yet. They will see it after signing up.'}</Text>
          <Pressable onPress={() => withdraw(r.id)}><Text style={[st.link, { color: C.red }]}>Withdraw request</Text></Pressable>
        </Card>
      ))}
      <Footer />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  section: { fontSize: 18, fontWeight: '800', color: C.ink, marginVertical: 10 },
  name: { fontSize: 17, fontWeight: '800', color: C.ink },
  muted: { color: C.slate, marginTop: 2 },
  ask: { color: C.ink, marginVertical: 10, fontSize: 15, lineHeight: 21 },
  link: { color: C.teal, fontWeight: '700', marginBottom: 10 },
  actions: { flexDirection: 'row', gap: 10 },
});
