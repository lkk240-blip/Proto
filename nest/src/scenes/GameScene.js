import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import facility01 from '../maps/facility01.js';
import { parseMap, isWallAt } from '../systems/MapLoader.js';
import { keys, PlayerControls } from '../systems/Input.js';
import NoiseSystem from '../systems/NoiseSystem.js';
import EggSystem from '../systems/EggSystem.js';
import Fx from '../systems/Fx.js';
import Pathfinder from '../systems/Pathfinder.js';
import Companion from '../systems/Companion.js';
import Fog from '../systems/Fog.js';
import { isFreeSpot } from '../systems/Los.js';
import { Sfx } from '../systems/Sfx.js';
import Monster from '../entities/Monster.js';
import Guard from '../entities/Guard.js';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  init(data) {
    this.mode = data?.mode || this.registry.get('mode') || 'solo'; // 'solo' | 'duo'
  }

  create() {
    this.map = parseMap(facility01, CONFIG.world.tileSize);
    const { pixelWidth: W, pixelHeight: H } = this.map;
    keys.endFrame();

    this.matter.world.setBounds(0, 0, W, H);
    this.noise = new NoiseSystem(this);
    this.fx = new Fx(this);
    this.stats = newStats();
    this.secured = 0;
    this.tension = 0;
    this.chaser = null;
    this.paused = false;

    this.drawMap();
    this.buildWalls();
    this.pathfinder = new Pathfinder(this.map);

    this.spawnMonsters();
    this.eggs = new EggSystem(this);
    this.eggs.spawn(this.map.points.nests);
    this.guards = this.spawnGuards();
    this.noise.onNoise((n) => {
      for (const g of this.guards) g.hear(n);
      if (n.source !== 'test') this.addTension(n.size * CONFIG.tension.noiseMul, 'noise');
    });
    this.fog = new Fog(this);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, W, H);
    if (this.mode === 'solo') cam.startFollow(this.player.view, true, CONFIG.camera.followLerp, CONFIG.camera.followLerp);

    this.buildHud();
  }

  // ---------- 생성 ----------
  spawnMonsters() {
    const p = this.map.points.player;
    const r = CONFIG.monster.radius * 1.3;
    const second = [[48, 0], [-48, 0], [0, 48], [0, -48]].map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy }))
      .find((q) => isFreeSpot(this.map, q.x, q.y, r)) || p;
    const a = new Monster(this, p.x, p.y, 'kkuldduk');
    const b = new Monster(this, second.x, second.y, 'kkaburi');
    this.monsters = [a, b];
    if (this.mode === 'duo') {
      a.controls = new PlayerControls('p1', 0);
      b.controls = new PlayerControls('p2', 1);
      a.tag = 'P1';
      b.tag = 'P2';
      this.player = a;
    } else {
      this.companion = new Companion(this);
      this.setControlled(a);
    }
  }

  setControlled(m) {
    const other = this.monsters.find((o) => o !== m);
    this.player = m;
    m.controlled = true;
    other.controlled = false;
    m.statusText = '';
    m.controls = this.soloControls || (this.soloControls = new PlayerControls('solo', 0));
    other.controls = this.companion;
  }

  // Tab: 조작 몬스터 교체
  swap() {
    const next = this.monsters.find((o) => o !== this.player);
    this.companion.onSwap(next);
    this.setControlled(next);
    this.stats.swaps++;
    Sfx.swap();
    const cam = this.cameras.main;
    cam.stopFollow();
    cam.pan(next.x, next.y, CONFIG.camera.switchPanMs, 'Sine.easeInOut', true, (c, progress) => {
      if (progress >= 1) c.startFollow(this.player.view, true, CONFIG.camera.followLerp, CONFIG.camera.followLerp);
    });
    this.fx.ring(next.x, next.y, 0x7cf0ff, 50, 300);
  }

  // 맵의 guardRoutes 로 경비 생성. G(시작점)는 첫 경로점이 가장 가까운 경로에 배정.
  spawnGuards() {
    const wp = this.map.points.waypoints;
    const routes = (facility01.guardRoutes || []).map((r) => ({
      points: r.points.map((d) => wp[String(d)]).filter(Boolean),
      loop: !!r.loop,
    })).filter((r) => r.points.length > 0);
    const starts = [...this.map.points.guards];
    return routes.map((route) => {
      let start = route.points[0];
      if (starts.length) {
        let bi = 0, bd = Infinity;
        starts.forEach((g, i) => {
          const d = Math.hypot(g.x - route.points[0].x, g.y - route.points[0].y);
          if (d < bd) { bd = d; bi = i; }
        });
        start = starts.splice(bi, 1)[0];
      }
      return new Guard(this, start.x, start.y, route);
    });
  }

  // 바닥·벽·출구를 한 번 그려서 텍스처로 굽는다(매 프레임 수천 개 도형을 다시 그리지 않도록)
  drawMap() {
    const { grid, width, height, tileSize: ts, pixelWidth: W, pixelHeight: H } = this.map;
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    // 바닥
    g.fillStyle(0x2a2d34, 1);
    g.fillRect(0, 0, W, H);
    g.lineStyle(1, 0x33373f, 1);
    for (let x = 0; x <= width; x++) g.lineBetween(x * ts, 0, x * ts, H);
    for (let y = 0; y <= height; y++) g.lineBetween(0, y * ts, W, y * ts);

    // 출구
    const ex = this.map.exitRect;
    if (ex) {
      g.fillStyle(0x2ecc71, 0.35);
      g.fillRect(ex.x, ex.y, ex.w, ex.h);
      g.lineStyle(3, 0x2ecc71, 1);
      g.strokeRect(ex.x, ex.y, ex.w, ex.h);
    }

    // 알 둥지 후보
    g.lineStyle(2, 0xc9a26b, 0.5);
    for (const n of this.map.points.nests) g.strokeCircle(n.x, n.y, ts * 1.6);

    // 벽
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!grid[y][x]) continue;
        g.fillStyle(0x5d6576, 1);
        g.fillRect(x * ts, y * ts, ts, ts);
        // 바닥과 맞닿은 벽 아래쪽에 그림자 선을 줘서 입체감
        if (y + 1 < height && !grid[y + 1][x]) {
          g.fillStyle(0x3a3f4a, 1);
          g.fillRect(x * ts, y * ts + ts - 6, ts, 6);
        }
      }
    }
    const rt = this.add.renderTexture(0, 0, W, H).setOrigin(0, 0).setDepth(0);
    rt.draw(g);
    g.destroy();

    if (ex) {
      this.add.text(ex.x + ex.w / 2, ex.y - 12, '출구', {
        fontFamily: 'sans-serif', fontSize: '16px', color: '#2ecc71', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(52);
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
  }

  // ---------- 게임 규칙 훅 ----------
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

  // ---------- 프레임 ----------
  update(time, deltaMs) {
    const dt = Math.min(deltaMs, 50) / 1000; // 프레임이 크게 튀어도 한 번에 0.05초까지만

    if (this.mode === 'solo') {
      if (keys.wasPressed('Tab')) this.swap();
      if (keys.wasPressed('KeyQ')) {
        const mode = this.companion.toggleMode();
        const c = this.monsters.find((o) => o !== this.player);
        this.fx.popText(c.x, c.y - c.radius - 30, mode === 'wait' ? '기다려!' : '따라와!', { color: '#9fe8ff', size: 20 });
        this.fx.popText(this.player.x, this.player.y - this.player.radius - 30, mode === 'wait' ? '거기 있어!' : '이리 와!', { color: '#ffffff', size: 16 });
      }
      this.companion.record(this.player);
      const c = this.monsters.find((o) => o !== this.player);
      this.companion.think(dt, c, this.player);
    }

    for (const m of this.monsters) {
      m.controls?.update?.();
      this.eggs.handleActions(m);
    }
    for (const m of this.monsters) m.update(dt);
    this.eggs.update(dt);
    for (const g of this.guards) g.update(dt);
    this.fog.update();
    this.stats.playTime += dt;

    const p = this.player;
    const pips = '●'.repeat(p.dashCharges) + '○'.repeat(CONFIG.monster.dashCharges - p.dashCharges);
    this.hudText.setText(`${p.type.name}   대시 ${pips}\n확보 가치 ${this.secured.toFixed(2)} / 할당량 ${CONFIG.run.quota}   소란도 ${this.tension.toFixed(0)}` +
      (this.mode === 'solo' ? `\n동료: ${this.companion.mode === 'wait' ? '기다려' : '따라와'}  (Tab 교체 / Q 전환)` : ''));
    keys.endFrame();
  }
}

function newStats() {
  return {
    deposited: 0, cracks: 0, broken: 0, caught: 0, chaser: false, swaps: 0,
    coopTime: 0, dragTime: 0, swallowTime: 0, playTime: 0, throws: 0, catches: 0,
  };
}
