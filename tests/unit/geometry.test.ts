import { expect, test } from "bun:test";
import { screenTile, tilePosition } from "../../src/game/geometry";

test("等角投影可由格位中心還原原始座標", () => {
  for (let y = 0; y < 9; y++)
    for (let x = 0; x < 13; x++) {
      const point = tilePosition(x, y, 13);
      expect(screenTile(point.x, point.y, 13)).toEqual({ x, y });
    }
});
