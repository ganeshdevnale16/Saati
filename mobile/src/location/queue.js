// Offline-first location log. Every point is written to the device first,
// then uploaded. If the network is down, points stay here until it returns.
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { api } from '../api';

const KEY = 'saathi:loc_queue';
const MAX_POINTS = 20000;   // ~1 week at 30s intervals
const BATCH = 300;
let flushing = false;

const read = async () => JSON.parse((await AsyncStorage.getItem(KEY)) || '[]');
const write = (q) => AsyncStorage.setItem(KEY, JSON.stringify(q));

export async function enqueue(points) {
  const q = await read();
  q.push(...points);
  await write(q.length > MAX_POINTS ? q.slice(q.length - MAX_POINTS) : q);
}

export const pendingCount = async () => (await read()).length;

export async function flush() {
  if (flushing) return { skipped: true };
  const net = await NetInfo.fetch();
  if (!net.isConnected || net.isInternetReachable === false) return { offline: true };
  flushing = true;
  let sent = 0;
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const q = await read();
      if (!q.length) break;
      const chunk = q.slice(0, BATCH);
      await api('/locations/batch', { method: 'POST', body: { points: chunk }, timeoutMs: 25000 });
      const after = await read();                       // new points may have arrived meanwhile
      const sentIds = new Set(chunk.map((p) => p.clientId));
      await write(after.filter((p) => !sentIds.has(p.clientId)));
      sent += chunk.length;
    }
  } catch (e) {
    // keep the queue; it will retry on the next point or when the network comes back
    if (e.status === 401) return { unauthorized: true };
  } finally { flushing = false; }
  return { sent };
}

// Upload backlog as soon as the phone reconnects (while the app process is alive)
let unsub = null;
export function watchConnectivity() {
  if (unsub) return;
  unsub = NetInfo.addEventListener((s) => { if (s.isConnected) flush(); });
}
