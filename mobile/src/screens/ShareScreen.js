import React, { useCallback, useState } from 'react';
import { ScrollView, Text, Pressable, StyleSheet, Alert, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api';
import { C } from '../theme';
import { Button, Field, Card, DurationPicker, durationBody, Footer, timeLeft } from '../components/ui';
import { startBackgroundSharing, syncSharingState } from '../location/control';

export default function ShareScreen({ navigation }) {
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [duration, setDuration] = useState('1h');
  const [hours, setHours] = useState('');
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState({ sharing: [], incoming: [] });

  const load = useCallback(async () => {
    const d = await api('/shares').catch(() => null);
    if (d) { setData(d); syncSharingState(d.sharing.length); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const share = async () => {
    setBusy(true);
    try {
      const perm = await startBackgroundSharing();   // ask permissions before creating the share
      if (!perm.ok) throw new Error(perm.reason);
      const r = await api('/shares/offer', { method: 'POST', body: { to, note: note || undefined, ...durationBody(duration, hours) } });
      Alert.alert('Sharing started', r.invited ? `${to} isn't on Saathi yet. They'll see your location as soon as they sign up with this number or email.` : 'They can now see your live location.');
      setTo(''); setNote(''); load();
    } catch (e) { Alert.alert('Could not start sharing', e.message); }
    setBusy(false);
  };

  const stop = (s) => Alert.alert('Stop sharing?', `${s.viewer_name || s.invite_mobile || s.invite_email} will no longer see your location.`, [
    { text: 'Keep sharing' },
    { text: 'Stop', style: 'destructive', onPress: async () => { await api(`/shares/${s.id}/stop`, { method: 'POST' }); load(); } },
  ]);

  return (
    <ScrollView contentContainerStyle={{ padding: 18 }} keyboardShouldPersistTaps="handled">
      {data.incoming.length > 0 && (
        <Pressable onPress={() => navigation.navigate('Requests')} style={st.pending}>
          <Text style={st.pendingText}>{data.incoming.length} pending {data.incoming.length === 1 ? 'request' : 'requests'} to see your location</Text>
          <Text style={{ color: C.amber, fontWeight: '800' }}>Review</Text>
        </Pressable>
      )}

      <Card>
        <Text style={st.h}>Share with</Text>
        <Field label="Mobile number or Gmail / email" value={to} onChangeText={setTo} autoCapitalize="none" keyboardType="email-address" placeholder="98765 43210 or name@gmail.com" />
        <Text style={st.label}>For how long</Text>
        <DurationPicker value={duration} onChange={setDuration} customHours={hours} onCustomHours={setHours} />
        <Field label="Message (optional)" value={note} onChangeText={setNote} placeholder="On my way home" maxLength={140} />
        <Button title="Start sharing" onPress={share} loading={busy} disabled={!to.trim()} />
        <Text style={st.fine}>Your phone keeps sending your location when the app is closed. If you lose internet, points are saved on your phone and uploaded later.</Text>
      </Card>

      <Text style={st.section}>Who can see you now</Text>
      {data.sharing.length === 0 && <Text style={st.empty}>No one. Add a number or email above to start.</Text>}
      {data.sharing.map((s) => (
        <Card key={s.id}>
          <View style={st.row}>
            <View style={{ flex: 1 }}>
              <Text style={st.name}>{s.viewer_name || s.invite_mobile || s.invite_email}</Text>
              <Text style={st.muted}>{s.viewer_id ? '' : 'Invited, not joined yet · '}{timeLeft(s.expires_at)}</Text>
            </View>
            <Pressable onPress={() => stop(s)}><Text style={st.stop}>Stop</Text></Pressable>
          </View>
        </Card>
      ))}
      <Footer />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  h: { fontSize: 20, fontWeight: '900', color: C.ink, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: C.slate, marginBottom: 6 },
  section: { fontSize: 18, fontWeight: '800', color: C.ink, marginVertical: 10 },
  fine: { color: C.slate, fontSize: 12, marginTop: 10, lineHeight: 17 },
  empty: { color: C.slate },
  row: { flexDirection: 'row', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '800', color: C.ink },
  muted: { color: C.slate, marginTop: 2 },
  stop: { color: C.red, fontWeight: '800', fontSize: 16 },
  pending: { backgroundColor: C.amberSoft, borderRadius: 14, padding: 14, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between' },
  pendingText: { color: C.ink, fontWeight: '700', flex: 1 },
});
