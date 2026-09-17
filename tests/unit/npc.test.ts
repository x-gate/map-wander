import { expect, test } from "bun:test";
import { parseNpcCatalog, parseNpcTsv } from "../../src/resources/npc";

const example =
  "Itemshop2\t希洛克\t0\t1005\t0\t1\t1\t0\t1011\t19\t13\t19\t13\t19\t13\t19\t13\t1\t60000\t6\t14002\t0\t1\t0";

test("依指定欄位解析 1011 NPC 與 Graphic MapID", () => {
  expect(parseNpcTsv(`忽略此行\n${example}`, 1011)).toEqual([
    {
      sourceLine: 2,
      mapId: 1011,
      positions: [
        { x: 19, y: 13 },
        { x: 19, y: 13 },
        { x: 19, y: 13 },
        { x: 19, y: 13 },
      ],
      direction: 6,
      graphicMapId: 14002,
    },
  ]);
});

test("NPC 依地圖分組且無效資料不影響其他地圖", () => {
  const other = example.replace("\t1011\t", "\t2000\t");
  const broken = other.replace("\t19\t13", "\tx\t13");
  const catalog = parseNpcCatalog(`${example}\n${other}\n${broken}\n# comment`);
  expect(catalog[1011].definitions).toHaveLength(1);
  expect(catalog[1011].issues).toEqual([]);
  expect(catalog[2000].definitions[0].sourceLine).toBe(2);
  expect(catalog[2000].issues).toEqual([
    "npc.txt 第 3 行的數值欄位無效，已略過。",
  ]);
  expect(catalog[3000]).toBeUndefined();
});

test("只保留指定地圖並拒絕該地圖的非整數座標", () => {
  const otherMap = example.replace("\t1011\t", "\t1000\t");
  expect(parseNpcTsv(`${otherMap}\n${example}`, 1011)).toHaveLength(1);
  expect(() =>
    parseNpcTsv(example.replace("\t19\t13", "\tx\t13"), 1011),
  ).toThrow("第 10 個值不是整數");
});
