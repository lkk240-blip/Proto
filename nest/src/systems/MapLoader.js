// 문자열 배열 맵 데이터를 읽어 벽 목록·특수 지점으로 바꾼다.

export function parseMap(mapData, tileSize) {
  const rows = mapData.rows;
  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));
  const grid = []; // grid[y][x] = true 면 벽
  const chars = []; // 원래 글자(그림 그릴 때 숲/바위 구분용)
  const bush = []; // bush[y][x] = true 면 수풀
  const points = { player: null, exits: [], nests: [], guards: [], waypoints: {}, stones: [] };

  const center = (x, y) => ({ x: x * tileSize + tileSize / 2, y: y * tileSize + tileSize / 2 });

  for (let y = 0; y < height; y++) {
    grid.push([]);
    chars.push([]);
    bush.push([]);
    for (let x = 0; x < width; x++) {
      const ch = rows[y][x] ?? '#'; // 짧은 줄은 벽으로 채움
      grid[y].push(ch === '#' || ch === 'o');
      chars[y].push(ch);
      bush[y].push(ch === 'b');
      if (ch === 'P') points.player = center(x, y);
      else if (ch === 'X') points.exits.push({ tx: x, ty: y, ...center(x, y) });
      else if (ch === 'N') points.nests.push(center(x, y));
      else if (ch === 'r') points.stones.push(center(x, y));
      else if (ch === 'G') points.guards.push(center(x, y));
      else if (ch >= '1' && ch <= '9') points.waypoints[ch] = center(x, y);
    }
  }

  if (!points.player) {
    console.warn('[맵] P(플레이어 시작점)가 없습니다. 맵 중앙에서 시작합니다.');
    points.player = center(Math.floor(width / 2), Math.floor(height / 2));
  }

  return {
    width,
    height,
    tileSize,
    pixelWidth: width * tileSize,
    pixelHeight: height * tileSize,
    grid,
    chars,
    bush,
    points,
    wallRects: mergeWalls(grid, width, height, tileSize),
    exitRect: boundsOf(points.exits, tileSize),
  };
}

export function isWallAt(map, px, py) {
  const tx = Math.floor(px / map.tileSize);
  const ty = Math.floor(py / map.tileSize);
  if (ty < 0 || ty >= map.height || tx < 0 || tx >= map.width) return true;
  return map.grid[ty][tx];
}

// 벽 타일을 큰 사각형으로 합친다(물리 바디 수를 줄이기 위해).
// 1) 가로로 이어진 벽을 한 줄로 묶고 2) 같은 폭의 줄이 아래로 이어지면 합친다.
function mergeWalls(grid, width, height, ts) {
  const open = new Map(); // key "x0,x1" -> rect(타일 단위)
  const done = [];
  for (let y = 0; y < height; y++) {
    const runs = [];
    let x = 0;
    while (x < width) {
      if (!grid[y][x]) { x++; continue; }
      const x0 = x;
      while (x < width && grid[y][x]) x++;
      runs.push([x0, x - 1]);
    }
    const next = new Map();
    for (const [x0, x1] of runs) {
      const key = `${x0},${x1}`;
      const r = open.get(key);
      if (r) { r.h++; next.set(key, r); open.delete(key); }
      else next.set(key, { x: x0, y, w: x1 - x0 + 1, h: 1 });
    }
    for (const r of open.values()) done.push(r);
    open.clear();
    for (const [k, r] of next) open.set(k, r);
  }
  for (const r of open.values()) done.push(r);
  return done.map((r) => ({ x: r.x * ts, y: r.y * ts, w: r.w * ts, h: r.h * ts }));
}

function boundsOf(tiles, ts) {
  if (!tiles.length) return null;
  const xs = tiles.map((t) => t.tx);
  const ys = tiles.map((t) => t.ty);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const x1 = Math.max(...xs), y1 = Math.max(...ys);
  return { x: x0 * ts, y: y0 * ts, w: (x1 - x0 + 1) * ts, h: (y1 - y0 + 1) * ts };
}

export function isBushAt(map, px, py) {
  const tx = Math.floor(px / map.tileSize);
  const ty = Math.floor(py / map.tileSize);
  if (ty < 0 || ty >= map.height || tx < 0 || tx >= map.width) return false;
  return map.bush[ty][tx];
}
