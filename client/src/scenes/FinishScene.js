// ─── FinishScene ──────────────────────────────────────────────────────────────
// Tela pós-corrida: celebração animada, resultados da sala e top-5 global.
// ─────────────────────────────────────────────────────────────────────────────
import { GAME_WIDTH, GAME_HEIGHT } from '../config/constants.js';
import { SERVER_URL }              from '../config/constants.js';

const MEDALS  = ['🥇', '🥈', '🥉'];
const PLACES  = ['1°', '2°', '3°', '4°', '5°', '6°'];
const PALETTE = [0xff4757, 0x2ed573, 0x1e90ff, 0xffa502, 0xa29bfe, 0xffd700, 0xfd79a8, 0xffffff];

export class FinishScene extends Phaser.Scene {
  constructor() { super('FinishScene'); }

  // data: { myName, mySocketId, myTotalTime, myBestLap, myLapTimes, finishers, roomData }
  init(data) { this._data = data; }

  create() {
    this._drawBackground();
    this._spawnConfetti();
    this._drawTitle();
    this._drawRaceResults();
    this._drawLapBreakdown();
    this._drawLeaderboard();   // async fetch
    this._drawButtons();
  }

  // ── Background ─────────────────────────────────────────────────────────────
  _drawBackground() {
    const g = this.add.graphics();
    g.fillGradientStyle(0x0f0c29, 0x0f0c29, 0x302b63, 0x24243e, 1);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }

  // ── Confetti ───────────────────────────────────────────────────────────────
  _spawnConfetti() {
    const isWinner = this._getMyPosition() === 0;
    const count    = isWinner ? 80 : 40;

    for (let i = 0; i < count; i++) {
      const x     = Phaser.Math.Between(0, GAME_WIDTH);
      const color = Phaser.Utils.Array.GetRandom(PALETTE);
      const w     = Phaser.Math.Between(6, 14);
      const h     = Phaser.Math.Between(6, 14);
      const conf  = this.add.rectangle(x, -10, w, h, color).setDepth(1);

      this.tweens.add({
        targets:  conf,
        y:        GAME_HEIGHT + 20,
        x:        x + Phaser.Math.Between(-80, 80),
        angle:    Phaser.Math.Between(-720, 720),
        duration: Phaser.Math.Between(1600, 3500),
        delay:    Phaser.Math.Between(0, 1200),
        ease:     'Quad.easeIn',
        onComplete: () => conf.destroy(),
      });
    }

    // Repeat confetti wave
    this.time.delayedCall(3200, () => {
      if (!this.scene.isActive('FinishScene')) return;
      this._spawnConfetti();
    });
  }

  // ── Title ──────────────────────────────────────────────────────────────────
  _drawTitle() {
    const pos  = this._getMyPosition();
    const msgs = ['🏆 VOCÊ VENCEU!', '🎉 MUITO BOM!', '👏 BOM TRABALHO!', '✅ FIM DE CORRIDA!'];
    const cols = ['#FFD700', '#C0C0C0', '#CD7F32', '#74b9ff'];
    const msg  = msgs[Math.min(pos, msgs.length - 1)];
    const col  = cols[Math.min(pos, cols.length - 1)];

    const title = this.add.text(GAME_WIDTH / 2, 60, msg, {
      fontFamily: 'Fredoka, sans-serif', fontStyle: '900',
      fontSize: '56px', color: col,
      stroke: '#FFFFFF', strokeThickness: 10,
    }).setOrigin(0.5).setDepth(5).setScale(0.1).setAlpha(0);

    this.tweens.add({
      targets: title, alpha: 1, scaleX: 1, scaleY: 1,
      duration: 500, ease: 'Back.easeOut',
    });

    // Sub-title: your final position
    const placeLabel = MEDALS[pos] ?? `${PLACES[pos]} lugar`;
    this.add.text(GAME_WIDTH / 2, 110, `Você terminou em ${placeLabel}`, {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold',
      fontSize: '24px', color: '#FFFFFF',
    }).setOrigin(0.5).setDepth(5);
  }

  // ── Race results (this room's finishers) ───────────────────────────────────
  _drawRaceResults() {
    const finishers = this._data.finishers ?? [];
    const startY    = 130;
    const cardW     = 440;
    const cx        = GAME_WIDTH / 2;

    this.add.text(cx, startY, '⏱ Resultados da Corrida', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold',
      fontSize: '20px', color: '#00D8A4',
    }).setOrigin(0.5).setDepth(5);

    finishers.forEach((f, i) => {
      const y     = startY + 28 + i * 40;
      const isMe  = f.socketId === this._data.mySocketId;
      const medal = MEDALS[i] ?? PLACES[i];
      const color = isMe ? 0xffd700 : 0x2d3436;
      const alpha = isMe ? 0.35 : 0.18;

      const bg = this.add.graphics().setDepth(4);
      bg.fillStyle(color, alpha);
      bg.fillRoundedRect(cx - cardW / 2, y - 14, cardW, 34, 8);
      if (isMe) {
        bg.lineStyle(1.5, 0xffd700, 0.6);
        bg.strokeRoundedRect(cx - cardW / 2, y - 14, cardW, 34, 8);
      }

      this.add.text(cx - cardW / 2 + 16, y + 3, `${medal}  ${f.name}`, {
        fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold',
        fontSize: '20px', color: isMe ? '#FFD700' : '#ffffff',
      }).setOrigin(0, 0.5).setDepth(5);

      this.add.text(cx + cardW / 2 - 12, y + 3, this._fmt(f.totalTime), {
        fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold',
        fontSize: '20px', color: isMe ? '#FFCB2B' : '#dfe6e9',
      }).setOrigin(1, 0.5).setDepth(5);
    });
  }

  // ── My lap times breakdown ─────────────────────────────────────────────────
  _drawLapBreakdown() {
    const lapTimes = this._data.myLapTimes ?? [];
    const bestLap  = this._data.myBestLap;
    const baseY    = 130 + 28 + Math.max((this._data.finishers?.length ?? 0), 1) * 40 + 18;

    const bg = this.add.graphics().setDepth(4);
    bg.fillStyle(0x000000, 0.3);
    bg.fillRoundedRect(GAME_WIDTH / 2 - 220, baseY, 440, 52, 10);

    this.add.text(GAME_WIDTH / 2, baseY + 11, `Melhor volta: ${this._fmt(bestLap)}`, {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold',
      fontSize: '16px', color: '#00D8A4',
    }).setOrigin(0.5).setDepth(5);

    const lapStr = lapTimes.map((t, i) => `V${i + 1}: ${this._fmt(t)}`).join('   ');
    this.add.text(GAME_WIDTH / 2, baseY + 33, lapStr, {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold', fontSize: '15px', color: '#b2bec3',
    }).setOrigin(0.5).setDepth(5);
  }

  // ── Global Leaderboard (REST fetch) ───────────────────────────────────────
  async _drawLeaderboard() {
    const titleY = 370;
    this.add.text(GAME_WIDTH / 2, titleY, '🌍 TOP 5 RANKING GLOBAL', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold',
      fontSize: '18px', color: '#FFCB2B',
    }).setOrigin(0.5).setDepth(5);

    let entries = [];
    try {
      const res = await fetch(`${SERVER_URL}/leaderboard?track=main`);
      entries   = await res.json();
    } catch {
      this.add.text(GAME_WIDTH / 2, titleY + 30, 'Não foi possível carregar o ranking.', {
        fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold', fontSize: '16px', color: '#FF5A5F',
      }).setOrigin(0.5).setDepth(5);
      return;
    }

    const top5 = entries.slice(0, 5);
    if (top5.length === 0) {
      this.add.text(GAME_WIDTH / 2, titleY + 34, 'Ainda sem registros!', {
        fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold', fontSize: '16px', color: '#636e72',
      }).setOrigin(0.5).setDepth(5);
      return;
    }

    top5.forEach((entry, i) => {
      const y     = titleY + 28 + i * 36;
      const medal = MEDALS[i] ?? `${i + 1}.`;
      const isMe  = entry.player_name === this._data.myName;

      const bg = this.add.graphics().setDepth(4);
      bg.fillStyle(isMe ? 0xffd700 : 0xffffff, isMe ? 0.12 : 0.05);
      bg.fillRoundedRect(GAME_WIDTH / 2 - 200, y - 12, 400, 28, 6);

      this.add.text(GAME_WIDTH / 2 - 186, y + 2,
        `${medal}  ${entry.player_name}`, {
          fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold',
          fontSize: '16px', color: isMe ? '#FFD700' : '#dfe6e9',
        }).setOrigin(0, 0.5).setDepth(5);

      this.add.text(GAME_WIDTH / 2 + 190, y + 2,
        this._fmt(entry.total_time), {
          fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold',
          fontSize: '16px', color: isMe ? '#FFCB2B' : '#b2bec3',
        }).setOrigin(1, 0.5).setDepth(5);
    });
  }

  // ── Buttons ────────────────────────────────────────────────────────────────
  _drawButtons() {
    const cy = GAME_HEIGHT - 44;

    this._makeButton(GAME_WIDTH / 2 - 150, cy, '🏎️ Jogar Novamente', 0xFF5A5F, 0xFF7B7F, 0xC93A3F, () => {
      this.scene.start('MenuScene');
    });

    this._makeButton(GAME_WIDTH / 2 + 150, cy, '🏆 Ver Ranking Global', 0xFFCB2B, 0xFFD95A, 0xD9A41C, () => {
      this.scene.start('LeaderboardScene');
    });
  }

  _makeButton(cx, cy, label, color, hover, shadowColor, action) {
    const W = 280, H = 58, R = 24;
    const c = this.add.container(cx, cy).setDepth(6);
    const visuals = this.add.container(0, 0); // New subcontainer
    const bgShadow = this.add.graphics();
    const bg = this.add.graphics();

    const draw = (col, isDown = false) => {
      bgShadow.clear();
      bgShadow.fillStyle(shadowColor, 1);
      bgShadow.fillRoundedRect(-W / 2, -H / 2 + 6, W, H, R); 
      
      bg.clear();
      bg.fillStyle(col, 1);
      const oy = isDown ? 4 : 0;
      bg.fillRoundedRect(-W / 2, -H / 2 + oy, W, H, R);
      bg.lineStyle(4, 0xffffff, 0.5);
      bg.strokeRoundedRect(-W / 2, -H / 2 + oy, W, H, R);
    };
    draw(color);

    const txt = this.add.text(0, -2, label, {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold',
      fontSize: '22px', color: '#ffffff',
      stroke: shadowColor.toString(16).replace('0x', '#'), strokeThickness: 4,
    }).setOrigin(0.5);

    visuals.add([bgShadow, bg, txt]); // Add to visuals

    const hit = this.add.rectangle(0, 0, W, H + 8, 0, 0)
      .setInteractive({ useHandCursor: true });

    c.add([visuals, hit]);

    hit.on('pointerover', () => { draw(hover); this.tweens.add({ targets: visuals, scaleX: 1.05, scaleY: 1.05, duration: 150, ease: 'Back.easeOut' }); });
    hit.on('pointerout',  () => { draw(color); this.tweens.add({ targets: visuals, scaleX: 1, scaleY: 1, duration: 100 }); });
    hit.on('pointerdown', () => {
      draw(hover, true);
      txt.setY(2);
      this.tweens.add({ targets: visuals, scaleX: 0.95, scaleY: 0.95, duration: 60, yoyo: true, onComplete: () => {
        draw(hover, false);
        txt.setY(-2);
        action();
      }});
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  _getMyPosition() {
    const fin = this._data.finishers ?? [];
    const idx = fin.findIndex(f => f.socketId === this._data.mySocketId);
    return idx >= 0 ? idx : fin.length;
  }

  _fmt(s) {
    if (!s || !isFinite(s)) return '--:--.--';
    const min  = Math.floor(s / 60);
    const sec  = Math.floor(s % 60);
    const cent = Math.floor((s % 1) * 100);
    return `${min}:${String(sec).padStart(2, '0')}.${String(cent).padStart(2, '0')}`;
  }
}
