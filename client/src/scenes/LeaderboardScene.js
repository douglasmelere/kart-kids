// ─── LeaderboardScene ─────────────────────────────────────────────────────────
// Ranking global: busca dados REST do servidor e exibe tabela paginada.
// ─────────────────────────────────────────────────────────────────────────────
import { GAME_WIDTH, GAME_HEIGHT, SERVER_URL } from '../config/constants.js';

const MEDALS  = ['🥇', '🥈', '🥉'];
const ROW_H   = 46;
const PAGE    = 10;

export class LeaderboardScene extends Phaser.Scene {
  constructor() {
    super('LeaderboardScene');
    this._entries = [];
    this._page    = 0;
  }

  create() {
    this._drawBackground();
    this._drawHeader();
    this._rowContainer = this.add.container(0, 0);
    this._drawLoadingText();
    this._drawNav();
    this._fetch();
  }

  // ── Background ─────────────────────────────────────────────────────────────
  _drawBackground() {
    const g = this.add.graphics();
    g.fillGradientStyle(0x4A90E2, 0x4A90E2, 0x8E54E9, 0x8E54E9, 1);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Nuvens decorativas
    for (let i = 0; i < 10; i++) {
      const x = Phaser.Math.Between(0, GAME_WIDTH);
      const y = Phaser.Math.Between(0, GAME_HEIGHT);
      const cloud = this.add.text(x, y, '☁️', { fontSize: `${Phaser.Math.Between(24, 60)}px` }).setAlpha(0.15);
      this.tweens.add({
        targets: cloud, x: x + Phaser.Math.Between(30, 80),
        duration: Phaser.Math.Between(4000, 8000), yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
      });
    }
  }

  // ── Header ─────────────────────────────────────────────────────────────────
  _drawHeader() {
    // Back button "bolha"
    const backBtnBg = this.add.graphics().fillStyle(0xFF5A5F, 1).fillRoundedRect(16, 16, 120, 48, 24);
    backBtnBg.lineStyle(4, 0xFFFFFF, 1).strokeRoundedRect(16, 16, 120, 48, 24);
    
    const back = this.add.text(76, 40, '← Voltar', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold',
      fontSize: '20px', color: '#FFFFFF',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    
    const backHit = this.add.rectangle(76, 40, 120, 48, 0, 0).setInteractive({ useHandCursor: true });

    backHit.on('pointerover', () => { backBtnBg.clear().fillStyle(0xFF7B7F, 1).fillRoundedRect(16, 16, 120, 48, 24).lineStyle(4, 0xFFFFFF, 1).strokeRoundedRect(16, 16, 120, 48, 24); this.tweens.add({ targets: [backBtnBg, back], scaleX: 1.05, scaleY: 1.05, duration: 150 }); });
    backHit.on('pointerout',  () => { backBtnBg.clear().fillStyle(0xFF5A5F, 1).fillRoundedRect(16, 16, 120, 48, 24).lineStyle(4, 0xFFFFFF, 1).strokeRoundedRect(16, 16, 120, 48, 24); this.tweens.add({ targets: [backBtnBg, back], scaleX: 1, scaleY: 1, duration: 150 }); });
    backHit.on('pointerdown', () => this.scene.start('MenuScene'));

    // Title
    const title = this.add.text(GAME_WIDTH / 2, 42, '🏆 RANKING GLOBAL', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: '900',
      fontSize: '46px', color: '#FFCB2B',
      stroke: '#FF5A5F', strokeThickness: 8,
    }).setOrigin(0.5);

    this.tweens.add({ targets: title, scaleX: 1.05, scaleY: 1.05, angle: {from: -1, to: 1}, duration: 1200, yoyo: true, repeat: -1 });

    this.add.text(GAME_WIDTH / 2, 85, 'Pista Principal — Melhores Tempos (Servidor)', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold', fontSize: '16px', color: '#FFFFFF',
      stroke: '#4A90E2', strokeThickness: 4,
    }).setOrigin(0.5);

    // Column headers bubble
    const hY = 110;
    const g  = this.add.graphics();
    g.fillStyle(0xFFFFFF, 0.4);
    g.fillRoundedRect(40, hY - 16, GAME_WIDTH - 80, 32, 16);

    this.add.text(70,              hY, '#',             { fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold', fontSize: '15px', color: '#111111' }).setOrigin(0, 0.5);
    this.add.text(120,             hY, 'JOGADOR',       { fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold', fontSize: '15px', color: '#111111' }).setOrigin(0, 0.5);
    this.add.text(GAME_WIDTH - 250, hY, 'MELHOR VOLTA',  { fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold', fontSize: '15px', color: '#111111' }).setOrigin(0, 0.5);
    this.add.text(GAME_WIDTH - 120, hY, 'TEMPO TOTAL',   { fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold', fontSize: '15px', color: '#111111' }).setOrigin(0, 0.5);
  }

  // ── Loading / error text ───────────────────────────────────────────────────
  _drawLoadingText() {
    this._loadingTxt = this.add.text(GAME_WIDTH / 2, 300, '⏳ Carregando Ranking...', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold', fontSize: '24px', color: '#FFFFFF',
    }).setOrigin(0.5);
  }

  // ── Fetch from server ──────────────────────────────────────────────────────
  async _fetch() {
    try {
      const res  = await fetch(`${SERVER_URL}/leaderboard?track=main`);
      this._entries = await res.json();
    } catch {
      this._loadingTxt?.setText('❌ Não foi possível carregar o ranking.\nVerifique a conexão com o servidor.');
      return;
    }

    this._loadingTxt?.destroy();
    this._loadingTxt = null;
    this._renderPage();
  }

  // ── Render current page ────────────────────────────────────────────────────
  _renderPage() {
    this._rowContainer.removeAll(true);

    const start = this._page * PAGE;
    const slice = this._entries.slice(start, start + PAGE);

    if (slice.length === 0) {
      const empty = this.add.text(GAME_WIDTH / 2, 300,
        '🏁 Ainda não há registros!\nJogue uma corrida para aparecer aqui.', {
          fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold',
          fontSize: '24px', color: '#FFFFFF', align: 'center',
          stroke: '#4A90E2', strokeThickness: 4,
        }).setOrigin(0.5);
      this._rowContainer.add(empty);
      return;
    }

    slice.forEach((entry, i) => {
      const rank  = start + i;
      const y     = 140 + i * ROW_H;
      const isTop = rank < 3;

      // Row background bubble
      const rowBg = this.add.graphics();
      rowBg.fillStyle(0xFFFFFF, isTop ? 0.95 : 0.8);
      rowBg.fillRoundedRect(40, y - 20, GAME_WIDTH - 80, ROW_H - 4, 16);
      
      const borderColor = rank === 0 ? 0xFFCB2B : rank === 1 ? 0xAAAAAA : rank === 2 ? 0xCD7F32 : 0x00D8A4;
      rowBg.lineStyle(4, borderColor, 0.8);
      rowBg.strokeRoundedRect(40, y - 20, GAME_WIDTH - 80, ROW_H - 4, 16);

      // Medal / rank number
      const medalTxt = MEDALS[rank] ?? `${rank + 1}º`;
      const rankLabel = this.add.text(70, y, medalTxt, {
        fontFamily: 'Fredoka, sans-serif', fontStyle: '900',
        fontSize: isTop ? '24px' : '20px',
        color: isTop ? '#333333' : '#666666',
      }).setOrigin(0, 0.5);

      // Player name
      const nameTxt = this.add.text(120, y, entry.player_name, {
        fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold',
        fontSize: '22px',
        color: '#333333',
      }).setOrigin(0, 0.5);

      // Best lap
      const lapTxt = this.add.text(GAME_WIDTH - 250, y, this._fmt(entry.best_lap), {
        fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold', fontSize: '20px', color: '#00D8A4',
      }).setOrigin(0, 0.5);

      // Total time
      const totalTxt = this.add.text(GAME_WIDTH - 120, y, this._fmt(entry.total_time), {
        fontFamily: 'Fredoka, sans-serif', fontStyle: '900',
        fontSize: '20px', color: '#FF5A5F',
      }).setOrigin(0, 0.5);

      // Date (small)
      const date = new Date(entry.created_at).toLocaleDateString('pt-BR');
      const dateTxt = this.add.text(GAME_WIDTH - 48, y, date, {
        fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold', fontSize: '13px', color: '#888888',
      }).setOrigin(1, 0.5);

      this._rowContainer.add([rowBg, rankLabel, nameTxt, lapTxt, totalTxt, dateTxt]);
    });

    this._updateNavButtons();
  }

  // ── Page navigation ────────────────────────────────────────────────────────
  _drawNav() {
    const y = GAME_HEIGHT - 36;

    this._prevBtn = this._makeNavBtn(GAME_WIDTH / 2 - 100, y, '◀ Anterior', () => {
      if (this._page > 0) { this._page--; this._renderPage(); }
    });

    this._pageLabel = this.add.text(GAME_WIDTH / 2, y, '', {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold', fontSize: '18px', color: '#FFFFFF',
      stroke: '#4A90E2', strokeThickness: 4,
    }).setOrigin(0.5);

    this._nextBtn = this._makeNavBtn(GAME_WIDTH / 2 + 100, y, 'Próximo ▶', () => {
      const maxPage = Math.ceil(this._entries.length / PAGE) - 1;
      if (this._page < maxPage) { this._page++; this._renderPage(); }
    });
  }

  _makeNavBtn(cx, cy, label, action) {
    const bg = this.add.graphics();
    bg.fillStyle(0xFFFFFF, 0.9).fillRoundedRect(cx - 60, cy - 18, 120, 36, 18);
    bg.lineStyle(3, 0x00D8A4, 1).strokeRoundedRect(cx - 60, cy - 18, 120, 36, 18);

    const btnTxt = this.add.text(cx, cy, label, {
      fontFamily: 'Fredoka, sans-serif', fontStyle: 'bold',
      fontSize: '16px', color: '#333333',
    }).setOrigin(0.5);
    
    const hit = this.add.rectangle(cx, cy, 120, 36, 0, 0).setInteractive({ useHandCursor: true });

    hit.on('pointerover', () => { bg.clear().fillStyle(0xFFFFFF, 1).fillRoundedRect(cx - 60, cy - 18, 120, 36, 18).lineStyle(4, 0x00D8A4, 1).strokeRoundedRect(cx - 60, cy - 18, 120, 36, 18); this.tweens.add({ targets: btnTxt, scaleX: 1.1, scaleY: 1.1, duration: 100 }); });
    hit.on('pointerout',  () => { bg.clear().fillStyle(0xFFFFFF, 0.9).fillRoundedRect(cx - 60, cy - 18, 120, 36, 18).lineStyle(3, 0x00D8A4, 1).strokeRoundedRect(cx - 60, cy - 18, 120, 36, 18); this.tweens.add({ targets: btnTxt, scaleX: 1, scaleY: 1, duration: 100 }); });
    hit.on('pointerdown', action);

    const c = this.add.container(0, 0).add([bg, btnTxt, hit]);
    return c;
  }

  _updateNavButtons() {
    const maxPage = Math.max(0, Math.ceil(this._entries.length / PAGE) - 1);
    this._prevBtn?.setAlpha(this._page > 0 ? 1 : 0.3);
    this._nextBtn?.setAlpha(this._page < maxPage ? 1 : 0.3);
    this._pageLabel?.setText(`Página ${this._page + 1} / ${Math.max(1, maxPage + 1)}`);
  }

  // ── Format time ────────────────────────────────────────────────────────────
  _fmt(s) {
    if (!s || !isFinite(s)) return '--:--.--';
    const min  = Math.floor(s / 60);
    const sec  = Math.floor(s % 60);
    const cent = Math.floor((s % 1) * 100);
    return `${min}:${String(sec).padStart(2, '0')}.${String(cent).padStart(2, '0')}`;
  }
}
