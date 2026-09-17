import { expect, test } from "bun:test";
import { parseWarpTsv } from "../../src/resources/warp";
import { buildWarpIndex, warpOnStep } from "../../src/game/warp";

test("傳送資料保留序號、來源行與兩端座標，略過註解及空白", () => {
  const parsed = parseWarpTsv("# comment\r\n\r\n1\t100\t2\t3\t200\t4\t5\r\n");
  expect(parsed).toEqual({
    warps: [
      {
        id: 1,
        sourceLine: 3,
        from: { mapId: 100, x: 2, y: 3 },
        to: { mapId: 200, x: 4, y: 5 },
      },
    ],
    issues: [],
  });
});

test("空欄位或無效數值不會成為原點傳送，保留行號診斷", () => {
  const parsed = parseWarpTsv(
    "1\t\t\t\t\t\t\n2\t100\t-1\t0\t200\t0\t0\n3\t100\t0\t0\t200\t0\t0",
  );
  expect(parsed.warps).toHaveLength(1);
  expect(parsed.warps[0].from).toEqual({ mapId: 100, x: 0, y: 0 });
  expect(parsed.issues).toHaveLength(2);
  expect(parsed.issues[0]).toContain("第 1 行");
});

test("單筆關係建立雙向傳送，反向重複資料不會重複觸發", () => {
  const parsed = parseWarpTsv(
    "1\t100\t2\t3\t200\t4\t5\n2\t200\t4\t5\t100\t2\t3",
  );
  const index = buildWarpIndex(parsed.warps);
  expect(index.maps.get(100)?.size).toBe(1);
  expect(index.maps.get(200)?.get("4,5")?.to).toEqual({
    mapId: 100,
    x: 2,
    y: 3,
  });
  expect(index.issues).toEqual([]);
  const oneWay = buildWarpIndex(parsed.warps.slice(0, 1));
  expect(oneWay.maps.get(200)?.get("4,5")?.to).toEqual({
    mapId: 100,
    x: 2,
    y: 3,
  });
});

test("明確入口優先於反向補足，衝突保留診斷與穩定順序", () => {
  const parsed = parseWarpTsv(
    "1\t100\t2\t3\t200\t4\t5\n2\t200\t4\t5\t100\t2\t4\n3\t200\t4\t5\t300\t0\t0",
  );
  const index = buildWarpIndex(parsed.warps);
  expect(index.maps.get(200)?.get("4,5")?.to).toEqual({
    mapId: 100,
    x: 2,
    y: 4,
  });
  expect(index.issues.length).toBeGreaterThan(0);
});

test("只有踏入入口才觸發，落地停留與點擊同格不會立即回傳", () => {
  const { maps } = buildWarpIndex(
    parseWarpTsv("1\t100\t2\t3\t200\t4\t5").warps,
  );
  const outbound = warpOnStep(maps.get(100)!, { x: 1, y: 3 }, { x: 2, y: 3 });
  expect(outbound?.to.mapId).toBe(200);
  const reverse = maps.get(200)!;
  expect(warpOnStep(reverse, { x: 4, y: 5 }, { x: 4, y: 5 })).toBeUndefined();
  expect(warpOnStep(reverse, { x: 4, y: 5 }, { x: 4, y: 6 })).toBeUndefined();
  expect(warpOnStep(reverse, { x: 4, y: 6 }, { x: 4, y: 5 })?.to.mapId).toBe(
    100,
  );
});

test("同地圖不同座標的傳送仍可雙向觸發", () => {
  const { maps } = buildWarpIndex(
    parseWarpTsv("1\t100\t2\t3\t100\t4\t5").warps,
  );
  expect(maps.get(100)?.size).toBe(2);
  expect(
    warpOnStep(maps.get(100)!, { x: 4, y: 6 }, { x: 4, y: 5 })?.to,
  ).toEqual({ mapId: 100, x: 2, y: 3 });
});
