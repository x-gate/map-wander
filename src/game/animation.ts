export interface AnimationClock {
  action: 0 | 1;
  elapsed: number;
}

export function advanceAnimationClock(
  clock: AnimationClock,
  action: 0 | 1,
  deltaMS: number,
): AnimationClock {
  if (clock.action !== action) return { action, elapsed: 0 };
  return { action, elapsed: clock.elapsed + Math.max(0, deltaMS) };
}

export function loopFrameIndex(
  elapsed: number,
  duration: number,
  frameCount: number,
) {
  if (duration <= 0 || frameCount <= 0)
    throw new Error("動畫週期與影格數必須大於 0。");
  const frameDuration = duration / frameCount;
  return Math.floor((elapsed % duration) / frameDuration);
}
