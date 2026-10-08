// Background location task: runs even when the app is closed / phone locked.
import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';
import { enqueue, flush } from './queue';

export const LOCATION_TASK = 'saathi-background-location';

const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  let battery = null;
  try { battery = await Battery.getBatteryLevelAsync(); } catch {}
  const points = data.locations.map((l) => ({
    lat: l.coords.latitude,
    lng: l.coords.longitude,
    accuracy: l.coords.accuracy,
    speed: l.coords.speed,
    heading: l.coords.heading,
    battery,
    recordedAt: new Date(l.timestamp).toISOString(),
    clientId: id(),
  }));
  await enqueue(points);   // 1) always save on device first
  await flush();           // 2) then try to upload (no-op if offline)
});
