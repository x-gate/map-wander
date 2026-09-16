import { expect, test } from "bun:test";
import {
  collisionRecordsForMap,
  INVISIBLE_BLOCKER_MAP_ID,
} from "../../src/resources/game-resources";
import type { GraphicRecord } from "../../src/resources/binary";

test("缺少圖像的物件 ID 2 仍保留一格不可穿越碰撞", () => {
  const collisions = collisionRecordsForMap(new Map<number, GraphicRecord>(), [
    INVISIBLE_BLOCKER_MAP_ID,
  ]);
  expect(collisions.get(INVISIBLE_BLOCKER_MAP_ID)).toEqual({
    access: 0,
    asGround: false,
    gridWidth: 1,
    gridHeight: 1,
  });
});

test("已有 GraphicInfo 碰撞資料時不覆寫 grid_w 與 grid_h", () => {
  const record: GraphicRecord = {
    row: 1,
    id: 20,
    addr: 0,
    len: 16,
    offX: 0,
    offY: 0,
    width: 64,
    height: 48,
    gridWidth: 3,
    gridHeight: 2,
    access: 0,
    asGround: false,
    mapId: INVISIBLE_BLOCKER_MAP_ID,
  };
  const collisions = collisionRecordsForMap(
    new Map([[INVISIBLE_BLOCKER_MAP_ID, record]]),
    [INVISIBLE_BLOCKER_MAP_ID],
  );
  expect(collisions.get(INVISIBLE_BLOCKER_MAP_ID)).toBe(record);
});
