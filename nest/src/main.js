import Phaser from 'phaser';
import { CONFIG } from './config.js';
import GameScene from './scenes/GameScene.js';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#111111',
  width: CONFIG.world.viewWidth,
  height: CONFIG.world.viewHeight,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 0 }, // 탑다운이므로 중력 없음
      debug: false,
    },
  },
  scene: [GameScene],
});

// 브라우저 콘솔에서 확인용
window.__game = game;
