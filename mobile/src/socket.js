import { io } from 'socket.io-client';
import { API_URL } from './config';
import { getToken } from './session';

let socket = null;
export async function connectSocket() {
  if (socket?.connected) return socket;
  const token = await getToken();
  if (!token) return null;
  socket = io(API_URL, { auth: { token }, transports: ['websocket'], reconnection: true });
  return socket;
}
export const getSocket = () => socket;
export const disconnectSocket = () => { socket?.disconnect(); socket = null; };
