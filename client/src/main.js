import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from './config/constants.js';
import { BootScene }        from './scenes/BootScene.js';
import { MenuScene }        from './scenes/MenuScene.js';
import { LobbyScene }       from './scenes/LobbyScene.js';
import { RaceScene }        from './scenes/RaceScene.js';
import { FinishScene }      from './scenes/FinishScene.js';
import { LeaderboardScene } from './scenes/LeaderboardScene.js';

const config = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-container',
  backgroundColor: '#1a0a2e',
  scene: [
    BootScene,
    MenuScene,
    LobbyScene,
    RaceScene,
    FinishScene,
    LeaderboardScene,
  ],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  dom: {
    createContainer: true,
  },
};

new Phaser.Game(config);
