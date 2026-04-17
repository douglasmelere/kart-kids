// ─── BootScene ────────────────────────────────────────────────────────────────
// First scene: connects to server, then transitions to MenuScene.
// ─────────────────────────────────────────────────────────────────────────────
import { socketManager } from '../network/SocketManager.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    // Placeholder: load assets here in future steps
    this.load.on('complete', () => {
      console.log('[Boot] Assets loaded');
    });
  }

  create() {
    socketManager.connect();

    // Give socket a moment then go to menu
    this.time.delayedCall(400, () => {
      this.scene.start('MenuScene');
    });
  }
}
