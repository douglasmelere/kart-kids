// ─── LapTracker ───────────────────────────────────────────────────────────────
// Detecta cruzamento de checkpoints e contagem de voltas via line-segment
// intersection. Requer que todos os CPs intermediários (1, 2, 3) sejam
// cruzados antes de validar o cruzamento da linha de largada (CP0).
// ─────────────────────────────────────────────────────────────────────────────
import { CHECKPOINTS } from './Track.js';
import { TOTAL_LAPS }   from '../config/constants.js';

// ── Segment × Segment intersection ────────────────────────────────────────────
// Retorna true se o segmento (p1→p2) cruza (p3→p4).
function segCross(p1x, p1y, p2x, p2y, p3x, p3y, p4x, p4y) {
  const d1x = p2x - p1x, d1y = p2y - p1y;
  const d2x = p4x - p3x, d2y = p4y - p3y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 0.001) return false;         // paralelos

  const ex = p3x - p1x, ey = p3y - p1y;
  const t  = (ex * d2y - ey * d2x) / denom;
  const u  = (ex * d1y - ey * d1x) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

export class LapTracker {
  constructor() {
    this.currentLap = 1;
    this.lapTimes   = [];
    this.bestLap    = Infinity;
    this.finished   = false;

    this._lapStartTime = 0;
    this._crossed      = new Set();  // CPs intermediários cruzados nesta volta
    this._prevX        = null;
    this._prevY        = null;
    this._cooldown     = 0;          // ms — bloqueia após cruzar CP0
  }

  // ── Chamado a cada frame ───────────────────────────────────────────────────
  // Retorna: null | { type:'checkpoint', index }
  //                | { type:'lap', lap, lapTime, isRecord, bestLap }
  //                | { type:'finished', totalTime, bestLap, lapTimes }
  update(x, y, raceTime, delta) {
    if (this.finished) return null;

    if (this._cooldown > 0) {
      this._cooldown -= delta;
      this._prevX = x;
      this._prevY = y;
      return null;
    }

    if (this._prevX === null) {
      this._prevX = x; this._prevY = y;
      return null;
    }

    const px = this._prevX, py = this._prevY;
    this._prevX = x; this._prevY = y;

    // ── Checkpoints intermediários (1, 2, 3…) ─────────────────────────────
    for (let i = 1; i < CHECKPOINTS.length; i++) {
      if (this._crossed.has(i)) continue;
      const cp = CHECKPOINTS[i];
      if (segCross(px, py, x, y, cp.x1, cp.y1, cp.x2, cp.y2)) {
        this._crossed.add(i);
        return { type: 'checkpoint', index: i };
      }
    }

    // ── Linha de largada (CP0) ─────────────────────────────────────────────
    // Válida apenas se todos os CPs intermediários foram cruzados
    // E o kart está se movendo para a direita (direção correta da pista)
    const vx     = x - px;
    const needCPs = CHECKPOINTS.length - 1;

    if (vx > 0 && this._crossed.size >= needCPs) {
      const cp0 = CHECKPOINTS[0];
      if (segCross(px, py, x, y, cp0.x1, cp0.y1, cp0.x2, cp0.y2)) {
        const lapTime  = raceTime - this._lapStartTime;
        const isRecord = lapTime < this.bestLap;
        if (isRecord) this.bestLap = lapTime;
        this.lapTimes.push(lapTime);
        this._lapStartTime = raceTime;
        this._crossed.clear();
        this._cooldown = 600;   // evita dupla contagem

        if (this.currentLap >= TOTAL_LAPS) {
          this.finished = true;
          return {
            type:      'finished',
            totalTime: raceTime,
            bestLap:   this.bestLap,
            lapTimes:  [...this.lapTimes],
          };
        }

        this.currentLap++;
        return { type: 'lap', lap: this.currentLap, lapTime, isRecord, bestLap: this.bestLap };
      }
    }

    return null;
  }
}
