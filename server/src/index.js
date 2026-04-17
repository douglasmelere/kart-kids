import express    from 'express';
import http       from 'http';
import { Server } from 'socket.io';
import cors       from 'cors';
import path       from 'path';
import fs         from 'fs';
import { fileURLToPath } from 'url';
import { roomManager }              from './rooms/RoomManager.js';
import { saveResult, getLeaderboard, getDb } from './db/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT ?? 3001;

const BOT_TRACK = {
  CX: 480,
  CY: 315,
  OUTER_A: 400,
  OUTER_B: 218,
  INNER_A: 238,
  INNER_B: 122,
  START_X: 548,
  INNER_BOTTOM: 315 + 122,
  OUTER_BOTTOM: 315 + 218,
  LANE_INNER: 315 + 122 + 28,
  LANE_OUTER: 315 + 218 - 28,
};

// Base config (fallback only; per-bot config set from difficulty)
const BOT_CONFIG = {
  trackWidth: 70,
  skillLevel: 0.92,
};

const DIFFICULTY_CONFIGS = {
  facil: {
    baseSpeed: 220, maxSpeed: 290,
    turnSpeed: 3.5, acceleration: 6, deceleration: 10,
    lookahead: 0.20,
  },
  medio: {
    baseSpeed: 360, maxSpeed: 480,
    turnSpeed: 4.5, acceleration: 8, deceleration: 12,
    lookahead: 0.15,
  },
  dificil: {
    baseSpeed: 460, maxSpeed: 570,
    turnSpeed: 6.0, acceleration: 14, deceleration: 18,
    lookahead: 0.12,
  },
};

// How long to wait after 'race:starting' before the bot starts moving.
// Matches client-side delay: LobbyScene 600ms + RaceScene PREPARE-SE ~1630ms.
const BOT_START_DELAY_MS = 2500;

const botState = new Map();

function getTrackPoint(t) {
  const midA = (BOT_TRACK.OUTER_A + BOT_TRACK.INNER_A) / 2;
  const midB = (BOT_TRACK.OUTER_B + BOT_TRACK.INNER_B) / 2;
  return {
    x: BOT_TRACK.CX + Math.cos(t) * midA,
    y: BOT_TRACK.CY + Math.sin(t) * midB,
  };
}

function updateBot(bot, roomId) {
  const current = botState.get(bot.socketId);
  if (!current) return;

  let { x, y, angle, lap, currentSpeed, lastCheckpoint, finishedRace } = current;
  if (finishedRace) return;

  const midA = (BOT_TRACK.OUTER_A + BOT_TRACK.INNER_A) / 2;
  const midB = (BOT_TRACK.OUTER_B + BOT_TRACK.INNER_B) / 2;

  // Checkpoint order: right → top → left → finish (bottom) → lap++
  // Bot starts at the bottom looking for CP0 (right side), so it never
  // triggers the finish line prematurely on the first frame.
  const cpX = [BOT_TRACK.CX + midA, BOT_TRACK.CX,           BOT_TRACK.CX - midA, BOT_TRACK.START_X  ];
  const cpY = [BOT_TRACK.CY,        BOT_TRACK.CY - midB,    BOT_TRACK.CY,        BOT_TRACK.CY + midB];

  const distToCp = Math.hypot(cpX[lastCheckpoint] - x, cpY[lastCheckpoint] - y);
  if (distToCp < 100) {
    lastCheckpoint = (lastCheckpoint + 1) % 4;
    if (lastCheckpoint === 0) {
      lap++;
      if (lap > 3) {
        botState.set(bot.socketId, { ...current, x, y, angle, lap, currentSpeed, lastCheckpoint, finishedRace: true });
        io.to(roomId).emit('race:player_finished', {
          socketId: bot.socketId,
          playerName: bot.name,
          totalTime: (Date.now() - current.startTime) / 1000,
        });
        return;
      }
    }
  }

  // Compute nearest position on mid-ellipse (avoids drift over time).
  // Race direction is counterclockwise in screen-space = decreasing t.
  const trackT = Math.atan2((y - BOT_TRACK.CY) / midB, (x - BOT_TRACK.CX) / midA);

  // Look ahead by difficulty-configured amount (subtract = counterclockwise)
  let targetT = trackT - current.config.lookahead;
  if (targetT < -Math.PI) targetT += Math.PI * 2;
  if (targetT >  Math.PI) targetT -= Math.PI * 2;

  const target = getTrackPoint(targetT);
  const dx = target.x - x;
  const dy = target.y - y;
  const targetAngle = Math.atan2(dy, dx) * (180 / Math.PI);

  let angleDiff = targetAngle - angle;
  while (angleDiff >  180) angleDiff -= 360;
  while (angleDiff < -180) angleDiff += 360;

  angle += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), current.config.turnSpeed);
  if (angle >  180) angle -= 360;
  if (angle < -180) angle += 360;

  const cfg = current.config;

  let targetSpeed = cfg.baseSpeed;
  if (Math.abs(angleDiff) > 30) {
    targetSpeed = cfg.baseSpeed * 0.7;
  } else if (Math.abs(angleDiff) < 10) {
    targetSpeed = cfg.maxSpeed;
  }

  if (currentSpeed < targetSpeed) {
    currentSpeed = Math.min(targetSpeed, currentSpeed + cfg.acceleration);
  } else {
    currentSpeed = Math.max(targetSpeed, currentSpeed - cfg.deceleration);
  }

  const rad = angle * (Math.PI / 180);
  x += Math.cos(rad) * currentSpeed * 0.016;
  y += Math.sin(rad) * currentSpeed * 0.016;

  x = Math.max(BOT_TRACK.CX - BOT_TRACK.OUTER_A, Math.min(BOT_TRACK.CX + BOT_TRACK.OUTER_A, x));
  y = Math.max(BOT_TRACK.CY - BOT_TRACK.OUTER_B, Math.min(BOT_TRACK.CY + BOT_TRACK.OUTER_B, y));

  botState.set(bot.socketId, { ...current, x, y, angle, trackT, lap, currentSpeed, lastCheckpoint });

  io.to(roomId).emit('race:position', {
    socketId: bot.socketId,
    x: Math.round(x),
    y: Math.round(y),
    angle: Math.round(angle * 10) / 10,
    speed: Math.round(currentSpeed),
    lap,
    ts: Date.now(),
  });
}

function initBot(bot, roomId, difficulty = 'medio') {
  const midA   = (BOT_TRACK.OUTER_A + BOT_TRACK.INNER_A) / 2;
  const midB   = (BOT_TRACK.OUTER_B + BOT_TRACK.INNER_B) / 2;
  const config = DIFFICULTY_CONFIGS[difficulty] ?? DIFFICULTY_CONFIGS.medio;

  // Stagger bots behind the start line along the bottom straight.
  // t = π/2 is the ellipse bottom; adding a positive offset moves backward
  // (clockwise) so bots start before the finish line, not past it.
  const stagger = bot.colorIndex * 0.06;
  const startT  = Math.PI / 2 + stagger;

  botState.set(bot.socketId, {
    x: BOT_TRACK.CX + Math.cos(startT) * midA,
    y: BOT_TRACK.CY + Math.sin(startT) * midB,
    angle: 0,       // facing right — correct tangent direction at the bottom
    trackT: startT,
    lap: 1,
    currentSpeed: 0,
    lastCheckpoint: 0,   // looking for right-side CP first
    startTime: Date.now(),
    finishedRace: false,
    config,
  });

  console.log(`[Bot] Initialized bot ${bot.name} in room ${roomId} — difficulty: ${difficulty}`);
}

function removeBot(botId) {
  botState.delete(botId);
}

const app    = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());
app.set('trust proxy', 1);

// Serve built client in production (Dockerfile copies client/dist here)
const CLIENT_DIST = path.join(__dirname, '../../client/dist');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
}

app.get('/leaderboard', async (req, res) => {
  const track = req.query.track ?? 'main';
  const data = await getLeaderboard(track);
  res.json(data);
});

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  socket.on('room:join_public', ({ name }) => {
    const { room, player } = roomManager.joinPublic(socket.id, name);
    socket.join(room.roomId);

    const data = roomManager.toPublicData(room);
    socket.emit('room:joined', { ...data, isHost: player.isHost });

    socket.to(room.roomId).emit('room:players_updated', data.players);
    console.log(`[Room] ${name} joined public room ${room.roomId}`);
  });

  socket.on('room:create_private', ({ name }) => {
    const { room, player } = roomManager.createPrivate(socket.id, name);
    socket.join(room.roomId);

    const data = roomManager.toPublicData(room);
    socket.emit('room:joined', { ...data, isHost: player.isHost });
    console.log(`[Room] ${name} created private room ${room.roomCode}`);
  });

  socket.on('room:join_private', ({ name, code }) => {
    const result = roomManager.joinPrivate(socket.id, name, code);
    if (result.error) {
      socket.emit('room:error', result.error);
      return;
    }
    const { room, player } = result;
    socket.join(room.roomId);

    const data = roomManager.toPublicData(room);
    socket.emit('room:joined', { ...data, isHost: player.isHost });
    socket.to(room.roomId).emit('room:players_updated', data.players);
    console.log(`[Room] ${name} joined private room ${room.roomCode}`);
  });

  socket.on('room:leave', () => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room) return;

    const result = roomManager.removePlayer(socket.id);
    if (result && !result.deleted) {
      io.to(result.roomId).emit('room:players_updated', result.players);
    }
    console.log(`[Room] ${socket.id} left room`);
  });

  socket.on('room:start', ({ roomId, difficulty = 'medio' }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const requestingPlayer = room.players.find(p => p.socketId === socket.id);
    if (!requestingPlayer?.isHost) return;
    if (room.players.length < 1) return;
    if (room.status !== 'waiting') return;

    roomManager.startRoom(roomId);

    const bots = room.players.filter(p => p.isBot);
    bots.forEach(bot => initBot(bot, roomId, difficulty));

    io.to(roomId).emit('race:countdown', { seconds: 3 });

    let count = 3;
    const countdownInterval = setInterval(() => {
      count--;
      if (count > 0) {
        io.to(roomId).emit('race:countdown', { seconds: count });
      } else {
        clearInterval(countdownInterval);
        io.to(roomId).emit('race:starting', {
          players: roomManager.toPublicData(room).players,
          trackId: 'main',
        });
        console.log(`[Race] Room ${roomId} started — bot difficulty: ${difficulty}`);

        // Delay bot movement to sync with client-side "PREPARE-SE → VÁ!" sequence.
        // Client waits 600ms (LobbyScene) + ~1630ms (RaceScene banner) before _raceStarted.
        setTimeout(() => {
          const botInterval = setInterval(() => {
            const currentRoom = roomManager.getRoom(roomId);
            if (!currentRoom || currentRoom.status !== 'racing') {
              clearInterval(botInterval);
              bots.forEach(bot => removeBot(bot.socketId));
              return;
            }

            currentRoom.players.filter(p => p.isBot).forEach(bot => updateBot(bot, roomId));
          }, 16);
        }, BOT_START_DELAY_MS);
      }
    }, 1000);
  });

  socket.on('race:position', (data) => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room || room.status !== 'racing') return;

    socket.to(room.roomId).emit('race:position', {
      socketId: socket.id,
      ...data,
      ts: Date.now(),
    });
  });

  socket.on('race:finished', async ({ roomId, playerName, bestLap, totalTime }) => {
    await saveResult({
      player_name: playerName,
      best_lap:    bestLap,
      total_time:  totalTime,
      track:       'main',
    });

    io.to(roomId).emit('race:player_finished', {
      socketId:   socket.id,
      playerName,
      totalTime,
    });
    console.log(`[Race] ${playerName} finished in ${totalTime.toFixed(2)}s`);
  });

  socket.on('leaderboard:get', async ({ track = 'main' }) => {
    const data = await getLeaderboard(track);
    socket.emit('leaderboard:data', data);
  });

  socket.on('disconnect', () => {
    const result = roomManager.removePlayer(socket.id);
    if (result && !result.deleted) {
      io.to(result.roomId).emit('room:players_updated', result.players);
    }
    console.log(`[-] Disconnected: ${socket.id}`);
  });
});

// SPA fallback — must come after API routes and Socket.IO setup
if (fs.existsSync(CLIENT_DIST)) {
  app.get('*', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

getDb().then(() => {
  server.listen(PORT, () => {
    console.log(`\n🚦 Kart Kids Racing Server running on http://localhost:${PORT}\n`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
