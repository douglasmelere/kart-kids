// ─── RaceScene ────────────────────────────────────────────────────────────────
// Passo 4+5: física, controles, colisão, rede, checkpoints, voltas e vitória.
// ─────────────────────────────────────────────────────────────────────────────
import { GAME_WIDTH, GAME_HEIGHT, TOTAL_LAPS, TICK_RATE } from '../config/constants.js';
import { socketManager }           from '../network/SocketManager.js';
import { Track, START_POSITIONS }  from '../game/Track.js';
import { Kart }                    from '../game/Kart.js';
import { KartPhysics }             from '../game/KartPhysics.js';
import { RemoteKartInterpolator }  from '../game/RemoteKartInterpolator.js';
import { LapTracker }              from '../game/LapTracker.js';

const TICK_MS = 1000 / TICK_RATE;

export class RaceScene extends Phaser.Scene {
  constructor() {
    super('RaceScene');
    this._karts               = new Map();
    this._remoteInterpolators = new Map();
    this._localKart           = null;
    this._physics             = null;
    this._raceStarted         = false;
    this._lap                 = 1;
    this._raceTimer           = 0;
    this._netTickAccum        = 0;
    this._dustAccum           = 0;
    this._roomData            = null;
    this._localId             = null;
    this._lapTracker          = null;
    this._finishers           = [];   // { socketId, name, totalTime } em ordem de chegada
    this._myName              = 'Jogador';
    this._raceEnded           = false;

    // Named socket callbacks for clean removal
    this._onPosition       = null;
    this._onPlayerFinished = null;
    this._onDisconnect     = null;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  init(data) {
    this._roomData = data;
    this._localId  = socketManager.id;
  }

  create() {
    console.log('[RaceScene] create() called', this._roomData);
    try {
      new Track(this);
      console.log('[RaceScene] Track created');
      this._setupInput();
      console.log('[RaceScene] Input setup');
      this._setupKarts();
      console.log('[RaceScene] Karts setup');
      this._setupPhysics();
      console.log('[RaceScene] Physics setup');
      this._buildHUD();
      console.log('[RaceScene] HUD built');
      this._showReadyBanner();
      console.log('[RaceScene] Ready banner shown');
      this._listenSocketEvents();
      console.log('[RaceScene] Socket events listened');
    } catch (err) {
      console.error('[RaceScene] Error in create():', err);
    }
  }

  update(_time, delta) {
    if (!this._raceStarted) return;
    console.log('[RaceScene] update() running');

    // ── Race timer ───────────────────────────────────────────────────────
    this._raceTimer += delta / 1000;
    this._hudTimer?.setText(this._formatTime(this._raceTimer));

    // ── Local kart physics ───────────────────────────────────────────────
    const keys   = this._readKeys();
    const result = this._physics.update(delta, keys);

    this._localKart?.moveTo(this._physics.x, this._physics.y, this._physics.angle);

    if (result.bounced) {
      this._localKart?.bounce();
      this._spawnBounceParticles(this._physics.x, this._physics.y);
    }

    if (result.boosted) {
      this._spawnBoostFlare(this._physics.x, this._physics.y, this._physics.angle);
    }

    // Dust trail
    this._dustAccum += delta;
    if (this._dustAccum > 55 && Math.abs(this._physics.speed) > 70) {
      this._dustAccum = 0;
      this._spawnDust(this._physics.x, this._physics.y, this._physics.angle, this._physics.speed);
    }

    // Speed HUD
    this._updateSpeedHUD(this._physics.speed, this._physics.boostFraction, this._physics.boostReady);

    // ── Lap / checkpoint detection ────────────────────────────────────────
    if (!this._raceEnded) {
      const ev = this._lapTracker.update(
        this._physics.x, this._physics.y, this._raceTimer, delta,
      );
      if (ev) this._handleLapEvent(ev);
    }

    // ── Remote kart interpolation ────────────────────────────────────────
    this._remoteInterpolators.forEach((interp, sid) => {
      interp.update(delta);
      this._karts.get(sid)?.moveTo(interp.x, interp.y, interp.angle);
    });

    // ── Network tick ─────────────────────────────────────────────────────
    this._netTickAccum += delta;
    if (this._netTickAccum >= TICK_MS) {
      this._netTickAccum = 0;
      if (this._roomData?.roomId) {
        socketManager.emit('race:position', {
          x:     Math.round(this._physics.x),
          y:     Math.round(this._physics.y),
          angle: Math.round(this._physics.angle * 10) / 10,
          speed: Math.round(this._physics.speed),
          lap:   this._lap,
        });
      }
    }
  }

  // ── Lap / finish events ────────────────────────────────────────────────────
  _handleLapEvent(ev) {
    if (ev.type === 'checkpoint') {
      // Pequeno flash no HUD para confirmar o checkpoint
      this._hudLap?.setTint(0x2ed573);
      this.time.delayedCall(200, () => this._hudLap?.clearTint());
    }

    if (ev.type === 'lap') {
      this._lap = ev.lap;
      this._hudLap?.setText(`${this._lap}/${TOTAL_LAPS}`);
      this._showLapBanner(ev.lap, ev.lapTime, ev.isRecord);
    }

    if (ev.type === 'finished') {
      this._raceEnded = true;
      this._physics.speed = 0;  // para o kart

      // Registra no ranking de finalizadores desta sala
      this._finishers.push({
        socketId:  this._localId ?? 'solo',
        name:      this._myName,
        totalTime: ev.totalTime,
      });

      // Envia ao servidor (salva no SQLite + broadcast para os outros)
      if (this._roomData?.roomId) {
        socketManager.emit('race:finished', {
          roomId:     this._roomData.roomId,
          playerName: this._myName,
          bestLap:    ev.bestLap,
          totalTime:  ev.totalTime,
        });
      }

      // Celebração e transição
      this._showFinishCelebration(ev.totalTime, ev.bestLap, ev.lapTimes);
    }
  }

  // ── "Volta X completa!" banner ─────────────────────────────────────────────
  _showLapBanner(lap, lapTime, isRecord) {
    const cx   = GAME_WIDTH / 2;
    const recTxt = isRecord ? ' ⚡ RECORDE!' : '';
    const color  = isRecord ? '#00D8A4' : '#FFCB2B';

    const banner = this.add.text(cx, GAME_HEIGHT / 2 - 80,
      `🏁 VOLTA ${lap - 1} — ${this._fmt(lapTime)}${recTxt}`, {
        fontFamily: 'Fredoka, sans-serif', fontStyle: '900',
        fontSize: '32px', color,
        stroke: '#FFFFFF', strokeThickness: 8,
      }).setOrigin(0.5).setDepth(55).setAlpha(0).setScale(0.1).setAngle(-5);

    this.tweens.add({
      targets: banner, alpha: 1, scaleX: 1.2, scaleY: 1.2, angle: 5,
      duration: 400, ease: 'Elastic.easeOut',
      onComplete: () => {
        this.time.delayedCall(1500, () => {
          this.tweens.add({
            targets: banner, alpha: 0, y: banner.y - 50, scaleX: 0.5, scaleY: 0.5, duration: 400,
            onComplete: () => banner.destroy(),
          });
        });
      },
    });

    // Mini partículas de confete
    const colors = [0xffd700, 0x2ed573, 0xff4757, 0xa29bfe];
    for (let i = 0; i < 18; i++) {
      const dot = this.add.circle(
        cx + Phaser.Math.Between(-160, 160),
        GAME_HEIGHT / 2 - 40,
        Phaser.Math.Between(4, 9),
        Phaser.Utils.Array.GetRandom(colors),
      ).setDepth(54);
      this.tweens.add({
        targets: dot,
        y: dot.y - Phaser.Math.Between(40, 100),
        x: dot.x + Phaser.Math.Between(-50, 50),
        alpha: 0, scaleX: 0.1, scaleY: 0.1,
        duration: Phaser.Math.Between(600, 1200),
        onComplete: () => dot.destroy(),
      });
    }
  }

  // ── Finish celebration → transição para FinishScene ───────────────────────
  _showFinishCelebration(totalTime, bestLap, lapTimes) {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    const overlay = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0)
      .setDepth(70);

    const trophy = this.add.text(cx, cy - 40, '🏆', {
      fontSize: '100px',
    }).setOrigin(0.5).setDepth(71).setScale(0.1).setAlpha(0);

    const timeTxt = this.add.text(cx, cy + 80, `Tempo: ${this._fmt(totalTime)}`, {
      fontFamily: 'Fredoka, sans-serif', fontStyle: '900',
      fontSize: '36px', color: '#FFCB2B',
      stroke: '#FF5A5F', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(71).setAlpha(0);

    this.tweens.add({ targets: overlay, alpha: 0.6, duration: 400 });
    this.tweens.add({
      targets: trophy, alpha: 1, scaleX: 1.5, scaleY: 1.5, angle: {from: -15, to: 15},
      duration: 800, ease: 'Elastic.easeOut', yoyo: true, repeat: 1,
      onComplete: () => {
        this.tweens.add({ targets: timeTxt, alpha: 1, y: cy + 50, duration: 400, ease: 'Back.easeOut' });
        this.time.delayedCall(2000, () => {
          this.scene.start('FinishScene', {
            mySocketId:  this._localId ?? 'solo',
            myName:      this._myName,
            myTotalTime: totalTime,
            myBestLap:   bestLap,
            myLapTimes:  lapTimes,
            finishers:   [...this._finishers],
            roomData:    this._roomData,
          });
        });
      },
    });
  }

  // ── Socket events ──────────────────────────────────────────────────────────
  // (override _listenSocketEvents to also track finishers)
  shutdown() {
    socketManager.off('race:position',        this._onPosition);
    socketManager.off('race:player_finished', this._onPlayerFinished);
    socketManager.off('disconnect',           this._onDisconnect);
    this._karts.forEach(k => k.destroy());
    this._karts.clear();
    this._remoteInterpolators.clear();
    this._cursors = null;
  }

  // ── Input ──────────────────────────────────────────────────────────────────
  _setupInput() {
    this._cursors  = this.input.keyboard.createCursorKeys();
    this._wasd     = this.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.W,
      down:  Phaser.Input.Keyboard.KeyCodes.S,
      left:  Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });
    this._boostKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this._shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
  }

  _readKeys() {
    return {
      up:    this._cursors.up.isDown    || this._wasd.up.isDown,
      down:  this._cursors.down.isDown  || this._wasd.down.isDown,
      left:  this._cursors.left.isDown  || this._wasd.left.isDown,
      right: this._cursors.right.isDown || this._wasd.right.isDown,
      boost: Phaser.Input.Keyboard.JustDown(this._boostKey)
          || Phaser.Input.Keyboard.JustDown(this._shiftKey),
    };
  }

  // ── Karts setup ────────────────────────────────────────────────────────────
  _setupKarts() {
    const players = this._roomData?.players ?? [];

    if (players.length === 0) {
      // Solo / dev mode
      const pos  = START_POSITIONS[0];
      const kart = new Kart(this, { x: pos.x, y: pos.y, angle: 0,
        colorIndex: 0, name: 'Você', isLocal: true });
      this._karts.set('solo', kart);
      this._localKart      = kart;
      this._localStartPos  = pos;
      return;
    }

    players.forEach((player, i) => {
      const pos     = START_POSITIONS[i] ?? START_POSITIONS[0];
      const isLocal = player.socketId === this._localId;

      const kart = new Kart(this, {
        x: pos.x, y: pos.y, angle: pos.angle ?? 0,
        colorIndex: player.colorIndex ?? i,
        name:    player.name,
        isLocal,
      });

      this._karts.set(player.socketId, kart);

      if (isLocal) {
        this._localKart     = kart;
        this._localStartPos = pos;
        this._myName        = player.name;
      } else {
        this._remoteInterpolators.set(
          player.socketId,
          new RemoteKartInterpolator(pos.x, pos.y, pos.angle ?? 0),
        );
      }
    });
  }

  _setupPhysics() {
    const pos = this._localStartPos ?? START_POSITIONS[0];
    this._physics    = new KartPhysics(pos.x, pos.y, pos.angle ?? 0);
    this._lapTracker = new LapTracker();
  }

  // ── HUD ────────────────────────────────────────────────────────────────────
  _buildHUD() {
    const D = 50;
    
    // Bubble Panels for stats
    const drawBubble = (x, y, w, h) => {
      const g = this.add.graphics().setDepth(D);
      g.fillStyle(0xFFFFFF, 0.85); // Fundo semi-transparente branco "vidro"
      g.fillRoundedRect(x, y, w, h, 16);
      g.lineStyle(3, 0x4A90E2, 0.8);
      g.strokeRoundedRect(x, y, w, h, 16);
    };

    drawBubble(16, 16, 110, 56);
    drawBubble(GAME_WIDTH / 2 - 80, 16, 160, 56);
    drawBubble(GAME_WIDTH - 126, 16, 110, 56);

    // Lap
    this.add.text(30, 24, 'VOLTA', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold', fontSize: '13px', color: '#4A90E2',
    }).setDepth(D + 1);
    this._hudLap = this.add.text(76, 42, `${this._lap}/${TOTAL_LAPS}`, {
      fontFamily: 'Fredoka, sans-serif', fontStyle: '900', fontSize: '24px', color: '#333333',
    }).setOrigin(0.5, 0.5).setDepth(D + 1);

    // Timer
    this.add.text(GAME_WIDTH / 2, 24, 'TEMPO', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold', fontSize: '13px', color: '#4A90E2',
    }).setOrigin(0.5, 0).setDepth(D + 1);
    this._hudTimer = this.add.text(GAME_WIDTH / 2, 42, '0:00.00', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: '900', fontSize: '24px', color: '#FFCB2B',
      stroke: '#C93A3F', strokeThickness: 4,
    }).setOrigin(0.5, 0.5).setDepth(D + 1);

    // Position
    this.add.text(GAME_WIDTH - 30, 24, 'POS', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold', fontSize: '13px', color: '#4A90E2',
    }).setOrigin(1, 0).setDepth(D + 1);
    this._hudPos = this.add.text(GAME_WIDTH - 71, 42, '1°', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: '900', fontSize: '24px', color: '#00D8A4',
      stroke: '#00A87A', strokeThickness: 4,
    }).setOrigin(0.5, 0.5).setDepth(D + 1);

    // ── Bottom speed bar ────────────────────────────────────────────────
    const barY = GAME_HEIGHT - 36;
    const barW = 260;

    // Outer Bubble for Speed & Boost
    const spdBgm = this.add.graphics().setDepth(D);
    spdBgm.fillStyle(0xFFFFFF, 0.85).fillRoundedRect(GAME_WIDTH / 2 - barW / 2 - 50, barY - 14, barW + 110, 48, 24);
    spdBgm.lineStyle(4, 0x4A90E2, 1).strokeRoundedRect(GAME_WIDTH / 2 - barW / 2 - 50, barY - 14, barW + 110, 48, 24);

    // Speed label
    this.add.text(GAME_WIDTH / 2 - barW / 2 - 25, barY + 9, '⚡', {
      fontSize: '24px',
    }).setOrigin(0.5).setDepth(D + 1);

    // Speed bar background
    const barBg = this.add.graphics().setDepth(D + 1);
    barBg.fillStyle(0xDDDDDD);
    barBg.fillRoundedRect(GAME_WIDTH / 2 - barW / 2 + 5, barY - 2, barW - 10, 24, 12);
    this._speedBarBg = barBg;

    // Speed bar foreground (we'll resize it each frame)
    this._speedBarFill = this.add.graphics().setDepth(D + 2);

    // Boost indicator text
    this.add.text(GAME_WIDTH / 2 + barW / 2 + 30, barY + 16, 'TURBO', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold', fontSize: '11px', color: '#4A90E2',
    }).setOrigin(0.5, 0.5).setDepth(D + 1);

    this._boostDot = this.add.circle(
      GAME_WIDTH / 2 + barW / 2 + 30, barY - 2, 10, 0xAAAAAA,
    ).setDepth(D + 2);
    
    // Contorno cinza do turbo
    this.add.graphics({ lineStyle: { width: 3, color: 0x888888 } }).setDepth(D+1).strokeCircle(GAME_WIDTH / 2 + barW / 2 + 30, barY - 2, 12);

    // Controls hint (bottom-left)
    this.add.text(16, GAME_HEIGHT - 22, '🕹️ Setas: Mover   [ESPAÇO]: Turbo', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold', fontSize: '15px', color: '#FFFFFF',
      stroke: '#4A90E2', strokeThickness: 4,
    }).setOrigin(0, 0.5).setDepth(D + 1);

    // Sair (top right bubble small)
    const exitMenu = this.add.graphics().setDepth(D).setInteractive(new Phaser.Geom.Rectangle(GAME_WIDTH - 120, 80, 100, 36), Phaser.Geom.Rectangle.Contains, { useHandCursor: true });
    exitMenu.fillStyle(0xFF5A5F, 1).fillRoundedRect(GAME_WIDTH - 110, 80, 90, 32, 16);
    exitMenu.lineStyle(3, 0xFFFFFF, 1).strokeRoundedRect(GAME_WIDTH - 110, 80, 90, 32, 16);

    const exitBtnTxt = this.add.text(GAME_WIDTH - 65, 96, 'Sair ✕', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold', fontSize: '16px', color: '#FFFFFF',
    }).setOrigin(0.5).setDepth(D + 1);

    exitMenu.on('pointerover', () => exitMenu.clear().fillStyle(0xFF7B7F, 1).fillRoundedRect(GAME_WIDTH - 110, 80, 90, 32, 16).lineStyle(3, 0xFFFFFF, 1).strokeRoundedRect(GAME_WIDTH - 110, 80, 90, 32, 16));
    exitMenu.on('pointerout',  () => exitMenu.clear().fillStyle(0xFF5A5F, 1).fillRoundedRect(GAME_WIDTH - 110, 80, 90, 32, 16).lineStyle(3, 0xFFFFFF, 1).strokeRoundedRect(GAME_WIDTH - 110, 80, 90, 32, 16));
    exitMenu.on('pointerdown', () => this.scene.start('MenuScene'));
  }

  _updateSpeedHUD(speed, boostFraction, boostReady) {
    if (!this._speedBarFill) return;
    const barW  = 220;
    const barY  = GAME_HEIGHT - 28;
    const bx    = GAME_WIDTH / 2 - barW / 2;
    const maxSp = 500;
    const ratio = Math.min(1, Math.abs(speed) / maxSp);

    // Color: green → yellow → red
    const r = Math.round(Math.min(255, ratio * 510));
    const g = Math.round(Math.min(255, (1 - ratio) * 510));
    const fillColor = (r << 16) | (g << 8) | 0;

    this._speedBarFill.clear();
    if (ratio > 0) {
      this._speedBarFill.fillStyle(fillColor);
      this._speedBarFill.fillRoundedRect(bx + 5, barY - 2, (barW - 10) * ratio, 24, 12);
    }

    // Boost dot
    this._boostDot?.setFillStyle(boostReady ? 0x00D8A4 : 0xAAAAAA);
    if (!boostReady && boostFraction < 1) {
      // Charging animation (pulse)
      const pulse = Math.sin(Date.now() / 200) * 0.3 + 0.7;
      this._boostDot?.setAlpha(pulse);
    } else {
      this._boostDot?.setAlpha(1);
    }
  }

  // ── "Prepare-se!" banner ────────────────────────────────────────────────────
  _showReadyBanner() {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    const overlay = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55)
      .setDepth(60);

    // Hint overlay: controls cheat-sheet
    this.add.text(cx, cy + 90, '🕹️ Setas para Dirigir   ⚡ ESPAÇO para Turbo!', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold',
      fontSize: '22px', color: '#FFFFFF',
      stroke: '#4A90E2', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(61).setAlpha(0.9);

    const txt = this.add.text(cx, cy, '🏎️ PREPARE-SE!', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: '900',
      fontSize: '68px', color: '#FFCB2B',
      stroke: '#FF5A5F', strokeThickness: 10,
    }).setOrigin(0.5).setDepth(61).setScale(0.2).setAlpha(0);

    this.tweens.add({
      targets: txt, alpha: 1, scaleX: 1, scaleY: 1,
      duration: 380, ease: 'Back.easeOut',
      onComplete: () => {
        this.time.delayedCall(900, () => {
          this.tweens.add({
            targets: [overlay, txt],
            alpha: 0, duration: 350,
            onComplete: () => {
              overlay.destroy();
              txt.destroy();
              this._startRace();
            },
          });
        });
      },
    });
  }

  _startRace() {
    console.log('[RaceScene] _startRace() called - race should begin!');
    this._raceStarted = true;

    const go = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '🚦 VÁ!', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: '900',
      fontSize: '96px', color: '#00D8A4',
      stroke: '#FFFFFF', strokeThickness: 12,
    }).setOrigin(0.5).setDepth(61).setScale(0.2).setAlpha(0).setAngle(Phaser.Math.Between(-10, 10));

    this.tweens.add({
      targets: go, alpha: 1, scaleX: 1.1, scaleY: 1.1,
      duration: 200, ease: 'Back.easeOut',
      onComplete: () => {
        this.time.delayedCall(500, () => {
          this.tweens.add({
            targets: go, alpha: 0, scaleX: 2.5, scaleY: 2.5,
            duration: 280,
            onComplete: () => go.destroy(),
          });
        });
      },
    });
  }

  // ── Particle effects ────────────────────────────────────────────────────────
  _spawnDust(x, y, angle, speed) {
    const rad   = angle * (Math.PI / 180);
    const rearX = x - Math.cos(rad) * 20 + Phaser.Math.Between(-5, 5);
    const rearY = y - Math.sin(rad) * 20 + Phaser.Math.Between(-5, 5);
    const size  = Phaser.Math.Between(4, 9);
    const alpha = Math.min(0.7, Math.abs(speed) / 500);

    // Poeirinha estilo nuvem/bolha flutuante
    const cloud = this.add.circle(
      rearX, rearY, size,
      0xFFFFFF, alpha,
    ).setDepth(14);
    
    // Contorno divertido na poeira
    this.add.graphics({ lineStyle: { width: 2, color: 0xDDDDDD, alpha: alpha } }).setDepth(14).strokeCircle(rearX, rearY, size);

    this.tweens.add({
      targets: cloud,
      alpha: 0, scaleX: 1.8, scaleY: 1.8, y: rearY - 15,
      duration: Phaser.Math.Between(300, 500),
      ease: 'Sine.easeOut',
      onComplete: () => {
        cloud.destroy();
      },
    });
  }

  _spawnBounceParticles(x, y) {
    const words = ['BUMP!', 'POING!', 'OUCH!', '💥', '⭐'];
    const colors = ['#FF5A5F', '#FFCB2B', '#00D8A4', '#9D4EDD'];
    
    // Textinho pulando estilo quadrinhos
    const t = this.add.text(x + Phaser.Math.Between(-20, 20), y - 10, Phaser.Utils.Array.GetRandom(words), {
      fontFamily: 'Fredoka, sans-serif', fontStyle: '900', fontSize: '26px',
      color: Phaser.Utils.Array.GetRandom(colors),
      stroke: '#FFFFFF', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(31).setAngle(Phaser.Math.Between(-20, 20));

    this.tweens.add({
      targets: t, y: t.y - 40, alpha: 0, scaleX: 1.5, scaleY: 1.5,
      duration: 600, ease: 'Back.easeOut',
      onComplete: () => t.destroy()
    });

    // Estrelinhas/bolhas pulando
    const palette = [0xFFCB2B, 0xFF5A5F, 0x00D8A4, 0xFFFFFF];
    for (let i = 0; i < 8; i++) {
      const a   = Phaser.Math.Between(0, 359) * (Math.PI / 180);
      const d   = Phaser.Math.Between(30, 80);
      const dot = this.add.circle(x, y, Phaser.Math.Between(4, 10),
        Phaser.Utils.Array.GetRandom(palette), 1,
      ).setDepth(30);

      this.tweens.add({
        targets: dot,
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d,
        alpha: 0, scaleX: 0.1, scaleY: 0.1,
        duration: Phaser.Math.Between(400, 700),
        ease: 'Quad.easeOut',
        onComplete: () => dot.destroy(),
      });
    }

    // Screen flash (Cartoon Hit Flash)
    const flash = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xFFFFFF, 0.2,
    ).setDepth(29);
    this.tweens.add({
      targets: flash, alpha: 0, duration: 200,
      onComplete: () => flash.destroy(),
    });
  }

  _spawnBoostFlare(x, y, angle) {
    const rad = angle * (Math.PI / 180);
    // Linhas de vento (Anime speed lines)
    const colors = [0xFFCB2B, 0xFFFFFF, 0x00D8A4];
    for (let i = 0; i < 8; i++) {
      const spread = Phaser.Math.FloatBetween(-0.5, 0.5);
      const len    = Phaser.Math.Between(40, 90);
      const a      = rad + spread;
      const dot    = this.add.rectangle(x, y, Phaser.Math.Between(8, 16), 4,
        Phaser.Utils.Array.GetRandom(colors), 1,
      ).setDepth(18).setAngle((a * 180) / Math.PI);

      this.tweens.add({
        targets: dot,
        x: x + Math.cos(a) * len,
        y: y + Math.sin(a) * len,
        alpha: 0, scaleX: 0.1,
        duration: Phaser.Math.Between(250, 400),
        ease: 'Quad.easeOut',
        onComplete: () => dot.destroy(),
      });
    }
  }

  // ── Socket events ──────────────────────────────────────────────────────────
  _listenSocketEvents() {
    this._onPosition = (data) => {
      const interp = this._remoteInterpolators.get(data.socketId);
      interp?.receive(data.x, data.y, data.angle);
    };

    this._onPlayerFinished = (data) => {
      // Acumula finalizadores remotos (o local já se adiciona em _handleLapEvent)
      if (data.socketId !== this._localId) {
        if (!this._finishers.some(f => f.socketId === data.socketId)) {
          this._finishers.push({
            socketId:  data.socketId,
            name:      data.playerName,
            totalTime: data.totalTime,
          });
          // Ordena por tempo
          this._finishers.sort((a, b) => a.totalTime - b.totalTime);
        }
      }
      this._showFinishNotice(data.playerName, data.totalTime);
    };

    this._onDisconnect = () => this.scene.start('MenuScene');

    socketManager.on('race:position',        this._onPosition);
    socketManager.on('race:player_finished', this._onPlayerFinished);
    socketManager.on('disconnect',           this._onDisconnect);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  _fmt(s) {
    if (!s || !isFinite(s)) return '--:--.--';
    const min  = Math.floor(s / 60);
    const sec  = Math.floor(s % 60);
    const cent = Math.floor((s % 1) * 100);
    return `${min}:${String(sec).padStart(2, '0')}.${String(cent).padStart(2, '0')}`;
  }

  _formatTime(s) { return this._fmt(s); }

  _showFinishNotice(name, time) {
    const notice = this.add.text(GAME_WIDTH / 2, 80,
      `🏆 ${name} terminou: ${this._formatTime(time)}`, {
        fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold',
        fontSize: '24px', color: '#FFFFFF',
        stroke: '#4A90E2', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(55).setAlpha(0).setY(70);

    this.tweens.add({ targets: notice, alpha: 1, y: 90, duration: 300, ease: 'Back.easeOut' });
    this.time.delayedCall(4000, () => {
      this.tweens.add({ targets: notice, alpha: 0, duration: 300, onComplete: () => notice.destroy() });
    });
  }
}
