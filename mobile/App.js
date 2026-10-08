import React, { useEffect, useState, useCallback } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { View, ActivityIndicator } from 'react-native';

import { getUser, getToken, saveSession, clearSession } from './src/session';
import { connectSocket, disconnectSocket } from './src/socket';
import { registerPush } from './src/push';
import { watchConnectivity, flush } from './src/location/queue';
import { stopBackgroundSharing } from './src/location/control';
import { C } from './src/theme';

import AuthScreen from './src/screens/AuthScreen';
import HomeScreen from './src/screens/HomeScreen';
import ShareScreen from './src/screens/ShareScreen';
import TrackScreen from './src/screens/TrackScreen';
import PersonScreen from './src/screens/PersonScreen';
import RequestsScreen from './src/screens/RequestsScreen';
import ProfileScreen from './src/screens/ProfileScreen';

import { AuthCtx } from './src/auth';

const Stack = createNativeStackNavigator();
const navRef = React.createRef();

export default function App() {
  const [user, setUser] = useState(undefined);

  useEffect(() => { (async () => setUser((await getToken()) ? await getUser() : null))(); }, []);

  useEffect(() => {
    if (!user) return;
    connectSocket(); registerPush().catch(() => {}); watchConnectivity(); flush();
    // Tapping a push opens the right screen
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const d = r.notification.request.content.data || {};
      if (d.type === 'share_request') navRef.current?.navigate('Requests');
      else if (d.userId) navRef.current?.navigate('Person', { userId: d.userId });
    });
    return () => sub.remove();
  }, [user]);

  const signIn = useCallback(async (token, u) => { await saveSession(token, u); setUser(u); }, []);
  const signOut = useCallback(async () => { await stopBackgroundSharing(); disconnectSocket(); await clearSession(); setUser(null); }, []);

  if (user === undefined) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: C.paper }}><ActivityIndicator color={C.teal} /></View>;

  return (
    <AuthCtx.Provider value={{ user, setUser, signIn, signOut }}>
      <NavigationContainer ref={navRef}>
        <StatusBar style="dark" />
        <Stack.Navigator screenOptions={{ headerTintColor: C.ink, headerShadowVisible: false, headerStyle: { backgroundColor: C.paper }, contentStyle: { backgroundColor: C.paper } }}>
          {!user ? (
            <Stack.Screen name="Auth" component={AuthScreen} options={{ headerShown: false }} />
          ) : (
            <>
              <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Saathi' }} />
              <Stack.Screen name="Share" component={ShareScreen} options={{ title: 'Share my location' }} />
              <Stack.Screen name="Track" component={TrackScreen} options={{ title: 'Track' }} />
              <Stack.Screen name="Person" component={PersonScreen} options={{ title: 'Live location' }} />
              <Stack.Screen name="Requests" component={RequestsScreen} options={{ title: 'Requests' }} />
              <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile & alerts' }} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </AuthCtx.Provider>
  );
}
