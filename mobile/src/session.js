import * as SecureStore from 'expo-secure-store';

// AFTER_FIRST_UNLOCK lets the background location task read the token while the phone is locked.
const OPTS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

export const saveSession = async (token, user) => {
  await SecureStore.setItemAsync('token', token, OPTS);
  await SecureStore.setItemAsync('user', JSON.stringify(user), OPTS);
};
export const getToken = () => SecureStore.getItemAsync('token', OPTS);
export const getUser = async () => JSON.parse((await SecureStore.getItemAsync('user', OPTS)) || 'null');
export const clearSession = async () => {
  await SecureStore.deleteItemAsync('token', OPTS);
  await SecureStore.deleteItemAsync('user', OPTS);
};
