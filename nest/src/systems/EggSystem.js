import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import Egg from '../entities/Egg.js';
import { isFreeSpot } from './Los.js';
import { Sfx } from './Sfx.js';

// 알 규칙: 줍기/내려놓기/던지기, 오래 들면 피로(느려지다 떨어뜨림), 큰 알 밀어서 굴리기, 충돌 충격, 입금.
// 알은 처음엔 모두 둥지(NestSystem) 안에 있고, 꺼내면 여기 list 로 들어온다.
export default class EggSystem {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    scene.matter.world.on('collisionstart', (ev) => this.onCollision(ev));
  }

  spawnEggAt(x, y, kind) {
    const egg = new Egg(this.scene, x, y, kind);
    this.list.push(egg);
    return egg;
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
    if (c.justPressed('grab') && !m.reviveTarget) {
      // 둥지 안이면 꺼내기/타이밍 체크가 우선
      if (!this.scene.nest || !this.scene.nest.handleGrab(m)) this.grab(m);
    }
    if (m.extracting) return;
    if (c.justPressed('throw')) this.throwEgg(m);
    if (c.justPressed('swallow')) this.swallowOrSpit(m);
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

  grab(m) {
    if (m.carrying) { this.putDown(m); return; }
    const egg = this.nearestGroundEgg(m, (e) => !e.big);
    if (egg) {
      if (m.fatigue >= 1) {
        this.scene.fx.popText(m.x, m.y - m.radius - 26, '팔이 저려서 못 들어!', { color: '#ffb36b', size: 16 });
        return;
      }
      this.attachCarry(m, egg);
      this.onPickup(egg, CONFIG.tension.pickupSmall);
      return;
    }
    const big = this.nearestGroundEgg(m, (e) => e.big);
    if (big) this.scene.fx.popText(big.x, big.y - 40, '큰 알은 뒤에서 밀어서 굴려요', { color: '#cfe6ff', size: 16 });
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

  // 너무 오래 들고 있어서 떨어뜨림: 앞으로 데굴데굴
  forceDrop(m) {
    const egg = this.releaseCarry(m);
    if (!egg) return;
    egg.setVelocityPx(m.facing.x * 120, m.facing.y * 120);
    this.scene.noise.emit(egg.x, egg.y, CONFIG.noise.bump, 'drop');
    this.scene.fx.popText(m.x, m.y - m.radius - 26, '아이고 팔이야!', { color: '#ffb36b', size: 20 });
    this.scene.stats.fatigueDrops = (this.scene.stats.fatigueDrops || 0) + 1;
    Sfx.bump();
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
    const start = { x: m.x + m.facing.x * (m.radius * 0.6), y: m.y + m.facing.y * (m.radius * 0.6) };
    egg.moveTo(start.x, start.y);
    egg.launch(m.facing.x * E.throwSpeed, m.facing.y * E.throwSpeed, E.throwUpSpeed, m.carryMode === 'horn' ? 8 : m.radius + 10, m);
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

  // ---------- 큰 알: 밀어서 굴리기 ----------
  // 몬스터가 큰 알 쪽으로 걸어가며 몸이 닿아 있으면 그 방향으로 굴러간다. 둘이 같이 밀면 더 빠름.
  updatePush(dt) {
    const B = CONFIG.bigEgg;
    for (const m of this.scene.monsters) m.pushing = null;
    for (const e of this.list) {
      if (!e.big || e.state !== 'ground') continue;
      let vx = 0, vy = 0, n = 0;
      for (const m of this.scene.monsters) {
        if (m.stunned || m.carrying || m.extracting) continue;
        const dx = e.x - m.x, dy = e.y - m.y;
        const d = Math.hypot(dx, dy);
        if (d > m.radius + e.radius + 8) continue;
        const mv = m.controls ? m.controls.getMove() : { x: 0, y: 0 };
        const ml = Math.hypot(mv.x, mv.y);
        if (ml < 0.3) continue;
        const dot = (mv.x * dx + mv.y * dy) / (ml * d || 1);
        if (dot < B.pushAngle) continue;
        const sp = CONFIG.monster.baseSpeed * m.type.speedMul * B.pushSpeedMul;
        vx += (mv.x / ml) * sp;
        vy += (mv.y / ml) * sp;
        n++;
        m.pushing = e;
      }
      if (!n) continue;
      const len = Math.hypot(vx, vy);
      const cap = n > 1 ? B.pushMaxSpeed : Math.min(len, B.pushMaxSpeed);
      if (len > cap) { vx = (vx / len) * cap; vy = (vy / len) * cap; }
      const v = e.body.velocity;
      const k = 1 - Math.pow(0.8, dt * 60);
      e.setVelocityPx(Phaser.Math.Linear(v.x * 60, vx, k), Phaser.Math.Linear(v.y * 60, vy, k));
      this.scene.stats.pushTime = (this.scene.stats.pushTime || 0) + dt;
      if (!e.pickedOnce) this.onPickup(e, CONFIG.tension.pickupBig);
    }
  }

  // ---------- 충격 ----------
  onDash(m) {
    // 까부리가 알을 뿔에 낀 채 대시하면 충격(고유 스킬 켰을 때만)
    if (m.carrying && m.carryMode === 'horn') m.carrying.crack('horn-dash');
  }

  dropAllOnHit(m) {
    if (m.extracting) m.extracting.cancel(null);
    if (m.carrying) {
      const egg = this.releaseCarry(m);
      if (egg) {
        const a = Math.random() * Math.PI * 2;
        egg.setVelocityPx(Math.cos(a) * 180, Math.sin(a) * 180);
        egg.crack('caught');
      }
    }
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
    }
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
    }
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
    const C = CONFIG.carry;
    this.updatePush(dt);
    for (const m of this.scene.monsters) {
      // 피로도: 알(돌멩이 제외)을 들고 있으면 쌓이고, 내려놓으면 회복
      const heavy = m.carrying && !m.carrying.isStone;
      if (heavy) m.fatigue = Math.min(1, m.fatigue + dt / C.fatigueTime);
      else m.fatigue = Math.max(0, m.fatigue - dt / C.recoverTime);
      if (heavy && m.fatigue >= 1) this.forceDrop(m);
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
