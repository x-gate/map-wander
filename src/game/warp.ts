import type { WarpDefinition } from "../resources/warp";
import type { Cell } from "./movement";

export type MapWarps = ReadonlyMap<string, WarpDefinition>;
const cellKey = ({ x, y }: Cell) => `${x},${y}`;

export function buildWarpIndex(warps: readonly WarpDefinition[]) {
  const maps = new Map<number, Map<string, WarpDefinition>>();
  const issues: string[] = [];
  const add = (warp: WarpDefinition, reverse: boolean) => {
    let map = maps.get(warp.from.mapId);
    if (!map) maps.set(warp.from.mapId, (map = new Map()));
    const key = cellKey(warp.from);
    const previous = map.get(key);
    if (!previous) map.set(key, warp);
    else if (
      previous.to.mapId !== warp.to.mapId ||
      cellKey(previous.to) !== cellKey(warp.to)
    ) {
      issues.push(
        `warp.txt 第 ${warp.sourceLine} 行${reverse ? "反向" : ""}入口 ${warp.from.mapId} (${key}) 有多個目的地，採用第 ${previous.sourceLine} 行。`,
      );
    }
  };
  // Explicit From entries take priority over inferred reverse entries.
  // Within the same priority, file order gives a stable result with diagnostics.
  for (const warp of warps) add(warp, false);
  for (const warp of warps)
    add({ ...warp, from: warp.to, to: warp.from }, true);
  return { maps, issues };
}

export function warpOnStep(warps: MapWarps, from: Cell, to: Cell) {
  if (from.x === to.x && from.y === to.y) return undefined;
  return warps.get(cellKey(to));
}
