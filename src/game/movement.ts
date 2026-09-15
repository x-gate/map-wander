export interface Cell {
  x: number;
  y: number;
}

export interface CollisionRecord {
  access: number;
  asGround: boolean;
  gridWidth: number;
  gridHeight: number;
}

export interface CollisionMap {
  header: { width: number; height: number };
  ground: number[];
  object: number[];
}

// The user-facing direction convention starts at north-west and rotates clockwise.
export const DIRECTION_DELTAS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

export function directionFor(from: Cell, to: Cell) {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  const direction = DIRECTION_DELTAS.findIndex(
    ([x, y]) => x === dx && y === dy,
  );
  if (direction < 0) throw new Error("移動步驟必須位於相鄰格位。");
  return direction;
}

export function directionToward(from: Cell, target: Cell) {
  if (from.x === target.x && from.y === target.y) return null;
  return directionFor(from, target);
}

export function buildWalkability(
  map: CollisionMap,
  records: Map<number, CollisionRecord>,
) {
  const { width, height } = map.header;
  const result = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const ground = records.get(map.ground[index]);
      result[index] = ground && ground.access !== 0 ? 1 : 0;
    }

  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const object = records.get(map.object[y * width + x]);
      if (!object || object.asGround || object.access !== 0) continue;
      const gridWidth = Math.max(1, object.gridWidth);
      const gridHeight = Math.max(1, object.gridHeight);
      for (let offsetY = 0; offsetY < gridHeight; offsetY++)
        for (let offsetX = 0; offsetX < gridWidth; offsetX++) {
          const blockedX = x + offsetX;
          const blockedY = y + offsetY;
          if (blockedX < width && blockedY < height)
            result[blockedY * width + blockedX] = 0;
        }
    }
  return result;
}

const cellKey = ({ x, y }: Cell) => `${x},${y}`;
const octile = (a: Cell, b: Cell) => {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
};

export function findPath(
  start: Cell,
  goal: Cell,
  width: number,
  height: number,
  walkable: (x: number, y: number) => boolean,
): Cell[] | null {
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height;
  if (!inside(start.x, start.y) || !inside(goal.x, goal.y)) return null;
  if (!walkable(goal.x, goal.y)) return null;
  if (start.x === goal.x && start.y === goal.y) return [start];

  const open = new Map<string, { cell: Cell; score: number }>();
  const costs = new Map([[cellKey(start), 0]]);
  const cameFrom = new Map<string, Cell>();
  open.set(cellKey(start), { cell: start, score: octile(start, goal) });

  while (open.size) {
    const currentEntry = [...open.entries()].reduce((best, entry) =>
      entry[1].score < best[1].score ? entry : best,
    );
    const [currentKey, { cell: current }] = currentEntry;
    open.delete(currentKey);
    if (current.x === goal.x && current.y === goal.y) {
      const path = [current];
      let cursor = currentKey;
      while (cameFrom.has(cursor)) {
        const previous = cameFrom.get(cursor)!;
        path.push(previous);
        cursor = cellKey(previous);
      }
      return path.reverse();
    }

    for (const [dx, dy] of DIRECTION_DELTAS) {
      const next = { x: current.x + dx, y: current.y + dy };
      if (!inside(next.x, next.y) || !walkable(next.x, next.y)) continue;
      // Combined raw-axis steps must not squeeze between two blocked cells.
      if (
        dx !== 0 &&
        dy !== 0 &&
        (!walkable(current.x + dx, current.y) ||
          !walkable(current.x, current.y + dy))
      )
        continue;
      const nextKey = cellKey(next);
      const cost =
        (costs.get(currentKey) ?? Infinity) +
        (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1);
      if (cost >= (costs.get(nextKey) ?? Infinity)) continue;
      costs.set(nextKey, cost);
      cameFrom.set(nextKey, current);
      open.set(nextKey, { cell: next, score: cost + octile(next, goal) });
    }
  }
  return null;
}

export function nearestWalkable(
  origin: Cell,
  width: number,
  height: number,
  walkable: (x: number, y: number) => boolean,
) {
  const queue = [origin];
  const visited = new Set([cellKey(origin)]);
  while (queue.length) {
    const current = queue.shift()!;
    if (walkable(current.x, current.y)) return current;
    for (const [dx, dy] of DIRECTION_DELTAS) {
      const next = { x: current.x + dx, y: current.y + dy };
      const key = cellKey(next);
      if (
        next.x < 0 ||
        next.y < 0 ||
        next.x >= width ||
        next.y >= height ||
        visited.has(key)
      )
        continue;
      visited.add(key);
      queue.push(next);
    }
  }
  throw new Error("地圖上沒有可行走格位。");
}
