// ─── RemoteKartInterpolator ───────────────────────────────────────────────────
// Smoothly interpolates a remote kart's position between network updates.
// Uses frame-rate-independent exponential lerp for position and angle.
// ─────────────────────────────────────────────────────────────────────────────

// How quickly the displayed position catches up to the received position.
// Higher = snappier (more lag-apparent), lower = smoother (more delay).
const INTERP_SPEED = 14; // units/second of "correction"

export class RemoteKartInterpolator {
  constructor(x, y, angle) {
    this.x     = x;
    this.y     = y;
    this.angle = angle;

    this._tx = x;   // target (latest received)
    this._ty = y;
    this._ta = angle;
  }

  // Call when a new network packet arrives
  receive(x, y, angle) {
    this._tx = x;
    this._ty = y;
    this._ta = angle;
  }

  // Call every frame — advances toward target
  update(delta) {
    // Frame-rate-independent exponential approach
    const alpha = 1 - Math.exp(-INTERP_SPEED * delta / 1000);

    this.x = this.x + (this._tx - this.x) * alpha;
    this.y = this.y + (this._ty - this.y) * alpha;
    this.angle = this._lerpAngle(this.angle, this._ta, alpha);
  }

  // Lerp through shortest arc (handles 359°→1° wrap)
  _lerpAngle(from, to, t) {
    let delta = ((to - from + 540) % 360) - 180;
    return from + delta * t;
  }
}
