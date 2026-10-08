import React, { useCallback, useState } from 'react';
import { ScrollView, Text, View, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api';
import { useAuth } from '../auth';
import { C } from '../theme';
import { Button, Field, Card, Footer, ago } from '../components/ui';
import { pendingCount, flush } from '../location/queue';
import { COMPANY } from '../config';

export default function ProfileScreen() {
  const { user, setUser, signOut } = useAuth();
  const [f, setF] = useState({ fullName: user.full_name, city: user.city || '', emergencyName: user.emergency_name || '', emergencyMobile: user.emergency_mobile || '' });
  const [items, setItems] = useState([]);
  const [queued, setQueued] = useState(0);

  const load = useCallback(async () => {
    setQueued(await pendingCount());
    const n = await api('/notifications').catch(() => null);
    if (n) { setItems(n.items); api('/notifications/read-all', { method: 'POST' }).catch(() => {}); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    try { const r = await api('/auth/me', { method: 'PATCH', body: f }); setUser(r.user); Alert.alert('Saved', 'Your profile is updated.'); }
    catch (e) { Alert.alert('Could not save', e.message); }
  };
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  return (
    <ScrollView contentContainerStyle={{ padding: 18 }}>
      <Card>
        <Text style={st.h}>{user.full_name}</Text>
        <Text style={st.muted}>{user.mobile}{user.email ? ` · ${user.email}` : ''}</Text>
      </Card>

      <Card>
        <Text style={st.h}>Details</Text>
        <Field label="Full name" value={f.fullName} onChangeText={set('fullName')} />
        <Field label="City" value={f.city} onChangeText={set('city')} />
        <Field label="Emergency contact name" value={f.emergencyName} onChangeText={set('emergencyName')} />
        <Field label="Emergency contact mobile" value={f.emergencyMobile} onChangeText={set('emergencyMobile')} keyboardType="phone-pad" hint="They get your SOS alerts if they use Saathi." />
        <Button title="Save changes" onPress={save} />
      </Card>

      <Card>
        <Text style={st.h}>Offline log</Text>
        <Text style={st.muted}>{queued ? `${queued} location points are saved on this phone and waiting for internet.` : 'Everything is uploaded.'}</Text>
        {queued > 0 && <Button title="Upload now" variant="outline" onPress={async () => { await flush(); load(); }} style={{ marginTop: 10 }} />}
      </Card>

      <Text style={st.section}>Recent alerts</Text>
      {items.length === 0 && <Text style={st.muted}>Nothing yet.</Text>}
      {items.map((n) => (
        <View key={n.id} style={st.n}>
          <Text style={[st.nT, n.type === 'sos' && { color: C.red }]}>{n.title}</Text>
          <Text style={st.muted}>{n.body}</Text>
          <Text style={st.time}>{ago(n.created_at)}</Text>
        </View>
      ))}

      <Button title="Sign out" variant="outline" tone="red" onPress={signOut} style={{ marginTop: 20 }} />
      <Footer />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  h: { fontSize: 18, fontWeight: '900', color: C.ink, marginBottom: 8 },
  section: { fontSize: 18, fontWeight: '800', color: C.ink, marginVertical: 10 },
  muted: { color: C.slate },
  n: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line },
  nT: { fontWeight: '800', color: C.ink },
  time: { color: C.slate, fontSize: 12, marginTop: 2 },
  about: { textAlign: 'center', color: C.slate, marginTop: 20 },
});
