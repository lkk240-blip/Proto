import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { hasClearPath, isFreeSpot } from './Los.js';

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
    self.statusText = this.mode === 'wait' ? '대기' : '';
    if (self.stunned || self.coop || this.mode === 'wait' || !leader) { this.farTimer = 0; return; }

    const map = this.scene.map;
    const d = Phaser.Math.Distance.Between(self.x, self.y, leader.x, leader.y);
    const directOk = hasClearPath(map, self.x, self.y, leader.x, leader.y, self.radius * 0.8);

    // 안전장치: 오래 멀어져 있고 화면 밖이면 순간이동
    if (d > C.farDistance) this.farTimer += dt; else this.farTimer = 0;
    if (this.farTimer >= C.teleportDelay && !this.onScreen(self)) {
      this.teleportNear(self, leader);
      return;
    }

    if (d < C.stopDistance && directOk) return; // 충분히 가까우면 멈춤

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
