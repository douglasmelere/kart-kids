// ─── KartPhysics ──────────────────────────────────────────────────────────────
// Pure physics — no Phaser dependency.
// Angle convention: 0° = facing RIGHT (+x). Degrees increase clockwise.
// ─────────────────────────────────────────────────────────────────────────────
import {
  KART_MAX_SPEED,
  KART_ACCEL,
  KART_FRICTION,
  KART_TURN_SPEED,
  KART_BOUNCE_DAMP,
} from '../config/constants.js';
import { T } from './Track.js';

const DEG = Math.PI / 180;
const BOOST_SPEED    = KART_MAX_SPEED * 1.45;
const BOOST_COOLDOWN = 3500;   // ms
const WALL_MARGIN    = 5;      // px clearance from wall after bounce

export class KartPhysics {
  constructor(x, y, angle = 0) {
    this.x     = x;
    this.y     = y;
    this.angle = angle;  // degrees
    this.speed = 0;      // px/s  (positive = forward)

    this._boostCooldown = 0;
    this._bounceCooldown = 0;
  }

  // ── Main tick — call every frame ───────────────────────────────────────────
  // Returns: { bounced: bool, boosted: bool }
  update(delta, keys) {
    const dt = delta / 1000;
    let bounced = false;
    let boosted = false;

    // ── Boost (Space / Shift) ─────────────────────────────────────────────
    if (keys.boost && this._boostCooldown <= 0 && this.speed > 40) {
      this.speed = Math.min(BOOST_SPEED, this.speed + 200);
      this._boostCooldown = BOOST_COOLDOWN;
      boosted = true;
    }
    if (this._boostCooldown > 0) this._boostCooldown -= delta;

    // ── Throttle / Brake / Ré ────────────────────────────────────────────
    if (keys.up) {
      // Aceleração para frente — se estava de ré, freia antes de avançar
      if (this.speed < 0) {
        this.speed += KART_ACCEL * 2.5 * dt;   // freio de ré mais brusco
      } else {
        this.speed += KART_ACCEL * dt;
      }
    } else if (keys.down) {
      // Para frente → freia forte. Parado ou de ré → engata ré devagar
      if (this.speed > 0) {
        this.speed -= KART_ACCEL * 2 * dt;
      } else {
        this.speed -= KART_ACCEL * 0.45 * dt;  // ré lenta
      }
    } else {
      // Sem input: atrito traz de volta ao zero
      const sign = Math.sign(this.speed);
      this.speed -= sign * KART_FRICTION * dt;
      if (Math.abs(this.speed) < 4) this.speed = 0;
    }

    // Clamp: ré limitada a 30% da vel. máx; frente ilimitada até boost
    this.speed = Math.max(-KART_MAX_SPEED * 0.30, Math.min(BOOST_SPEED, this.speed));

    // ── Steering (proporcional à velocidade; sem inversão no ré — mais
    //    intuitivo para crianças) ────────────────────────────────────────
    const speedRatio = Math.abs(this.speed) / KART_MAX_SPEED;
    const turnRate   = KART_TURN_SPEED * Math.max(0.12, speedRatio);

    if (keys.left)  this.angle -= turnRate * dt;
    if (keys.right) this.angle += turnRate * dt;

    // ── Move ──────────────────────────────────────────────────────────────
    const rad  = this.angle * DEG;
    const newX = this.x + Math.cos(rad) * this.speed * dt;
    const newY = this.y + Math.sin(rad) * this.speed * dt;

    // ── Wall collision ────────────────────────────────────────────────────
    const wall = this._checkWall(newX, newY);

    if (wall && this._bounceCooldown <= 0) {
      this._resolveWall(wall, newX, newY);
      this._bounceCooldown = 220;
      bounced = true;
    } else if (!wall) {
      this.x = newX;
      this.y = newY;
    } else {
      // Still inside a previous bounce frame — slide along wall
      this.x = newX;
      this.y = newY;
    }

    if (this._bounceCooldown > 0) this._bounceCooldown -= delta;

    return { bounced, boosted };
  }

  // ── Collision detection ────────────────────────────────────────────────────
  _checkWall(x, y) {
    const outer = ((x - T.CX) / T.OUTER_A) ** 2 + ((y - T.CY) / T.OUTER_B) ** 2;
    if (outer >= 1) return 'outer';

    const inner = ((x - T.CX) / T.INNER_A) ** 2 + ((y - T.CY) / T.INNER_B) ** 2;
    if (inner <= 1) return 'inner';

    return null;
  }

  // ── Collision resolution ───────────────────────────────────────────────────
  _resolveWall(wall, hitX, hitY) {
    const isOuter = wall === 'outer';
    const a = isOuter ? T.OUTER_A : T.INNER_A;
    const b = isOuter ? T.OUTER_B : T.INNER_B;

    // Direction from ellipse center to hit point
    const dx  = hitX - T.CX;
    const dy  = hitY - T.CY;
    const dLen = Math.hypot(dx, dy) || 1;
    const ndx  = dx / dLen;
    const ndy  = dy / dLen;

    // Parametric distance to ellipse surface in direction (ndx, ndy)
    const tSurf = 1 / Math.sqrt((ndx / a) ** 2 + (ndy / b) ** 2);

    // Push kart back to just inside/outside the wall
    if (isOuter) {
      this.x = T.CX + ndx * (tSurf - WALL_MARGIN);
      this.y = T.CY + ndy * (tSurf - WALL_MARGIN);
    } else {
      this.x = T.CX + ndx * (tSurf + WALL_MARGIN);
      this.y = T.CY + ndy * (tSurf + WALL_MARGIN);
    }

    // Ellipse gradient normal at hit point → inward-facing wall normal
    const gnx = (hitX - T.CX) / (a * a);
    const gny = (hitY - T.CY) / (b * b);
    const gLen = Math.hypot(gnx, gny) || 1;
    const sign = isOuter ? -1 : 1;          // inward for outer, outward for inner
    const nx = (gnx / gLen) * sign;
    const ny = (gny / gLen) * sign;

    // Reflect velocity vector
    const rad = this.angle * DEG;
    const vx  = Math.cos(rad) * this.speed;
    const vy  = Math.sin(rad) * this.speed;
    const dot = vx * nx + vy * ny;
    const rvx = vx - 2 * dot * nx;
    const rvy = vy - 2 * dot * ny;

    this.angle = Math.atan2(rvy, rvx) / DEG;
    this.speed  = Math.abs(this.speed) * KART_BOUNCE_DAMP;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  get boostReady() { return this._boostCooldown <= 0; }
  get boostFraction() { return 1 - Math.max(0, this._boostCooldown / BOOST_COOLDOWN); }
}
