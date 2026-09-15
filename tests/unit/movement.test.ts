import { expect, test } from "bun:test";
import {
  buildWalkability,
  directionFor,
  DIRECTION_DELTAS,
  findPath,
  nearestWalkable,
} from "../../src/game/movement";

test("碰撞網格套用地面 access 與多格物件占地", () => {
  const records = new Map([
    [10, { access: 1, asGround: false, gridWidth: 1, gridHeight: 1 }],
    [20, { access: 0, asGround: false, gridWidth: 2, gridHeight: 1 }],
  ]);
  expect([
    ...buildWalkability(
      {
        header: { width: 3, height: 2 },
        ground: [10, 10, 10, 10, 0, 10],
        object: [20, 0, 0, 0, 0, 0],
      },
      records,
    ),
  ]).toEqual([0, 0, 1, 1, 0, 1]);
});

test("方向 0 從西北開始並順時針對應八方位", () => {
  expect(DIRECTION_DELTAS).toEqual([
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
  ]);
  DIRECTION_DELTAS.forEach(([x, y], direction) =>
    expect(directionFor({ x: 5, y: 5 }, { x: 5 + x, y: 5 + y })).toBe(
      direction,
    ),
  );
});

test("A* 會繞過障礙抵達指定格位", () => {
  const blocked = new Set(["1,0", "1,1", "1,2"]);
  const path = findPath(
    { x: 0, y: 1 },
    { x: 3, y: 1 },
    4,
    4,
    (x, y) => !blocked.has(`${x},${y}`),
  );
  expect(path?.[0]).toEqual({ x: 0, y: 1 });
  expect(path?.at(-1)).toEqual({ x: 3, y: 1 });
  expect(path?.every(({ x, y }) => !blocked.has(`${x},${y}`))).toBe(true);
});

test("A* 不會穿過被兩側障礙夾住的斜角", () => {
  const blocked = new Set(["1,0", "0,1"]);
  expect(
    findPath(
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      2,
      2,
      (x, y) => !blocked.has(`${x},${y}`),
    ),
  ).toBeNull();
});

test("起點被擋住時可找出最近的可行走格位", () => {
  expect(
    nearestWalkable({ x: 1, y: 1 }, 3, 3, (x, y) => x === 2 && y === 1),
  ).toEqual({
    x: 2,
    y: 1,
  });
});
