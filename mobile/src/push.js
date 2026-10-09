import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true, shouldShowBanner: true, shouldShowList: true }),
});

export async function registerPush() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'General', importance: Notifications.AndroidImportance.DEFAULT });
    // SOS channel: max importance, long vibration, bypasses Do Not Disturb where allowed
    await Notifications.setNotificationChannelAsync('sos', {
      name: 'SOS alerts', importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 800, 300, 800, 300, 800], bypassDnd: true, lockscreenVisibility: 1, sound: 'default',
    });
  }
  if (!Device.isDevice) return null;
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return null;
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await api('/auth/push-token', { method: 'POST', body: { token } }).catch(() => {});
    return token;
  } catch (e) {
    // Happens until Firebase (google-services.json) is added. The app still works; alerts show while it's open.
    console.log('[push] not available yet:', e.message);
    return null;
  }
}
