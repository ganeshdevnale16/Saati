// Saathi app: native shell around the Saathi web interface (one design for web + app).
// Native parts: background location, offline queue, push notifications, SOS vibration, back button.
// Developed by Devnale Globals
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Linking, View, Text, Pressable, ActivityIndicator, StyleSheet, Vibration, Alert, Platform, Image } from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import * as Updates from 'expo-updates';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';

import { API_URL } from './src/config';
import { saveSession, clearSession } from './src/session';
import { registerPush } from './src/push';
import { watchConnectivity, flush, pendingCount } from './src/location/queue';
import { syncSharingState, startBackgroundSharing, stopBackgroundSharing } from './src/location/control';
import { C } from './src/theme';

const APP_INFO = { version: Constants.expoConfig?.version || '0.0.0', platform: Platform.OS };
const START_URL = API_URL + '/';
const BEFORE_LOAD = `window.SAATHI_APP = ${JSON.stringify(APP_INFO)}; true;`;

export default function App() {
  const web = useRef(null);
  const canGoBack = useRef(false);
  const [state, setState] = useState('loading'); // loading | ready | error
  const [slow, setSlow] = useState(false);

  const js = useCallback((code) => web.current?.injectJavaScript(code + '; true;'), []);
  const sendStatus = useCallback(async (sharing) => {
    const pending = await pendingCount();
    js(`window.onNativeStatus && window.onNativeStatus(${JSON.stringify({ sharing, pending })})`);
  }, [js]);

  // Over-the-air updates for this native shell
  useEffect(() => {
    if (__DEV__) return;
    (async () => {
      try {
        const r = await Updates.checkForUpdateAsync();
        if (r.isAvailable) { await Updates.fetchUpdateAsync(); await Updates.reloadAsync(); }
      } catch {}
    })();
  }, []);

  // Upload offline locations whenever the internet comes back
  useEffect(() => { watchConnectivity(); flush(); }, []);

  // Android back button: go back inside Saathi first
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack.current) { web.current?.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, []);

  // Tapping a notification opens the right page
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const d = r.notification.request.content.data || {};
      const hash = d.type === 'share_request' ? '#/requests' : d.userId ? `#/track/${d.userId}` : '#/alerts';
      js(`location.hash = ${JSON.stringify(hash)}`);
    });
    return () => sub.remove();
  }, [js]);

  // First load on Render's free plan can take ~50 s while the server wakes up
  useEffect(() => {
    if (state !== 'loading') return;
    const t = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(t);
  }, [state]);

  // Messages from the web interface
  const onMessage = useCallback(async (e) => {
    let m; try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    switch (m.type) {
      case 'auth':
        if (m.token) { await saveSession(m.token, m.user || {}); registerPush().catch(() => {}); flush(); }
        break;
      case 'logout':
        await stopBackgroundSharing(); await clearSession();
        break;
      case 'sharing': {
        const r = await syncSharingState(m.count || 0);
        if (!r.ok) {
          Alert.alert('Location permission needed', r.reason, [
            { text: 'Not now' }, { text: 'Open settings', onPress: () => Linking.openSettings() },
          ]);
        }
        sendStatus(r.ok && m.count > 0);
        break;
      }
      case 'startSharing': {
        const r = await startBackgroundSharing();
        if (!r.ok) Alert.alert('Location permission needed', r.reason, [{ text: 'Not now' }, { text: 'Open settings', onPress: () => Linking.openSettings() }]);
        break;
      }
      case 'haptic':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        break;
      case 'sosAlert':
        Vibration.vibrate([0, 800, 300, 800, 300, 800]);
        break;
      case 'stopAlarm':
        Vibration.cancel();
        break;
      case 'status':
        sendStatus(m.sharing);
        break;
      default:
    }
  }, [sendStatus]);

  // Keep Saathi pages inside the app; open everything else (calls, maps, APK download) outside
  const onShouldStart = useCallback((req) => {
    const u = req.url || '';
    if (u.startsWith('about:') || u.startsWith('data:') || u.startsWith('blob:')) return true;
    if (u.startsWith(API_URL) && !u.startsWith(API_URL + '/download')) return true;
    Linking.openURL(u).catch(() => {});
    return false;
  }, []);

  const retry = () => { setState('loading'); setSlow(false); web.current?.reload(); };

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" backgroundColor="#ffffff" />
      <SafeAreaView style={st.safe} edges={['top', 'bottom']}>
        <WebView
          ref={web}
          source={{ uri: START_URL }}
          injectedJavaScriptBeforeContentLoaded={BEFORE_LOAD}
          onMessage={onMessage}
          onShouldStartLoadWithRequest={onShouldStart}
          onNavigationStateChange={(n) => { canGoBack.current = n.canGoBack; }}
          onLoadEnd={() => setState((s) => (s === 'error' ? s : 'ready'))}
          onError={() => setState('error')}
          onHttpError={(e) => { if (e.nativeEvent.statusCode >= 500) setState('error'); }}
          geolocationEnabled
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          cacheEnabled
          setSupportMultipleWindows={false}
          allowsBackForwardNavigationGestures
          pullToRefreshEnabled
          mediaPlaybackRequiresUserAction={false}
          overScrollMode="never"
          textZoom={100}
          style={{ flex: 1, backgroundColor: C.paper }}
        />

        {state !== 'ready' && (
          <View style={st.cover}>
            <Image source={require('./assets/icon.png')} style={st.logo} />
            <Text style={st.brand}>Saathi</Text>
            <Text style={st.by}>by Devnale Globals</Text>
            {state === 'loading' ? (
              <>
                <ActivityIndicator color="#fff" style={{ marginTop: 28 }} />
                {slow && <Text style={st.note}>Connecting to Saathi… The first start can take up to a minute.</Text>}
              </>
            ) : (
              <>
                <Text style={st.note}>Can't reach Saathi. Check your internet connection.{'\n'}If you are sharing, your location is still saved on this phone.</Text>
                <Pressable onPress={retry} style={st.btn}><Text style={st.btnT}>Try again</Text></Pressable>
              </>
            )}
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ffffff' },
  cover: { ...StyleSheet.absoluteFillObject, backgroundColor: C.teal, alignItems: 'center', justifyContent: 'center', padding: 30 },
  logo: { width: 92, height: 92, borderRadius: 22, marginBottom: 18 },
  brand: { color: '#fff', fontSize: 40, fontWeight: '900', letterSpacing: -1 },
  by: { color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  note: { color: '#fff', textAlign: 'center', marginTop: 22, lineHeight: 21, fontSize: 15 },
  btn: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 13, marginTop: 22 },
  btnT: { color: C.teal, fontWeight: '900', fontSize: 16 },
});
