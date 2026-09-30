import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { isFreeSpot } from './Los.js';
import { Sfx } from './Sfx.js';

// 알 둥지(맵에 하나, 글자 N). 둥지 안에서 E → 꺼내기 시작(움직이면 취소).
// 게이지가 차는 동안 타이밍 체크(회전하는 바늘)가 1~2번 뜨고, 바늘이 구간 안에 있을 때 E.
// 실패하면 큰 소음 + 진행도 감소. 게이지가 다 차면 알 하나가 둥지 밖으로 튀어나와 바닥에 떨어진다.
export default class NestSystem {
  constructor(scene, pos) {
    this.scene = scene;
    this.x = pos.x;
    this.y = pos.y;
    const N = CONFIG.nest;
    this.pile = Phaser.Utils.Array.Shuffle([
      ...Array(N.smallCount).fill('small'),
      ...Array(N.bigCount).fill('big'),
    ]);
    this.extractor = null;
    this.progress = 0;
    this.checks = [];      // 이번 알에서 체크가 뜰 진행도 지점들
    this.check = null;     // 진행 중인 체크 { t: 0~1, zone: 시작 각도(도) }
    this.moveTimer = 0;
    this.gfx = scene.add.graphics().setDepth(6);
    this.label = scene.add.text(this.x, this.y + N.radius + 14, '', {
      fontFamily: 'sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#ffe7a8', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(52);
    this.draw();
  }

  get total() {
    return CONFIG.nest.smallCount + CONFIG.nest.bigCount;
  }

  draw() {
    const g = this.gfx;
    const R = CONFIG.nest.radius;
    g.clear();
    g.fillStyle(0x6b4a26, 1);
    g.fillCircle(this.x, this.y, R);
    g.lineStyle(10, 0xb08a4e, 1);
    g.strokeCircle(this.x, this.y, R);
    g.lineStyle(3, 0x7a5a30, 1);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      g.lineBetween(this.x + Math.cos(a) * R * 0.8, this.y + Math.sin(a) * R * 0.8, this.x + Math.cos(a + 0.4) * R * 1.2, this.y + Math.sin(a + 0.4) * R * 1.2);
    }
    // 남은 알 더미
    this.pile.forEach((kind, i) => {
      const a = i * 2.4, d = 6 + (i % 4) * 7;
      const px = this.x + Math.cos(a) * d, py = this.y + Math.sin(a) * d * 0.7;
      const big = kind === 'big';
      g.fillStyle(big ? 0xcfe6ff : 0xfff1d0, 1);
      g.lineStyle(2, 0x3a3226, 1);
      g.fillEllipse(px, py, big ? 26 : 16, big ? 32 : 20);
      g.strokeEllipse(px, py, big ? 26 : 16, big ? 32 : 20);
    });
    this.label.setText(this.pile.length ? `알 둥지 (${this.pile.length}개 남음) — 안에서 E` : '빈 둥지');
  }

  inRange(m) {
    return Phaser.Math.Distance.Between(m.x, m.y, this.x, this.y) <= CONFIG.nest.radius + m.radius * 0.5;
  }

  // E 입력. 둥지 관련 입력으로 처리했으면 true
  handleGrab(m) {
    if (this.extractor === m) {
      if (this.check) this.resolveCheck();
      return true;
    }
    if (m.carrying || !this.inRange(m) || !this.pile.length || this.extractor) return false;
    this.start(m);
    return true;
  }

  start(m) {
    const N = CONFIG.nest;
    this.extractor = m;
    m.extracting = this;
    this.progress = 0;
    this.moveTimer = 0;
    const n = Phaser.Math.Between(N.checksMin, Math.max(N.checksMin, N.checksMax));
    this.checks = [];
    for (let i = 0; i < n; i++) this.checks.push(0.2 + ((i + Math.random()) / n) * 0.65);
    this.checks.sort((a, b) => a - b);
    Sfx.pickup();
  }

  cancel(msg) {
    const m = this.extractor;
    if (!m) return;
    m.extracting = null;
    this.extractor = null;
    this.check = null;
    this.progress = 0;
    if (msg) this.scene.fx.popText(m.x, m.y - m.radius - 26, msg, { color: '#cccccc', size: 16 });
  }

  startCheck() {
    const S = CONFIG.skillCheck;
    // 성공 구간은 바늘 시작점에서 너무 가깝지 않은 곳(반응할 시간)
    this.check = { t: 0, zone: Phaser.Math.FloatBetween(110, 330 - S.zoneDeg) };
    Sfx.suspect();
  }

  resolveCheck() {
    const S = CONFIG.skillCheck;
    const ang = this.check.t * 360;
    const z = this.check.zone;
    const m = this.extractor;
    if (ang >= z && ang <= z + S.greatDeg) {
      this.progress = Math.min(0.99, this.progress + S.greatBonus);
      this.scene.fx.popText(m.x, m.y - m.radius - 30, '완벽!', { color: '#8cf5a8', size: 22 });
      this.scene.stats.checkGreat = (this.scene.stats.checkGreat || 0) + 1;
      Sfx.coop();
    } else if (ang >= z && ang <= z + S.zoneDeg) {
      this.scene.fx.popText(m.x, m.y - m.radius - 30, '좋아', { color: '#ffffff', size: 18 });
      this.scene.stats.checkGood = (this.scene.stats.checkGood || 0) + 1;
      Sfx.catch();
    } else {
      this.fail();
      return;
    }
    this.check = null;
  }

  fail() {
    const S = CONFIG.skillCheck;
    const m = this.extractor;
    this.check = null;
    this.progress = Math.max(0, this.progress - S.failPenalty);
    this.scene.stats.checkFails = (this.scene.stats.checkFails || 0) + 1;
    this.scene.noise.emit(this.x, this.y, S.failNoise, 'check-fail');
    this.scene.fx.popText(this.x, this.y - 50, '와장창! 삐끗!', { color: '#ff6b6b', size: 28, rise: 50, duration: 1000 });
    this.scene.fx.shake(220, 0.012);
    Sfx.break();
    if (m) this.scene.tweens.add({ targets: m.bodyC, angle: { from: -15, to: 15 }, duration: 70, yoyo: true, repeat: 2, onComplete: () => { m.bodyC.angle = 0; } });
  }

  // 알 하나가 둥지 밖으로 튀어나옴
  pop() {
    const kind = this.pile.pop();
    const N = CONFIG.nest;
    const m = this.extractor;
    // 꺼낸 몬스터가 보는 방향 쪽(벽이면 다른 방향)으로 튀어나감
    let ang = m ? Math.atan2(m.facing.y, m.facing.x) : Math.random() * Math.PI * 2;
    for (let i = 0; i < 12; i++) {
      const a = ang + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.5;
      const tx = this.x + Math.cos(a) * (N.radius + 50), ty = this.y + Math.sin(a) * (N.radius + 50);
      if (isFreeSpot(this.scene.map, tx, ty, 26)) { ang = a; break; }
    }
    const egg = this.scene.eggs.spawnEggAt(this.x + Math.cos(ang) * 10, this.y + Math.sin(ang) * 10, kind);
    egg.launch(Math.cos(ang) * N.popSpeed, Math.sin(ang) * N.popSpeed, 230, 16, null, true); // 바닥에 떨어짐(받기 없음)
    this.scene.stats.extracted = (this.scene.stats.extracted || 0) + 1;
    this.scene.fx.popText(this.x, this.y - 40, kind === 'big' ? '큰 알 뽁!' : '뽁!', { color: '#ffe7a8', size: 24 });
    Sfx.throw();
    this.draw();
  }

  update(dt) {
    const m = this.extractor;
    if (!m) return;
    const N = CONFIG.nest;
    if (m.stunned || !this.inRange(m)) { this.cancel(m.stunned ? null : '꺼내기 취소'); return; }
    const mv = m.controls ? m.controls.getMove() : { x: 0, y: 0 };
    if (Math.hypot(mv.x, mv.y) > 0.3) {
      this.moveTimer += dt;
      if (this.moveTimer > 0.12) { this.cancel('꺼내기 취소'); return; }
    } else {
      this.moveTimer = 0;
    }
    if (this.check) {
      this.check.t += dt / CONFIG.skillCheck.duration;
      if (this.check.t >= 1) this.fail();
    } else if (this.checks.length && this.progress >= this.checks[0]) {
      this.checks.shift();
      this.startCheck();
    }
    this.progress += dt / N.extractTime;
    if (this.progress >= 1) {
      if (this.check) { this.progress = 0.99; return; } // 체크가 끝나야 완료
      this.pop();
      this.cancel(null);
    }
  }
}
