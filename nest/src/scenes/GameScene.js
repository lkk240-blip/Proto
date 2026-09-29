import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import forest01 from '../maps/forest01.js';
import { parseMap, isWallAt } from '../systems/MapLoader.js';
import { keys, PlayerControls } from '../systems/Input.js';
import NoiseSystem from '../systems/NoiseSystem.js';
import EggSystem from '../systems/EggSystem.js';
import Fx from '../systems/Fx.js';
import Pathfinder from '../systems/Pathfinder.js';
import Companion from '../systems/Companion.js';
import { isFreeSpot } from '../systems/Los.js';
import { Sfx } from '../systems/Sfx.js';
import Monster from '../entities/Monster.js';
import Guard from '../entities/Guard.js';
import Chaser from '../entities/Chaser.js';
import { incrementRunCount } from '../systems/RunLog.js';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  init(data) {
    this.mode = data?.mode || this.registry.get('mode') || 'solo'; // 'solo' | 'duo'
  }

  create() {
    this.map = parseMap(forest01, CONFIG.world.tileSize);
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
    this.elapsed = 0;
    this.ended = false;
    this.exitHold = 0;
    this.bothInExit = false;

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

    const cam = this.cameras.main;
    cam.setBounds(0, 0, W, H);
    if (this.mode === 'solo') {
      cam.setZoom(CONFIG.camera.soloZoom);
      cam.startFollow(this.player.view, true, CONFIG.camera.followLerp, CONFIG.camera.followLerp);
    }

    this.scene.launch('Hud');
    this.hud = this.scene.get('Hud');
    this.events.once('shutdown', () => this.scene.stop('Hud'));
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
    const routes = (forest01.guardRoutes || []).map((r) => ({
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

  // 숲·풀밭·바위·출구를 한 번 그려서 텍스처로 굽는다(매 프레임 수천 개 도형을 다시 그리지 않도록)
  drawMap() {
    const { grid, chars, width, height, tileSize: ts, pixelWidth: W, pixelHeight: H } = this.map;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    const rnd = (x, y, k = 0) => {
      const n = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
      return n - Math.floor(n);
    };
    const isFloor = (x, y) => x >= 0 && y >= 0 && x < width && y < height && !grid[y][x];

    // 풀밭
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = rnd(x, y);
        const c = Phaser.Display.Color.GetColor(58 + v * 14, 98 + v * 18, 50 + v * 10);
        g.fillStyle(c, 1);
        g.fillRect(x * ts, y * ts, ts, ts);
        if (!grid[y][x]) {
          // 풀 포기·꽃
          if (rnd(x, y, 1) > 0.6) {
            g.lineStyle(2, 0x5f9a4c, 0.8);
            const px = x * ts + rnd(x, y, 2) * ts, py = y * ts + rnd(x, y, 3) * ts;
            g.lineBetween(px, py, px - 3, py - 7);
            g.lineBetween(px, py, px + 2, py - 8);
          }
          if (rnd(x, y, 4) > 0.97) {
            g.fillStyle(rnd(x, y, 5) > 0.5 ? 0xf2e36b : 0xf0a3c8, 1);
            g.fillCircle(x * ts + rnd(x, y, 6) * ts, y * ts + rnd(x, y, 7) * ts, 3);
          }
        }
      }
    }

    // 출구: 숲 밖으로 이어지는 흙길
    const ex = this.map.exitRect;
    if (ex) {
      g.fillStyle(0xb99a64, 0.55);
      g.fillRect(ex.x, ex.y, ex.w, ex.h);
      g.lineStyle(4, 0x7dffa0, 0.9);
      g.strokeRect(ex.x + 2, ex.y + 2, ex.w - 4, ex.h - 4);
    }

    // 둥지 자리
    for (const n of this.map.points.nests) {
      g.lineStyle(10, 0x9c7a45, 0.9);
      g.strokeCircle(n.x, n.y, ts * 1.4);
      g.lineStyle(3, 0x6b5230, 0.9);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        g.lineBetween(n.x + Math.cos(a) * ts * 1.1, n.y + Math.sin(a) * ts * 1.1, n.x + Math.cos(a + 0.5) * ts * 1.7, n.y + Math.sin(a + 0.5) * ts * 1.7);
      }
    }

    // 숲(#): 깊은 숲은 어둡게, 풀밭과 맞닿은 가장자리는 나무 꼭대기(원)를 겹쳐 그려 자연스럽게
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (chars[y][x] !== '#') continue;
        g.fillStyle(0x16291a, 1);
        g.fillRect(x * ts, y * ts, ts, ts);
      }
    }
    const edgeTrees = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (chars[y][x] !== '#') continue;
        const edge = isFloor(x + 1, y) || isFloor(x - 1, y) || isFloor(x, y + 1) || isFloor(x, y - 1);
        const near2 = edge || isFloor(x + 2, y) || isFloor(x - 2, y) || isFloor(x, y + 2) || isFloor(x, y - 2);
        if (near2 || rnd(x, y, 8) > 0.55) edgeTrees.push({ x, y, edge });
      }
    }
    // 나무 그림자(풀밭 쪽으로)
    for (const t of edgeTrees) {
      if (!t.edge) continue;
      g.fillStyle(0x000000, 0.22);
      g.fillCircle(t.x * ts + ts / 2 + 5, t.y * ts + ts / 2 + 8, ts * 0.75);
    }
    for (const t of edgeTrees) {
      const cx = t.x * ts + ts / 2 + (rnd(t.x, t.y, 9) - 0.5) * 8;
      const cy = t.y * ts + ts / 2 + (rnd(t.x, t.y, 10) - 0.5) * 8;
      const r = ts * (0.6 + rnd(t.x, t.y, 11) * 0.25);
      const dark = t.edge ? 0x2a4d2a : 0x1f3b21;
      g.fillStyle(dark, 1);
      g.fillCircle(cx, cy, r);
      g.fillStyle(t.edge ? 0x3b6b37 : 0x28492a, 1);
      g.fillCircle(cx - r * 0.25, cy - r * 0.25, r * 0.6);
      if (t.edge) {
        g.fillStyle(0x4f8646, 0.8);
        g.fillCircle(cx - r * 0.35, cy - r * 0.38, r * 0.25);
      }
    }

    // 바위(o)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (chars[y][x] !== 'o') continue;
        const cx = x * ts + ts / 2, cy = y * ts + ts / 2;
        g.fillStyle(0x000000, 0.25);
        g.fillEllipse(cx + 4, cy + 8, ts * 1.1, ts * 0.7);
        g.fillStyle(0x6f747c, 1);
        g.fillCircle(cx, cy, ts * 0.62);
        g.fillStyle(0x8d939b, 1);
        g.fillCircle(cx - 4, cy - 5, ts * 0.36);
        g.lineStyle(2, 0x3f434a, 1);
        g.strokeCircle(cx, cy, ts * 0.62);
      }
    }

    const rt = this.add.renderTexture(0, 0, W, H).setOrigin(0, 0).setDepth(0);
    rt.draw(g);
    g.destroy();

    if (ex) {
      this.add.text(ex.x + ex.w / 2 + 10, ex.y - 14, '← 출구', {
        fontFamily: 'sans-serif', fontSize: '18px', color: '#7dffa0', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
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

  // ---------- 게임 규칙 훅 ----------
  isWallAt(x, y) {
    return isWallAt(this.map, x, y);
  }

  addTension(amount) {
    if (this.ended || this.stats.chaser) return; // 추격자는 한 판에 1회뿐 — 이후 소란도는 더 오르지 않음
    this.tension = Math.min(100, this.tension + amount);
    if (this.tension >= 100) this.spawnChaser();
  }

  // 소란도 100: 맵 반대편(플레이어에게서 가장 먼 지점)에서 추격자(우두머리 괴수) 등장
  spawnChaser() {
    this.stats.chaser = true;
    const pts = [...this.map.points.nests, ...Object.values(this.map.points.waypoints), ...this.map.points.guards];
    let best = pts[0], bd = -1;
    for (const q of pts) {
      const d = Math.min(...this.monsters.map((m) => Math.hypot(q.x - m.x, q.y - m.y)));
      if (d > bd) { bd = d; best = q; }
    }
    this.chaser = new Chaser(this, best.x, best.y);
    this.fx.shake(500, 0.015);
    this.hud?.showBanner('우두머리 괴수가 깨어났다!', '#ff4d4d');
    this.hud?.redFlash();
    Sfx.siren();
  }

  timeLeft() {
    return CONFIG.run.timeLimit - this.elapsed;
  }

  togglePause() {
    this.paused = !this.paused;
    if (this.paused) { this.matter.world.pause(); this.tweens.pauseAll(); }
    else { this.matter.world.resume(); this.tweens.resumeAll(); }
    this.hud?.setPaused(this.paused);
  }

  endRun(reason) {
    if (this.ended) return;
    this.ended = true;
    const runNumber = incrementRunCount();
    const result = {
      mode: this.mode,
      reason,
      success: this.secured >= CONFIG.run.quota,
      secured: this.secured,
      quota: CONFIG.run.quota,
      stats: { ...this.stats },
      runNumber,
    };
    this.hud?.showBanner(result.success ? '성공!' : '종료!', result.success ? '#5dff9a' : '#ffd166');
    this.matter.world.pause();
    this.time.delayedCall(1300, () => this.scene.start('Result', result));
  }

  // 조기 탈출: 두 마리 모두 출구 존 안 + E 길게
  updateExit(dt) {
    this.bothInExit = this.monsters.every((m) => this.eggs.inExit(m.x, m.y));
    const holding = this.bothInExit && this.monsters.some((m) => m.controls?.isHeld?.('grab'));
    this.exitHold = holding ? this.exitHold + dt : 0;
    if (this.exitHold >= CONFIG.run.exitHoldTime) this.endRun('조기 탈출');
  }

  onDeposit(egg, value) {
    this.secured += value;
    this.stats.deposited++;
  }

  // ---------- 프레임 ----------
  update(time, deltaMs) {
    const dt = Math.min(deltaMs, 50) / 1000; // 프레임이 크게 튀어도 한 번에 0.05초까지만
    if (this.ended) { keys.endFrame(); return; }

    if (keys.wasPressed('Escape')) this.togglePause();
    if (this.paused) {
      if (keys.wasPressed('KeyM')) this.scene.start(this.scene.get('Start') ? 'Start' : 'Game');
      keys.endFrame();
      return;
    }

    if (this.mode === 'solo') {
      if (keys.wasPressed('Tab')) this.swap();
      if (keys.wasPressed('KeyQ')) {
        const mode = this.companion.toggleMode();
        const c = this.monsters.find((o) => o !== this.player);
        this.fx.popText(c.x, c.y - c.radius - 30, mode === 'wait' ? '기다려!' : '따라와!', { color: '#9fe8ff', size: 20 });
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
    if (this.chaser) {
      this.chaser.update(dt);
      if (this.chaser.gone) this.chaser = null;
    }
    if (this.mode === 'duo') this.updateDuoCamera();

    this.elapsed += dt;
    this.stats.playTime += dt;
    this.updateExit(dt);
    if (this.timeLeft() <= 0) this.endRun('시간 종료');
    keys.endFrame();
  }

  // 2인 모드 카메라: 두 몬스터를 모두 담도록 중심·줌 조정
  updateDuoCamera() {
    const C = CONFIG.camera;
    const cam = this.cameras.main;
    const [a, b] = this.monsters;
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const needW = Math.abs(a.x - b.x) + C.duoPadding * 2;
    const needH = Math.abs(a.y - b.y) + C.duoPadding * 2;
    const zoom = Phaser.Math.Clamp(Math.min(cam.width / needW, cam.height / needH), C.duoMinZoom, C.duoMaxZoom);
    cam.setZoom(Phaser.Math.Linear(cam.zoom, zoom, 0.08));
    const tx = Phaser.Math.Linear(cam.midPoint.x, cx, C.followLerp);
    const ty = Phaser.Math.Linear(cam.midPoint.y, cy, C.followLerp);
    cam.centerOn(tx, ty);
  }
}

function newStats() {
  return {
    deposited: 0, cracks: 0, broken: 0, caught: 0, chaser: false, swaps: 0,
    coopTime: 0, dragTime: 0, swallowTime: 0, playTime: 0, throws: 0, catches: 0,
  };
}
