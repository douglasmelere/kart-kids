// ─── Track ────────────────────────────────────────────────────────────────────
// Defines track geometry data + handles all visual rendering of the circuit.
// Layout: elliptical oval, clockwise, camera-fixed (entire track fits on screen).
// ─────────────────────────────────────────────────────────────────────────────

import { GAME_WIDTH, GAME_HEIGHT } from '../config/constants.js';

// ── Geometry constants ────────────────────────────────────────────────────────
export const T = {
  CX:      480,   // track center X
  CY:      315,   // track center Y (offset up to leave room for HUD)
  OUTER_A: 400,   // outer ellipse X-radius
  OUTER_B: 218,   // outer ellipse Y-radius
  INNER_A: 238,   // inner ellipse X-radius
  INNER_B: 122,   // inner ellipse Y-radius
  N_PTS:   96,    // polygon resolution

  // Start/finish line: vertical segment at this X, in the bottom straight
  START_X: 548,
};

// Derived conveniences
T.INNER_BOTTOM = T.CY + T.INNER_B;  // 437
T.OUTER_BOTTOM = T.CY + T.OUTER_B;  // 533
T.LANE_MID     = (T.INNER_BOTTOM + T.OUTER_BOTTOM) / 2;  // ~485
T.LANE_INNER   = T.INNER_BOTTOM + 28;  // inner lane Y  ~465
T.LANE_OUTER   = T.OUTER_BOTTOM - 28;  // outer lane Y  ~505

// ── Start grid positions (facing RIGHT, angle = 0) ────────────────────────────
export const START_POSITIONS = [
  { x: T.START_X - 42,  y: T.LANE_INNER, angle: 0 },  // P1 — pole, inner
  { x: T.START_X - 42,  y: T.LANE_OUTER, angle: 0 },  // P2 — pole, outer
  { x: T.START_X - 92,  y: T.LANE_INNER, angle: 0 },  // P3
  { x: T.START_X - 92,  y: T.LANE_OUTER, angle: 0 },  // P4
  { x: T.START_X - 142, y: T.LANE_INNER, angle: 0 },  // P5
  { x: T.START_X - 142, y: T.LANE_OUTER, angle: 0 },  // P6
];

// ── Checkpoints (line segments, must be crossed in order for a valid lap) ─────
// Each car must cross CP 1→2→3 then START_LINE (CP 0) to complete a lap.
export const CHECKPOINTS = [
  // 0 — Start/finish line (bottom, vertical)
  { x1: T.START_X, y1: T.INNER_BOTTOM, x2: T.START_X, y2: T.OUTER_BOTTOM },
  // 1 — Right side (horizontal, cars going UP)
  { x1: T.CX + T.INNER_A + 20, y1: T.CY - 60, x2: T.CX + T.OUTER_A - 10, y2: T.CY - 60 },
  // 2 — Top (vertical, cars going LEFT)
  { x1: T.CX - 40, y1: T.CY - T.OUTER_B + 10, x2: T.CX - 40, y2: T.CY - T.INNER_B - 10 },
  // 3 — Left side (horizontal, cars going DOWN)
  { x1: T.CX - T.OUTER_A + 10, y1: T.CY + 60, x2: T.CX - T.INNER_A - 20, y2: T.CY + 60 },
];

// ─────────────────────────────────────────────────────────────────────────────
export class Track {
  constructor(scene) {
    this.scene = scene;
    this._render();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  _ellipsePoints(a, b, n = T.N_PTS) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      pts.push({ x: T.CX + Math.cos(t) * a, y: T.CY + Math.sin(t) * b });
    }
    return pts;
  }

  // ── Main render ───────────────────────────────────────────────────────────────
  _render() {
    this._drawGround();
    this._drawOuterDecorations();
    this._drawRoad();
    this._drawCurbs();
    this._drawInnerIsland();
    this._drawCenterLine();
    this._drawGridBoxes();
    this._drawStartFinishLine();
    this._drawCheckpointDebug();   // subtle, can remove later
  }

  // ── Ground / atmosphere ────────────────────────────────────────────────────
  _drawGround() {
    const g = this.scene.add.graphics().setDepth(0);
    // Base grass color
    g.fillStyle(0x7ED957);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Quadriculado gigante de grama (cartoon checkboard)
    g.fillStyle(0x8CE363);
    const sqSide = 80;
    for (let y = 0; y < GAME_HEIGHT; y += sqSide) {
      for (let x = 0; x < GAME_WIDTH; x += sqSide) {
        if ((x / sqSide + y / sqSide) % 2 === 0) {
          g.fillRect(x, y, sqSide, sqSide);
        }
      }
    }
  }

  // ── Outer decorations (grandstands, sponsor banners) ───────────────────────
  _drawOuterDecorations() {
    const g = this.scene.add.graphics().setDepth(1);

    // ── Corner crowd stands (Tendas Flutuantes) ───────────────────────────
    const stands = [
      { x: 50,  y: 120, w: 200, h: 80, color: 0x9D4EDD },  // top-left
      { x: 710, y: 120, w: 200, h: 80, color: 0x4A90E2 },  // top-right
      { x: 50,  y: 430, w: 180, h: 75, color: 0xFF914D },  // bottom-left
      { x: 730, y: 430, w: 180, h: 75, color: 0xFF5A5F },  // bottom-right
    ];
    stands.forEach(s => {
      // Base da tenda
      g.fillStyle(s.color, 1);
      g.fillRoundedRect(s.x, s.y, s.w, s.h, 24);
      g.lineStyle(6, 0xFFFFFF, 0.8);
      g.strokeRoundedRect(s.x, s.y, s.w, s.h, 24);

      // Listras no teto
      g.fillStyle(0xFFFFFF, 0.3);
      for (let px = 20; px < s.w - 10; px += 35) {
        g.fillRoundedRect(s.x + px, s.y + 4, 16, s.h - 8, 8);
      }
    });

    // ── Sponsor signs (funny, child-friendly) ──────────────────────────────
    const signs = [
      { x: 290, y: 55,  text: '🍕 PIZZA TURBO',   bg: 0xFF5A5F },
      { x: 540, y: 55,  text: '🍦 SORVETE VELOZ',  bg: 0x4A90E2 },
      { x: 710, y: 560, text: '⚡ ENERGIA CHICLETE', bg: 0xFFCB2B },
      { x: 130, y: 560, text: '🎮 KART KIDS',      bg: 0x9D4EDD },
    ];
    signs.forEach(s => {
      g.fillStyle(s.bg);
      g.fillRoundedRect(s.x - 4, s.y - 4, 190, 36, 18);
      g.lineStyle(3, 0xFFFFFF, 1);
      g.strokeRoundedRect(s.x - 4, s.y - 4, 190, 36, 18);

      this.scene.add.text(s.x + 91, s.y + 14, s.text, {
        fontFamily: 'Fredoka, sans-serif', fontStyle: '900',
        fontSize: '15px', color: '#ffffff',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(2);
    });

    // ── Trees around track corners (Fluffy Cotton Candy style) ─────────────
    const trees = [
      { x: 48,  y: 310 }, { x: 60,  y: 260 }, { x: 65,  y: 360 },
      { x: 912, y: 310 }, { x: 900, y: 260 }, { x: 905, y: 360 },
      { x: 300, y: 42  }, { x: 380, y: 38  }, { x: 580, y: 38  }, { x: 660, y: 42  },
      { x: 300, y: 592 }, { x: 400, y: 598 }, { x: 560, y: 598 }, { x: 650, y: 592 },
    ];
    trees.forEach(t => {
      // Trunk (gordinho)
      g.fillStyle(0xCC8C3A);
      g.fillRoundedRect(t.x - 4, t.y - 4, 8, 16, 4);
      
      // Canopy (3 bolhas pra dar volume)
      g.fillStyle(0x00A87A);
      g.fillCircle(t.x - 8, t.y - 12, 12);
      g.fillCircle(t.x + 8, t.y - 12, 12);
      g.fillCircle(t.x, t.y - 20, 16);

      // Highlight das folhas
      g.fillStyle(0x00D8A4);
      g.fillCircle(t.x - 4, t.y - 14, 8);
      g.fillCircle(t.x + 4, t.y - 14, 8);
      g.fillCircle(t.x, t.y - 22, 10);
    });
  }

  // ── Road surface ───────────────────────────────────────────────────────────
  _drawRoad() {
    const g = this.scene.add.graphics().setDepth(3);
    const outer = this._ellipsePoints(T.OUTER_A, T.OUTER_B);
    const inner = this._ellipsePoints(T.INNER_A, T.INNER_B);

    // Asfalto principal (tom azulado e cartoon)
    g.fillStyle(0x566075);
    g.fillPoints(outer, true);

    // Marcas de asfalto clarinho (bolinhas de textura)
    g.fillStyle(0x6A758B, 0.4);
    for (let i = 0; i < T.N_PTS; i += 4) {
      const t1 = (i / T.N_PTS) * Math.PI * 2;
      const medA = (T.OUTER_A + T.INNER_A) / 2 + Phaser.Math.Between(-20, 20);
      const medB = (T.OUTER_B + T.INNER_B) / 2 + Phaser.Math.Between(-20, 20);
      const mx   = T.CX + Math.cos(t1) * medA;
      const my   = T.CY + Math.sin(t1) * medB;
      g.fillCircle(mx, my, Phaser.Math.Between(4, 12));
    }

    // Cut out inner island with grass (checkered background takes over basically, we just clear but we need same exact grass there)
    // To match the background checker exactly, we can use a mask, or just redraw simple green since it's the island
    g.fillStyle(0x7ED957);
    g.fillPoints(inner, true);
  }

  // ── Kerbs (curbs) — alternating red/white stripes on edges ────────────────
  _drawCurbs() {
    const g = this.scene.add.graphics().setDepth(4);
    const outerPts = this._ellipsePoints(T.OUTER_A, T.OUTER_B);
    const innerPts = this._ellipsePoints(T.INNER_A, T.INNER_B);

    this._drawKerb(g, outerPts, 10, true);
    this._drawKerb(g, innerPts, 8, false);
  }

  _drawKerb(g, pts, w, isOuter) {
    const n   = pts.length;
    const dir = isOuter ? 1 : -1;

    for (let i = 0; i < n; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) continue;

      const nx = (-dy / len) * dir;
      const ny = (dx  / len) * dir;

      // Vibrantes kerbs brancos e azuis em vez de vermelho e branco para parecer jogo candy
      const color = (Math.floor(i / 2) % 2 === 0) ? 0xFF5A5F : 0xFFFFFF;
      g.fillStyle(color);
      g.fillPoints([
        { x: p1.x,          y: p1.y },
        { x: p2.x,          y: p2.y },
        { x: p2.x + nx * w, y: p2.y + ny * w },
        { x: p1.x + nx * w, y: p1.y + ny * w },
      ], true);
    }
  }

  // ── Inner island (grass + decorations) ────────────────────────────────────
  _drawInnerIsland() {
    const g = this.scene.add.graphics().setDepth(5);

    // Brighter green for island
    const inner = this._ellipsePoints(T.INNER_A - 6, T.INNER_B - 6);
    g.fillStyle(0x8CE363);
    g.fillPoints(inner, true);

    // Subtle darker edge
    const edge = this._ellipsePoints(T.INNER_A - 2, T.INNER_B - 2, 48);
    g.lineStyle(6, 0x00A87A, 1);
    g.strokePoints(edge, true);

    // Inner island details — tire walls (Bolhas infláveis protetoras)
    const tireWalls = [
      { x: T.CX + 10, y: T.CY - 60, w: 90, h: 22 },
      { x: T.CX - 70, y: T.CY + 50, w: 90, h: 22 },
    ];
    tireWalls.forEach(t => {
      g.fillStyle(0x4A90E2, 1);
      g.fillRoundedRect(t.x - t.w / 2, t.y - t.h / 2, t.w, t.h, 11);
      g.lineStyle(4, 0xFFFFFF, 0.6);
      g.strokeRoundedRect(t.x - t.w / 2, t.y - t.h / 2, t.w, t.h, 11);
      // Highlights das bolhas azuis
      for (let i = 0; i < 4; i++) {
        g.fillStyle(0xFFFFFF, 0.4);
        g.fillCircle(t.x - t.w / 2 + 14 + i * (t.w / 4), t.y - 2, 4);
      }
    });

    // Pit lane building mock (Oficina Gordinha)
    g.fillStyle(0xFFCB2B, 1);
    g.fillRoundedRect(T.CX - 80, T.CY - 20, 160, 48, 16);
    g.lineStyle(4, 0xFFFFFF, 1);
    g.strokeRoundedRect(T.CX - 80, T.CY - 20, 160, 48, 16);
    // Janelas azuis
    g.fillStyle(0x4A90E2, 0.8);
    g.fillRoundedRect(T.CX - 60, T.CY - 5, 40, 20, 8);
    g.fillRoundedRect(T.CX + 20, T.CY - 5, 40, 20, 8);

    this.scene.add.text(T.CX, T.CY - 24, '🔧 PIT STOP', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: '900',
      fontSize: '20px', color: '#111111',
      stroke: '#FFFFFF', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(6);
  }

  // ── Dashed center line ─────────────────────────────────────────────────────
  _drawCenterLine() {
    const g = this.scene.add.graphics().setDepth(6);
    const medA = (T.OUTER_A + T.INNER_A) / 2;
    const medB = (T.OUTER_B + T.INNER_B) / 2;
    const n = 80;

    g.lineStyle(8, 0xFFFFFF, 0.6);
    for (let i = 0; i < n; i += 2) {
      const t1 = (i / n) * Math.PI * 2;
      const t2 = ((i + 0.8) / n) * Math.PI * 2;
      g.strokeLineShape(new Phaser.Geom.Line(
        T.CX + Math.cos(t1) * medA, T.CY + Math.sin(t1) * medB,
        T.CX + Math.cos(t2) * medA, T.CY + Math.sin(t2) * medB,
      ));
    }
  }

  // ── Grid position boxes ────────────────────────────────────────────────────
  _drawGridBoxes() {
    const g = this.scene.add.graphics().setDepth(7);

    START_POSITIONS.forEach((pos, i) => {
      g.fillStyle(0xFFFFFF, 0.2);
      g.fillRoundedRect(pos.x - 22, pos.y - 14, 44, 28, 8);
      g.lineStyle(3, 0x00D8A4, 0.8);
      g.strokeRoundedRect(pos.x - 22, pos.y - 14, 44, 28, 8);
      
      // Grid number
      this.scene.add.text(pos.x + 2, pos.y, String(i + 1), {
        fontFamily: 'Fredoka, sans-serif', fontStyle: '900',
        fontSize: '20px', color: '#00D8A4',
        alpha: 0.9,
      }).setOrigin(0.5).setDepth(7).setAngle(-10);
    });
  }

  // ── Start / Finish line ────────────────────────────────────────────────────
  _drawStartFinishLine() {
    const g = this.scene.add.graphics().setDepth(8);

    const x     = T.START_X;
    const yTop  = T.INNER_BOTTOM;
    const yBot  = T.OUTER_BOTTOM;
    const sqH   = 14;
    const sqW   = 10;
    const rows  = Math.ceil((yBot - yTop) / sqH);

    // Checkered flag pattern
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < 3; col++) {
        const dark = (row + col) % 2 === 0;
        g.fillStyle(dark ? 0x000000 : 0xffffff, 0.9);
        g.fillRect(x - sqW + col * sqW, yTop + row * sqH, sqW, sqH);
      }
    }

    // Overhead gantry beam (Mufa vibrante)
    g.fillStyle(0x00D8A4, 1);
    g.fillRoundedRect(x - 14, yTop - 34, 28, 16, 8);
    g.lineStyle(3, 0xFFFFFF, 1);
    g.strokeRoundedRect(x - 14, yTop - 34, 28, 16, 8);

    // "LARGADA" text above line
    this.scene.add.text(x + 24, yTop - 30, '🏁 LARGADA / CHEGADA', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: '900',
      fontSize: '22px', color: '#FFCB2B',
      stroke: '#FF5A5F', strokeThickness: 5,
    }).setOrigin(0, 0.5).setDepth(9);
  }

  // ── Checkpoint indicators (subtle, for debugging — can toggle off) ─────────
  _drawCheckpointDebug() {
    if (import.meta.env?.DEV !== true) return;  // only in dev
    const g = this.scene.add.graphics().setDepth(2);
    g.lineStyle(2, 0x00ffff, 0.25);
    CHECKPOINTS.forEach(cp => {
      g.strokeLineShape(new Phaser.Geom.Line(cp.x1, cp.y1, cp.x2, cp.y2));
    });
  }
}
