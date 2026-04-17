import initSqlJs from 'sql.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../data/racing.db');

const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

let db;

async function initDb() {
  const SQL = await initSqlJs();

  let data;
  if (fs.existsSync(DB_PATH)) {
    data = fs.readFileSync(DB_PATH);
  }

  db = new SQL.Database(data);

  db.run(`
    CREATE TABLE IF NOT EXISTS leaderboard (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      player_name TEXT    NOT NULL,
      best_lap    REAL    NOT NULL,
      total_time  REAL    NOT NULL,
      track       TEXT    NOT NULL DEFAULT 'main',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  saveToFile();
  return db;
}

function saveToFile() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

export async function getDb() {
  if (!db) await initDb();
  return db;
}

export async function saveResult({ player_name, best_lap, total_time, track = 'main' }) {
  const database = await getDb();
  database.run(
    `INSERT INTO leaderboard (player_name, best_lap, total_time, track) VALUES (?, ?, ?, ?)`,
    [player_name, best_lap, total_time, track]
  );
  saveToFile();
}

export async function getLeaderboard(track = 'main') {
  const database = await getDb();
  const stmt = database.prepare(`
    SELECT player_name, best_lap, total_time, created_at
    FROM leaderboard
    WHERE track = ?
    ORDER BY total_time ASC
    LIMIT 20
  `);
  stmt.bind([track]);

  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

export default { getDb, saveResult, getLeaderboard };
