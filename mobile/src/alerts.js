// Shows Saathi alerts in the phone's notification bar.
// - Live: the web interface passes each alert here while the app is open/in background.
// - Background: while location sharing runs, the background task checks for new alerts about once a minute.
// (Instant alerts with the app fully closed come from Firebase push, once configured.)
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { api } from './api';
import { getToken } from './session';

const LAST = 'saathi:last_alert_id';
const POLL = 'saathi:last_alert_poll';
let channelsReady = false;

async function ensureChannels() {
  if (channelsReady || Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', { name: 'General', importance: Notifications.AndroidImportance.HIGH, sound: 'default' });
  await Notifications.setNotificationChannelAsync('sos', {
    name: 'SOS alerts', importance: Notifications.AndroidImportance.MAX, sound: 'default',
    vibrationPattern: [0, 800, 300, 800, 300, 800], bypassDnd: true, lockscreenVisibility: 1,
  });
  channelsReady = true;
}

const getLast = async () => Number((await AsyncStorage.getItem(LAST)) || 0);
const setLast = (id) => AsyncStorage.setItem(LAST, String(id));

export async function showAlert(n) {
  if (!n || !n.id) return;
  const last = await getLast();
  if (n.id <= last) return;            // already shown
  await setLast(n.id);
  await ensureChannels();
  const sos = n.type === 'sos';
  const data = { ...(n.data || {}), type: n.type };
  await Notifications.scheduleNotificationAsync({
    content: { title: n.title, body: n.body || '', data, sound: 'default', priority: sos ? 'max' : 'high' },
    trigger: Platform.OS === 'android' ? { channelId: sos ? 'sos' : 'default' } : null,
  });
}

export async function pollAlerts({ minGapMs = 55000 } = {}) {
  try {
    if (!(await getToken())) return;
    const now = Date.now();
    const lastPoll = Number((await AsyncStorage.getItem(POLL)) || 0);
    if (now - lastPoll < minGapMs) return;
    await AsyncStorage.setItem(POLL, String(now));
    const last = await getLast();
    const { items } = await api(`/notifications?after=${last}`, { timeoutMs: 10000 });
    if (!items?.length) return;
    if (!last) { await setLast(items[items.length - 1].id); return; } // first run: don't flood old alerts
    for (const n of items) await showAlert(n);
  } catch {}
}

// Remember the newest alert when the user signs in, so old ones aren't replayed
export async function markAllSeen() {
  try {
    const { items } = await api('/notifications');
    if (items?.length) await setLast(Math.max(...items.map((i) => i.id)));
  } catch {}
}
