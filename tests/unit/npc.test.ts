import { expect, test } from "bun:test";
import { parseNpcTsv } from "../../src/resources/npc";

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

test("只保留指定地圖並拒絕該地圖的非整數座標", () => {
  const otherMap = example.replace("\t1011\t", "\t1000\t");
  expect(parseNpcTsv(`${otherMap}\n${example}`, 1011)).toHaveLength(1);
  expect(() =>
    parseNpcTsv(example.replace("\t19\t13", "\tx\t13"), 1011),
  ).toThrow("第 10 個值不是整數");
});
