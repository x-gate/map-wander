import { expect, test } from "bun:test";
import type { GraphicRecord } from "../../src/resources/binary";
import type { LoadedGame } from "../../src/resources/game-resources";
import {
  MapVisibility,
  intersects,
  viewportBounds,
} from "../../src/game/visibility";
import { cameraPosition, tilePosition } from "../../src/game/geometry";

const record: GraphicRecord = {
  row: 1,
  id: 1,
  mapId: 1,
  addr: 0,
  len: 1,
  offX: -32,
  offY: -24,
  width: 64,
  height: 48,
  gridWidth: 1,
  gridHeight: 1,
  access: 1,
  asGround: false,
};
function fixture(width = 64, height = 64) {
  return {
    map: {
      header: { width, height },
      ground: Array(width * height).fill(1),
      object: Array(width * height).fill(0),
    } as LoadedGame["map"],
    mapRecords: new Map([[1, record]]),
    npcs: [] as LoadedGame["npcs"],
  };
}

test("視野只選取相交圖像，平移與縮放後與全掃描參考結果相同", () => {
  const index = new MapVisibility(fixture());
  const all = index.query({
    left: -10000,
    top: -10000,
    right: 10000,
    bottom: 10000,
  });
  expect(all.length).toBe(4096);
  for (const zoom of [0.35, 0.7, 1.5, 3]) {
    for (const x of [0, 17, 40, 63]) {
      const camera = cameraPosition(tilePosition(x, 29, 64), 800, 600, zoom);
      const bounds = viewportBounds(camera.x, camera.y, zoom, 800, 600);
      const visible = index.query(bounds);
      expect(visible.map((p) => p.key)).toEqual(
        all.filter((p) => intersects(p, bounds)).map((p) => p.key),
      );
      expect(visible.length).toBeLessThan(index.total);
    }
  }
});

test("圖像偏移與尺寸納入區塊邊界，即使錨點不在視野仍載入高大物件", () => {
  const resources = fixture();
  const tall = { ...record, row: 2, mapId: 2, offY: -1000, height: 1000 };
  resources.mapRecords.set(2, tall);
  resources.map.object[32 * 64 + 32] = 2;
  const foot = tilePosition(32, 32, 64);
  const visible = new MapVisibility(resources).query({
    left: foot.x - 10,
    right: foot.x + 10,
    top: foot.y - 950,
    bottom: foot.y - 900,
  });
  expect(visible.some((p) => p.record.row === 2)).toBe(true);
});

test("NPC 使用同一視野索引並保留獨立圖層與穩定排序", () => {
  const resources = fixture(2, 2);
  resources.npcs.push({
    sourceLine: 44,
    mapId: 1011,
    direction: 6,
    graphicMapId: 1,
    positions: Array(4).fill({ x: 1, y: 1 }),
    graphic: record,
  } as LoadedGame["npcs"][number]);
  const index = new MapVisibility(resources);
  const all = index.query({ left: -100, top: -100, right: 200, bottom: 200 });
  expect(all.map((p) => p.key)).toEqual([0, 1, 2, 3, 4]);
  expect(all[4].layer).toBe("npc");
  expect(all[4].depth).toBe(tilePosition(1, 1, 2).y + 0.25);
  expect(index.query({ left: 500, top: 500, right: 600, bottom: 600 })).toEqual(
    [],
  );
});
