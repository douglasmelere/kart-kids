// ─── Kart ──────────────────────────────────────────────────────────────────────
// Top-down kart visual using a Graphics container.
// Angle 0 = facing RIGHT. The rotating container holds only the car body;
// the name tag and local-player marker are separate non-rotating objects.
// ─────────────────────────────────────────────────────────────────────────────
import { KART_COLORS } from '../config/constants.js';

const BODY_W  = 34;   // comprimento
const BODY_H  = 22;   // largura
const WHEEL_L = 14;   // comprimento da roda
const WHEEL_W = 8;    // largura da roda
const EMOJIS  = ['🏎️', '🚜', '🚓', '🚕', '🚙', '🚌', '🚒', '🚚'];

export class Kart {
  constructor(scene, { x, y, angle, colorIndex, name, isLocal }) {
    this.scene      = scene;
    this.x          = x;
    this.y          = y;
    this.colorIndex = colorIndex;
    this.color      = KART_COLORS[colorIndex % KART_COLORS.length];
    this.name       = name;
    this.isLocal    = isLocal;

    this._buildBody();
    this._buildLabel();
    if (isLocal) this._buildMarker();
  }

  // ── Kart body (rotating container + Graphics) ──────────────────────────────
  _buildBody() {
    this.container = this.scene.add.container(this.x, this.y);
    this.container.setAngle(this.angle ?? 0);
    this.container.setDepth(20);

    const g = this.scene.add.graphics();

    // Drop shadow redondo
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(-BODY_W / 2 - 2, -BODY_H / 2 + 8, BODY_W + 4, BODY_H + 4, 12);

    // ── Grossas Rodas ────────────────────────────────────────────────────────
    g.fillStyle(0x1B1B1B);
    const wy = BODY_H / 2 + 2;
    // Frontais
    g.fillRoundedRect(BODY_W / 2 - 14, -wy - WHEEL_W + 4, WHEEL_L, WHEEL_W, 4);
    g.fillRoundedRect(BODY_W / 2 - 14,  wy - 4,           WHEEL_L, WHEEL_W, 4);
    // Traseiras
    g.fillRoundedRect(-BODY_W / 2 - 2, -wy - WHEEL_W + 4, WHEEL_L + 2, WHEEL_W + 2, 5);
    g.fillRoundedRect(-BODY_W / 2 - 2,  wy - 4,           WHEEL_L + 2, WHEEL_W + 2, 5);

    // Aros dourados nas traseiras e pratas nas frontais
    g.fillStyle(0xDDDDDD);
    g.fillCircle(BODY_W / 2 - 7, -wy + 4, 2);
    g.fillCircle(BODY_W / 2 - 7,  wy, 2);
    g.fillStyle(0xFFCB2B);
    g.fillCircle(-BODY_W / 2 + 5, -wy + 3, 3);
    g.fillCircle(-BODY_W / 2 + 5,  wy + 1, 3);

    // ── Eixos (Suspensão) ────────────────────────────────────────────────────
    g.fillStyle(0x444444);
    g.fillRect(-BODY_W / 2 + 3, -wy + 2, 4, BODY_H); 
    g.fillRect(BODY_W / 2 - 10, -wy + 2, 2, BODY_H);

    // ── Aerofólio (Spoiler traseiro) gordinho ───────────────────────────────
    g.fillStyle(0x222222);
    g.fillRoundedRect(-BODY_W / 2 - 6, -BODY_H / 2 + 2, 8, BODY_H - 4, 4);
    g.fillStyle(this.color);
    g.fillRoundedRect(-BODY_W / 2 - 8, -BODY_H / 2 - 2, 6, BODY_H + 4, 3);
    
    // ── Carroceria Oval ──────────────────────────────────────────────────────
    g.fillStyle(this.color);
    g.fillRoundedRect(-BODY_W / 2, -BODY_H / 2, BODY_W, BODY_H, 10);

    // Destaque brilhante em cima (Glossy highlight)
    const hColor = Phaser.Display.Color.IntegerToColor(this.color);
    hColor.lighten(30);
    g.fillStyle(hColor.color, 0.6);
    g.fillRoundedRect(-BODY_W / 2 + 4, -BODY_H / 2 + 2, BODY_W - 8, BODY_H / 2 - 2, 6);

    // ── Para-brisa (Cockpit redondinho) ──────────────────────────────────────
    g.fillStyle(0x222222, 0.9);
    g.fillRoundedRect(-4, -BODY_H / 2 + 3, 14, BODY_H - 6, 4);
    g.fillStyle(0x88CCFF, 0.85);
    g.fillRoundedRect(-2, -BODY_H / 2 + 4, 10, BODY_H - 8, 3);

    // ── Para-choque frontal gordinho ─────────────────────────────────────────
    g.fillStyle(0xEEEEEE);
    g.fillRoundedRect(BODY_W / 2 - 4, -BODY_H / 2 + 2, 6, BODY_H - 4, 3);

    // ── Faróis Frontais (Grandes) ────────────────────────────────────────────
    g.fillStyle(0xFFFFFF);
    g.fillCircle(BODY_W / 2, -BODY_H / 2 + 5, 3.5);
    g.fillCircle(BODY_W / 2,  BODY_H / 2 - 5, 3.5);
    g.fillStyle(0xFFEA00); // Lâmpada
    g.fillCircle(BODY_W / 2 + 1, -BODY_H / 2 + 5, 2);
    g.fillCircle(BODY_W / 2 + 1,  BODY_H / 2 - 5, 2);

    // ── Lanternas Traseiras ──────────────────────────────────────────────────
    g.fillStyle(0xFF2233);
    g.fillCircle(-BODY_W / 2 + 2, -BODY_H / 2 + 4, 2.5);
    g.fillCircle(-BODY_W / 2 + 2,  BODY_H / 2 - 4, 2.5);

    // ── Racing number ─────────────────────────────────────────────────────────
    // (added as separate text object inside container so it scales with it)
    const numBg = this.scene.add.graphics();
    numBg.fillStyle(0xffffff, 0.9);
    numBg.fillRoundedRect(-6, -5, 11, 10, 2);
    this.container.add([g, numBg]);

    this._numText = this.scene.add.text(0, 0, EMOJIS[this.colorIndex % EMOJIS.length], {
      fontSize: '18px',
    }).setOrigin(0.5).setAngle(90); // Roda o emoji para apontar para "frente"
    this.container.add(this._numText);
  }

  // ── Player name tag (doesn't rotate) ──────────────────────────────────────
  _buildLabel() {
    this._label = this.scene.add.text(this.x, this.y + 26, this.name, {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold',
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 5,
    }).setOrigin(0.5, 0).setDepth(21);
  }

  // ── Local player arrow (offset bounce using scene update callback) ──────────
  _buildMarker() {
    this._marker = this.scene.add.text(this.x, this.y - 32, '👇', {
      fontSize: '22px',
    }).setOrigin(0.5).setDepth(22);

    // Store bounce phase; updated in the scene's update via a recurring timer
    this._markerPhase = 0;
    this._markerTimer = this.scene.time.addEvent({
      delay: 16, loop: true,
      callback: () => {
        if (!this._marker?.active) return;
        this._markerPhase = (this._markerPhase + 0.08) % (Math.PI * 2);
        const offset = Math.sin(this._markerPhase) * 6;
        this._marker.setPosition(this.x, this.y - 34 + offset);
      },
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  moveTo(x, y, angle) {
    this.x = x;
    this.y = y;
    this.container.setPosition(x, y);
    this.container.setAngle(angle);
    this._label.setPosition(x, y + 26);
    if (this._marker) {
      this._marker.setPosition(x, y - 34);
    }
  }

  // One-shot explode effect for wall bounce (Passo 4)
  bounce() {
    this.scene.tweens.add({
      targets: this.container,
      scaleX: 1.3, scaleY: 0.7,
      duration: 80,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  destroy() {
    this._markerTimer?.remove();
    this.container.destroy();
    this._label?.destroy();
    this._marker?.destroy();
  }
}
