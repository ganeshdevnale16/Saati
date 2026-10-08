import Constants from 'expo-constants';

const raw = Constants.expoConfig?.extra?.apiUrl || 'http://10.0.2.2:4000';
export const API_URL = raw.replace(/\/+$/, '');   // remove trailing slashes
export const COMPANY = 'Devnale Globals';
export const APP_NAME = 'Saathi';
