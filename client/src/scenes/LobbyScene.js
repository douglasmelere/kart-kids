// ─── LobbyScene ───────────────────────────────────────────────────────────────
// Sala de espera: mostra jogadores conectados, código da sala e countdown.
// ─────────────────────────────────────────────────────────────────────────────
import { GAME_WIDTH, GAME_HEIGHT, KART_COLORS } from '../config/constants.js';
import { socketManager } from '../network/SocketManager.js';

const KART_EMOJIS = ['🔴','🟢','🔵','🟠','🟣','🩷'];

export class LobbyScene extends Phaser.Scene {
  constructor() {
    super('LobbyScene');
    this._onPlayersUpdated = null;
    this._onCountdown      = null;
    this._onStarting       = null;
    this._onDisconnect     = null;
  }

  init(data) {
    this.roomData = data; // { roomId, roomCode, isPrivate, players, isHost }
  }

  create() {
    this._selectedDifficulty = 'medio';
    this._diffGfxRefs        = [];   // redraw callbacks for difficulty buttons

    this._drawBackground();
    this._drawHeader();
    this._drawRoomInfo();
    this._drawLeaveButton();

    this._playerListContainer = this.add.container(0, 0);
    this._updatePlayerList(this.roomData.players ?? []);

    this._drawStartArea();
    this._listenSocketEvents();
  }

  // ── Background ─────────────────────────────────────────────────────────────
  _drawBackground() {
    const gfx = this.add.graphics();
    // Fundo lúdico gradiente (Azul para Roxo)
    gfx.fillGradientStyle(0x4A90E2, 0x4A90E2, 0x8E54E9, 0x8E54E9, 1);
    gfx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Animated racing flags deco / nuvens
    for (let i = 0; i < 8; i++) {
      const flag = this.add.text(
        Phaser.Math.Between(40, GAME_WIDTH - 40),
        Phaser.Math.Between(60, GAME_HEIGHT - 60),
        '☁️', { fontSize: `${Phaser.Math.Between(24, 48)}px` }
      ).setAlpha(0.2);
      this.tweens.add({
        targets: flag, x: flag.x + Phaser.Math.Between(40, 100),
        duration: Phaser.Math.Between(4000, 8000),
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }
  }

  // ── Header ─────────────────────────────────────────────────────────────────
  _drawHeader() {
    const header = this.add.text(GAME_WIDTH / 2, 54, '🏁 SALA DE ESPERA', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: '900',
      fontSize: '42px', color: '#FFCB2B',
      stroke: '#FF5A5F', strokeThickness: 8,
    }).setOrigin(0.5);

    this.tweens.add({
      targets: header, scaleX: 1.05, scaleY: 1.05, angle: {from: -1, to: 1},
      duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  // ── Room info (code + player count) ────────────────────────────────────────
  _drawRoomInfo() {
    const isPrivate = this.roomData.isPrivate;
    const code      = this.roomData.roomCode;

    if (isPrivate && code) {
      // Big copyable code box
      this.add.text(GAME_WIDTH / 2, 105, 'Código da Sala:', {
        fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold', fontSize: '18px', color: '#FFFFFF',
        stroke: '#4A90E2', strokeThickness: 4,
      }).setOrigin(0.5);

      const codeBg = this.add.graphics();
      codeBg.fillStyle(0xFFFFFF, 0.9);
      codeBg.fillRoundedRect(GAME_WIDTH / 2 - 90, 118, 180, 52, 20);
      codeBg.lineStyle(4, 0x00D8A4, 1);
      codeBg.strokeRoundedRect(GAME_WIDTH / 2 - 90, 118, 180, 52, 20);

      const codeText = this.add.text(GAME_WIDTH / 2, 144, code, {
        fontFamily: 'Fredoka, sans-serif', fontStyle: '900',
        fontSize: '36px', color: '#FF5A5F', letterSpacing: 8,
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      // Pulse the code
      this.tweens.add({
        targets: codeText, scaleX: 1.05, scaleY: 1.05,
        duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });

      this.add.text(GAME_WIDTH / 2, 184, '👆 Compartilhe com os amigos!', {
        fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold', fontSize: '15px', color: '#FFCB2B',
        stroke: '#C93A3F', strokeThickness: 4,
      }).setOrigin(0.5);
    } else {
      this.add.text(GAME_WIDTH / 2, 115, '🌐 Sala Pública', {
        fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold',
        fontSize: '26px', color: '#00D8A4',
        stroke: '#00A87A', strokeThickness: 5,
      }).setOrigin(0.5);
      this.add.text(GAME_WIDTH / 2, 145, 'Qualquer jogador pode entrar', {
        fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold', fontSize: '16px', color: '#FFFFFF',
      }).setOrigin(0.5);
    }
  }

  // ── Leave button ───────────────────────────────────────────────────────────
  _drawLeaveButton() {
    const visual = this.add.container(70, 42).setDepth(10);
    const btnBox = this.add.graphics();
    const btn = this.add.text(0, 0, '← Sair', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold',
      fontSize: '20px', color: '#FFFFFF',
    }).setOrigin(0.5);

    visual.add([btnBox, btn]);

    const drawBg = (color, stroke) => {
      btnBox.clear();
      btnBox.fillStyle(color, 1).fillRoundedRect(-50, -22, 100, 44, 16);
      btnBox.lineStyle(3, 0xFFFFFF, stroke).strokeRoundedRect(-50, -22, 100, 44, 16);
    };
    drawBg(0xFF5A5F, 0.4);

    const hit = this.add.rectangle(70, 42, 100, 44, 0, 0).setInteractive({ useHandCursor: true }).setDepth(11);

    hit.on('pointerover', () => { 
      drawBg(0xFF7B7F, 0.8); 
      this.tweens.add({ targets: visual, scaleX: 1.05, scaleY: 1.05, duration: 100 });
    });
    hit.on('pointerout',  () => { 
      drawBg(0xFF5A5F, 0.4); 
      this.tweens.add({ targets: visual, scaleX: 1, scaleY: 1, duration: 100 });
    });
    hit.on('pointerdown', () => {
      drawBg(0xFF7B7F, 0.8);
      this.tweens.add({ targets: visual, scaleX: 0.9, scaleY: 0.9, duration: 80, yoyo: true });
      
      this.time.delayedCall(100, () => {
        socketManager.emit('room:leave');
        this.scene.start('MenuScene');
      });
    });
  }

  // ── Player list ─────────────────────────────────────────────────────────────
  _updatePlayerList(players) {
    this._playerListContainer.removeAll(true);

    const labelY  = 205;
    const startY  = 240;
    const rowH    = 68;
    const cx      = GAME_WIDTH / 2;
    const rowW    = 540;

    // Section header
    const header = this.add.text(cx, labelY,
      `Jogadores na sala (${players.length}/6)`, {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold',
      fontSize: '18px', color: '#FFFFFF',
    }).setOrigin(0.5);
    this._playerListContainer.add(header);

    players.forEach((p, i) => {
      const y     = startY + i * rowH;
      const color = KART_COLORS[i % KART_COLORS.length];
      const emoji = KART_EMOJIS[i % KART_EMOJIS.length];

      // Row bg "bubble"
      const rowBg = this.add.graphics();
      rowBg.fillStyle(0xFFFFFF, 0.95);
      rowBg.fillRoundedRect(cx - rowW / 2, y - 26, rowW, 58, 24);
      rowBg.lineStyle(5, color, 1);
      rowBg.strokeRoundedRect(cx - rowW / 2, y - 26, rowW, 58, 24);

      // Kart emoji + color dot
      const dot  = this.add.circle(cx - rowW / 2 + 34, y + 3, 20, color);
      const icon = this.add.text(cx - rowW / 2 + 34, y + 3, emoji, {
        fontSize: '22px',
      }).setOrigin(0.5);

      const nameText = this.add.text(cx - rowW / 2 + 68, y - 10, p.name, {
        fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold',
        fontSize: '26px', color: '#333333',
      });

      // Ping badge (placeholder)
      const pingBadge = this.add.text(cx + rowW / 2 - 20, y + 3, '●', {
        fontSize: '16px', color: '#00D8A4',
      }).setOrigin(1, 0.5);

      const badge = p.isHost
        ? this.add.text(cx + 60, y + 2, '👑 HOST', {
            fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold',
            fontSize: '18px', color: '#FFCB2B',
            stroke: '#C93A3F', strokeThickness: 3,
          }).setOrigin(0, 0.5)
        : this.add.text(cx + 60, y + 2, '✓ Pronto', {
            fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold', fontSize: '18px', color: '#00D8A4',
          }).setOrigin(0, 0.5);

      this._playerListContainer.add([rowBg, dot, icon, nameText, badge, pingBadge]);
    });

    // Empty slots
    const emptySlots = Math.max(0, 2 - players.length);
    for (let i = 0; i < emptySlots; i++) {
      const y = startY + (players.length + i) * rowH;
      const rowBg = this.add.graphics();
      rowBg.fillStyle(0xFFFFFF, 0.2);
      rowBg.fillRoundedRect(cx - rowW / 2, y - 26, rowW, 58, 24);
      rowBg.lineStyle(3, 0xFFFFFF, 0.4);
      rowBg.strokeRoundedRect(cx - rowW / 2, y - 26, rowW, 58, 24);

      const waiting = this.add.text(cx, y + 3, '🕐 Aguardando jogador...', {
        fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold', fontSize: '18px', color: '#FFFFFF',
      }).setOrigin(0.5);

      this._playerListContainer.add([rowBg, waiting]);
    }

    // Update start button state
    this._refreshStartButton(players);
  }

  // ── Start area (host button or waiting text) ────────────────────────────────
  _drawStartArea() {
    this._startAreaContainer = this.add.container(0, 0);
    this._refreshStartButton(this.roomData.players ?? []);

    if (this.roomData.isHost) {
      this._drawDifficultySelector();
    }
  }

  // ── Difficulty selector (host only, drawn once and updates in-place) ─────────
  _drawDifficultySelector() {
    const cx    = GAME_WIDTH / 2;
    const baseY = GAME_HEIGHT - 205;  // above the start button

    const diffs = [
      { key: 'facil',   label: '😄 Fácil',   color: 0x00D8A4, shadow: 0x00A87A },
      { key: 'medio',   label: '😤 Médio',   color: 0xFFCB2B, shadow: 0xD9A41C },
      { key: 'dificil', label: '😈 Difícil', color: 0xFF5A5F, shadow: 0xC93A3F },
    ];

    this.add.text(cx, baseY, '🤖 Nível do Bot:', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold',
      fontSize: '17px', color: '#FFFFFF',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);

    diffs.forEach((d, i) => {
      const bx = cx - 168 + i * 168;
      const by = baseY + 24;

      const gfx = this.add.graphics();

      const redraw = (hovered = false) => {
        const selected = this._selectedDifficulty === d.key;
        gfx.clear();
        // Drop shadow
        gfx.fillStyle(d.shadow, 1);
        gfx.fillRoundedRect(bx - 66, by + 6, 132, 42, 18);
        // Button face
        gfx.fillStyle(hovered ? d.shadow : d.color, 1);
        gfx.fillRoundedRect(bx - 66, by, 132, 42, 18);
        // White border when selected
        if (selected) {
          gfx.lineStyle(4, 0xFFFFFF, 1);
          gfx.strokeRoundedRect(bx - 66, by, 132, 42, 18);
        }
      };
      redraw();

      this.add.text(bx, by + 21, d.label, {
        fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold',
        fontSize: '19px', color: '#FFFFFF',
      }).setOrigin(0.5);

      const hit = this.add.rectangle(bx, by + 21, 132, 42, 0, 0)
        .setInteractive({ useHandCursor: true });

      hit.on('pointerover',  () => redraw(true));
      hit.on('pointerout',   () => redraw(false));
      hit.on('pointerdown',  () => {
        this._selectedDifficulty = d.key;
        // Redraw all 3 buttons so only the new selection has the white border
        this._diffGfxRefs.forEach(fn => fn(false));
      });

      this._diffGfxRefs[i] = redraw;
    });
  }

  _refreshStartButton(players) {
    if (!this._startAreaContainer) return;
    this._startAreaContainer.removeAll(true);

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT - 65;

    if (!this.roomData.isHost) {
      const txt = this.add.text(cx, cy, '⏳ Aguardando o host iniciar', {
        fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold',
        fontSize: '24px', color: '#FFFFFF',
      }).setOrigin(0.5);

      // Pulsing dots animation
      let dots = 0;
      this.time.addEvent({
        delay: 600, repeat: -1,
        callback: () => {
          dots = (dots + 1) % 4;
          txt.setText('⏳ Aguardando o host iniciar' + '.'.repeat(dots));
        },
      });

      this._startAreaContainer.add(txt);
      return;
    }

    const canStart = players.length >= 1; // solo OK for testing
    const color    = canStart ? 0x00D8A4 : 0x888888;
    const shadow   = canStart ? 0x00A87A : 0x666666;
    const hover    = canStart ? 0x2EE5B8 : 0x888888;

    const visual = this.add.container(cx, cy);

    const bgShadow = this.add.graphics();
    bgShadow.fillStyle(shadow, 1);
    bgShadow.fillRoundedRect(-160, -35 + 8, 320, 70, 28);

    const bg = this.add.graphics();

    const drawBg = (col, isDown) => {
      bg.clear();
      bg.fillStyle(col, 1);
      const oy = isDown ? 6 : 0;
      bg.fillRoundedRect(-160, -35 + oy, 320, 70, 28);
      bg.lineStyle(4, 0xFFFFFF, 0.5);
      bg.strokeRoundedRect(-160, -35 + oy, 320, 70, 28);
    };
    drawBg(color, false);

    const btnTxt = this.add.text(0, -2, '🚦 INICIAR CORRIDA', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: '900',
      fontSize: '28px', color: '#ffffff',
      stroke: shadow.toString(16).replace('0x', '#'), strokeThickness: 5,
    }).setOrigin(0.5);

    visual.add([bgShadow, bg, btnTxt]);
    this._startAreaContainer.add(visual);

    if (canStart) {
      const hit = this.add.rectangle(cx, cy, 320, 70, 0, 0)
        .setInteractive({ useHandCursor: true });

      hit.on('pointerover', () => {
        drawBg(hover, false);
        this.tweens.add({ targets: visual, scaleX: 1.05, scaleY: 1.05, duration: 150, ease: 'Back.easeOut' });
      });
      hit.on('pointerout', () => {
        drawBg(color, false);
        this.tweens.add({ targets: visual, scaleX: 1, scaleY: 1, duration: 100 });
      });
      hit.on('pointerdown', () => {
        drawBg(hover, true);
        btnTxt.setY(4);
        this.tweens.add({ targets: visual, scaleX: 0.95, scaleY: 0.95, duration: 80, yoyo: true, onComplete: () => {
          drawBg(hover, false);
          btnTxt.setY(-2);
          socketManager.emit('room:start', { roomId: this.roomData.roomId, difficulty: this._selectedDifficulty });
        }});
      });

      this._startAreaContainer.add(hit);
    }

    const note = this.add.text(cx, cy + 50, canStart ? '' : 'Mínimo 1 jogador para iniciar', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold', fontSize: '15px', color: '#FFFFFF',
    }).setOrigin(0.5);

    this._startAreaContainer.add(note);
  }

  // ── Countdown overlay ──────────────────────────────────────────────────────
  _showCountdown(seconds) {
    // Remove previous countdown if any
    this._countdownOverlay?.destroy();

    const overlay = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this._countdownOverlay = overlay;

    const colors   = ['#ff4757', '#ffa502', '#2ed573', '#74b9ff'];
    const colorHex = [0xff4757, 0xffa502, 0x2ed573, 0x74b9ff];
    const idx      = Math.max(0, seconds);   // seconds: 3,2,1,0 → "GO!"
    const label    = seconds > 0 ? String(seconds) : 'GO! 🏎️';
    const col      = colors[Math.min(idx, colors.length - 1)];
    const colHex   = colorHex[Math.min(idx, colorHex.length - 1)];

    // Glow circle
    const glow = this.add.circle(0, 0, 88, colHex, 0.25);
    const ring  = this.add.graphics();
    ring.lineStyle(6, colHex, 0.8);
    ring.strokeCircle(0, 0, 88);

    const txt = this.add.text(0, 0, label, {
      fontFamily: 'Fredoka, sans-serif', fontStyle: '900',
      fontSize: seconds > 0 ? '100px' : '72px',
      color: col,
      stroke: '#FFFFFF', strokeThickness: 12,
    }).setOrigin(0.5);

    overlay.add([glow, ring, txt]);

    // Entrance scale animation
    overlay.setScale(0.1);
    this.tweens.add({
      targets: overlay, scaleX: 1, scaleY: 1,
      duration: 300, ease: 'Back.easeOut',
    });

    // Exit pop
    this.time.delayedCall(700, () => {
      this.tweens.add({
        targets: overlay, scaleX: 1.4, scaleY: 1.4, alpha: 0,
        duration: 250, ease: 'Quad.easeIn',
        onComplete: () => overlay.destroy(),
      });
    });

    // Subtle screen flash
    const flash = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, colHex, 0.12);
    this.tweens.add({ targets: flash, alpha: 0, duration: 400, onComplete: () => flash.destroy() });
  }

  // ── Socket events ──────────────────────────────────────────────────────────
  _listenSocketEvents() {
    this._onPlayersUpdated = (players) => {
      this._updatePlayerList(players);
    };

    this._onCountdown = ({ seconds }) => {
      this._showCountdown(seconds);

      // Disable start button while counting down
      if (this._startAreaContainer) {
        this._startAreaContainer.setAlpha(0.4);
        this._startAreaContainer.list.forEach(o => o.removeInteractive?.());
      }
    };

    this._onStarting = (data) => {
      console.log('[LobbyScene] race:starting received', data);
      this._showCountdown(0); // show "GO!"
      this.time.delayedCall(600, () => {
        console.log('[LobbyScene] Starting RaceScene with data:', { ...this.roomData, ...data });
        this.scene.start('RaceScene', { ...this.roomData, ...data });
      });
    };

    this._onDisconnect = () => {
      this.scene.start('MenuScene');
    };

    socketManager.on('room:players_updated', this._onPlayersUpdated);
    socketManager.on('race:countdown',       this._onCountdown);
    socketManager.on('race:starting',        this._onStarting);
    socketManager.on('disconnect',           this._onDisconnect);
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────
  shutdown() {
    socketManager.off('room:players_updated', this._onPlayersUpdated);
    socketManager.off('race:countdown',       this._onCountdown);
    socketManager.off('race:starting',        this._onStarting);
    socketManager.off('disconnect',           this._onDisconnect);
  }
}
