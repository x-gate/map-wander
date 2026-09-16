// Optional read-only integration audit. It prints metadata and hashes, never pixels.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initSync } from "../.generated/xglib/xglib.js";
import * as bindings from "../.generated/xglib/xglib.js";
import type * as Contract from "../.generated/xglib/contract";
import { REQUIRED_PATHS, type GameFiles } from "../src/resources/catalog";
import { loadGame } from "../src/resources/game-resources";
import { parseNpcTsv } from "../src/resources/npc";

const selectedRoot = process.argv[2];
if (!selectedRoot)
  throw new Error("用法：bun scripts/audit-local.ts <遊戲根目錄>");
const root = resolve(selectedRoot);
const npcPath = fileURLToPath(
  new URL("../../cgmsv/gmsv/data/npc.txt", import.meta.url),
);

async function hashFile(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function hashes() {
  return Promise.all(
    REQUIRED_PATHS.map(async (path) => {
      return { path, sha256: await hashFile(resolve(root, path)) };
    }),
  );
}

const before = await hashes();
const npcBefore = await hashFile(npcPath);
initSync({
  module: await readFile(
    new URL("../.generated/xglib/xglib_bg.wasm", import.meta.url),
  ),
});
const files = Object.fromEntries(
  REQUIRED_PATHS.map((path) => [path, Bun.file(resolve(root, path))]),
) as unknown as GameFiles;
const npcDefinitions = parseNpcTsv(await readFile(npcPath, "latin1"), 1011);
const game = await loadGame(
  bindings as unknown as typeof Contract,
  files,
  undefined,
  npcDefinitions,
);
const after = await hashes();
const npcAfter = await hashFile(npcPath);
const inputsUnchanged =
  JSON.stringify(before) === JSON.stringify(after) && npcBefore === npcAfter;
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
      npcs: {
        count: game.npcs.length,
        graphicMapIds: game.npcs
          .map(({ graphicMapId }) => graphicMapId)
          .sort((a, b) => a - b),
        missingGraphicMapIds: game.missingNpcGraphicMapIds,
      },
      inputs: [
        ...before,
        { path: "../cgmsv/gmsv/data/npc.txt", sha256: npcBefore },
      ],
      inputsUnchanged,
    },
    null,
    2,
  ),
);
if (!inputsUnchanged) process.exitCode = 1;
