import React, { useCallback, useState } from 'react';
import { ScrollView, Text, View, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api';
import { useAuth } from '../auth';
import { C } from '../theme';
import { Button, Field, Card, Chips, Footer, ago } from '../components/ui';
import { pendingCount, flush } from '../location/queue';
import { COMPANY } from '../config';

export default function ProfileScreen() {
  const { user, setUser, signOut } = useAuth();
  const [f, setF] = useState({ fullName: user.full_name, email: user.email || '', dob: user.dob || '', gender: user.gender || '', city: user.city || '', emergencyName: user.emergency_name || '', emergencyMobile: user.emergency_mobile || '' });
  const [pw, setPw] = useState({ current: '', password: '' });
  const changePw = async () => {
    try { await api('/auth/password', { method: 'POST', body: pw }); setPw({ current: '', password: '' }); Alert.alert('Done', 'Your password is updated.'); }
    catch (e) { Alert.alert('Could not update', e.message); }
  };
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
        <Field label="Email" value={f.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Date of birth" value={f.dob} onChangeText={set('dob')} placeholder="YYYY-MM-DD" />
        <Text style={st.label}>Gender</Text>
        <Chips value={f.gender} onChange={set('gender')} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }, { value: 'prefer_not', label: 'Prefer not to say' }]} />
        <Field label="City" value={f.city} onChangeText={set('city')} />
        <Field label="Emergency contact name" value={f.emergencyName} onChangeText={set('emergencyName')} />
        <Field label="Emergency contact mobile" value={f.emergencyMobile} onChangeText={set('emergencyMobile')} keyboardType="phone-pad" hint="They get your SOS alerts if they use Saathi." />
        <Button title="Save changes" onPress={save} />
      </Card>

      <Card>
        <Text style={st.h}>Password</Text>
        <Field label="Current password" value={pw.current} onChangeText={(v) => setPw((p) => ({ ...p, current: v }))} secureTextEntry />
        <Field label="New password" value={pw.password} onChangeText={(v) => setPw((p) => ({ ...p, password: v }))} secureTextEntry hint="At least 8 characters" />
        <Button title="Update password" variant="outline" onPress={changePw} />
        <Text style={[st.muted, { marginTop: 10 }]}>To change your mobile number, sign in on the Saathi website and open Profile & settings.</Text>
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
  label: { fontSize: 13, fontWeight: '600', color: C.slate, marginBottom: 6 },
  section: { fontSize: 18, fontWeight: '800', color: C.ink, marginVertical: 10 },
  muted: { color: C.slate },
  n: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line },
  nT: { fontWeight: '800', color: C.ink },
  time: { color: C.slate, fontSize: 12, marginTop: 2 },
  about: { textAlign: 'center', color: C.slate, marginTop: 20 },
});
