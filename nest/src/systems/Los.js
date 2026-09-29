import { isWallAt } from './MapLoader.js';

// 두 점 사이에 벽이 없는지(시야/직선 이동 가능 여부). step 간격으로 표본 검사.
export function hasLineOfSight(map, x0, y0, x1, y1, step = 8) {
  const dx = x1 - x0, dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const n = Math.max(1, Math.ceil(dist / step));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (isWallAt(map, x0 + dx * t, y0 + dy * t)) return false;
  }
  return true;
}

// 몸 두께(radius)를 가진 물체가 직선으로 지나갈 수 있는지
export function hasClearPath(map, x0, y0, x1, y1, radius) {
  const dx = x1 - x0, dy = y1 - y0;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = (-dy / dist) * radius, ny = (dx / dist) * radius;
  return (
    hasLineOfSight(map, x0, y0, x1, y1) &&
    hasLineOfSight(map, x0 + nx, y0 + ny, x1 + nx, y1 + ny) &&
    hasLineOfSight(map, x0 - nx, y0 - ny, x1 - nx, y1 - ny)
  );
}

// 원 하나(반지름 r)가 벽과 겹치지 않는 자리인지
export function isFreeSpot(map, x, y, r) {
  const pts = [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, -r * 0.7]];
  return pts.every(([ox, oy]) => !isWallAt(map, x + ox, y + oy));
}
