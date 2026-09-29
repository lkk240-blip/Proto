import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { CAT, MASK } from '../systems/physics.js';
import { hasClearPath, hasLineOfSight } from '../systems/Los.js';
import { Sfx } from '../systems/Sfx.js';

// 추격자(우두머리 괴수): 소란도 100 도달 시 1회 등장, 일정 시간 후 퇴장.
// 알 냄새를 따라 슬금슬금 다가오다가(stalk) 수풀이 있으면 숨어서 매복한다.
// 몬스터가 보이면 발견 게이지가 서서히 차고, 가득 차면 포효하며 돌진(hunt) — 이후엔 알 가진 몬스터를 끝까지 쫓는다.
export default class Chaser {
  constructor(scene, x, y) {
    this.scene = scene;
    this.radius = CONFIG.chaser.radius;
    this.body = scene.matter.add.circle(x, y, this.radius, {
      friction: 0, frictionStatic: 0, frictionAir: 0, inertia: Infinity, label: 'chaser',
      collisionFilter: { category: CAT.GUARD, mask: MASK.GUARD, group: 0 },
    });
    this.life = 0;
    this.leaving = false;
    this.gone = false;
    this.path = null;
    this.repath = 0;
    this.gloat = 0;
    this.stunTimer = 0;
    this.mode = 'stalk';        // stalk(발견 전: 접근/매복) → hunt(발견: 돌진)
    this.awareness = 0;         // 발견 게이지 0~100
    this.lurking = false;
    this.visible = true;
    this.angle = 0;

    // 우두머리 괴수: 경비 괴수보다 훨씬 크고 붉은 털
    this.view = scene.add.container(x, y).setDepth(13);
    const g = scene.add.graphics();
    const r = this.radius;
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(0, r * 0.6, r * 2.4, r * 1.0);
    g.fillStyle(0x5a1010, 1);
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * 0.5 + (i / 8) * Math.PI;
      g.fillCircle(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9, r * 0.45);
    }
    g.fillStyle(0xa3201f, 1);
    g.lineStyle(5, 0x2a0505, 1);
    g.fillCircle(0, 0, r);
    g.strokeCircle(0, 0, r);
    g.fillStyle(0xc84a3a, 1);
    g.fillEllipse(r * 0.4, 0, r * 0.9, r * 1.1);
    g.fillStyle(0x1a1a1a, 1);
    for (const sgn of [-1, 1]) g.fillTriangle(r * 0.1, sgn * r * 0.5, r * 0.5, sgn * r * 0.8, -r * 0.2, sgn * r * 1.55);
    g.fillStyle(0xffffff, 1);
    for (const sgn of [-1, 1]) g.fillTriangle(r * 0.85, sgn * r * 0.15, r * 0.95, sgn * r * 0.3, r * 1.15, sgn * r * 0.2); // 송곳니
    g.fillStyle(0xfff36b, 1);
    g.fillCircle(r * 0.6, -r * 0.32, r * 0.14);
    g.fillCircle(r * 0.6, r * 0.32, r * 0.14);
    this.gfx = g;
    this.view.add(g);
    // 다른 물체 위에도 보이는 경고 표시
    this.tag = scene.add.text(x, y - r - 18, '우두머리', {
      fontFamily: 'sans-serif', fontSize: '15px', fontStyle: 'bold', color: '#ff5d5d', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(56);
    this.meter = scene.add.graphics().setDepth(56);
    this.view.setScale(0);
    scene.tweens.add({ targets: this.view, scale: 1, duration: 400, ease: 'Back.easeOut' });
  }

  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }
  get remaining() { return Math.max(0, CONFIG.chaser.duration - this.life); }

  // 목표: 알을 가진 몬스터(없으면 가장 가까운 몬스터)
  target() {
    const ms = this.scene.monsters.filter((m) => !m.stunned);
    const withEgg = ms.filter((m) => m.hasEgg);
    const pool = withEgg.length ? withEgg : ms;
    let best = null, bd = Infinity;
    for (const m of pool) {
      const d = Phaser.Math.Distance.Between(this.x, this.y, m.x, m.y);
      if (d < bd) { bd = d; best = m; }
    }
    return { m: best, hunting: withEgg.length > 0, dist: bd };
  }

  // 발견 게이지: 보이는 몬스터가 있으면 서서히 오름(수풀 속 몬스터는 느리게). 100이 되면 포효하고 돌진.
  updateAwareness(dt) {
    const C = CONFIG.chaser;
    let gain = 0;
    for (const m of this.scene.monsters) {
      if (m.stunned) continue;
      const d = Phaser.Math.Distance.Between(this.x, this.y, m.x, m.y);
      if (d > C.sightRange || !hasLineOfSight(this.scene.map, this.x, this.y, m.x, m.y)) continue;
      const near = 1 + (1 - d / C.sightRange); // 가까울수록 최대 2배
      const hidden = m.inBush && d > this.radius + CONFIG.bush.closeRange;
      gain += C.awareRate * near * (m.hasEgg ? CONFIG.guard.carryingMul : 1) * (hidden ? CONFIG.bush.sightMul : 1);
    }
    if (gain > 0) this.awareness = Math.min(100, this.awareness + gain * dt);
    else this.awareness = Math.max(0, this.awareness - C.awareDecay * dt);
    if (this.awareness >= 100) {
      this.mode = 'hunt';
      this.scene.fx.popText(this.x, this.y - this.radius - 40, '크아아앙!!', { color: '#ff4d4d', size: 34, rise: 50, duration: 1100, depth: 56 });
      this.scene.fx.shake(300, 0.012);
      this.scene.hud?.redFlash();
      Sfx.alert();
    }
  }

  update(dt) {
    if (this.gone) return;
    this.life += dt;
    if (!this.leaving && this.life >= CONFIG.chaser.duration) this.leave();
    this.gloat = Math.max(0, this.gloat - dt);
    this.stunTimer = Math.max(0, this.stunTimer - dt);

    const C = CONFIG.chaser;
    const setV = (vx, vy) => this.scene.matter.body.setVelocity(this.body, { x: vx / 60, y: vy / 60 });
    const { m, hunting, dist } = this.target();
    if (this.mode !== 'hunt' && this.stunTimer <= 0 && !this.leaving) this.updateAwareness(dt);

    // 발견 전: 수풀 속에서 알 가진 몬스터가 가까우면 멈춰서 매복, 아니면 슬금슬금 접근
    this.lurking = this.mode !== 'hunt' && this.inBush && hunting && dist <= C.lurkRange;
    const busy = this.leaving || this.gloat > 0 || this.stunTimer > 0 || !m || this.lurking;
    if (busy) {
      setV(0, 0);
      if (this.lurking && m) this.angle = Phaser.Math.Angle.RotateTo(this.angle, Math.atan2(m.y - this.y, m.x - this.x), 3 * dt);
    } else {
      const sp = this.mode === 'hunt' ? (hunting ? C.speed : CONFIG.guard.patrolSpeed) : C.stalkSpeed;
      let next = m;
      if (!hasClearPath(this.scene.map, this.x, this.y, m.x, m.y, this.radius)) {
        this.repath -= dt;
        if (!this.path || this.repath <= 0) {
          this.path = this.scene.pathfinder.find(this.x, this.y, m.x, m.y, this.radius);
          this.repath = 0.35;
        }
        if (this.path && this.path.length) {
          while (this.path.length > 1 && Phaser.Math.Distance.Between(this.x, this.y, this.path[0].x, this.path[0].y) < 14) this.path.shift();
          next = this.path[0];
        }
      } else {
        this.path = null;
      }
      const dx = next.x - this.x, dy = next.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      setV((dx / d) * sp, (dy / d) * sp);
      this.angle = Math.atan2(dy, dx);
    }

    // 닿으면 잡음(발견 전이라도 부딪히면 잡힘)
    if (m && this.gloat <= 0 && this.stunTimer <= 0 && !this.leaving &&
      Phaser.Math.Distance.Between(this.x, this.y, m.x, m.y) < this.radius + m.radius + 3) {
      if (m.stun(this.x, this.y, CONFIG.monster.bossDamage)) {
        this.gloat = 1.5;
        this.mode = 'hunt';
        this.awareness = 100;
        this.scene.fx.popText(this.x, this.y - 50, '크아앙!', { color: '#ff8a8a', size: 22, depth: 56 });
      }
    }

    this.view.setPosition(this.x, this.y);
    this.view.setVisible(!this.hidden);
    this.tag.setVisible(!this.hidden);
    this.meter.setVisible(!this.hidden);
    this.view.setDepth(this.inBush ? 15 : 13);
    this.gfx.rotation = this.angle;
    this.tag.setPosition(this.x, this.y - this.radius - 18);
    let label = `우두머리 ${Math.ceil(this.remaining)}`;
    if (this.stunTimer > 0) label = '★ 기절 ★';
    else if (this.mode !== 'hunt') label = this.lurking ? '우두머리 (매복 중…)' : '우두머리 (냄새를 맡는 중…)';
    this.tag.setText(label);
    // 발견 게이지
    const g = this.meter;
    g.clear();
    if (this.mode !== 'hunt' && this.awareness > 1) {
      const w = 60, y = this.y - this.radius - 8;
      g.fillStyle(0x000000, 0.6).fillRect(this.x - w / 2 - 1, y - 1, w + 2, 7);
      g.fillStyle(0xff4d4d, 1).fillRect(this.x - w / 2, y, (w * this.awareness) / 100, 5);
    }
  }

  hitByThrow() {
    this.stunTimer = CONFIG.stone.bossStunTime;
    this.awareness = Math.min(100, this.awareness + 40); // 맞으면 화가 나서 더 빨리 알아챔
    this.path = null;
  }

  leave() {
    this.leaving = true;
    this.scene.fx.popText(this.x, this.y - 30, '퇴장...', { color: '#ffaaaa', size: 20, depth: 56 });
    this.scene.tweens.add({
      targets: [this.view, this.tag, this.meter], alpha: 0, duration: 800, onComplete: () => this.destroy(),
    });
  }

  destroy() {
    if (this.gone) return;
    this.gone = true;
    this.scene.matter.world.remove(this.body);
    this.view.destroy();
    this.tag.destroy();
    this.meter.destroy();
  }
}
