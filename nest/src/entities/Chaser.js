import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { CAT, MASK } from '../systems/physics.js';
import { hasClearPath, hasLineOfSight } from '../systems/Los.js';
import { Sfx } from '../systems/Sfx.js';

// 우두머리 괴수(코드상 이름은 Chaser). 둥지 옆 잠자리(맵 글자 K)에서 자면서 시작한다.
// 깨우는 방법: ① 소음이 쌓여 깸 게이지가 가득 참 ② 몸에 닿음(직접 깨움) ③ 돌·알에 맞음 ④ 소란도 100
// 깨어나면: 알 냄새를 따라 슬금슬금 접근(stalk) — 수풀이 있으면 매복, 몬스터가 보이면 발견 게이지가 서서히 참
//          → 가득 차면 포효하며 돌진(hunt). 깨어 있는 시간이 끝나면 잠자리로 돌아가(return) 다시 잔다.
export default class Chaser {
  constructor(scene, x, y) {
    this.scene = scene;
    this.radius = CONFIG.chaser.radius;
    this.lair = { x, y };
    this.body = scene.matter.add.circle(x, y, this.radius, {
      friction: 0, frictionStatic: 0, frictionAir: 0, inertia: Infinity, label: 'chaser',
      collisionFilter: { category: CAT.GUARD, mask: MASK.GUARD, group: 0 },
    });
    this.mode = 'sleep';        // sleep → waking → stalk → hunt → return → sleep
    this.modeTimer = 0;
    this.awake = 0;             // 깨어난 뒤 흐른 시간
    this.wake = 0;              // 깸 게이지(잘 때)
    this.awareness = 0;         // 발견 게이지(깨어 있을 때)
    this.path = null;
    this.repath = 0;
    this.gloat = 0;
    this.stunTimer = 0;
    this.lurking = false;
    this.gone = false;          // (구버전 호환) 사라지지 않음
    this.angle = Math.PI;

    this.view = scene.add.container(x, y).setDepth(13);
    this.bodyC = scene.add.container(0, 0);
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
    this.eyes = scene.add.graphics();
    this.gfx = g;
    this.bodyC.add([g, this.eyes]);
    this.view.add(this.bodyC);
    this.drawEyes(false);
    this.tag = scene.add.text(x, y - r - 18, '', {
      fontFamily: 'sans-serif', fontSize: '15px', fontStyle: 'bold', color: '#ff5d5d', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(56);
    this.meter = scene.add.graphics().setDepth(56);
    this.breath = scene.tweens.add({ targets: this.bodyC, scaleX: 1.05, scaleY: 0.95, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }
  get asleep() { return this.mode === 'sleep'; }
  get remaining() { return Math.max(0, CONFIG.chaser.duration - this.awake); }

  drawEyes(open) {
    const g = this.eyes, r = this.radius;
    g.clear();
    for (const sgn of [-1, 1]) {
      if (open) {
        g.fillStyle(0xfff36b, 1);
        g.fillCircle(r * 0.6, sgn * r * 0.32, r * 0.14);
      } else {
        g.lineStyle(4, 0x2a0505, 1);
        g.lineBetween(r * 0.5, sgn * r * 0.2, r * 0.7, sgn * r * 0.42);
      }
    }
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.modeTimer = 0;
    this.path = null;
    this.drawEyes(mode !== 'sleep');
    this.breath.timeScale = mode === 'sleep' ? 1 : 3;
  }

  // 깨우기(이유: noise / touch / hit / tension)
  wakeUp(reason, where) {
    if (this.mode !== 'sleep') return;
    this.setMode('waking');
    this.awake = 0;
    this.awareness = reason === 'touch' || reason === 'hit' ? 100 : 50;
    this.scene.stats.chaser = true;
    this.scene.stats.bossWakes = (this.scene.stats.bossWakes || 0) + 1;
    this.scene.fx.popText(this.x, this.y - this.radius - 40, '크아아앙!!', { color: '#ff4d4d', size: 36, rise: 50, duration: 1300, depth: 56 });
    this.scene.fx.shake(500, 0.015);
    this.scene.hud?.showBanner('우두머리 괴수가 깨어났다!', '#ff4d4d');
    this.scene.hud?.redFlash();
    Sfx.siren();
    this.scene.tweens.add({ targets: this.bodyC, scaleX: 1.3, scaleY: 1.3, duration: 160, yoyo: true, repeat: 1 });
  }

  // 소음: 잘 때는 깸 게이지, 깨어 있을 때는 발견 게이지를 조금 올림
  hear(n) {
    const C = CONFIG.chaser;
    const d = Phaser.Math.Distance.Between(this.x, this.y, n.x, n.y);
    if (d > n.size + C.hearingRadius + this.radius) return;
    if (this.mode === 'sleep') {
      this.wake += n.size * C.sleepHearingMul;
      if (this.wake >= C.wakeThreshold) this.wakeUp('noise', n);
      else {
        this.scene.fx.popText(this.x, this.y - this.radius - 30, '그르렁..', { color: '#ffb3b3', size: 16, rise: 16, duration: 700, depth: 56 });
        this.scene.tweens.add({ targets: this.bodyC, angle: { from: -6, to: 6 }, duration: 100, yoyo: true, repeat: 1, onComplete: () => { this.bodyC.angle = 0; } });
      }
    } else if (this.mode === 'stalk') {
      this.awareness = Math.min(100, this.awareness + n.size * 0.05);
    }
  }

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

  // 발견 게이지: 보이는 몬스터가 있으면 서서히 오름(수풀 속 몬스터는 느리게). 100이 되면 돌진.
  updateAwareness(dt) {
    const C = CONFIG.chaser;
    let gain = 0;
    for (const m of this.scene.monsters) {
      if (m.stunned) continue;
      const d = Phaser.Math.Distance.Between(this.x, this.y, m.x, m.y);
      if (d > C.sightRange || !hasLineOfSight(this.scene.map, this.x, this.y, m.x, m.y)) continue;
      const near = 1 + (1 - d / C.sightRange);
      const hidden = m.inBush && d > this.radius + CONFIG.bush.closeRange;
      gain += C.awareRate * near * (m.hasEgg ? CONFIG.guard.carryingMul : 1) * (hidden ? CONFIG.bush.sightMul : 1);
    }
    if (gain > 0) this.awareness = Math.min(100, this.awareness + gain * dt);
    else this.awareness = Math.max(0, this.awareness - C.awareDecay * dt);
  }

  moveTo(target, speed, dt) {
    const setV = (vx, vy) => this.scene.matter.body.setVelocity(this.body, { x: vx / 60, y: vy / 60 });
    let next = target;
    if (!hasClearPath(this.scene.map, this.x, this.y, target.x, target.y, this.radius)) {
      this.repath -= dt;
      if (!this.path || this.repath <= 0) {
        this.path = this.scene.pathfinder.find(this.x, this.y, target.x, target.y, this.radius);
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
    const d = Math.hypot(dx, dy);
    if (d < 3) { setV(0, 0); return; }
    setV((dx / d) * speed, (dy / d) * speed);
    this.angle = Phaser.Math.Angle.RotateTo(this.angle, Math.atan2(dy, dx), 8 * dt);
  }

  update(dt) {
    const C = CONFIG.chaser;
    this.modeTimer += dt;
    this.gloat = Math.max(0, this.gloat - dt);
    this.stunTimer = Math.max(0, this.stunTimer - dt);
    const stop = () => this.scene.matter.body.setVelocity(this.body, { x: 0, y: 0 });
    const { m, hunting, dist } = this.target();

    if (this.mode === 'sleep') {
      stop();
      this.wake = Math.max(0, this.wake - C.wakeDecay * dt);
      // 몸에 닿으면 벌떡 깸(직접 깨우기)
      for (const mo of this.scene.monsters) {
        if (!mo.stunned && Phaser.Math.Distance.Between(this.x, this.y, mo.x, mo.y) < this.radius + mo.radius + 3) {
          this.wakeUp('touch', mo);
          break;
        }
      }
    } else if (this.mode === 'waking') {
      stop();
      if (m) this.angle = Phaser.Math.Angle.RotateTo(this.angle, Math.atan2(m.y - this.y, m.x - this.x), 4 * dt);
      if (this.modeTimer >= C.groggyTime) this.setMode(this.awareness >= 100 ? 'hunt' : 'stalk');
    } else if (this.mode === 'return') {
      this.moveTo(this.lair, C.stalkSpeed, dt);
      if (Phaser.Math.Distance.Between(this.x, this.y, this.lair.x, this.lair.y) < 16) {
        this.setMode('sleep');
        this.wake = 0;
        this.scene.onBossSleep();
        this.scene.fx.popText(this.x, this.y - this.radius - 30, '쿨... 쿨...', { color: '#ffb3b3', size: 18, depth: 56 });
      }
    } else {
      // stalk / hunt
      this.awake += dt;
      if (this.awake >= C.duration && this.stunTimer <= 0) {
        this.setMode('return');
        this.scene.fx.popText(this.x, this.y - this.radius - 30, '하아암...', { color: '#ffb3b3', size: 20, depth: 56 });
      }
      if (this.mode === 'stalk' && this.stunTimer <= 0) {
        this.updateAwareness(dt);
        if (this.awareness >= 100) {
          this.setMode('hunt');
          this.scene.fx.popText(this.x, this.y - this.radius - 40, '크아앙!!', { color: '#ff4d4d', size: 30, depth: 56 });
          this.scene.fx.shake(250, 0.01);
          this.scene.hud?.redFlash();
          Sfx.alert();
        }
      }
      this.lurking = this.mode === 'stalk' && this.inBush && hunting && dist <= C.lurkRange;
      if (this.gloat > 0 || this.stunTimer > 0 || !m || this.lurking) {
        stop();
        if (this.lurking && m) this.angle = Phaser.Math.Angle.RotateTo(this.angle, Math.atan2(m.y - this.y, m.x - this.x), 3 * dt);
      } else if (this.mode === 'hunt' || this.mode === 'stalk') {
        const sp = this.mode === 'hunt' ? (hunting ? C.speed : CONFIG.guard.patrolSpeed) : C.stalkSpeed;
        this.moveTo(m, sp, dt);
      }
      // 닿으면 잡음
      if (m && this.gloat <= 0 && this.stunTimer <= 0 && (this.mode === 'stalk' || this.mode === 'hunt') &&
        Phaser.Math.Distance.Between(this.x, this.y, m.x, m.y) < this.radius + m.radius + 3) {
        if (m.stun(this.x, this.y, CONFIG.monster.bossDamage)) {
          this.gloat = 1.5;
          this.setMode('hunt');
          this.awareness = 100;
          this.scene.fx.popText(this.x, this.y - 50, '크아앙!', { color: '#ff8a8a', size: 22, depth: 56 });
        }
      }
    }
    this.syncView();
  }

  syncView() {
    this.view.setPosition(this.x, this.y);
    this.view.setVisible(!this.hidden);
    this.tag.setVisible(!this.hidden);
    this.meter.setVisible(!this.hidden);
    this.view.setDepth(this.inBush ? 15 : 13);
    this.bodyC.rotation = this.angle;
    this.tag.setPosition(this.x, this.y - this.radius - 18);
    const labels = {
      sleep: '우두머리 Zzz', waking: '우두머리 !!', stalk: this.lurking ? '우두머리 (매복 중…)' : '우두머리 (냄새를 맡는 중…)',
      hunt: `우두머리 ${Math.ceil(this.remaining)}`, return: '우두머리 (잠자리로…)',
    };
    this.tag.setText(this.stunTimer > 0 ? '★ 기절 ★' : labels[this.mode]);
    this.tag.setColor(this.mode === 'sleep' || this.mode === 'return' ? '#ffb3b3' : '#ff5d5d');
    const g = this.meter;
    g.clear();
    const w = 64, y = this.y - this.radius - 8;
    if (this.mode === 'sleep' && this.wake > 1) {
      g.fillStyle(0x000000, 0.6).fillRect(this.x - w / 2 - 1, y - 1, w + 2, 7);
      g.fillStyle(0xc49bff, 1).fillRect(this.x - w / 2, y, (w * Math.min(this.wake, CONFIG.chaser.wakeThreshold)) / CONFIG.chaser.wakeThreshold, 5);
    } else if (this.mode === 'stalk' && this.awareness > 1) {
      g.fillStyle(0x000000, 0.6).fillRect(this.x - w / 2 - 1, y - 1, w + 2, 7);
      g.fillStyle(0xff4d4d, 1).fillRect(this.x - w / 2, y, (w * this.awareness) / 100, 5);
    }
  }

  hitByThrow(from) {
    if (this.mode === 'sleep') { this.wakeUp('hit', from); return; }
    this.stunTimer = CONFIG.stone.bossStunTime;
    this.awareness = Math.min(100, this.awareness + 40); // 맞으면 화가 나서 더 빨리 알아챔
    this.path = null;
  }
}
