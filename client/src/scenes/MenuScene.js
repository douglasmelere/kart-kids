// ─── MenuScene ────────────────────────────────────────────────────────────────
// Main menu: name input + Play Now | Private Room (create/join) | Leaderboard
// ─────────────────────────────────────────────────────────────────────────────
import { GAME_WIDTH, GAME_HEIGHT } from '../config/constants.js';
import { socketManager } from '../network/SocketManager.js';

const BTN_W = 300;
const BTN_H = 64;
const BTN_R = 18;

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
    // Named callbacks so we can remove them precisely in shutdown()
    this._onJoined    = null;
    this._onRoomError = null;
    this._onConnect   = null;
    this._onDisconnect= null;
  }

  create() {
    this._drawBackground();
    this._drawTitle();
    this._drawNameInput();
    this._drawButtons();
    this._drawConnectionStatus();
    this._listenSocketEvents();
  }

  // ── Background ─────────────────────────────────────────────────────────────
  _drawBackground() {
    const gfx = this.add.graphics();
    // Fundo lúdico azul claro para roxo
    gfx.fillGradientStyle(0x4A90E2, 0x4A90E2, 0x8E54E9, 0x8E54E9, 1);
    gfx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    for (let i = 0; i < 60; i++) {
      const x = Phaser.Math.Between(0, GAME_WIDTH);
      const y = Phaser.Math.Between(0, GAME_HEIGHT);
      const r = Phaser.Math.FloatBetween(2, 6);
      const a = Phaser.Math.FloatBetween(0.2, 0.6);
      // Nuvens/bolinhas ao invés de apenas estrelinhas
      const bubble = this.add.circle(x, y, r, 0xffffff, a);
      this.tweens.add({
        targets: bubble, y: bubble.y - Phaser.Math.Between(30, 80), alpha: { from: a, to: 0 },
        duration: Phaser.Math.Between(2000, 5000),
        yoyo: false, repeat: -1, ease: 'Sine.easeInOut',
      });
    }
  }

  // ── Title ──────────────────────────────────────────────────────────────────
  _drawTitle() {
    this.add.text(GAME_WIDTH / 2 + 4, 84, '🏎️ KART KIDS!', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: '900',
      fontSize: '66px', color: '#00000044',
    }).setOrigin(0.5);

    const title = this.add.text(GAME_WIDTH / 2, 80, '🏎️ KART KIDS!', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: '900',
      fontSize: '66px', color: '#FFCB2B',
      stroke: '#FF5A5F', strokeThickness: 10,
    }).setOrigin(0.5);

    this.tweens.add({
      targets: title, scaleX: 1.08, scaleY: 1.08, angle: {from: -2, to: 2},
      duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    this.add.text(GAME_WIDTH / 2, 148, 'Corrida Maluca Multiplayer!', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold',
      fontSize: '24px', color: '#FFFFFF',
      stroke: '#4A90E2', strokeThickness: 6,
    }).setOrigin(0.5);
  }

  // ── Name Input ─────────────────────────────────────────────────────────────
  _drawNameInput() {
    this.add.text(GAME_WIDTH / 2, 195, 'Seu apelido:', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold',
      fontSize: '20px', color: '#FFFFFF',
      stroke: '#4A90E2', strokeThickness: 4,
    }).setOrigin(0.5);

    // Rounded box behind the input
    const boxW = 280, boxH = 48, boxX = GAME_WIDTH / 2 - boxW / 2, boxY = 207;
    const bg = this.add.graphics();
    bg.fillStyle(0xffffff, 0.9);
    bg.fillRoundedRect(boxX, boxY, boxW, boxH, 24);
    bg.lineStyle(4, 0x00D8A4, 1);
    bg.strokeRoundedRect(boxX, boxY, boxW, boxH, 24);

    // HTML input via Phaser DOM element
    this._nameInput = this.add.dom(GAME_WIDTH / 2, 231).createFromHTML(
      `<input id="player-name" type="text" maxlength="16"
        placeholder="TurboGato"
        style="
          width:240px; height:40px; border:none; outline:none;
          background:transparent; color:#333333;
          font-family:'Fredoka', sans-serif; font-weight: bold; font-size:22px;
          text-align:center; caret-color:#FF5A5F;
        "
      />`
    );

    // Pre-fill with a fun random name
    const nameEl = this._nameInput.getChildByID('player-name');
    nameEl.value = this._randomName();

    // Highlight border on focus
    nameEl.addEventListener('focus', () => {
      bg.clear();
      bg.fillStyle(0xffffff, 1);
      bg.fillRoundedRect(boxX, boxY, boxW, boxH, 24);
      bg.lineStyle(4, 0xFFCB2B, 1);
      bg.strokeRoundedRect(boxX, boxY, boxW, boxH, 24);
    });
    nameEl.addEventListener('blur', () => {
      bg.clear();
      bg.fillStyle(0xffffff, 0.9);
      bg.fillRoundedRect(boxX, boxY, boxW, boxH, 24);
      bg.lineStyle(4, 0x00D8A4, 1);
      bg.strokeRoundedRect(boxX, boxY, boxW, boxH, 24);
    });
  }

  // ── Buttons ────────────────────────────────────────────────────────────────
  _drawButtons() {
    const btnDefs = [
      { label: '▶  Jogar Agora',     color: 0xFF5A5F, hover: 0xFF7B7F, shadow: 0xC93A3F, action: () => this._joinPublicRoom() },
      { label: '🔒  Entrar em Sala', color: 0x00D8A4, hover: 0x2EE5B8, shadow: 0x00A87A, action: () => this._showPrivateModal() },
      { label: '🏆  Ranking',        color: 0xFFCB2B, hover: 0xFFD95A, shadow: 0xD9A41C, action: () => this.scene.start('LeaderboardScene') },
    ];

    btnDefs.forEach((b, i) => {
      this._makeButton(GAME_WIDTH / 2, 318 + i * 86, b.label, b.color, b.hover, b.shadow, b.action);
    });
  }

  _makeButton(cx, cy, label, color, hover, shadowColor, action) {
    const c = this.add.container(cx, cy);
    const bgShadow = this.add.graphics();
    const bg = this.add.graphics();

    const draw = (col, isDown = false) => {
      bgShadow.clear();
      bgShadow.fillStyle(shadowColor, 1);
      bgShadow.fillRoundedRect(-BTN_W / 2, -BTN_H / 2 + 8, BTN_W, BTN_H, 24); // Sombra do botão gordinho
      
      bg.clear();
      bg.fillStyle(col, 1);
      const yOffset = isDown ? 6 : 0;
      bg.fillRoundedRect(-BTN_W / 2, -BTN_H / 2 + yOffset, BTN_W, BTN_H, 24);
      bg.lineStyle(4, 0xffffff, 0.5);
      bg.strokeRoundedRect(-BTN_W / 2, -BTN_H / 2 + yOffset, BTN_W, BTN_H, 24);
    };
    draw(color);

    const txt = this.add.text(0, -2, label, {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold',
      fontSize: '28px', color: '#ffffff',
      stroke: shadowColor.toString(16).replace('0x', '#'), strokeThickness: 5,
    }).setOrigin(0.5);

    const hit = this.add.rectangle(0, 0, BTN_W, BTN_H + 10, 0, 0)
      .setInteractive({ useHandCursor: true });

    c.add([bgShadow, bg, txt, hit]);

    hit.on('pointerover', () => { 
      draw(hover); 
      this.tweens.add({ targets: c, scaleX: 1.08, scaleY: 1.08, duration: 250, ease: 'Elastic.easeOut' }); 
    });
    hit.on('pointerout',  () => { 
      draw(color); 
      this.tweens.add({ targets: c, scaleX: 1, scaleY: 1, duration: 150 }); 
    });
    hit.on('pointerdown', () => {
      draw(hover, true);
      txt.setY(4);
      this.tweens.add({ targets: c, scaleX: 0.95, scaleY: 0.95, duration: 80, yoyo: true, onComplete: () => {
        draw(hover, false);
        txt.setY(-2);
        action();
      }});
    });

    return c;
  }

  // ── Private Room Modal ─────────────────────────────────────────────────────
  _showPrivateModal() {
    if (this._modal) return;

    const W = 400, H = 280, mx = GAME_WIDTH / 2, my = GAME_HEIGHT / 2;

    // Overlay
    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7)
      .setInteractive();

    // Modal box (arredondada e com cara de bolha)
    const box = this.add.graphics();
    box.fillStyle(0xFFFFFF, 1);
    box.fillRoundedRect(mx - W / 2, my - H / 2, W, H, 32);
    box.lineStyle(6, 0x00D8A4, 1);
    box.strokeRoundedRect(mx - W / 2, my - H / 2, W, H, 32);

    const title = this.add.text(mx, my - 105, '🔒 Sala Privada', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold',
      fontSize: '32px', color: '#333333',
    }).setOrigin(0.5);

    // ── Create new room ─────────────────────────────────────────────────────
    const btnCreate = this._makeButton(mx, my - 40, '✨ Criar Nova Sala', 0x00D8A4, 0x2EE5B8, 0x00A87A, () => {
      this._closeModal();
      this._createPrivateRoom();
    });

    // ── Join by code ────────────────────────────────────────────────────────
    const codeLbl = this.add.text(mx, my + 18, 'ou entre com um código:', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold', fontSize: '18px', color: '#888888',
    }).setOrigin(0.5);

    // Code input
    const inpBg = this.add.graphics();
    inpBg.fillStyle(0xF0F0F0, 1);
    inpBg.fillRoundedRect(mx - 100, my + 38, 140, 48, 16);
    inpBg.lineStyle(3, 0xDDDDDD, 1);
    inpBg.strokeRoundedRect(mx - 100, my + 38, 140, 48, 16);

    this._codeInputDom = this.add.dom(mx - 30, my + 61).createFromHTML(
      `<input id="room-code" type="text" maxlength="4"
        placeholder="ABCD"
        style="
          width:128px; height:40px; border:none; outline:none;
          background:transparent; color:#FF5A5F;
          font-family:'Fredoka', sans-serif; font-weight:bold; font-size:26px;
          text-align:center; text-transform:uppercase; letter-spacing:6px;
          caret-color:#FF5A5F;
        "
      />`
    );

    // Join button (small, beside input)
    const joinBtnGfx = this.add.graphics();
    joinBtnGfx.fillStyle(0xFF5A5F, 1);
    joinBtnGfx.fillRoundedRect(mx + 46, my + 38, 60, 48, 16);
    joinBtnGfx.lineStyle(3, 0xC93A3F, 1);
    joinBtnGfx.strokeRoundedRect(mx + 46, my + 38, 60, 48, 16);

    const joinBtnTxt = this.add.text(mx + 76, my + 62, '→', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold',
      fontSize: '28px', color: '#ffffff',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    joinBtnTxt.on('pointerover', () => { joinBtnGfx.clear().fillStyle(0xFF7B7F).fillRoundedRect(mx + 46, my + 38, 60, 48, 16).lineStyle(3, 0xC93A3F, 1).strokeRoundedRect(mx + 46, my + 38, 60, 48, 16); });
    joinBtnTxt.on('pointerout',  () => { joinBtnGfx.clear().fillStyle(0xFF5A5F).fillRoundedRect(mx + 46, my + 38, 60, 48, 16).lineStyle(3, 0xC93A3F, 1).strokeRoundedRect(mx + 46, my + 38, 60, 48, 16); });
    joinBtnTxt.on('pointerdown', () => {
      const code = this._codeInputDom?.getChildByID('room-code')?.value?.trim().toUpperCase();
      if (!code || code.length < 4) { this._showError('Digite um código de 4 letras!'); return; }
      this._closeModal();
      this._joinPrivateRoom(code);
    });

    // Allow Enter key
    this._codeInputDom.getChildByID('room-code').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') joinBtnTxt.emit('pointerdown');
    });

    // Close (X)
    const closeBtnBg = this.add.circle(mx + W / 2 - 10, my - H / 2 + 10, 18, 0xFF5A5F).setInteractive({ useHandCursor: true });
    const closeBtnTxt = this.add.text(mx + W / 2 - 10, my - H / 2 + 10, '✕', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold', fontSize: '20px', color: '#FFFFFF',
    }).setOrigin(0.5);

    closeBtnBg.on('pointerover', () => closeBtnBg.setFillStyle(0xFF7B7F));
    closeBtnBg.on('pointerout',  () => closeBtnBg.setFillStyle(0xFF5A5F));
    closeBtnBg.on('pointerdown', () => this._closeModal());

    this._modal = { overlay, box, title, btnCreate, codeLbl, inpBg, joinBtnGfx, joinBtnTxt, closeBtnBg, closeBtnTxt };
  }

  _closeModal() {
    if (!this._modal) return;
    const m = this._modal;
    this._modal = null;
    this._codeInputDom?.destroy();
    this._codeInputDom = null;
    [m.overlay, m.box, m.title, m.codeLbl, m.inpBg, m.joinBtnGfx, m.joinBtnTxt, m.closeBtnBg, m.closeBtnTxt].forEach(o => o?.destroy());
    m.btnCreate?.destroy();
  }

  // ── Connection badge ───────────────────────────────────────────────────────
  _drawConnectionStatus() {
    this._statusDot  = this.add.circle(20, GAME_HEIGHT - 20, 10, 0xFF5A5F);
    this._statusText = this.add.text(40, GAME_HEIGHT - 30, 'Conectando...', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold', fontSize: '18px', color: '#FFFFFF',
      stroke: '#000000', strokeThickness: 3,
    });
    if (socketManager.socket?.connected) this._setConnected();
  }

  _setConnected() {
    this._statusDot?.setFillStyle(0x00D8A4);
    this._statusText?.setText('Online ✓').setColor('#00D8A4');
  }

  // ── Socket events ──────────────────────────────────────────────────────────
  _listenSocketEvents() {
    this._onConnect    = () => this._setConnected();
    this._onDisconnect = () => {
      this._statusDot?.setFillStyle(0xff4757);
      this._statusText?.setText('Desconectado').setColor('#ff4757');
    };
    this._onJoined    = (data) => this.scene.start('LobbyScene', data);
    this._onRoomError = (msg)  => this._showError(msg);

    socketManager.on('connect',     this._onConnect);
    socketManager.on('disconnect',  this._onDisconnect);
    socketManager.on('room:joined', this._onJoined);
    socketManager.on('room:error',  this._onRoomError);
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  _getPlayerName() {
    const val = this._nameInput?.getChildByID('player-name')?.value?.trim();
    return (val && val.length > 0) ? val : this._randomName();
  }

  _joinPublicRoom() {
    socketManager.emit('room:join_public', { name: this._getPlayerName() });
  }

  _createPrivateRoom() {
    socketManager.emit('room:create_private', { name: this._getPlayerName() });
  }

  _joinPrivateRoom(code) {
    socketManager.emit('room:join_private', { name: this._getPlayerName(), code });
  }

  _randomName() {
    const adj  = ['Turbo','Foguete','Relâmpago','Rápido','Veloz','Super','Ultra'];
    const noun = ['Pato','Gato','Urso','Coelho','Panda','Leão','Tigre'];
    return adj[Math.floor(Math.random() * adj.length)] + noun[Math.floor(Math.random() * noun.length)];
  }

  _showError(msg) {
    this._errorText?.destroy();
    this._errorBg?.destroy();

    this._errorBg = this.add.graphics();
    this._errorBg.fillStyle(0xFF5A5F, 0.9);
    this._errorBg.fillRoundedRect(GAME_WIDTH / 2 - 200, GAME_HEIGHT - 60, 400, 40, 20);

    this._errorText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 40, `⚠️ ${msg}`, {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold', fontSize: '20px', color: '#ffffff',
    }).setOrigin(0.5);

    this.time.delayedCall(3000, () => {
      this._errorText?.destroy();
      this._errorBg?.destroy();
    });
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────
  shutdown() {
    socketManager.off('connect',     this._onConnect);
    socketManager.off('disconnect',  this._onDisconnect);
    socketManager.off('room:joined', this._onJoined);
    socketManager.off('room:error',  this._onRoomError);
    this._closeModal();
  }
}
