import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { CAT, MASK } from '../systems/physics.js';
import { Sfx } from '../systems/Sfx.js';

// 알. 상태(state):
//   ground   바닥에 놓여 물리적으로 굴러다님
//   carried  작은 알을 한 마리가 들고 있음(손/뿔)
//   swallowed 꿀떡이 배 속
//   air      던져져서 날아가는 중(가짜 높이 z)
//   drag     큰 알을 한 마리가 질질 끄는 중(물리 유지)
//   coop     큰 알을 두 마리가 함께 운반 중(물리 유지)
export default class Egg {
  constructor(scene, x, y, kind) {
    this.scene = scene;
    this.kind = kind;
    this.big = kind === 'big';
    this.radius = this.big ? 22 : 11;
    this.body = scene.matter.add.circle(x, y, this.radius, {
      density: this.big ? 0.03 : 0.002,
      frictionAir: this.big ? 0.25 : 0.06,
      friction: 0.05,
      restitution: 0.35,
      label: 'egg',
      collisionFilter: { category: CAT.EGG, mask: MASK.EGG, group: 0 },
    });
    this.body.gameEgg = this;

    this.state = 'ground';
    this.holder = null;
    this.cracks = 0;
    this.broken = false;
    this.deposited = false;
    this.z = 0;
    this.air = null;
    this.prevSpeed = 0;
    this.crackCd = 0;
    this.seen = false;       // 한 번이라도 본 적 있는지(안개 기억용)
    this.visible = true;     // 지금 플레이어 시야 안인지
    this.lastSeen = { x, y };
    this.crackPaths = [0, 1, 2].map((i) => this.makeCrackPath(i));

    this.buildView();
  }

  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }
  get baseValue() { return this.big ? CONFIG.egg.bigValue : CONFIG.egg.smallValue; }
  get value() {
    if (this.broken) return 0;
    return Math.max(0, this.baseValue * (1 - this.cracks * CONFIG.egg.crackValueLoss));
  }
  get speedPx() {
    const v = this.body.velocity;
    return Math.hypot(v.x, v.y) * 60;
  }

  // 금 모양: 가장자리 한 점에서 안쪽으로 지그재그
  makeCrackPath(i) {
    const rx = this.radius * 0.8, ry = this.radius * 1.05;
    const a = (i * 2.1 + Math.random() * 0.8) - Math.PI / 2;
    const pts = [{ x: Math.cos(a) * rx, y: Math.sin(a) * ry }];
    const steps = 4;
    for (let s = 1; s <= steps; s++) {
      const t = 1 - s / (steps + 1.5);
      const jitter = (s % 2 ? 1 : -1) * this.radius * 0.28;
      pts.push({
        x: Math.cos(a) * rx * t + Math.cos(a + Math.PI / 2) * jitter,
        y: Math.sin(a) * ry * t + Math.sin(a + Math.PI / 2) * jitter,
      });
    }
    return pts;
  }

  buildView() {
    const s = this.scene;
    this.shadow = s.add.ellipse(this.x, this.y + this.radius * 0.6, this.radius * 1.8, this.radius * 0.7, 0x000000, 0.35).setDepth(7);
    this.view = s.add.container(this.x, this.y).setDepth(8);
    this.gfx = s.add.graphics();
    this.view.add(this.gfx);
    this.redraw();
  }

  redraw() {
    const g = this.gfx;
    const rx = this.radius * 0.8, ry = this.radius * 1.05;
    const base = this.big ? 0xcfe6ff : 0xfff1d0;
    const tint = [base, this.big ? 0xbcd6f0 : 0xf0dfb8, this.big ? 0xa9c3dd : 0xe0c898][Math.min(this.cracks, 2)];
    g.clear();
    g.fillStyle(tint, 1);
    g.lineStyle(this.big ? 3 : 2, 0x3a3226, 1);
    g.fillEllipse(0, 0, rx * 2, ry * 2);
    g.strokeEllipse(0, 0, rx * 2, ry * 2);
    // 반짝이
    g.fillStyle(0xffffff, 0.7);
    g.fillEllipse(-rx * 0.35, -ry * 0.4, rx * 0.5, ry * 0.35);
    if (this.big) {
      // 큰 알 점박이
      g.fillStyle(0x6b8fb3, 0.8);
      [[0.3, 0.1, 0.18], [-0.25, 0.45, 0.14], [0.1, -0.5, 0.12], [-0.45, -0.05, 0.1]].forEach(([px, py, pr]) => {
        g.fillCircle(px * rx, py * ry, pr * rx);
      });
    }
    // 금
    g.lineStyle(this.big ? 3 : 2, 0x1a120a, 1);
    for (let i = 0; i < Math.min(this.cracks, 3); i++) {
      g.strokePoints(this.crackPaths[i], false);
    }
  }

  // 물리 충돌 켜기/끄기(들고 있거나 날아갈 때는 끔)
  setPhysicsActive(active) {
    this.body.collisionFilter.mask = active ? MASK.EGG : MASK.NONE;
    if (!active) this.scene.matter.body.setVelocity(this.body, { x: 0, y: 0 });
  }

  setGroup(group) {
    this.body.collisionFilter.group = group;
  }

  moveTo(x, y) {
    this.scene.matter.body.setPosition(this.body, { x, y });
    this.scene.matter.body.setVelocity(this.body, { x: 0, y: 0 });
  }

  setVelocityPx(vx, vy) {
    this.scene.matter.body.setVelocity(this.body, { x: vx / 60, y: vy / 60 });
  }

  // 충격 → 금 1단계. reason 은 기록용.
  crack(reason = '') {
    if (this.broken || this.deposited || this.state === 'swallowed') return false;
    if (this.crackCd > 0) return false;
    this.crackCd = CONFIG.egg.crackCooldown;
    this.cracks++;
    this.scene.stats.cracks++;
    if (this.cracks >= CONFIG.egg.maxCracks) {
      this.shatter();
      return true;
    }
    this.redraw();
    const { x, y } = this.displayPos();
    this.scene.fx.popText(x, y - this.radius - 8, '쩍!', { color: '#ffd166', size: this.big ? 28 : 24 });
    this.scene.fx.shake(120, 0.004 + this.cracks * 0.002);
    this.scene.noise.emit(x, y, CONFIG.noise.crack, 'crack');
    Sfx.crack();
    this.scene.tweens.add({ targets: this.view, scaleX: 1.35, scaleY: 0.75, duration: 70, yoyo: true, repeat: 1 });
    this.scene.fx.burst(x, y, 0xfff1d0, 4, 60, 3);
    return true;
  }

  shatter() {
    this.broken = true;
    const { x, y } = this.displayPos();
    this.scene.stats.broken++;
    this.scene.eggs.onEggBroken(this);
    this.scene.fx.popText(x, y - 10, '쨍그랑!!', { color: '#ff5d5d', size: 40, rise: 70, duration: 1200 });
    this.scene.fx.shake(350, 0.018);
    this.scene.fx.burst(x, y, this.big ? 0xcfe6ff : 0xfff1d0, this.big ? 28 : 18, this.big ? 260 : 200, this.big ? 9 : 6);
    this.scene.fx.burst(x, y, 0xffd23f, 10, 120, 5); // 노른자
    this.scene.fx.ring(x, y, 0xff5d5d, 90, 450);
    // 바닥에 노른자 얼룩(잠시 남김)
    const splat = this.scene.add.ellipse(x, y, this.radius * 3, this.radius * 2, 0xffc53d, 0.8).setDepth(3);
    this.scene.tweens.add({ targets: splat, alpha: 0, delay: 4000, duration: 2000, onComplete: () => splat.destroy() });
    this.scene.noise.emit(x, y, CONFIG.noise.break, 'break');
    this.scene.addTension(CONFIG.tension.eggBreak, 'break');
    Sfx.break();
    this.destroy();
  }

  displayPos() {
    return { x: this.view.x, y: this.view.y };
  }

  update(dt) {
    this.crackCd = Math.max(0, this.crackCd - dt);
    if (this.state === 'air') this.updateAir(dt);
    this.prevSpeed = this.speedPx;
    this.syncView();
  }

  updateAir(dt) {
    const E = CONFIG.egg;
    const a = this.air;
    a.t += dt;
    let nx = this.x + a.vx * dt;
    let ny = this.y + a.vy * dt;
    const r = this.radius;
    // 벽에 맞으면 튕기고 금 1단계
    const hitX = this.scene.isWallAt(nx + Math.sign(a.vx) * r, this.y);
    const hitY = this.scene.isWallAt(this.x, ny + Math.sign(a.vy) * r);
    if (hitX || hitY) {
      if (hitX) { a.vx *= -0.45; nx = this.x; }
      if (hitY) { a.vy *= -0.45; ny = this.y; }
      Sfx.bump();
      this.crack('wall-throw');
      if (this.broken) return;
    }
    this.moveTo(nx, ny);
    a.vz -= E.throwGravity * dt;
    this.z += a.vz * dt;

    // 다른 몬스터가 받기
    if (this.z < E.catchMaxHeight) {
      for (const m of this.scene.monsters) {
        if (m === a.thrower && a.t < 0.3) continue;
        if (!m.canHold()) continue;
        if (Phaser.Math.Distance.Between(m.x, m.y, this.x, this.y) < m.radius + this.radius + E.catchRadius) {
          this.scene.eggs.catchEgg(m, this);
          return;
        }
      }
    }

    if (this.z <= 0) {
      const impact = -a.vz;
      this.z = 0;
      this.air = null;
      this.state = 'ground';
      this.setPhysicsActive(true);
      this.setVelocityPx(a.vx * 0.3, a.vy * 0.3);
      if (impact >= E.landCrackSpeed) this.crack('land');
      else Sfx.bump();
      this.scene.noise.emit(this.x, this.y, CONFIG.noise.bump, 'land');
    }
  }

  syncView() {
    if (this.broken) return;
    let x = this.x, y = this.y, z = this.z, scale = 1, depth = 8;
    const h = this.holder;
    if (this.state === 'carried' && h) {
      if (h.carryMode === 'horn') {
        const d = h.radius * 1.5 + this.radius * 0.5;
        x = h.x + h.facing.x * d; y = h.y + h.facing.y * d;
        z = 6;
      } else {
        x = h.x; y = h.y; z = h.radius + 14; scale = 0.85;
      }
      depth = 11;
    }
    const hidden = this.state === 'swallowed';
    // 안개: 안 보이는 알은 숨김(기억 표시는 GameScene 이 따로 그림)
    const show = !hidden && (this.visible || this.state === 'carried' || this.state === 'coop' || this.state === 'drag');
    this.view.setVisible(show);
    this.shadow.setVisible(show);
    // 곧 깨질 알(금 2단계)은 부들부들 떨림
    const wobble = this.cracks >= 2 ? Math.sin(this.scene.time.now * 0.03) * 0.12 : 0;
    this.view.setPosition(x, y - z).setScale(scale).setDepth(depth);
    this.view.rotation = wobble;
    const zs = Math.max(0.4, 1 - z / 150);
    this.shadow.setPosition(x, y + this.radius * 0.6).setScale(zs * scale).setAlpha(0.35 * zs);
  }

  destroy() {
    this.scene.matter.world.remove(this.body);
    this.view.destroy();
    this.shadow.destroy();
  }
}
