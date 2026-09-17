import { nearestWalkable, type Cell } from "./movement";

export interface SpawnPoint extends Cell {
  direction: number;
}

export const START_MAP_ID = 1530;
export const START_POSITION: Readonly<SpawnPoint> = {
  x: 15,
  y: 6,
  direction: 0,
};

export function resolveSpawn(
  width: number,
  height: number,
  walkable: (x: number, y: number) => boolean,
  requested?: SpawnPoint,
): SpawnPoint {
  if (requested) {
    const { x, y, direction } = requested;
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      y < 0 ||
      x >= width ||
      y >= height ||
      !Number.isInteger(direction) ||
      direction < 0 ||
      direction > 7
    )
      throw new Error(`指定起點 (${x}, ${y}) 或朝向無效。`);
    if (!walkable(x, y)) throw new Error(`指定起點 (${x}, ${y}) 不可行走。`);
    return { x, y, direction };
  }
  return {
    ...nearestWalkable(
      { x: Math.floor(width / 2), y: Math.floor(height / 2) },
      width,
      height,
      walkable,
    ),
    direction: 0,
  };
}
