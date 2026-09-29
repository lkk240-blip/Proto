import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import facility01 from '../maps/facility01.js';
import { parseMap } from '../systems/MapLoader.js';
import { keys, PlayerControls } from '../systems/Input.js';
import NoiseSystem from '../systems/NoiseSystem.js';
import EggSystem from '../systems/EggSystem.js';
import Fx from '../systems/Fx.js';
import Monster from '../entities/Monster.js';
import { isWallAt } from '../systems/MapLoader.js';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  create() {
    this.map = parseMap(facility01, CONFIG.world.tileSize);
    const { pixelWidth: W, pixelHeight: H } = this.map;

    this.matter.world.setBounds(0, 0, W, H);
    this.mode = 'solo';
    this.noise = new NoiseSystem(this);
    this.fx = new Fx(this);
    this.stats = newStats();
    this.secured = 0;
    this.tension = 0;

    this.drawMap();
    this.buildWalls();

    const p = this.map.points.player;
    this.player = new Monster(this, p.x, p.y, 'kkuldduk');
    this.player.controls = new PlayerControls('solo', 0);
    this.player.controlled = true;
    this.monsters = [this.player];

    this.eggs = new EggSystem(this);
    this.eggs.spawn(this.map.points.nests);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, W, H);
    cam.startFollow(this.player.view, true, CONFIG.camera.followLerp, CONFIG.camera.followLerp);

    this.buildHud();
  }

  drawMap() {
    const { grid, width, height, tileSize: ts } = this.map;
    const g = this.add.graphics().setDepth(0);

    // 바닥
    g.fillStyle(0x2a2d34, 1);
    g.fillRect(0, 0, this.map.pixelWidth, this.map.pixelHeight);
    g.lineStyle(1, 0x33373f, 1);
    for (let x = 0; x <= width; x++) g.lineBetween(x * ts, 0, x * ts, height * ts);
    for (let y = 0; y <= height; y++) g.lineBetween(0, y * ts, width * ts, y * ts);

    // 출구
    const ex = this.map.exitRect;
    if (ex) {
      g.fillStyle(0x2ecc71, 0.35);
      g.fillRect(ex.x, ex.y, ex.w, ex.h);
      g.lineStyle(3, 0x2ecc71, 1);
      g.strokeRect(ex.x, ex.y, ex.w, ex.h);
      this.add.text(ex.x + ex.w / 2, ex.y - 12, '출구', {
        fontFamily: 'sans-serif', fontSize: '16px', color: '#2ecc71', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(1);
    }

    // 알 둥지 후보 (M2에서 알이 놓일 자리)
    g.lineStyle(2, 0xc9a26b, 0.6);
    for (const n of this.map.points.nests) g.strokeCircle(n.x, n.y, ts * 1.2);

    // 벽
    const w = this.add.graphics().setDepth(2);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!grid[y][x]) continue;
        w.fillStyle(0x565d6b, 1);
        w.fillRect(x * ts, y * ts, ts, ts);
        // 바닥과 맞닿은 벽 아래쪽에 그림자 선을 줘서 입체감
        if (y + 1 < height && !grid[y + 1][x]) {
          w.fillStyle(0x3a3f4a, 1);
          w.fillRect(x * ts, y * ts + ts - 6, ts, 6);
        }
      }
    }
  }

  buildWalls() {
    for (const r of this.map.wallRects) {
      this.matter.add.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, {
        isStatic: true, friction: 0, frictionStatic: 0, restitution: 0, label: 'wall',
      });
    }
  }

  buildHud() {
    const style = { fontFamily: 'sans-serif', fontSize: '16px', color: '#ffffff', stroke: '#000000', strokeThickness: 4 };
    this.hudText = this.add.text(16, 12, '', style).setScrollFactor(0).setDepth(100);
    this.add.text(16, CONFIG.world.viewHeight - 32, 'WASD 이동   Shift 대시   E 줍기/내려놓기   Space 던지기   R 삼키기/뱉기', {
      ...style, fontSize: '14px', color: '#cccccc',
    }).setScrollFactor(0).setDepth(100);
  }

  isWallAt(x, y) {
    return isWallAt(this.map, x, y);
  }

  addTension(amount) {
    this.tension = Math.min(100, this.tension + amount);
  }

  onDeposit(egg, value) {
    this.secured += value;
    this.stats.deposited++;
  }

  update(time, deltaMs) {
    const dt = Math.min(deltaMs, 50) / 1000; // 프레임이 크게 튀어도 한 번에 0.05초까지만
    for (const m of this.monsters) {
      m.controls?.update?.();
      this.eggs.handleActions(m);
    }
    for (const m of this.monsters) m.update(dt);
    this.eggs.update(dt);
    keys.endFrame();

    const p = this.player;
    const pips = '●'.repeat(p.dashCharges) + '○'.repeat(CONFIG.monster.dashCharges - p.dashCharges);
    const recharge = p.dashCharges < CONFIG.monster.dashCharges ? `  (충전 ${p.dashRechargeTimer.toFixed(1)}초)` : '';
    this.hudText.setText(`${p.type.name}   대시 ${pips}${recharge}\n확보 가치 ${this.secured.toFixed(2)} / 할당량 ${CONFIG.run.quota}   소란도 ${this.tension.toFixed(0)}`);
  }
}

function newStats() {
  return {
    deposited: 0, cracks: 0, broken: 0, caught: 0, chaser: false, swaps: 0,
    coopTime: 0, dragTime: 0, swallowTime: 0, playTime: 0, throws: 0, catches: 0,
  };
}
