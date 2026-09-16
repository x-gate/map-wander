import { expect, test } from "bun:test";
import {
  cameraPosition,
  screenTile,
  tilePosition,
} from "../../src/game/geometry";

test("等角投影可由格位中心還原原始座標", () => {
  for (let y = 0; y < 9; y++)
    for (let x = 0; x < 13; x++) {
      const point = tilePosition(x, y, 13);
      expect(screenTile(point.x, point.y, 13)).toEqual({ x, y });
    }
});

test("鏡頭位置會將縮放後的角色腳點置於畫面中央", () => {
  expect(cameraPosition({ x: 120, y: 80 }, 800, 600, 1.5)).toEqual({
    x: 220,
    y: 180,
  });
});
