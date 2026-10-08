import * as Location from 'expo-location';
import { LOCATION_TASK } from './task';
import { flush } from './queue';

export async function requestPermissions() {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return { ok: false, reason: 'Location permission is needed to share your location.' };
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') return { ok: false, reason: 'Choose "Allow all the time" so sharing continues when the app is closed.' };
  return { ok: true };
}

export const isRunning = () => Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);

export async function startBackgroundSharing() {
  if (await isRunning()) return { ok: true };
  const perm = await requestPermissions();
  if (!perm.ok) return perm;
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 30000,            // Android: every ~30s
    distanceInterval: 20,           // or after moving 20 m
    deferredUpdatesInterval: 30000,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.Other,
    showsBackgroundLocationIndicator: true,  // iOS blue bar: user always knows
    foregroundService: {                      // Android persistent notification (required + transparent)
      notificationTitle: 'Saathi is sharing your location',
      notificationBody: 'Open the app to see who can see you or to stop sharing.',
      notificationColor: '#0F7C7E',
      killServiceOnDestroy: false,
    },
  });
  return { ok: true };
}

export async function stopBackgroundSharing() {
  if (await isRunning()) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  await flush();
}

// Keep the device in sync with the server: run tracking only while at least one share is live
export async function syncSharingState(sharingCount) {
  if (sharingCount > 0) return startBackgroundSharing();
  await stopBackgroundSharing();
  return { ok: true };
}

export async function currentPosition() {
  const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: p.coords.latitude, lng: p.coords.longitude };
}
