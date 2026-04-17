import { io } from 'socket.io-client';
import { SERVER_URL } from '../config/constants.js';

// ─── SocketManager ────────────────────────────────────────────────────────────
// Singleton wrapper around socket.io-client.
// Scenes subscribe to events; they never import `io` directly.
// ─────────────────────────────────────────────────────────────────────────────
class SocketManager {
  constructor() {
    this.socket = null;
  }

  connect() {
    if (this.socket?.connected) return this.socket;

    // If socket exists but was manually disconnected, clean it up first
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.socket = io(SERVER_URL, {
      transports: ['websocket'],
      autoConnect: true,
    });

    this.socket.on('connect', () => {
      console.log('[Socket] Connected:', this.socket.id);
    });

    this.socket.on('disconnect', (reason) => {
      console.warn('[Socket] Disconnected:', reason);
    });

    this.socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
    });

    return this.socket;
  }

  get id() {
    return this.socket?.id ?? null;
  }

  emit(event, data) {
    this.socket?.emit(event, data);
  }

  on(event, cb) {
    this.socket?.on(event, cb);
  }

  off(event, cb) {
    this.socket?.off(event, cb);
  }

  disconnect() {
    this.socket?.disconnect();
  }
}

export const socketManager = new SocketManager();
