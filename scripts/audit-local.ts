// Optional read-only integration audit. It prints metadata and hashes, never pixels.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { initSync } from "../.generated/xglib/xglib.js";
import * as bindings from "../.generated/xglib/xglib.js";
import type * as Contract from "../.generated/xglib/contract";
import { REQUIRED_PATHS, type GameFiles } from "../src/resources/catalog";
import { loadGame } from "../src/resources/game-resources";

const selectedRoot = process.argv[2];
if (!selectedRoot)
  throw new Error("用法：bun scripts/audit-local.ts <遊戲根目錄>");
const root = resolve(selectedRoot);

async function hashes() {
  return Promise.all(
    REQUIRED_PATHS.map(async (path) => {
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(resolve(root, path)))
        hash.update(chunk);
      return { path, sha256: hash.digest("hex") };
    }),
  );
}

const before = await hashes();
initSync({
  module: await readFile(
    new URL("../.generated/xglib/xglib_bg.wasm", import.meta.url),
  ),
});
const files = Object.fromEntries(
  REQUIRED_PATHS.map((path) => [path, Bun.file(resolve(root, path))]),
) as unknown as GameFiles;
const game = await loadGame(bindings as unknown as typeof Contract, files);
const after = await hashes();
const inputsUnchanged = JSON.stringify(before) === JSON.stringify(after);
const actionSummary = [...game.clips.values()]
  .sort((a, b) => a.direction - b.direction || a.action - b.action)
  .map(({ direction, action, duration, frames }) => ({
    direction,
    action,
    duration,
    frames: frames.length,
  }));

console.log(
  JSON.stringify(
    {
      map: {
        width: game.map.header.width,
        height: game.map.header.height,
        decodedGraphicIds: [...game.mapGraphics.keys()].sort((a, b) => a - b),
        missingGraphicIds: game.missingMapIds,
      },
      cursor: {
        id: game.cursor.id,
        width: game.cursor.width,
        height: game.cursor.height,
      },
      marker: {
        id: game.marker.id,
        width: game.marker.width,
        height: game.marker.height,
      },
      anime: {
        id: 100052,
        selectedRow: game.animeRow,
        duplicateCount: game.animeDuplicateCount,
        actions: actionSummary,
      },
      inputs: before,
      inputsUnchanged,
    },
    null,
    2,
  ),
);
if (!inputsUnchanged) process.exitCode = 1;
