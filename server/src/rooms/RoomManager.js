import { v4 as uuidv4 } from 'uuid';

// ─── RoomManager ──────────────────────────────────────────────────────────────
// Manages game rooms (public matchmaking + private codes).
// Completely in-memory; no persistence needed for room state.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_PLAYERS_PER_ROOM = 6;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O,0,I,1

const BOT_NAMES = [
  'TurboBot', 'RoboCorrida', 'MegaSpeed', 'Veloz5000',
  'CrashBand', 'DriftKing', 'NitroBot', 'SpeedDemon',
];

function generateCode(len = 4) {
  let code = '';
  for (let i = 0; i < len; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

class RoomManager {
  constructor() {
    // Map<roomId, Room>
    this.rooms = new Map();
    // Map<socketId, roomId>
    this.socketRoom = new Map();
  }

  // ── Room factory ────────────────────────────────────────────────────────────
  _createRoom({ isPrivate = false } = {}) {
    const roomId = uuidv4();
    let roomCode = null;

    if (isPrivate) {
      // Ensure unique code
      do { roomCode = generateCode(); }
      while ([...this.rooms.values()].some(r => r.roomCode === roomCode));
    }

    const room = {
      roomId,
      roomCode,
      isPrivate,
      status: 'waiting',   // waiting | countdown | racing | finished
      players: [],         // { socketId, name, colorIndex, isHost }
    };

    this.rooms.set(roomId, room);
    return room;
  }

  // ── Join / Leave ────────────────────────────────────────────────────────────
  joinPublic(socketId, name) {
    // Find an open public room
    let room = [...this.rooms.values()].find(
      r => !r.isPrivate && r.status === 'waiting' && r.players.length < MAX_PLAYERS_PER_ROOM
    );

    if (!room) room = this._createRoom({ isPrivate: false });

    return this._addPlayer(room, socketId, name);
  }

  createPrivate(socketId, name) {
    const room = this._createRoom({ isPrivate: true });
    return this._addPlayer(room, socketId, name);
  }

  joinPrivate(socketId, name, code) {
    const room = [...this.rooms.values()].find(
      r => r.roomCode === code.toUpperCase() && r.status === 'waiting'
    );
    if (!room) return { error: 'Código de sala inválido ou sala já iniciou.' };
    if (room.players.length >= MAX_PLAYERS_PER_ROOM) return { error: 'Sala cheia!' };
    return this._addPlayer(room, socketId, name);
  }

  _addPlayer(room, socketId, name) {
    const isHost = room.players.length === 0;
    const colorIndex = room.players.length;
    const player = { socketId, name, colorIndex, isHost };
    room.players.push(player);
    this.socketRoom.set(socketId, room.roomId);
    return { room, player };
  }

  _addBot(room) {
    const usedNames = room.players.map(p => p.name);
    const availableNames = BOT_NAMES.filter(n => !usedNames.includes(n));
    const botName = availableNames.length > 0
      ? availableNames[Math.floor(Math.random() * availableNames.length)]
      : `Bot${room.players.length + 1}`;

    const colorIndex = room.players.length;
    const botId = `bot_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const bot = { socketId: botId, name: botName, colorIndex, isHost: false, isBot: true };
    room.players.push(bot);
    return bot;
  }

  removePlayer(socketId) {
    const roomId = this.socketRoom.get(socketId);
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) return null;

    room.players = room.players.filter(p => p.socketId !== socketId);
    this.socketRoom.delete(socketId);

    // Re-assign host if the host left
    if (room.players.length > 0 && !room.players.some(p => p.isHost)) {
      room.players[0].isHost = true;
    }

    // Clean up empty rooms
    if (room.players.length === 0) {
      this.rooms.delete(roomId);
      return { roomId, players: [], deleted: true };
    }

    return { roomId, players: room.players, deleted: false };
  }

  getRoom(roomId) {
    return this.rooms.get(roomId) ?? null;
  }

  getRoomBySocket(socketId) {
    const roomId = this.socketRoom.get(socketId);
    return roomId ? this.rooms.get(roomId) : null;
  }

  startRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const humanPlayers = room.players.filter(p => !p.isBot);
    if (humanPlayers.length === 1) {
      this._addBot(room);
      console.log(`[Room] Bot added to room ${roomId} for solo race`);
    }

    room.status = 'racing';
    return true;
  }

  toPublicData(room) {
    return {
      roomId:   room.roomId,
      roomCode: room.roomCode,
      isPrivate: room.isPrivate,
      status:   room.status,
      players:  room.players.map(p => ({
        socketId:   p.socketId,
        name:       p.name,
        colorIndex: p.colorIndex,
        isHost:     p.isHost,
      })),
    };
  }
}

export const roomManager = new RoomManager();
