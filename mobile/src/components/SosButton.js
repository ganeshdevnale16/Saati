// Press and hold for 3 seconds to send SOS - prevents accidental alerts in a pocket.
import React, { useRef, useState } from 'react';
import { Pressable, Text, View, Animated, StyleSheet, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { C } from '../theme';
import { api } from '../api';
import { currentPosition } from '../location/control';

export default function SosButton({ onSent }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [sending, setSending] = useState(false);
  const anim = useRef(null);

  const send = async () => {
    setSending(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    try {
      const pos = await currentPosition().catch(() => null);
      const r = await api('/sos', { method: 'POST', body: { ...(pos || {}), message: 'I need help.' } });
      Alert.alert('SOS sent', r.notified ? `${r.notified} people were alerted with your location.` : 'No one is connected yet. Add an emergency contact in Profile, or share your location with someone.');
      onSent?.();
    } catch (e) {
      Alert.alert('SOS could not be sent', `${e.message}\n\nCall 112 for emergency services.`);
    } finally { setSending(false); progress.setValue(0); }
  };

  const start = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    anim.current = Animated.timing(progress, { toValue: 1, duration: 3000, useNativeDriver: false });
    anim.current.start(({ finished }) => finished && send());
  };
  const cancel = () => { anim.current?.stop(); if (!sending) Animated.timing(progress, { toValue: 0, duration: 200, useNativeDriver: false }).start(); };

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <Pressable onPressIn={start} onPressOut={cancel} disabled={sending} style={st.wrap} accessibilityLabel="Hold for 3 seconds to send SOS">
      <Animated.View style={[st.fill, { width }]} />
      <View style={st.row}>
        <Text style={st.title}>{sending ? 'Sending SOS…' : 'SOS'}</Text>
        <Text style={st.sub}>{sending ? '' : 'Hold for 3 seconds to alert your people'}</Text>
      </View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  wrap: { backgroundColor: C.redSoft, borderRadius: 18, overflow: 'hidden', borderWidth: 2, borderColor: C.red, marginVertical: 12 },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: C.red },
  row: { paddingVertical: 18, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 14 },
  title: { fontSize: 26, fontWeight: '900', color: C.ink, letterSpacing: 1 },
  sub: { flex: 1, color: C.ink, fontWeight: '600' },
});
