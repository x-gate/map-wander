import { expect, test } from "bun:test";
import {
  buildWalkability,
  directionFor,
  directionToward,
  DIRECTION_DELTAS,
  findPath,
  findPathToward,
  movementStepDuration,
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

test("不可穿越物件向正 x 與負 y 展開 grid_w 與 grid_h", () => {
  const records = new Map([
    [10, { access: 1, asGround: false, gridWidth: 1, gridHeight: 1 }],
    [20, { access: 0, asGround: false, gridWidth: 2, gridHeight: 2 }],
  ]);
  expect([
    ...buildWalkability(
      {
        header: { width: 4, height: 3 },
        ground: Array(12).fill(10),
        object: [0, 0, 0, 0, 0, 20, 0, 0, 0, 0, 0, 0],
      },
      records,
    ),
  ]).toEqual([1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1]);
});

test("1x2 物件封鎖錨點與前一個 y 格位", () => {
  const records = new Map([
    [10, { access: 1, asGround: false, gridWidth: 1, gridHeight: 1 }],
    [17159, { access: 0, asGround: false, gridWidth: 1, gridHeight: 2 }],
  ]);
  expect([
    ...buildWalkability(
      {
        header: { width: 1, height: 4 },
        ground: [10, 10, 10, 10],
        object: [0, 0, 17159, 0],
      },
      records,
    ),
  ]).toEqual([1, 0, 0, 1]);
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

test("轉向使用目標格位相對方向，同一格則維持原朝向", () => {
  expect(directionToward({ x: 5, y: 5 }, { x: 2, y: 8 })).toBe(5);
  expect(directionToward({ x: 5, y: 5 }, { x: 5, y: 5 })).toBeNull();
});

test("雙軸斜向移動依根號二距離延長時間", () => {
  expect(movementStepDuration({ x: 2, y: 2 }, { x: 3, y: 2 }, 190)).toBe(190);
  expect(movementStepDuration({ x: 2, y: 2 }, { x: 3, y: 3 }, 190)).toBeCloseTo(
    190 * Math.SQRT2,
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

test("點擊不可穿越格位時走到障礙物前一格", () => {
  const blocked = new Set(["3,0"]);
  expect(
    findPathToward(
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      4,
      1,
      (x, y) => !blocked.has(`${x},${y}`),
    ),
  ).toEqual([
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
  ]);
});

test("目標位於隔離區域時走到可達區域中最接近的格位", () => {
  const blocked = new Set(["2,0", "2,1", "2,2"]);
  const path = findPathToward(
    { x: 0, y: 1 },
    { x: 4, y: 1 },
    5,
    3,
    (x, y) => !blocked.has(`${x},${y}`),
  );
  expect(path?.at(-1)).toEqual({ x: 1, y: 1 });
});

test("起點被擋住時可找出最近的可行走格位", () => {
  expect(
    nearestWalkable({ x: 1, y: 1 }, 3, 3, (x, y) => x === 2 && y === 1),
  ).toEqual({
    x: 2,
    y: 1,
  });
});
