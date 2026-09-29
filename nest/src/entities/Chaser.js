import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { CAT, MASK } from '../systems/physics.js';
import { hasClearPath } from '../systems/Los.js';

// 추격자(우두머리 괴수): 소란도 100 도달 시 1회 등장. 알을 가진 몬스터 위치를 항상 알고 쫓아온다. 일정 시간 후 퇴장.
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
    this.view.setScale(0);
    scene.tweens.add({ targets: this.view, scale: 1, duration: 400, ease: 'Back.easeOut' });
  }

  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }
  get remaining() { return Math.max(0, CONFIG.chaser.duration - this.life); }

  target() {
    const ms = this.scene.monsters.filter((m) => !m.stunned);
    const withEgg = ms.filter((m) => m.hasEgg);
    const pool = withEgg.length ? withEgg : ms;
    let best = null, bd = Infinity;
    for (const m of pool) {
      const d = Phaser.Math.Distance.Between(this.x, this.y, m.x, m.y);
      if (d < bd) { bd = d; best = m; }
    }
    return { m: best, hunting: withEgg.length > 0 };
  }

  update(dt) {
    if (this.gone) return;
    this.life += dt;
    if (!this.leaving && this.life >= CONFIG.chaser.duration) this.leave();
    this.gloat = Math.max(0, this.gloat - dt);
    this.stunTimer = Math.max(0, this.stunTimer - dt);

    const setV = (vx, vy) => this.scene.matter.body.setVelocity(this.body, { x: vx / 60, y: vy / 60 });
    const { m, hunting } = this.target();
    if (this.leaving || this.gloat > 0 || this.stunTimer > 0 || !m) {
      setV(0, 0);
    } else {
      // 알이 없으면 느릿느릿 어슬렁
      const sp = hunting ? CONFIG.chaser.speed : CONFIG.guard.patrolSpeed;
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

      if (Phaser.Math.Distance.Between(this.x, this.y, m.x, m.y) < this.radius + m.radius + 3) {
        if (m.stun(this.x, this.y)) {
          this.gloat = 1.5;
          this.scene.fx.popText(this.x, this.y - 50, '크아앙!', { color: '#ff8a8a', size: 22, depth: 56 });
        }
      }
    }
    this.view.setPosition(this.x, this.y);
    this.view.setVisible(!this.hidden);
    this.tag.setVisible(!this.hidden);
    this.view.setDepth(this.inBush ? 15 : 13);
    this.gfx.rotation = this.angle;
    this.tag.setPosition(this.x, this.y - this.radius - 18);
    this.tag.setText(this.stunTimer > 0 ? '★ 기절 ★' : `우두머리 ${Math.ceil(this.remaining)}`);
  }

  hitByThrow() {
    this.stunTimer = CONFIG.stone.bossStunTime;
    this.path = null;
  }

  leave() {
    this.leaving = true;
    this.scene.fx.popText(this.x, this.y - 30, '퇴장...', { color: '#ffaaaa', size: 20, depth: 56 });
    this.scene.tweens.add({
      targets: [this.view, this.tag], alpha: 0, duration: 800, onComplete: () => this.destroy(),
    });
  }

  destroy() {
    if (this.gone) return;
    this.gone = true;
    this.scene.matter.world.remove(this.body);
    this.view.destroy();
    this.tag.destroy();
  }
}
