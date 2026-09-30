import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { hasClearPath, hasLineOfSight, isFreeSpot } from './Los.js';

// 1인 모드 동료 AI. "단순함이 최우선" — 길찾기 대신 조작 몬스터의 발자국(궤적)을 따라간다.
//   follow(따라와): 궤적 중 "지금 직선으로 갈 수 있는 가장 앞쪽 점"을 향해 걷는다. 가까우면 멈춤.
//   wait(기다려): 제자리 정지, 머리 위 "대기".
// 안전장치: 3초 이상 멀리 떨어져 있고 동료가 화면 밖이면 조작 몬스터 뒤로 순간이동.
// PlayerControls 와 같은 모양(getMove/justPressed/isHeld/update)이라 몬스터가 구분 없이 읽는다.
export default class Companion {
  constructor(scene) {
    this.scene = scene;
    this.mode = 'follow';
    this.trail = [];       // 조작 몬스터의 발자국 {x,y}
    this.targetIdx = -1;
    this.move = { x: 0, y: 0 };
    this.searchTimer = 0;
    this.farTimer = 0;
    this.noTrailTimer = 0;
    this.fallbackPath = null;
    this.fallbackTimer = 0;
  }

  // --- 컨트롤 인터페이스 ---
  update() {}
  getMove() { return this.move; }
  justPressed() { return false; }
  isHeld() { return false; }

  toggleMode() {
    this.mode = this.mode === 'follow' ? 'wait' : 'follow';
    this.post = null; // 기다릴 자리(다음 think 에서 현재 위치로 정함)
    this.targetIdx = -1;
    this.farTimer = 0;
    return this.mode;
  }

  // 조작 몬스터가 움직인 자리를 기록
  record(leader) {
    const last = this.trail[this.trail.length - 1];
    const sp = CONFIG.companion.trailSpacing;
    if (!last || Math.hypot(leader.x - last.x, leader.y - last.y) >= sp) {
      this.trail.push({ x: leader.x, y: leader.y });
      if (this.trail.length > 3000) {
        this.trail.splice(0, 500);
        this.targetIdx = Math.max(-1, this.targetIdx - 500);
      }
    }
  }

  // 교체(Tab) 시: 새 동료(이전 조작 몬스터)가 새 조작 몬스터에게 가는 길 = 기존 궤적을 거꾸로
  onSwap(newLeader) {
    let k = this.trail.length - 1, bd = Infinity;
    for (let i = this.trail.length - 1; i >= Math.max(0, this.trail.length - 800); i--) {
      const p = this.trail[i];
      const d = Math.hypot(p.x - newLeader.x, p.y - newLeader.y);
      if (d < bd) { bd = d; k = i; }
    }
    this.trail = this.trail.slice(k).reverse();
    this.trail.push({ x: newLeader.x, y: newLeader.y });
    this.targetIdx = -1;
    this.fallbackPath = null;
  }

  think(dt, self, leader) {
    const C = CONFIG.companion;
    this.move = { x: 0, y: 0 };
    self.hurry = false;
    self.statusText = this.mode === 'wait' ? '대기' : '';
    if (self.stunned || !leader) { this.farTimer = 0; return; }

    // 1) 손에 든 것 처리(기다려 상태에서도 함): 돌 던지기, 알 패스, 지치면 내려놓기
    this.actCd = Math.max(0, (this.actCd || 0) - dt);
    if (this.actCd <= 0 && this.handleHeld(self, leader)) return;
    if (this.mode === 'wait') {
      this.farTimer = 0;
      if (!this.post) this.post = { x: self.x, y: self.y };
      // 기다리는 동안 근처 돌은 주워 두고, 다시 제자리로
      if (this.seekStone(self, this.post)) return;
      this.walkTo(self, this.post, 10);
      return;
    }
    this.post = null;

    // 2) 내가 큰 알을 밀고 있으면 같은 방향 뒤에서 같이 밀기
    if (C.pushAssist && this.assistPush(dt, self, leader)) return;

    const map = this.scene.map;
    const d = Phaser.Math.Distance.Between(self.x, self.y, leader.x, leader.y);
    const directOk = hasClearPath(map, self.x, self.y, leader.x, leader.y, self.radius * 0.8);

    // 안전장치: 오래 멀어져 있고 화면 밖이면 순간이동
    if (d > C.farDistance) this.farTimer += dt; else this.farTimer = 0;
    if (this.farTimer >= C.teleportDelay && !this.onScreen(self)) {
      this.teleportNear(self, leader);
      return;
    }

    if (d < C.stopDistance && directOk) { // 충분히 가까우면 멈춤 — 멈춰 있는 동안 근처 돌 줍기
      this.seekStone(self, self);
      return;
    }

    let target = null;
    if (directOk) {
      target = leader;
      this.fallbackPath = null;
    } else {
      this.searchTimer -= dt;
      if (this.targetIdx < 0 || this.searchTimer <= 0) {
        this.targetIdx = this.findReachable(self);
        this.searchTimer = 0.2;
      }
      if (this.targetIdx >= 0) {
        target = this.trail[this.targetIdx];
        this.noTrailTimer = 0;
        this.fallbackPath = null;
        if (Math.hypot(target.x - self.x, target.y - self.y) < 12 && this.targetIdx < this.trail.length - 1) this.targetIdx++;
      } else {
        // 궤적이 끊긴 경우(드묾): 최후 수단으로 격자 경로 사용 → 동료가 영영 멈추는 일이 없게
        this.noTrailTimer += dt;
        if (this.noTrailTimer > 0.6) {
          this.fallbackTimer -= dt;
          if (!this.fallbackPath || this.fallbackTimer <= 0) {
            this.fallbackPath = this.scene.pathfinder.find(self.x, self.y, leader.x, leader.y, self.radius);
            this.fallbackTimer = 0.8;
          }
          if (this.fallbackPath && this.fallbackPath.length) {
            while (this.fallbackPath.length > 1 && Math.hypot(this.fallbackPath[0].x - self.x, this.fallbackPath[0].y - self.y) < 12) this.fallbackPath.shift();
            target = this.fallbackPath[0];
          }
        }
      }
    }
    if (!target) return;
    const dx = target.x - self.x, dy = target.y - self.y;
    const len = Math.hypot(dx, dy);
    if (len > 1) this.move = { x: dx / len, y: dy / len };
  }

  // 손에 든 것 처리. 행동했으면 true
  handleHeld(self, leader) {
    const C = CONFIG.companion;
    const held = self.carrying;
    if (!held) return false;
    const eggs = this.scene.eggs;
    const map = this.scene.map;
    if (held.isStone) {
      // 깨어서 움직이는(의심·추격·수색) 괴수가 사거리 안에 보이면 던짐
      const threat = this.findThreat(self, C.stoneRange);
      if (!threat) return false;
      const t = 0.45; // 날아가는 동안 움직일 만큼 앞을 보고 조준
      const v = threat.body.velocity;
      const aim = { x: threat.x + v.x * 60 * t, y: threat.y + v.y * 60 * t };
      eggs.throwEgg(self, aim, 50, true); // 괴수 조준 돌은 내가 중간에 받아 버리지 않게
      this.actCd = C.stoneCooldown;
      this.scene.fx.popText(self.x, self.y - self.radius - 26, '이거나 먹어라!', { color: '#ffd166', size: 16 });
      return true;
    }
    // 알: 무거워지기 전에 나에게 패스
    if (self.fatigue >= C.passFatigue) {
      const d = Phaser.Math.Distance.Between(self.x, self.y, leader.x, leader.y);
      const free = !leader.stunned && !leader.carrying && !leader.extracting;
      if (free && d <= C.passRange && d > 40 && hasClearPath(map, self.x, self.y, leader.x, leader.y, 12)) {
        const lv = leader.body.velocity;
        eggs.throwEgg(self, { x: leader.x + lv.x * 60 * 0.4, y: leader.y + lv.y * 60 * 0.4 }, 40);
        this.actCd = 1;
        this.scene.fx.popText(self.x, self.y - self.radius - 26, '받아!', { color: '#9fe8ff', size: 18 });
        this.scene.stats.aiPasses = (this.scene.stats.aiPasses || 0) + 1;
        return true;
      }
    }
    if (self.fatigue >= C.putDownFatigue) {
      eggs.putDown(self);
      this.actCd = 1;
      this.scene.fx.popText(self.x, self.y - self.radius - 26, '잠깐 쉴게…', { color: '#cccccc', size: 15 });
      return true;
    }
    return false;
  }

  // 멈춰 있을 때: center 에서 stonePickRange 안의 바닥 돌을 주우러 감. 움직이는 중이면 true
  seekStone(self, center) {
    if (self.carrying || self.extracting) return false;
    const eggs = this.scene.eggs;
    const map = this.scene.map;
    const R = CONFIG.companion.stonePickRange;
    let best = null, bd = Infinity;
    for (const e of eggs.list) {
      if (!e.isStone || e.state !== 'ground') continue;
      if (Phaser.Math.Distance.Between(center.x, center.y, e.x, e.y) > R) continue;
      const d = Phaser.Math.Distance.Between(self.x, self.y, e.x, e.y);
      if (d < bd && hasClearPath(map, self.x, self.y, e.x, e.y, self.radius * 0.8)) { best = e; bd = d; }
    }
    if (!best) return false;
    if (bd <= eggs.reach(self, best) - 4) {
      eggs.attachCarry(self, best);
      this.scene.fx.popText(self.x, self.y - self.radius - 26, '돌 하나 챙겼어', { color: '#d0d4da', size: 15 });
      return false;
    }
    this.walkTo(self, best, 0);
    self.statusText = this.mode === 'wait' ? '대기 (돌 줍는 중)' : '돌 줍는 중';
    return true;
  }

  walkTo(self, p, stopAt) {
    const dx = p.x - self.x, dy = p.y - self.y;
    const d = Math.hypot(dx, dy);
    if (d > stopAt && d > 1) this.move = { x: dx / d, y: dy / d };
  }

  findThreat(self, range) {
    const map = this.scene.map;
    const list = [];
    for (const g of this.scene.guards) {
      if (g.hidden || !['suspect', 'chase', 'search'].includes(g.state)) continue;
      list.push(g);
    }
    const b = this.scene.chaser;
    if (b && !b.hidden && (b.mode === 'stalk' || b.mode === 'hunt') && b.stunTimer <= 0) list.push(b);
    let best = null, bd = Infinity;
    for (const en of list) {
      const d = Phaser.Math.Distance.Between(self.x, self.y, en.x, en.y);
      if (d > range + en.radius || d >= bd) continue;
      if (!hasLineOfSight(map, self.x, self.y, en.x, en.y)) continue;
      best = en; bd = d;
    }
    return best;
  }

  // 조작 몬스터가 큰 알을 밀면: 같은 방향으로, 알 뒤쪽(조작 몬스터 옆)에 붙어서 같이 밈. 도왔으면 true
  assistPush(dt, self, leader) {
    const e = leader.pushing;
    if (e) { this.assistEgg = e; this.assistT = 0.6; }
    else this.assistT = Math.max(0, (this.assistT || 0) - dt);
    const egg = this.assistEgg;
    if (!egg || this.assistT <= 0 || egg.broken || egg.deposited || (self.carrying && !self.carrying.isStone)) return false;
    const lm = leader.controls ? leader.controls.getMove() : { x: 0, y: 0 };
    let dir = { x: lm.x, y: lm.y };
    let len = Math.hypot(dir.x, dir.y);
    if (len < 0.3) {
      const v = egg.body.velocity;
      dir = { x: v.x, y: v.y };
      len = Math.hypot(dir.x, dir.y);
      if (len < 0.2) return false;
    }
    dir.x /= len; dir.y /= len;
    const perp = { x: -dir.y, y: dir.x };
    // 조작 몬스터 반대편 옆자리를 골라 나란히 밀기(벽 안이면 다른 자리)
    const map = this.scene.map;
    const pref = ((leader.x - egg.x) * perp.x + (leader.y - egg.y) * perp.y) > 0 ? -1 : 1;
    const back = egg.radius + self.radius + 2;
    let spot = null, side = pref;
    for (const k of [pref * 0.6, 0, -pref * 0.6]) {
      const c = { x: egg.x - dir.x * back + perp.x * k * egg.radius, y: egg.y - dir.y * back + perp.y * k * egg.radius };
      if (isFreeSpot(map, c.x, c.y, self.radius)) { spot = c; side = k === 0 ? pref : Math.sign(k); break; }
    }
    if (!spot) return false;
    const rel = { x: self.x - egg.x, y: self.y - egg.y };
    const along = rel.x * dir.x + rel.y * dir.y;
    const ahead = along > -egg.radius * 0.3;
    const touching = Math.hypot(rel.x, rel.y) <= egg.radius + self.radius + 10;
    let target = spot;
    if (ahead) {
      // 알 옆·앞쪽에 있으면 옆으로 돌아서 뒤로(가까운 옆, 벽이면 반대 옆)
      const s0 = (rel.x * perp.x + rel.y * perp.y) >= 0 ? 1 : -1;
      const wide = egg.radius + self.radius + 14;
      const a = { x: egg.x + perp.x * s0 * wide - dir.x * egg.radius * 0.5, y: egg.y + perp.y * s0 * wide - dir.y * egg.radius * 0.5 };
      const b = { x: egg.x - perp.x * s0 * wide - dir.x * egg.radius * 0.5, y: egg.y - perp.y * s0 * wide - dir.y * egg.radius * 0.5 };
      target = isFreeSpot(map, a.x, a.y, self.radius) ? a : b;
    }
    const dx = target.x - self.x, dy = target.y - self.y;
    const d = Math.hypot(dx, dy);
    if (!ahead && touching) {
      // 알 뒤에 붙어 있음: 미는 방향 + 자리 보정을 섞어서 같이 밀기
      const cx = d > 1 ? dx / d : 0, cy = d > 1 ? dy / d : 0;
      let mx = dir.x + cx * 0.35, my = dir.y + cy * 0.35;
      const ml = Math.hypot(mx, my) || 1;
      this.move = { x: mx / ml, y: my / ml };
    } else if (d > 1) {
      if (d > 300 || !hasClearPath(map, self.x, self.y, target.x, target.y, self.radius * 0.8)) return false; // 멀거나 막혀 있으면 평소처럼 따라감
      this.move = { x: dx / d, y: dy / d };
      self.hurry = true; // 굴러가는 알을 따라잡도록 잠깐 빠르게
    }
    self.statusText = '같이 밀자!';
    return true;
  }

  // 궤적에서 직선으로 갈 수 있는 가장 앞쪽(최근) 점
  findReachable(self) {
    const map = this.scene.map;
    const maxD = 420;
    for (let i = this.trail.length - 1; i >= 0; i -= 2) {
      const p = this.trail[i];
      if (Math.abs(p.x - self.x) > maxD || Math.abs(p.y - self.y) > maxD) continue;
      if (hasClearPath(map, self.x, self.y, p.x, p.y, self.radius * 0.8)) return i;
    }
    return -1;
  }

  onScreen(m) {
    const v = this.scene.cameras.main.worldView;
    return m.x > v.x - m.radius && m.x < v.right + m.radius && m.y > v.y - m.radius && m.y < v.bottom + m.radius;
  }

  teleportNear(self, leader) {
    const map = this.scene.map;
    let spot = null;
    let acc = 0;
    for (let i = this.trail.length - 1; i > 0; i--) {
      acc += Math.hypot(this.trail[i].x - this.trail[i - 1].x, this.trail[i].y - this.trail[i - 1].y);
      if (acc > 50 && isFreeSpot(map, this.trail[i].x, this.trail[i].y, self.radius + 2)) { spot = this.trail[i]; break; }
      if (acc > 200) break;
    }
    if (!spot) spot = { x: leader.x, y: leader.y };
    this.scene.matter.body.setPosition(self.body, { x: spot.x, y: spot.y });
    this.scene.matter.body.setVelocity(self.body, { x: 0, y: 0 });
    this.farTimer = 0;
    this.targetIdx = -1;
    this.scene.fx.popText(spot.x, spot.y - 30, '뿅!', { color: '#9fe8ff', size: 18 });
  }
}
