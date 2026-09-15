import { expect, test } from "bun:test";
import { cursorHotspot } from "../../src/game/cursor";

test("CSS 游標 hotspot 由 GraphicInfo 負偏移換算", () => {
  expect(
    cursorHotspot({ width: 32, height: 32, offX: -16, offY: -16 }),
  ).toEqual({ x: 16, y: 16 });
});

test("CSS 游標 hotspot 會限制在圖像範圍內", () => {
  expect(cursorHotspot({ width: 8, height: 6, offX: -99, offY: 3 })).toEqual({
    x: 7,
    y: 0,
  });
});
