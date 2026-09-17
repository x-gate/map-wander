import { expect, test } from "bun:test";
import {
  resolveSpawn,
  START_MAP_ID,
  START_POSITION,
} from "../../src/game/spawn";

test("預設起點為 1530 的 (15,6)，朝向 0 西北", () => {
  expect(START_MAP_ID).toBe(1530);
  expect(resolveSpawn(30, 30, () => true, START_POSITION)).toEqual({
    x: 15,
    y: 6,
    direction: 0,
  });
});

test("傳送使用精確落點及朝向，不偷偷移到附近格位", () => {
  const spawn = { x: 8, y: 9, direction: 6 };
  expect(resolveSpawn(20, 20, () => true, spawn)).toEqual(spawn);
  expect(() => resolveSpawn(20, 20, () => false, spawn)).toThrow("不可行走");
  expect(() => resolveSpawn(5, 5, () => true, spawn)).toThrow("無效");
});

test("未指定座標的手動選圖仍可找到附近可行走格", () => {
  expect(resolveSpawn(10, 10, (x, y) => x === 5 && y === 4)).toEqual({
    x: 5,
    y: 4,
    direction: 0,
  });
});
