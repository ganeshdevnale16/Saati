import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, RefreshControl, Linking, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api';
import { useAuth } from '../auth';
import { getSocket } from '../socket';
import { C } from '../theme';
import { Card, Footer, ago, timeLeft } from '../components/ui';
import SosButton from '../components/SosButton';
import { syncSharingState } from '../location/control';
import { pendingCount, flush } from '../location/queue';

export default function HomeScreen({ navigation }) {
  const { user } = useAuth();
  const [data, setData] = useState({ sharing: [], tracking: [], incoming: [], outgoing: [] });
  const [sos, setSos] = useState({ mine: null, others: [] });
  const [queued, setQueued] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sh, so] = await Promise.all([api('/shares'), api('/sos/active')]);
      setData(sh); setSos(so);
      const r = await syncSharingState(sh.sharing.length);
      if (!r.ok) Alert.alert('Location permission needed', r.reason);
      await flush();
    } catch (e) { /* offline: keep last state */ }
    setQueued(await pendingCount());
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => {
    navigation.setOptions({ headerRight: () => <Pressable onPress={() => navigation.navigate('Profile')}><Text style={st.headerLink}>Profile</Text></Pressable> });
    const s = getSocket();
    const h = () => load();
    s?.on('notification', h); s?.on('shares:changed', h);
    return () => { s?.off('notification', h); s?.off('shares:changed', h); };
  }, [navigation, load]);

  const resolveSos = async () => { await api(`/sos/${sos.mine.id}/resolve`, { method: 'POST' }); load(); };

  return (
    <ScrollView contentContainerStyle={st.wrap} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Text style={st.hello}>Hi {user.full_name.split(' ')[0]}</Text>

      {sos.others.map((e) => (
        <Pressable key={e.id} onPress={() => navigation.navigate('Person', { userId: e.user_id })} style={st.alert}>
          <Text style={st.alertTitle}>{e.full_name} sent an SOS</Text>
          <Text style={st.alertBody}>{ago(e.created_at)} · Tap to see their location</Text>
          <Pressable onPress={() => Linking.openURL(`tel:${e.mobile}`)} style={st.callBtn}><Text style={st.callText}>Call {e.full_name.split(' ')[0]}</Text></Pressable>
        </Pressable>
      ))}

      {sos.mine && (
        <Card style={{ borderColor: C.red }}>
          <Text style={st.cardTitle}>Your SOS is active</Text>
          <Text style={st.muted}>Your people were alerted {ago(sos.mine.created_at)}.</Text>
          <Pressable onPress={resolveSos}><Text style={[st.link, { color: C.red }]}>I'm safe now</Text></Pressable>
        </Card>
      )}

      <View style={st.tiles}>
        <Pressable style={[st.tile, { backgroundColor: C.teal }]} onPress={() => navigation.navigate('Share')}>
          <Text style={st.tileTitle}>Share</Text>
          <Text style={st.tileSub}>{data.sharing.length ? `${data.sharing.length} can see you` : 'Let someone see where you are'}</Text>
        </Pressable>
        <Pressable style={[st.tile, { backgroundColor: C.indigo }]} onPress={() => navigation.navigate('Track')}>
          <Text style={st.tileTitle}>Track</Text>
          <Text style={st.tileSub}>{data.tracking.length ? `You see ${data.tracking.length}` : 'See someone live and their history'}</Text>
        </Pressable>
      </View>

      {data.incoming.length > 0 && (
        <Pressable onPress={() => navigation.navigate('Requests')} style={st.pending}>
          <Text style={st.pendingText}>{data.incoming.length} {data.incoming.length === 1 ? 'person wants' : 'people want'} to see your location</Text>
          <Text style={[st.link, { color: C.amber, marginTop: 0 }]}>Review</Text>
        </Pressable>
      )}

      <SosButton onSent={load} />

      {data.sharing.length > 0 && (
        <Card>
          <Text style={st.cardTitle}>Your location is being shared</Text>
          <Text style={st.muted}>Updates continue when the app is closed. {queued ? `${queued} points saved offline, uploading when you're back online.` : 'All points uploaded.'}</Text>
          {data.sharing.map((s) => <Text key={s.id} style={st.row}>{s.viewer_name || s.invite_mobile || s.invite_email} · {timeLeft(s.expires_at)}</Text>)}
        </Card>
      )}

      {data.tracking.length > 0 && (
        <Card>
          <Text style={st.cardTitle}>People you can see</Text>
          {data.tracking.map((s) => (
            <Pressable key={s.id} onPress={() => navigation.navigate('Person', { userId: s.sharer_id, name: s.sharer_name })} style={st.person}>
              <Text style={st.personName}>{s.sharer_name}</Text>
              <Text style={st.muted}>{ago(s.last_seen)}</Text>
            </Pressable>
          ))}
        </Card>
      )}
      <Footer />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 18 },
  hello: { fontSize: 28, fontWeight: '900', color: C.ink, marginBottom: 14 },
  headerLink: { color: C.teal, fontWeight: '700', fontSize: 16 },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, borderRadius: 20, padding: 18, minHeight: 130, justifyContent: 'flex-end' },
  tileTitle: { color: '#fff', fontSize: 26, fontWeight: '900' },
  tileSub: { color: 'rgba(255,255,255,0.9)', marginTop: 4, fontWeight: '600' },
  pending: { backgroundColor: C.amberSoft, borderRadius: 14, padding: 14, marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pendingText: { color: C.ink, fontWeight: '700', flex: 1 },
  alert: { backgroundColor: C.red, borderRadius: 16, padding: 16, marginBottom: 12 },
  alertTitle: { color: '#fff', fontSize: 20, fontWeight: '900' },
  alertBody: { color: '#fff', marginTop: 4 },
  callBtn: { backgroundColor: '#fff', alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginTop: 10 },
  callText: { color: C.red, fontWeight: '800' },
  cardTitle: { fontSize: 17, fontWeight: '800', color: C.ink, marginBottom: 6 },
  muted: { color: C.slate },
  row: { color: C.ink, marginTop: 6, fontWeight: '600' },
  person: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.line, flexDirection: 'row', justifyContent: 'space-between' },
  personName: { fontWeight: '700', color: C.ink, fontSize: 16 },
  link: { color: C.teal, fontWeight: '800', marginTop: 10 },
});
