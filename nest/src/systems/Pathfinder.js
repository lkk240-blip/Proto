// 경비·추격자용 길찾기(타일 격자 A*). 동료 AI는 스펙상 길찾기를 쓰지 않는다(안전장치 제외).
import { hasClearPath } from './Los.js';

export default class Pathfinder {
  constructor(map) {
    this.map = map;
  }

  tileOf(x, y) {
    const ts = this.map.tileSize;
    return { tx: Math.floor(x / ts), ty: Math.floor(y / ts) };
  }

  passable(tx, ty) {
    const m = this.map;
    return tx >= 0 && ty >= 0 && tx < m.width && ty < m.height && !m.grid[ty][tx];
  }

  // 가장 가까운 바닥 타일(시작/목표가 벽 안일 때 보정)
  nearestFloor(tx, ty) {
    if (this.passable(tx, ty)) return { tx, ty };
    for (let r = 1; r < 6; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (this.passable(tx + dx, ty + dy)) return { tx: tx + dx, ty: ty + dy };
      }
    }
    return null;
  }

  // 월드 좌표 경로(점 배열)를 돌려준다. 실패 시 null.
  find(x0, y0, x1, y1, radius = 14) {
    const m = this.map;
    const ts = m.tileSize;
    const s0 = this.tileOf(x0, y0), g0 = this.tileOf(x1, y1);
    const s = this.nearestFloor(s0.tx, s0.ty), g = this.nearestFloor(g0.tx, g0.ty);
    if (!s || !g) return null;
    const W = m.width;
    const key = (x, y) => y * W + x;
    const open = [[s.tx, s.ty]];
    const gScore = new Map([[key(s.tx, s.ty), 0]]);
    const came = new Map();
    const h = (x, y) => Math.hypot(x - g.tx, y - g.ty);
    const fScore = new Map([[key(s.tx, s.ty), h(s.tx, s.ty)]]);
    const closed = new Set();
    let iter = 0;
    while (open.length && iter++ < 6000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) {
        if (fScore.get(key(...open[i])) < fScore.get(key(...open[bi]))) bi = i;
      }
      const [cx, cy] = open.splice(bi, 1)[0];
      const ck = key(cx, cy);
      if (cx === g.tx && cy === g.ty) {
        const tiles = [[cx, cy]];
        let k = ck;
        while (came.has(k)) { k = came.get(k); tiles.push([k % W, Math.floor(k / W)]); }
        tiles.reverse();
        const pts = tiles.map(([tx, ty]) => ({ x: tx * ts + ts / 2, y: ty * ts + ts / 2 }));
        pts[pts.length - 1] = { x: x1, y: y1 };
        return this.smooth({ x: x0, y: y0 }, pts, radius);
      }
      closed.add(ck);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (!this.passable(nx, ny)) continue;
        if (dx && dy && (!this.passable(cx + dx, cy) || !this.passable(cx, cy + dy))) continue; // 모서리 대각 금지
        // 벽에 바로 붙은 칸은 약간 비싸게 → 복도 가운데로 다니게
        const nearWall = !this.passable(nx + 1, ny) || !this.passable(nx - 1, ny) || !this.passable(nx, ny + 1) || !this.passable(nx, ny - 1);
        // 덩치 큰 괴수가 숲 가장자리에 걸리지 않도록 벽에서 2칸 떨어진 곳도 약간 비싸게
        const nearWall2 = !nearWall && (!this.passable(nx + 2, ny) || !this.passable(nx - 2, ny) || !this.passable(nx, ny + 2) || !this.passable(nx, ny - 2));
        const nk = key(nx, ny);
        if (closed.has(nk)) continue;
        const cost = (dx && dy ? 1.414 : 1) + (nearWall ? 1.5 : 0) + (nearWall2 ? 0.4 : 0);
        const tentative = gScore.get(ck) + cost;
        if (tentative < (gScore.get(nk) ?? Infinity)) {
          came.set(nk, ck);
          gScore.set(nk, tentative);
          fScore.set(nk, tentative + h(nx, ny));
          if (!open.some(([ox, oy]) => ox === nx && oy === ny)) open.push([nx, ny]);
        }
      }
    }
    return null;
  }

  // 직선으로 갈 수 있는 중간 점은 건너뛴다
  smooth(start, pts, radius) {
    const out = [];
    let cur = start;
    let i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !hasClearPath(this.map, cur.x, cur.y, pts[j].x, pts[j].y, radius)) j--;
      out.push(pts[j]);
      cur = pts[j];
      i = j + 1;
    }
    return out;
  }
}
