import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { CAT, MASK } from '../systems/physics.js';
import { hasLineOfSight } from '../systems/Los.js';
import { Sfx } from '../systems/Sfx.js';

// 경비(사람). 상태: patrol(순찰) → suspect(의심 "?") → chase(추격 "!") → search(수색) → return(순찰 복귀)
// gloat: 몬스터를 잡은 뒤 의기양양 정지
export default class Guard {
  constructor(scene, x, y, route) {
    this.scene = scene;
    this.route = route; // { points: [{x,y}], loop }
    this.radius = CONFIG.guard.radius;
    this.body = scene.matter.add.circle(x, y, this.radius, {
      friction: 0, frictionStatic: 0, frictionAir: 0, inertia: Infinity, label: 'guard',
      collisionFilter: { category: CAT.GUARD, mask: MASK.GUARD, group: 0 },
    });
    this.facingAngle = 0;
    this.state = 'return';
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
    this.bodyG = s.add.graphics();
    const r = this.radius;
    this.bodyG.fillStyle(0x3d6bd6, 1);
    this.bodyG.lineStyle(3, 0x0e1f4d, 1);
    this.bodyG.fillRect(-r, -r, r * 2, r * 2);
    this.bodyG.strokeRect(-r, -r, r * 2, r * 2);
    // 모자/얼굴 방향 표시
    this.bodyG.fillStyle(0xffe0bd, 1);
    this.bodyG.fillRect(r * 0.2, -r * 0.5, r * 0.7, r);
    this.bodyG.fillStyle(0x000000, 1);
    this.bodyG.fillRect(r * 0.55, -r * 0.35, 3, 3);
    this.bodyG.fillRect(r * 0.55, r * 0.2, 3, 3);
    const ts = { fontFamily: 'sans-serif', fontStyle: 'bold', stroke: '#000000', strokeThickness: 5 };
    this.icon = s.add.text(0, -r - 20, '', { ...ts, fontSize: '30px', color: '#ffd23f' }).setOrigin(0.5);
    this.meter = s.add.graphics();
    this.debugText = s.add.text(0, r + 12, '', { ...ts, fontSize: '12px', color: '#ffffff', strokeThickness: 3 }).setOrigin(0.5);
    this.view.add([this.bodyG, this.meter, this.icon, this.debugText]);
    // "?"/"!" 는 안개 위에도 보이게 별도 깊이
    this.iconLayer = s.add.container(this.x, this.y).setDepth(55);
    this.view.remove(this.icon);
    this.view.remove(this.meter);
    this.iconLayer.add([this.meter, this.icon]);
  }

  speed() {
    const G = CONFIG.guard;
    return { patrol: G.patrolSpeed, return: G.patrolSpeed, suspect: G.suspectSpeed, chase: G.chaseSpeed, search: G.searchSpeed, gloat: 0 }[this.state];
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
    }
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
    const G = CONFIG.guard;
    const d = Phaser.Math.Distance.Between(this.x, this.y, n.x, n.y);
    if (d > n.size + G.hearingRadius) return;
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
    if (this.state !== 'gloat') {
      let gain = 0;
      for (const m of this.scene.monsters) {
        if (m.stunned) continue;
        if (this.canSee(m.x, m.y)) {
          gain += G.sightRate * (m.hasEgg ? G.carryingMul : 1);
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
    if (this.state === 'gloat') return;
    for (const m of this.scene.monsters) {
      if (m.stunned || m.graceTimer > 0) continue;
      if (Phaser.Math.Distance.Between(this.x, this.y, m.x, m.y) < this.radius + m.radius + 3) {
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
    const show = this.visible || CONFIG.debug.showCones;
    if (!show || this.state === 'gloat') return;
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
    this.bodyG.rotation = this.facingAngle;
    this.view.setVisible(this.visible || CONFIG.debug.showCones);
    this.drawCone();

    // "?"/"!" 와 의심 게이지(안개 속에서도 보여서 위험을 미리 읽을 수 있게)
    const st = this.state;
    let icon = '';
    if (st === 'chase') icon = '!';
    else if (st === 'suspect') icon = '?';
    else if (st === 'search') icon = '?';
    else if (st === 'gloat') icon = '♪';
    this.icon.setText(icon);
    this.icon.setColor(st === 'chase' ? '#ff4d4d' : st === 'gloat' ? '#9fc3ff' : st === 'search' ? '#ffa23f' : '#ffd23f');
    const m = this.meter;
    m.clear();
    if (this.suspicion > 1 && st !== 'chase' && st !== 'gloat') {
      const w = 30;
      m.fillStyle(0x000000, 0.6);
      m.fillRect(-w / 2 - 1, -this.radius - 8, w + 2, 6);
      m.fillStyle(this.suspicion >= CONFIG.guard.suspectThreshold ? 0xffd23f : 0xffffff, 1);
      m.fillRect(-w / 2, -this.radius - 7, (w * this.suspicion) / 100, 4);
    }
    this.debugText.setText(CONFIG.debug.showSuspicion ? `${this.state} ${this.suspicion.toFixed(0)}` : '');
  }
}
