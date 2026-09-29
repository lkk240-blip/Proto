import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import Egg from '../entities/Egg.js';
import { newNoCollideGroup } from './physics.js';
import { isFreeSpot } from './Los.js';
import { Sfx } from './Sfx.js';

// 알 배치, 줍기/내려놓기/던지기/삼키기, 질질 끌기, 공동 운반, 충돌 충격, 입금을 담당.
export default class EggSystem {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.coops = [];
    scene.matter.world.on('collisionstart', (ev) => this.onCollision(ev));
  }

  // ---------- 배치 ----------
  spawn(nests) {
    const E = CONFIG.egg;
    const R = Phaser.Math.Between;
    const small = R(E.smallMin, Math.max(E.smallMin, E.smallMax));
    const big = Math.min(nests.length, R(E.bigMin, Math.max(E.bigMin, E.bigMax)));
    const order = Phaser.Utils.Array.Shuffle(nests.map((_, i) => i));
    const perNest = nests.map(() => []);
    for (let i = 0; i < big; i++) perNest[order[i]].push('big');
    for (let i = 0; i < small; i++) perNest[order[i % nests.length]].push('small');
    nests.forEach((n, ni) => {
      perNest[ni].forEach((kind, k) => {
        const spot = this.findSpotAround(n.x, n.y, kind === 'big' ? 24 : 12, k);
        this.list.push(new Egg(this.scene, spot.x, spot.y, kind));
      });
    });
  }

  findSpotAround(x, y, r, k) {
    for (let tries = 0; tries < 30; tries++) {
      const a = k * 2.2 + tries * 0.7;
      const d = k === 0 && tries === 0 ? 0 : 28 + tries * 4;
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      if (isFreeSpot(this.scene.map, px, py, r + 4) && !this.list.some((e) => Math.hypot(e.x - px, e.y - py) < e.radius + r + 6)) {
        return { x: px, y: py };
      }
    }
    return { x, y };
  }

  // 맵의 r 자리에 던질 수 있는 돌멩이
  spawnStones(points) {
    for (const p of points) this.list.push(new Egg(this.scene, p.x, p.y, 'stone'));
  }

  get eggsOnly() {
    return this.list.filter((e) => !e.isStone);
  }

  // ---------- 입력 처리 ----------
  handleActions(m) {
    const c = m.controls;
    if (!c || m.stunned) return;
    if (c.justPressed('grab')) this.grab(m);
    if (c.justPressed('throw')) this.throwEgg(m);
    if (c.justPressed('swallow')) this.swallowOrSpit(m);
  }

  partnerOf(m) {
    return this.scene.monsters.find((o) => o !== m) || null;
  }

  reach(m, egg) {
    return m.radius + egg.radius + CONFIG.egg.pickupRadius;
  }

  nearestGroundEgg(m, filter = () => true) {
    let best = null, bd = Infinity;
    for (const e of this.list) {
      if (e.state !== 'ground' || !filter(e)) continue;
      const d = Phaser.Math.Distance.Between(m.x, m.y, e.x, e.y);
      if (d < this.reach(m, e) && d < bd) { best = e; bd = d; }
    }
    return best;
  }

  canCoop(m, egg) {
    return m && !m.stunned && !m.carrying && !m.dragging && !m.coop && !m.belly &&
      Phaser.Math.Distance.Between(m.x, m.y, egg.x, egg.y) <= CONFIG.bigEgg.coopRadius;
  }

  grab(m) {
    if (m.coop) { this.dissolveCoop(m.coop, false); Sfx.drop(); return; }
    if (m.dragging) {
      const egg = m.dragging;
      const p = this.partnerOf(m);
      this.stopDrag(m);
      if (this.canCoop(p, egg) && !m.belly) this.startCoop(egg, m, p);
      else Sfx.drop();
      return;
    }
    if (m.carrying) { this.putDown(m); return; }

    const egg = this.nearestGroundEgg(m);
    if (!egg) return;
    if (egg.big) {
      const p = this.partnerOf(m);
      if (!m.belly && this.canCoop(m, egg) && this.canCoop(p, egg)) this.startCoop(egg, m, p);
      else this.startDrag(m, egg);
      this.onPickup(egg, CONFIG.tension.pickupBig);
    } else {
      this.attachCarry(m, egg);
      this.onPickup(egg, CONFIG.tension.pickupSmall);
    }
  }

  onPickup(egg, tension) {
    if (egg.isStone || egg.pickedOnce) return; // 같은 알을 다시 주울 때는 소란도 없음(내려놓고 줍기 반복 방지)
    egg.pickedOnce = true;
    this.scene.noise.emit(egg.x, egg.y, CONFIG.noise.pickup, 'pickup');
    this.scene.addTension(tension, 'pickup');
  }

  attachCarry(m, egg) {
    egg.state = 'carried';
    egg.holder = m;
    egg.setPhysicsActive(false);
    m.carrying = egg;
    Sfx.pickup();
    this.scene.tweens.add({ targets: egg.view, scale: 1.3, duration: 80, yoyo: true });
  }

  releaseCarry(m) {
    const egg = m.carrying;
    if (!egg) return null;
    m.carrying = null;
    egg.holder = null;
    egg.state = 'ground';
    const spot = this.spotInFront(m, egg.radius);
    egg.moveTo(spot.x, spot.y);
    egg.setPhysicsActive(true);
    return egg;
  }

  putDown(m) {
    if (this.releaseCarry(m)) Sfx.drop();
  }

  // 몬스터 앞쪽 빈자리(벽이면 뒤, 그것도 안 되면 제자리)
  spotInFront(m, r) {
    const d = m.radius + r + 4;
    const map = this.scene.map;
    for (const s of [1, -1]) {
      const x = m.x + m.facing.x * d * s, y = m.y + m.facing.y * d * s;
      if (isFreeSpot(map, x, y, r)) return { x, y };
    }
    return { x: m.x, y: m.y };
  }

  throwEgg(m) {
    const egg = m.carrying;
    if (!egg) return;
    const E = CONFIG.egg;
    m.carrying = null;
    egg.holder = null;
    egg.state = 'air';
    const start = { x: m.x + m.facing.x * (m.radius * 0.6), y: m.y + m.facing.y * (m.radius * 0.6) };
    egg.moveTo(start.x, start.y);
    egg.z = m.carryMode === 'horn' ? 8 : m.radius + 10;
    egg.air = { vx: m.facing.x * E.throwSpeed, vy: m.facing.y * E.throwSpeed, vz: E.throwUpSpeed, thrower: m, t: 0 };
    Sfx.throw();
    this.scene.stats.throws++;
  }

  catchEgg(m, egg) {
    egg.air = null;
    egg.z = 0;
    this.attachCarry(m, egg);
    Sfx.catch();
    this.scene.fx.popText(m.x, m.y - m.radius - 30, '나이스 캐치!', { color: '#8cf5a8', size: 20 });
    this.scene.stats.catches++;
  }

  // ---------- 꿀떡이 삼키기 ----------
  swallowOrSpit(m) {
    if (!CONFIG.features.uniqueSkills || m.typeKey !== 'kkuldduk') return;
    if (m.belly) { this.spit(m, false); return; }
    if (m.coop) return; // 공동 운반 중엔 입이 막힘
    let egg = m.carrying;
    if (egg && egg.isStone) return;
    if (egg) {
      m.carrying = null;
    } else {
      egg = this.nearestGroundEgg(m, (e) => !e.big && !e.isStone);
      if (!egg) return;
      this.onPickup(egg, CONFIG.tension.pickupSmall);
    }
    egg.state = 'swallowed';
    egg.holder = m;
    egg.setPhysicsActive(false);
    m.belly = egg;
    m.bellyTime = 0;
    m.drawBelly();
    Sfx.swallow();
    this.scene.fx.popText(m.x, m.y - m.radius - 20, '꿀꺽!', { color: '#ffd79a', size: 22 });
    this.scene.tweens.add({ targets: m.gfx, scaleX: 0.8, scaleY: 1.25, duration: 90, yoyo: true });
  }

  spit(m, forced) {
    const egg = m.belly;
    if (!egg) return;
    m.belly = null;
    m.drawBelly();
    egg.holder = null;
    egg.state = 'ground';
    const spot = this.spotInFront(m, egg.radius);
    egg.moveTo(spot.x, spot.y);
    egg.setPhysicsActive(true);
    if (forced) {
      // 강제로 뱉으면 알이 튀어 나감(벽에 맞으면 금이 갈 수 있음)
      egg.setVelocityPx(m.facing.x * 320, m.facing.y * 320);
      this.scene.noise.emit(m.x, m.y, CONFIG.kkuldduk.forcedSpitNoise, 'forced-spit');
      this.scene.fx.popText(m.x, m.y - m.radius - 24, '우웩!!', { color: '#b6ff6b', size: 34, rise: 60, duration: 1100 });
      this.scene.fx.shake(200, 0.01);
      Sfx.gag();
    } else {
      this.scene.noise.emit(m.x, m.y, CONFIG.kkuldduk.spitNoise, 'spit');
      Sfx.spit();
    }
  }

  // ---------- 큰 알: 질질 끌기 ----------
  startDrag(m, egg) {
    const group = newNoCollideGroup();
    egg.state = 'drag';
    egg.holder = m;
    egg.setGroup(group);
    m.body.collisionFilter.group = group;
    m.dragging = egg;
    m.dragNoiseTimer = 0;
    Sfx.pickup();
  }

  // 끌려오는 알: 몬스터와의 거리가 줄 길이보다 멀어지면 몬스터 쪽으로 끌려감(벽에는 물리적으로 막힘)
  updateDrag(m) {
    const egg = m.dragging;
    const len = m.radius + egg.radius + 8;
    const dx = m.x - egg.x, dy = m.y - egg.y;
    const d = Math.hypot(dx, dy) || 1;
    const pull = Math.max(0, d - len) * 8; // 줄이 팽팽할수록 빨리
    egg.setVelocityPx((dx / d) * pull, (dy / d) * pull);
  }

  stopDrag(m) {
    const egg = m.dragging;
    if (!egg) return null;
    m.dragging = null;
    m.body.collisionFilter.group = 0;
    egg.setGroup(0);
    egg.state = 'ground';
    egg.holder = null;
    return egg;
  }

  // ---------- 큰 알: 공동 운반 ----------
  startCoop(egg, a, b) {
    const coop = new Coop(this.scene, egg, a, b);
    this.coops.push(coop);
    Sfx.coop();
    this.scene.fx.popText(egg.x, egg.y - 40, '영차!', { color: '#9fe8ff', size: 26 });
    return coop;
  }

  dissolveCoop(coop, crack) {
    coop.destroy();
    this.coops = this.coops.filter((c) => c !== coop);
    if (crack) coop.egg.crack('coop-drop');
  }

  // ---------- 충격 ----------
  onDash(m) {
    // 까부리가 알을 뿔에 낀 채 대시하면 충격
    if (m.carrying && m.carryMode === 'horn') m.carrying.crack('horn-dash');
  }

  dropAllOnHit(m) {
    if (m.carrying) {
      const egg = this.releaseCarry(m);
      if (egg) {
        const a = Math.random() * Math.PI * 2;
        egg.setVelocityPx(Math.cos(a) * 180, Math.sin(a) * 180);
        egg.crack('caught');
      }
    }
    if (m.dragging) {
      const egg = this.stopDrag(m);
      if (egg) egg.crack('caught');
    }
    if (m.coop) this.dissolveCoop(m.coop, true);
  }

  onCollision(ev) {
    const E = CONFIG.egg;
    for (const pair of ev.pairs) {
      const { bodyA, bodyB } = pair;
      for (const [me, other] of [[bodyA, bodyB], [bodyB, bodyA]]) {
        // 알 충돌: 상대 속도가 크면 금
        const egg = me.gameEgg;
        if (egg && !egg.broken && egg.state !== 'carried' && egg.state !== 'swallowed' && egg.state !== 'air') {
          const ov = other.velocity;
          const otherPrev = other.gameEgg ? other.gameEgg.prevSpeed : Math.hypot(ov.x, ov.y) * 60;
          const rel = other.isStatic ? Math.max(egg.prevSpeed, egg.speedPx) : Math.max(
            Math.hypot(me.velocity.x - ov.x, me.velocity.y - ov.y) * 60,
            Math.abs(egg.prevSpeed - otherPrev),
          );
          if (rel >= E.impactSpeed) {
            egg.crack('impact');
          } else if (rel >= E.bumpNoiseSpeed && egg.crackCd <= 0) {
            Sfx.bump();
            this.scene.noise.emit(egg.x, egg.y, CONFIG.noise.bump, 'bump');
            egg.crackCd = 0.2;
          }
        }
        // 까부리: 뿔에 알을 낀 채 벽에 부딪힘
        const mon = me.gameMonster;
        if (mon && other.label === 'wall' && mon.carrying && mon.carryMode === 'horn') {
          const n = pair.collision.normal;
          const v = mon.body.velocity;
          const into = Math.abs(v.x * n.x + v.y * n.y) * 60;
          if (into >= CONFIG.kkaburi.hornBumpSpeed || mon.dashTimer > 0) mon.carrying.crack('horn-wall');
        }
      }
    }
  }

  onEggBroken(egg) {
    const h = egg.holder;
    if (h) {
      if (h.carrying === egg) h.carrying = null;
      if (h.belly === egg) { h.belly = null; h.drawBelly(); }
      if (h.dragging === egg) this.stopDrag(h);
    }
    const coop = this.coops.find((c) => c.egg === egg);
    if (coop) { coop.destroy(); this.coops = this.coops.filter((c) => c !== coop); }
    this.list = this.list.filter((e) => e !== egg);
  }

  // ---------- 입금 ----------
  inExit(x, y) {
    const r = this.scene.map.exitRect;
    return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  deposit(egg) {
    const h = egg.holder;
    if (h) {
      if (h.carrying === egg) h.carrying = null;
      if (h.belly === egg) { h.belly = null; h.drawBelly(); }
      if (h.dragging === egg) this.stopDrag(h);
    }
    const coop = this.coops.find((c) => c.egg === egg);
    if (coop) { coop.destroy(); this.coops = this.coops.filter((c) => c !== coop); }
    const value = egg.value;
    egg.deposited = true;
    this.scene.onDeposit(egg, value);
    const { x, y } = egg.displayPos();
    this.scene.fx.popText(x, y - 20, `입금! +${fmt(value)}`, { color: '#5dff9a', size: 30, rise: 60, duration: 1200 });
    this.scene.fx.burst(x, y, 0x5dff9a, 14, 160, 6);
    this.scene.fx.ring(x, y, 0x5dff9a, 70, 400);
    Sfx.deposit();
    this.list = this.list.filter((e) => e !== egg);
    egg.destroy();
  }

  // ---------- 프레임 ----------
  update(dt) {
    const B = CONFIG.bigEgg;
    for (const coop of this.coops) coop.update(dt);

    for (const m of this.scene.monsters) {
      // 질질 끌기 소음
      if (m.dragging) {
        this.updateDrag(m);
        this.scene.stats.dragTime += dt;
        const moving = Math.hypot(m.body.velocity.x, m.body.velocity.y) * 60 > 20;
        m.dragNoiseTimer = (m.dragNoiseTimer || 0) - dt;
        if (moving && m.dragNoiseTimer <= 0) {
          m.dragNoiseTimer = B.dragNoiseInterval;
          this.scene.noise.emit(m.dragging.x, m.dragging.y, B.dragNoise, 'drag');
          this.scene.fx.popText(m.dragging.x, m.dragging.y - 30, '끼익', { color: '#cccccc', size: 14, rise: 20, duration: 500 });
        }
      }
      if (m.coop) this.scene.stats.coopTime += dt / 2; // 두 마리가 각각 더하므로 절반
      // 삼킨 시간
      if (m.belly) {
        m.bellyTime += dt;
        this.scene.stats.swallowTime += dt;
        if (m.bellyTime >= CONFIG.kkuldduk.swallowLimit) this.spit(m, true);
      }
    }

    for (const e of [...this.list]) {
      e.update(dt);
      if (e.broken || e.deposited || e.isStone) continue;
      let px = e.x, py = e.y;
      if ((e.state === 'carried' || e.state === 'swallowed') && e.holder) { px = e.holder.x; py = e.holder.y; }
      if (e.state === 'air' && e.z > 20) continue;
      if (this.inExit(px, py)) this.deposit(e);
    }
  }
}

function fmt(v) {
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

// 공동 운반 덩어리: 알(가운데) + 몬스터 두 마리(양 끝). Matter 제약(constraint)으로 묶는다.
class Coop {
  constructor(scene, egg, a, b) {
    this.scene = scene;
    this.egg = egg;
    this.members = [a, b];
    this.group = newNoCollideGroup();
    for (const body of [egg.body, a.body, b.body]) body.collisionFilter.group = this.group;
    egg.state = 'coop';
    egg.holder = null;
    a.coop = this; b.coop = this;
    this.vel = new Phaser.Math.Vector2(0, 0);

    // 축: 두 몬스터를 잇는 방향. 알 양쪽에 몬스터를 배치.
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    this.angle = ang;
    this.da = a.radius + egg.radius + 4;
    this.db = b.radius + egg.radius + 4;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const map = scene.map;
    const pa = { x: egg.x - dx * this.da, y: egg.y - dy * this.da };
    const pb = { x: egg.x + dx * this.db, y: egg.y + dy * this.db };
    if (isFreeSpot(map, pa.x, pa.y, a.radius)) scene.matter.body.setPosition(a.body, pa);
    if (isFreeSpot(map, pb.x, pb.y, b.radius)) scene.matter.body.setPosition(b.body, pb);

    const M = scene.matter;
    this.constraints = [
      M.add.constraint(egg.body, a.body, this.da, 0.5, { damping: 0.05 }),
      M.add.constraint(egg.body, b.body, this.db, 0.5, { damping: 0.05 }),
      M.add.constraint(a.body, b.body, this.da + this.db, 0.5, { damping: 0.05 }),
    ];
  }

  // 조작 입력: 1인 모드는 조작 중인 몬스터, 2인 모드는 두 플레이어 입력의 합(줄다리기)
  input() {
    let x = 0, y = 0, n = 0;
    for (const m of this.members) {
      if (m.controls && (this.scene.mode === 'duo' || m.controlled)) {
        const mv = m.controls.getMove();
        x += mv.x; y += mv.y; n++;
      }
    }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  update(dt) {
    const B = CONFIG.bigEgg;
    const [a, b] = this.members;
    const mv = this.input();
    const speed = CONFIG.monster.baseSpeed * (1 - B.coopSlow);
    const k = 1 - Math.pow(1 - B.coopAccel, dt * 60);
    this.vel.x = Phaser.Math.Linear(this.vel.x, mv.x * speed, k);
    this.vel.y = Phaser.Math.Linear(this.vel.y, mv.y * speed, k);

    // 실제 축 각도(몬스터 위치 기준)
    this.angle = Math.atan2(b.y - a.y, b.x - a.x);
    // 움직이는 방향과 나란하도록(들것처럼) 천천히 회전 → 좁은 문도 통과 가능
    let omega = 0;
    if (this.vel.lengthSq() > 400) {
      const va = Math.atan2(this.vel.y, this.vel.x);
      let d1 = Phaser.Math.Angle.Wrap(va - this.angle);
      let d2 = Phaser.Math.Angle.Wrap(va + Math.PI - this.angle);
      const diff = Math.abs(d1) < Math.abs(d2) ? d1 : d2;
      const maxStep = B.coopTurnRate * dt;
      omega = Phaser.Math.Clamp(diff, -maxStep, maxStep) / Math.max(dt, 1e-3);
    }
    const e = this.egg;
    const setV = (body, vx, vy) => this.scene.matter.body.setVelocity(body, { x: vx / 60, y: vy / 60 });
    setV(e.body, this.vel.x, this.vel.y);
    for (const m of this.members) {
      const rx = m.x - e.x, ry = m.y - e.y;
      setV(m.body, this.vel.x - omega * ry, this.vel.y + omega * rx);
    }
  }

  destroy() {
    for (const c of this.constraints) this.scene.matter.world.removeConstraint(c);
    for (const m of this.members) {
      m.coop = null;
      m.body.collisionFilter.group = 0;
    }
    if (!this.egg.broken && !this.egg.deposited) {
      this.egg.setGroup(0);
      this.egg.state = 'ground';
    }
  }
}
