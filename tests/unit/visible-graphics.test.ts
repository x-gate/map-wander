import { expect, test } from "bun:test";
import type { GraphicRecord } from "../../src/resources/binary";
import { VisibleGraphics } from "../../src/game/visible-graphics";

const record = (row: number) => ({ row }) as GraphicRecord;
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

test("只解碼可見索引，重複圖塊共用資源，離開視野釋放", async () => {
  const requested: number[] = [];
  const released: number[] = [];
  const stream = new VisibleGraphics(
    async ({ row }) => {
      requested.push(row);
      return row;
    },
    (row) => released.push(row),
    () => {},
  );
  stream.set([record(1), record(1), record(2)]);
  await stream.ready();
  stream.set([record(2), record(3)]);
  await stream.ready();
  expect(requested).toEqual([1, 2, 3]);
  expect([...stream.loaded.keys()]).toEqual([2, 3]);
  expect(released).toEqual([1]);
  stream.destroy();
  expect(released).toEqual([1, 2, 3]);
});

test("快速平移取消未開始的工作，過期結果不重新加入畫面", async () => {
  const requests: number[] = [];
  const resolves = new Map<number, (row: number) => void>();
  const released: number[] = [];
  const stream = new VisibleGraphics(
    ({ row }) => {
      requests.push(row);
      return new Promise<number>((resolve) => resolves.set(row, resolve));
    },
    (row) => released.push(row),
    () => {},
    1,
  );
  stream.set([record(1), record(2)]);
  stream.set([record(3)]);
  resolves.get(1)!(1);
  await flush();
  expect(requests).toEqual([1, 3]);
  expect(released).toEqual([1]);
  resolves.get(3)!(3);
  await stream.ready();
  expect([...stream.loaded.keys()]).toEqual([3]);
  stream.destroy();
});

test("切圖銷毀後的非同步結果被釋放，不呼叫已銷毀場景", async () => {
  let resolve!: (value: number) => void;
  let callbacks = 0;
  const released: number[] = [];
  const stream = new VisibleGraphics(
    () =>
      new Promise<number>((done) => {
        resolve = done;
      }),
    (row) => released.push(row),
    () => callbacks++,
  );
  stream.set([record(1)]);
  const ready = stream.ready();
  stream.destroy();
  resolve(1);
  await ready;
  await flush();
  expect(released).toEqual([1]);
  expect(callbacks).toBe(0);
  expect(stream.loaded.size).toBe(0);
});

test("解碼失敗可回報且不無限重試，不阻止其他可見圖像", async () => {
  let attempts = 0;
  const stream = new VisibleGraphics(
    async ({ row }) => {
      attempts++;
      if (row === 1) throw new Error("bad graphic");
      return row;
    },
    () => {},
    () => {},
  );
  stream.set([record(1), record(2)]);
  await expect(stream.ready()).rejects.toThrow("bad graphic");
  stream.set([record(1), record(2)]);
  expect(attempts).toBe(2);
  expect(stream.loaded.get(2)).toBe(2);
  stream.destroy();
});
