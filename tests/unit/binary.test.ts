import { expect, test } from "bun:test";
import {
  readAnimeRecord,
  readGraphicRecord,
  validGraphicRecord,
} from "../../src/resources/binary";

test("讀取 40-byte GraphicInfo 尋址與碰撞欄位", () => {
  const bytes = new Uint8Array(40);
  const view = new DataView(bytes.buffer);
  view.setInt32(0, 1899, true);
  view.setUint32(4, 123, true);
  view.setInt32(8, 762, true);
  view.setInt32(12, -16, true);
  view.setInt32(16, -16, true);
  view.setInt32(20, 32, true);
  view.setInt32(24, 32, true);
  bytes.set([1, 1, 1, 0], 28);
  view.setInt32(36, 245400, true);
  expect(readGraphicRecord(bytes, 7)).toEqual({
    row: 7,
    id: 1899,
    addr: 123,
    len: 762,
    offX: -16,
    offY: -16,
    width: 32,
    height: 32,
    gridWidth: 1,
    gridHeight: 1,
    access: 1,
    asGround: false,
    mapId: 245400,
  });
  expect(validGraphicRecord(readGraphicRecord(bytes, 7), 1000)).toBe(true);
});

test("讀取 12-byte AnimeInfo 並保留索引列", () => {
  const bytes = new Uint8Array(12);
  const view = new DataView(bytes.buffer);
  view.setInt32(0, 100052, true);
  view.setInt32(4, 554544, true);
  view.setInt16(8, 160, true);
  expect(readAnimeRecord(bytes, 50)).toEqual({
    row: 50,
    id: 100052,
    addr: 554544,
    actionCount: 160,
  });
});

test("拒絕尺寸錯誤的索引列", () => {
  expect(() => readGraphicRecord(new Uint8Array(39), 0)).toThrow("40 bytes");
  expect(() => readAnimeRecord(new Uint8Array(11), 0)).toThrow("12 bytes");
});
