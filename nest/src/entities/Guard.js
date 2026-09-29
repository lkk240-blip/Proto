import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { CAT, MASK } from '../systems/physics.js';
import { hasLineOfSight } from '../systems/Los.js';
import { Sfx } from '../systems/Sfx.js';

// 적 대형 괴수(스펙의 "경비").
// 상태: sleep(잠 "Zzz") → waking(깨는 중) → return/patrol(로밍) → tosleep(잠자리로 돌아감) → sleep ...
//       로밍 중 감지하면 suspect(의심 "?") → chase(추격 "!") → search(수색) → return
// gloat: 몬스터를 잡은 뒤 의기양양 정지
// 시야는 화면에 그리지 않는다(디버그 옵션 제외). 눈이 향하는 쪽이 보는 방향.
export default class Guard {
  constructor(scene, x, y, route) {
    this.scene = scene;
    this.route = route; // { points: [{x,y}], loop }
    this.radius = CONFIG.guard.radius;
    this.body = scene.matter.add.circle(x, y, this.radius, {
      friction: 0, frictionStatic: 0, frictionAir: 0, inertia: Infinity, label: 'guard',
      collisionFilter: { category: CAT.GUARD, mask: MASK.GUARD, group: 0 },
    });
    this.facingAngle = Math.random() * Math.PI * 2;
    this.sleepSpot = { x, y };
    this.state = 'sleep';
    this.sleepTimer = Phaser.Math.FloatBetween(CONFIG.guard.sleepMin, CONFIG.guard.sleepMax);
    this.roamTimer = 0;
    this.wake = 0;            // 잠든 동안의 깸 게이지
    this.alerted = false;     // 소음/접촉으로 깼는지(자연스럽게 깬 게 아닌지)
    this.pendingSuspicion = 0;
    this.suspicion = 0;
    this.wpIndex = 0;
    this.wpDir = 1;
    this.path = null;
    this.pathTarget = null;
    this.repathTimer = 0;
    this.lastKnown = null;
    this.stateTimer = 0;
    this.searchCenter = null;
    this.searchPoint = null;
    this.lookTimer = 0;
    this.visible = true;
    this.stuckTimer = 0;
    this.lastPos = { x, y };
    this.buildView();
  }

  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }

  buildView() {
    const s = this.scene;
    this.cone = s.add.graphics().setDepth(4);
    this.view = s.add.container(this.x, this.y).setDepth(12);
    const r = this.radius;
    this.shadow = s.add.ellipse(0, r * 0.55, r * 2.3, r * 1.0, 0x000000, 0.3);
    this.bodyC = s.add.container(0, 0); // 숨쉬기/회전용
    this.bodyG = s.add.graphics();
    // 등(털 뭉치) + 몸통
    this.bodyG.fillStyle(0x3d2a52, 1);
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * 0.55 + (i / 6) * Math.PI * 0.9;
      this.bodyG.fillCircle(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85, r * 0.42);
    }
    this.bodyG.fillStyle(0x5b3f7a, 1);
    this.bodyG.lineStyle(4, 0x221430, 1);
    this.bodyG.fillCircle(0, 0, r);
    this.bodyG.strokeCircle(0, 0, r);
    this.bodyG.fillStyle(0x7a5a9c, 1);
    this.bodyG.fillEllipse(r * 0.35, 0, r * 1.0, r * 1.2); // 주둥이 쪽 밝은 털
    // 뿔 두 개
    this.bodyG.fillStyle(0xe8dcc0, 1);
    this.bodyG.lineStyle(2, 0x5a4a30, 1);
    for (const sgn of [-1, 1]) {
      this.bodyG.fillTriangle(r * 0.2, sgn * r * 0.55, r * 0.55, sgn * r * 0.75, r * 0.05, sgn * r * 1.35);
      this.bodyG.strokeTriangle(r * 0.2, sgn * r * 0.55, r * 0.55, sgn * r * 0.75, r * 0.05, sgn * r * 1.35);
    }
    this.eyes = s.add.graphics();
    this.bodyC.add([this.bodyG, this.eyes]);
    this.drawEyes(false);

    const ts = { fontFamily: 'sans-serif', fontStyle: 'bold', stroke: '#000000', strokeThickness: 5 };
    this.debugText = s.add.text(0, r + 14, '', { ...ts, fontSize: '12px', color: '#ffffff', strokeThickness: 3 }).setOrigin(0.5);
    this.view.add([this.shadow, this.bodyC, this.debugText]);
    // "?" "!" "Zzz" 와 게이지는 다른 물체 위에 보이도록 별도 층
    this.iconLayer = s.add.container(this.x, this.y).setDepth(55);
    this.icon = s.add.text(0, -r - 22, '', { ...ts, fontSize: '30px', color: '#ffd23f' }).setOrigin(0.5);
    this.meter = s.add.graphics();
    this.iconLayer.add([this.meter, this.icon]);
    this.breath = s.tweens.add({ targets: this.bodyC, scaleX: 1.06, scaleY: 0.95, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  drawEyes(open) {
    const g = this.eyes;
    const r = this.radius;
    g.clear();
    for (const sgn of [-1, 1]) {
      const ex = r * 0.62, ey = sgn * r * 0.3;
      if (open) {
        g.fillStyle(0xfff36b, 1);
        g.fillCircle(ex, ey, r * 0.17);
        g.fillStyle(0x000000, 1);
        g.fillCircle(ex + r * 0.05, ey, r * 0.08);
      } else {
        g.lineStyle(3, 0x1a0f24, 1);
        g.lineBetween(ex - r * 0.1, ey - r * 0.12, ex + r * 0.08, ey + r * 0.12);
      }
    }
    this.eyesOpen = open;
  }

  get asleep() {
    return this.state === 'sleep' || this.state === 'waking';
  }

  // 던진 알·돌멩이에 맞음 → 잠깐 기절. 깨어나면 던진 쪽으로 화가 나서 찾아온다.
  hitByThrow(from) {
    const S = CONFIG.stone;
    this.lastKnown = { x: from.x, y: from.y };
    this.stunTimer = S.enemyStunTime;
    this.setState('stunned');
    this.scene.matter.body.setVelocity(this.body, { x: 0, y: 0 });
    this.scene.tweens.add({ targets: this.bodyC, angle: { from: -25, to: 25 }, duration: 80, yoyo: true, repeat: 3, onComplete: () => { this.bodyC.angle = 0; } });
  }

  speed() {
    const G = CONFIG.guard;
    return {
      patrol: G.patrolSpeed, return: G.patrolSpeed, tosleep: G.patrolSpeed, suspect: G.suspectSpeed,
      chase: G.chaseSpeed, search: G.searchSpeed, gloat: 0, sleep: 0, waking: 0, stunned: 0,
    }[this.state];
  }

  setState(st) {
    if (this.state === st) return;
    const prev = this.state;
    this.state = st;
    this.stateTimer = 0;
    this.path = null;
    if (st === 'suspect') {
      Sfx.suspect();
      this.pop('?', '#ffd23f');
    } else if (st === 'chase') {
      Sfx.alert();
      this.pop('!', '#ff4d4d');
      this.scene.addTension(CONFIG.tension.chaseStart, 'chase');
      if (this.visible) this.scene.fx.shake(150, 0.006);
      this.scene.stats.chases = (this.scene.stats.chases || 0) + 1;
    } else if (st === 'search') {
      this.searchCenter = this.lastKnown ? { ...this.lastKnown } : { x: this.x, y: this.y };
      this.searchPoint = null;
    } else if (st === 'return') {
      this.wpIndex = this.nearestWaypoint();
    } else if (st === 'sleep') {
      this.sleepTimer = Phaser.Math.FloatBetween(CONFIG.guard.sleepMin, CONFIG.guard.sleepMax);
      this.wake = 0;
      this.suspicion = 0;
      this.alerted = false;
      this.scene.fx.popText(this.x, this.y - this.radius - 30, '쿨...', { color: '#a9c7ff', size: 18, depth: 56 });
    } else if (st === 'waking') {
      this.scene.tweens.add({ targets: this.bodyC, scaleX: 1.25, scaleY: 1.25, duration: 120, yoyo: true });
      if (this.alerted) {
        this.pop('!?', '#ffd23f');
        this.scene.fx.shake(120, 0.005);
        Sfx.suspect();
      } else {
        this.scene.fx.popText(this.x, this.y - this.radius - 30, '하암~', { color: '#d9c8ff', size: 20, depth: 56 });
      }
    }
    if (this.eyesOpen !== (st !== 'sleep' && st !== 'stunned')) this.drawEyes(st !== 'sleep' && st !== 'stunned');
    return prev;
  }

  pop(text, color) {
    this.scene.tweens.add({ targets: this.icon, scale: { from: 1.8, to: 1 }, duration: 250, ease: 'Back.easeOut' });
    this.scene.fx.popText(this.x, this.y - this.radius - 40, text, { color, size: 34, rise: 20, duration: 500, depth: 56 });
  }

  nearestWaypoint() {
    let bi = 0, bd = Infinity;
    this.route.points.forEach((p, i) => {
      const d = Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y);
      if (d < bd) { bd = d; bi = i; }
    });
    return bi;
  }

  // 소음 이벤트 수신: 파동이 몸(+청각 반경)에 닿으면 들림
  hear(n) {
    if (this.state === 'gloat') return;
    if (this.state === 'stunned') { this.lastKnown = { x: n.x, y: n.y }; return; }
    const G = CONFIG.guard;
    const d = Phaser.Math.Distance.Between(this.x, this.y, n.x, n.y);
    if (d > n.size + G.hearingRadius + this.radius) return;
    if (this.state === 'sleep') {
      // 잘 때는 깸 게이지가 차야 깬다(작은 소리는 뒤척이기만)
      this.wake += n.size * G.sleepHearingMul;
      this.lastKnown = { x: n.x, y: n.y };
      if (this.wake >= G.wakeThreshold) {
        this.alerted = true;
        this.pendingSuspicion = 60;
        this.setState('waking');
      } else {
        this.scene.fx.popText(this.x, this.y - this.radius - 26, '음냐..', { color: '#bfb3d9', size: 14, rise: 16, duration: 600, depth: 56 });
        this.scene.tweens.add({ targets: this.bodyC, angle: { from: -8, to: 8 }, duration: 90, yoyo: true, repeat: 1, onComplete: () => { this.bodyC.angle = 0; } });
      }
      return;
    }
    if (this.state === 'waking') {
      this.lastKnown = { x: n.x, y: n.y };
      if (this.alerted) this.pendingSuspicion = Math.min(100, this.pendingSuspicion + n.size * G.hearingMul);
      return;
    }
    this.suspicion = Math.min(100, this.suspicion + n.size * G.hearingMul);
    this.lastKnown = { x: n.x, y: n.y };
    this.path = null;
    if (this.suspicion >= 100) this.setState('chase');
    else if (this.suspicion >= G.suspectThreshold && this.state !== 'chase') {
      if (this.state === 'suspect') this.path = null; // 새 지점으로 경로 갱신
      this.setState('suspect');
    }
  }

  // 시야 판정: 원뿔 안 + 거리 안 + 벽에 가리지 않음
  canSee(tx, ty) {
    const G = CONFIG.guard;
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d > G.visionRange) return false;
    const diff = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - this.facingAngle));
    if (diff > Phaser.Math.DegToRad(G.visionAngle / 2) && d > this.radius * 2.2) return false;
    return hasLineOfSight(this.scene.map, this.x, this.y, tx, ty);
  }

  update(dt) {
    const G = CONFIG.guard;
    this.stateTimer += dt;

    // --- 감지 ---
    let seen = null;
    if (this.state === 'sleep') {
      this.wake = Math.max(0, this.wake - G.wakeDecay * dt);
      this.sleepTimer -= dt;
      if (this.sleepTimer <= 0) { this.alerted = false; this.setState('waking'); }
    } else if (this.state === 'waking') {
      if (this.stateTimer >= G.groggyTime) {
        if (this.alerted) {
          this.suspicion = this.pendingSuspicion;
          this.roamTimer = Phaser.Math.FloatBetween(G.roamMin, G.roamMax);
          if (this.suspicion >= 100) this.setState('chase');
          else this.setState('suspect');
        } else {
          this.roamTimer = Phaser.Math.FloatBetween(G.roamMin, G.roamMax);
          this.setState('return');
        }
      }
    }
    if (this.state === 'stunned') {
      this.stunTimer -= dt;
      if (this.stunTimer <= 0) {
        this.suspicion = Math.max(this.suspicion, CONFIG.stone.angerSuspicion);
        if (this.roamTimer <= 0) this.roamTimer = Phaser.Math.FloatBetween(G.roamMin, G.roamMax);
        this.pop('!?', '#ffd23f');
        this.setState(this.suspicion >= 100 ? 'chase' : 'suspect');
      }
    }
    if (this.state !== 'gloat' && this.state !== 'stunned' && !this.asleep) {
      let gain = 0;
      for (const m of this.scene.monsters) {
        if (m.stunned) continue;
        if (this.canSee(m.x, m.y)) {
          // 수풀에 숨은 몬스터는 코앞이 아니면 아주 천천히 알아챔
          const hidden = m.inBush && Phaser.Math.Distance.Between(this.x, this.y, m.x, m.y) > this.radius + CONFIG.bush.closeRange;
          gain += G.sightRate * (m.hasEgg ? G.carryingMul : 1) * (hidden ? CONFIG.bush.sightMul : 1);
          if (!seen || m.hasEgg) seen = m;
        }
      }
      if (seen) {
        this.suspicion = Math.min(100, this.suspicion + gain * dt);
        this.lastKnown = { x: seen.x, y: seen.y };
      } else if (this.state !== 'chase') {
        this.suspicion = Math.max(0, this.suspicion - G.decayRate * dt);
      }
    }

    // --- 상태 전환 ---
    switch (this.state) {
      case 'patrol':
      case 'return':
      case 'tosleep':
      case 'search':
        if (this.suspicion >= 100) this.setState('chase');
        else if (seen && this.suspicion >= G.suspectThreshold) this.setState('suspect');
        break;
      case 'suspect':
        if (this.suspicion >= 100) this.setState('chase');
        break;
      case 'chase':
        if (seen) this.suspicion = 100;
        break;
      default:
        break;
    }

    // --- 행동 ---
    let target = null;
    if (this.state === 'patrol' || this.state === 'return') {
      // 로밍 시간이 다 되면 잠자리로
      this.roamTimer -= dt;
      if (this.roamTimer <= 0) this.setState('tosleep');
    }
    if (this.state === 'tosleep') {
      target = this.sleepSpot;
      if (this.reached(target)) this.setState('sleep');
    } else if (this.state === 'patrol' || this.state === 'return') {
      const wp = this.route.points[this.wpIndex];
      target = wp;
      if (Phaser.Math.Distance.Between(this.x, this.y, wp.x, wp.y) < 10) {
        if (this.state === 'return') this.state = 'patrol';
        this.advanceWaypoint();
        target = this.route.points[this.wpIndex];
      }
    } else if (this.state === 'suspect') {
      target = this.lastKnown;
      if (this.reached(target) && !seen) this.setState('search');
      else if (!seen && this.suspicion <= 0) this.setState('search');
    } else if (this.state === 'chase') {
      target = seen ? { x: seen.x, y: seen.y } : this.lastKnown;
      if (!seen && this.reached(target)) {
        this.suspicion = 60;
        this.setState('search');
      }
    } else if (this.state === 'search') {
      if (!this.searchPoint || this.reached(this.searchPoint) || this.stateTimer % 2.2 < dt) {
        this.searchPoint = this.pickSearchPoint();
        this.path = null;
      }
      target = this.searchPoint;
      if (this.stateTimer >= G.searchTime) {
        this.suspicion = Math.min(this.suspicion, G.suspectThreshold - 1);
        this.setState('return');
      }
    } else if (this.state === 'gloat') {
      if (this.stateTimer >= G.gloatTime) {
        this.suspicion = 50;
        this.setState('search');
      }
    }

    this.moveToward(target, dt, seen);
    this.checkCatch();
    this.syncView(dt);
  }

  reached(p) {
    return !p || Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y) < 14;
  }

  advanceWaypoint() {
    const n = this.route.points.length;
    if (n < 2) return;
    if (this.route.loop) {
      this.wpIndex = (this.wpIndex + 1) % n;
    } else {
      if (this.wpIndex + this.wpDir >= n || this.wpIndex + this.wpDir < 0) this.wpDir *= -1;
      this.wpIndex += this.wpDir;
    }
  }

  pickSearchPoint() {
    const c = this.searchCenter || { x: this.x, y: this.y };
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 40 + Math.random() * 90;
      const p = { x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d };
      if (!this.scene.isWallAt(p.x, p.y) && hasLineOfSight(this.scene.map, c.x, c.y, p.x, p.y)) return p;
    }
    return { ...c };
  }

  moveToward(target, dt, seen) {
    const setV = (vx, vy) => this.scene.matter.body.setVelocity(this.body, { x: vx / 60, y: vy / 60 });
    const sp = this.speed();
    if (!target || sp === 0) { setV(0, 0); return; }

    // 직선으로 갈 수 있으면 바로, 아니면 길찾기 경로를 따름
    let next = target;
    const direct = hasLineOfSight(this.scene.map, this.x, this.y, target.x, target.y) &&
      hasLineOfSight(this.scene.map, this.x + this.radius, this.y, target.x + this.radius, target.y) &&
      hasLineOfSight(this.scene.map, this.x - this.radius, this.y, target.x - this.radius, target.y) &&
      hasLineOfSight(this.scene.map, this.x, this.y + this.radius, target.x, target.y + this.radius) &&
      hasLineOfSight(this.scene.map, this.x, this.y - this.radius, target.x, target.y - this.radius);
    if (!direct) {
      this.repathTimer -= dt;
      const targetMoved = !this.pathTarget || Phaser.Math.Distance.Between(this.pathTarget.x, this.pathTarget.y, target.x, target.y) > 48;
      if (!this.path || (targetMoved && this.repathTimer <= 0)) {
        this.path = this.scene.pathfinder.find(this.x, this.y, target.x, target.y, this.radius);
        this.pathTarget = { ...target };
        this.repathTimer = 0.4;
      }
      if (this.path && this.path.length) {
        while (this.path.length > 1 && this.reached(this.path[0])) this.path.shift();
        next = this.path[0];
      }
    } else {
      this.path = null;
    }

    const dx = next.x - this.x, dy = next.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 2) { setV(0, 0); return; }
    setV((dx / d) * sp, (dy / d) * sp);

    // 바라보는 방향: 추격 중 몬스터가 보이면 몬스터 쪽, 아니면 이동 방향
    const lookAt = seen && this.state === 'chase' ? Math.atan2(seen.y - this.y, seen.x - this.x) : Math.atan2(dy, dx);
    this.facingAngle = Phaser.Math.Angle.RotateTo(this.facingAngle, lookAt, 6 * dt);

    // 끼임 방지: 1초간 거의 못 움직이면 경로 재계산
    this.stuckTimer += dt;
    if (this.stuckTimer > 1) {
      if (Phaser.Math.Distance.Between(this.x, this.y, this.lastPos.x, this.lastPos.y) < 8) {
        this.path = null;
        if (this.state === 'search') this.searchPoint = null;
      }
      this.stuckTimer = 0;
      this.lastPos = { x: this.x, y: this.y };
    }
  }

  checkCatch() {
    if (this.state === 'gloat' || this.state === 'stunned') return;
    for (const m of this.scene.monsters) {
      if (m.stunned || m.graceTimer > 0) continue;
      const touching = Phaser.Math.Distance.Between(this.x, this.y, m.x, m.y) < this.radius + m.radius + 3;
      if (touching && this.asleep) {
        // 자는 괴수를 건드리면 벌떡 깨서 바로 추격
        this.lastKnown = { x: m.x, y: m.y };
        this.pendingSuspicion = 100;
        if (this.state === 'sleep') {
          this.alerted = true;
          this.setState('waking');
          this.scene.fx.popText(this.x, this.y - this.radius - 44, '크앙?!', { color: '#ff9b9b', size: 24, depth: 56 });
        }
        continue;
      }
      if (touching) {
        if (m.stun(this.x, this.y)) {
          this.setState('gloat');
          this.scene.fx.popText(this.x, this.y - 40, '잡았다!', { color: '#9fc3ff', size: 22, depth: 56 });
          this.scene.tweens.add({ targets: this.bodyG, scaleY: 1.3, scaleX: 0.85, duration: 150, yoyo: true, repeat: 3 });
          this.scene.matter.body.setVelocity(this.body, { x: 0, y: 0 });
          return;
        }
      }
    }
  }

  // 시야 원뿔: 벽에 가린 부분은 잘라서 그린다(부채꼴 방향으로 광선을 쏴서 벽까지)
  drawCone() {
    const G = CONFIG.guard;
    const g = this.cone;
    g.clear();
    if (!CONFIG.debug.showCones || this.state === 'gloat' || this.asleep) return;
    const color = { chase: 0xff4d4d, suspect: 0xffd23f, search: 0xffa23f }[this.state] || 0xffffff;
    const half = Phaser.Math.DegToRad(G.visionAngle / 2);
    const rays = 24;
    const pts = [{ x: this.x, y: this.y }];
    for (let i = 0; i <= rays; i++) {
      const a = this.facingAngle - half + (i / rays) * half * 2;
      const cx = Math.cos(a), cy = Math.sin(a);
      let d = 0;
      while (d < G.visionRange) {
        d += 6;
        if (this.scene.isWallAt(this.x + cx * d, this.y + cy * d)) { d -= 3; break; }
      }
      d = Math.min(d, G.visionRange);
      pts.push({ x: this.x + cx * d, y: this.y + cy * d });
    }
    g.fillStyle(color, this.state === 'patrol' || this.state === 'return' ? 0.14 : 0.24);
    g.fillPoints(pts, true);
    g.lineStyle(2, color, 0.45);
    g.strokePoints(pts, true);
  }

  syncView() {
    this.view.setPosition(this.x, this.y);
    this.iconLayer.setPosition(this.x, this.y);
    this.bodyC.rotation = this.facingAngle;
    // 수풀 속에 숨어 있으면 몸·아이콘 모두 안 보임. 가까이 가서 보이면 잎 위로 올려 그림.
    this.view.setVisible(!this.hidden);
    this.iconLayer.setVisible(!this.hidden);
    this.view.setDepth(this.inBush ? 15 : 12);
    this.drawCone();

    // 아이콘: 잠 "Zzz", 깨는 중 "!?", 의심/수색 "?", 추격 "!", 잡은 뒤 "♪"
    const st = this.state;
    const icons = { sleep: 'Zzz', waking: this.alerted ? '!?' : '…', suspect: '?', search: '?', chase: '!', gloat: '♪', stunned: '★ ★' };
    const colors = { sleep: '#a9c7ff', waking: '#ffd23f', suspect: '#ffd23f', search: '#ffa23f', chase: '#ff4d4d', gloat: '#9fc3ff', stunned: '#ffe14d' };
    this.icon.setText(icons[st] || '');
    this.icon.setColor(colors[st] || '#ffffff');
    this.icon.setFontSize(st === 'sleep' || st === 'stunned' ? 20 : 30);
    if (st === 'sleep') {
      const t = this.scene.time.now * 0.002;
      this.icon.setPosition(Math.sin(t) * 6 + 10, -this.radius - 18 - (t % 1) * 6);
    } else if (st === 'stunned') {
      this.icon.setPosition(0, -this.radius - 14);
      this.icon.rotation = Math.sin(this.scene.time.now * 0.012) * 0.4;
    } else {
      this.icon.setPosition(0, -this.radius - 22);
      this.icon.rotation = 0;
    }
    this.breath.timeScale = st === 'sleep' ? 1 : 3;

    const m = this.meter;
    m.clear();
    const w = 40, by = -this.radius - 8;
    if (st === 'sleep' && this.wake > 1) {
      // 깸 게이지(보라색): 가득 차면 깬다
      m.fillStyle(0x000000, 0.6);
      m.fillRect(-w / 2 - 1, by - 1, w + 2, 6);
      m.fillStyle(0xc49bff, 1);
      m.fillRect(-w / 2, by, (w * Math.min(this.wake, CONFIG.guard.wakeThreshold)) / CONFIG.guard.wakeThreshold, 4);
    } else if (this.suspicion > 1 && st !== 'chase' && st !== 'gloat' && !this.asleep) {
      m.fillStyle(0x000000, 0.6);
      m.fillRect(-w / 2 - 1, by - 1, w + 2, 6);
      m.fillStyle(this.suspicion >= CONFIG.guard.suspectThreshold ? 0xffd23f : 0xffffff, 1);
      m.fillRect(-w / 2, by, (w * this.suspicion) / 100, 4);
    }
    this.debugText.setText(CONFIG.debug.showSuspicion ? `${st} ${this.suspicion.toFixed(0)}${st === 'sleep' ? ' 깸' + this.wake.toFixed(0) : ''}` : '');
  }
}
