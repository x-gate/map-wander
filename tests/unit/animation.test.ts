import { expect, test } from "bun:test";
import {
  advanceAnimationClock,
  loopFrameIndex,
  type AnimationClock,
} from "../../src/game/animation";

test("同一個步行 ActID 跨格時持續累加動畫時間", () => {
  let clock: AnimationClock = { action: 1, elapsed: 180 };
  clock = advanceAnimationClock(clock, 1, 20);
  expect(clock).toEqual({ action: 1, elapsed: 200 });
  clock = advanceAnimationClock(clock, 1, 190);
  expect(clock).toEqual({ action: 1, elapsed: 390 });
});

test("只在 ActID 變更時重設動畫循環", () => {
  expect(advanceAnimationClock({ action: 0, elapsed: 800 }, 1, 16)).toEqual({
    action: 1,
    elapsed: 0,
  });
  expect(advanceAnimationClock({ action: 1, elapsed: 800 }, 0, 16)).toEqual({
    action: 0,
    elapsed: 0,
  });
});

test("步行影格依動畫 duration 循環而不超出範圍", () => {
  expect(
    [0, 166, 167, 999, 1000, 1167].map((elapsed) =>
      loopFrameIndex(elapsed, 1000, 6),
    ),
  ).toEqual([0, 0, 1, 5, 0, 1]);
});
