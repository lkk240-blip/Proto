import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { hasLineOfSight } from './Los.js';

// 전장의 안개: 플레이어 몬스터들의 시야(벽에 가린 영역 제외)를 합쳐서 밝히고 나머지는 어둡게.
// 시야 영역은 "레이캐스트 가시 영역 다각형"으로 계산한다(벽 모서리마다 광선을 쏴서 가장 가까운 벽까지).
export default class Fog {
  constructor(scene) {
    this.scene = scene;
    const m = scene.map;
    // 성능을 위해 맵의 1/4 해상도(가로세로 절반)로 그리고 2배로 늘려 표시
    this.res = 0.5;
    this.rt = scene.add.renderTexture(0, 0, Math.ceil(m.pixelWidth * this.res), Math.ceil(m.pixelHeight * this.res))
      .setOrigin(0, 0).setDepth(50).setScale(1 / this.res);
    this.brush = scene.make.graphics({ x: 0, y: 0 }, false);
    this.brush.setScale(this.res);
    this.memory = scene.add.graphics().setDepth(51);
    this.polys = [];
    // 벽 사각형들의 테두리 선분
    this.segments = [];
    for (const r of m.wallRects) {
      const a = { x: r.x, y: r.y }, b = { x: r.x + r.w, y: r.y }, c = { x: r.x + r.w, y: r.y + r.h }, d = { x: r.x, y: r.y + r.h };
      this.segments.push([a, b], [b, c], [c, d], [d, a]);
    }
  }

  // 한 점에서의 가시 영역 다각형
  visibilityPolygon(ox, oy, radius) {
    const segs = this.segments.filter(([a, b]) => segDistSq(ox, oy, a, b) < radius * radius);
    const angles = [];
    for (const [a, b] of segs) {
      for (const p of [a, b]) {
        const ang = Math.atan2(p.y - oy, p.x - ox);
        angles.push(ang - 0.0005, ang, ang + 0.0005);
      }
    }
    const N = 64;
    for (let i = 0; i < N; i++) angles.push(-Math.PI + (i / N) * Math.PI * 2);
    angles.sort((x, y) => x - y);
    const pts = [];
    for (const ang of angles) {
      const dx = Math.cos(ang), dy = Math.sin(ang);
      let best = radius;
      for (const [a, b] of segs) {
        const t = raySeg(ox, oy, dx, dy, a, b);
        if (t !== null && t < best) best = t;
      }
      // 벽 표면도 밝게 보이도록 광선을 벽 안쪽으로 조금 더 밀어 넣음(표시용일 뿐, 물체 판정은 isVisible 이 따로 함)
      const d = best < radius ? Math.min(best + 18, radius) : best;
      pts.push({ x: ox + dx * d, y: oy + dy * d });
    }
    return pts;
  }

  // 지금 이 점이 플레이어 몬스터 중 누군가에게 보이는지
  isVisible(x, y) {
    if (CONFIG.debug.noFog) return true;
    const R = CONFIG.vision.radius;
    for (const m of this.scene.monsters) {
      if (Math.hypot(x - m.x, y - m.y) <= R && hasLineOfSight(this.scene.map, m.x, m.y, x, y)) return true;
    }
    return false;
  }

  update() {
    const R = CONFIG.vision.radius;
    const noFog = CONFIG.debug.noFog;
    this.rt.setVisible(!noFog);
    if (!noFog) {
      this.rt.clear();
      this.rt.fill(0x05060a, CONFIG.vision.fogAlpha);
      const g = this.brush;
      g.clear();
      g.fillStyle(0xffffff, 1);
      for (const m of this.scene.monsters) {
        const poly = this.visibilityPolygon(m.x, m.y, R);
        g.fillPoints(poly, true);
      }
      this.rt.erase(g);
    }

    // 알·경비 표시 여부, 알 기억
    const mem = this.memory;
    mem.clear();
    for (const e of this.scene.eggs.list) {
      e.visible = this.isVisible(e.x, e.y);
      if (e.visible) { e.seen = true; e.lastSeen = { x: e.x, y: e.y }; }
      else if (e.seen && e.state === 'ground') {
        // 한 번 본 알은 마지막 위치에 흐리게 표시
        mem.lineStyle(2, 0xfff1d0, 0.45);
        mem.strokeEllipse(e.lastSeen.x, e.lastSeen.y, e.radius * 1.6, e.radius * 2.1);
      }
    }
    for (const g of this.scene.guards) g.visible = this.isVisible(g.x, g.y);
    if (this.scene.chaser) this.scene.chaser.visible = this.isVisible(this.scene.chaser.x, this.scene.chaser.y);
  }
}

function raySeg(ox, oy, dx, dy, a, b) {
  const sx = b.x - a.x, sy = b.y - a.y;
  const den = dx * sy - dy * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((a.x - ox) * sy - (a.y - oy) * sx) / den;
  const u = ((a.x - ox) * dy - (a.y - oy) * dx) / den;
  if (t >= 0 && u >= 0 && u <= 1) return t;
  return null;
}

function segDistSq(px, py, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const l2 = vx * vx + vy * vy;
  let t = l2 ? ((px - a.x) * vx + (py - a.y) * vy) / l2 : 0;
  t = Phaser.Math.Clamp(t, 0, 1);
  const x = a.x + vx * t - px, y = a.y + vy * t - py;
  return x * x + y * y;
}
