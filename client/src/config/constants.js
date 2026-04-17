// ─── Game Configuration ───────────────────────────────────────────────────────
export const GAME_WIDTH  = 960;
export const GAME_HEIGHT = 640;

// ─── Server ───────────────────────────────────────────────────────────────────
// In development: set VITE_SERVER_URL=http://localhost:3001 (via .env.local)
// In production:  leave unset → socket.io auto-connects to the same origin
export const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? '';

// ─── Physics ──────────────────────────────────────────────────────────────────
export const KART_MAX_SPEED    = 320;   // px/s
export const KART_ACCEL        = 220;   // px/s²
export const KART_FRICTION     = 180;   // px/s² (decel when no input)
export const KART_TURN_SPEED   = 160;   // deg/s
export const KART_BOUNCE_DAMP  = 0.45;  // speed multiplier on wall bounce

// ─── Race ─────────────────────────────────────────────────────────────────────
export const TOTAL_LAPS = 3;

// ─── Network ──────────────────────────────────────────────────────────────────
export const TICK_RATE = 30; // server ticks per second

// ─── Kart Colors (one per player slot) ───────────────────────────────────────
export const KART_COLORS = [0xff4757, 0x2ed573, 0x1e90ff, 0xffa502, 0xa29bfe, 0xfd79a8];
