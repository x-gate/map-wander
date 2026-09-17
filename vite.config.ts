import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { parseNpcCatalog } from "./src/resources/npc";
import { parseWarpTsv } from "./src/resources/warp";

const NPC_MODULE_ID = "virtual:map-npcs";
const RESOLVED_NPC_MODULE_ID = `\0${NPC_MODULE_ID}`;
const npcPath = fileURLToPath(
  new URL("../cgmsv/gmsv/data/npc.txt", import.meta.url),
);
const WARP_MODULE_ID = "virtual:map-warps";
const RESOLVED_WARP_MODULE_ID = `\0${WARP_MODULE_ID}`;
const warpPath = fileURLToPath(
  new URL("../cgmsv/gmsv/data/warp.txt", import.meta.url),
);

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "map-warps",
      resolveId(id) {
        return id === WARP_MODULE_ID ? RESOLVED_WARP_MODULE_ID : undefined;
      },
      load(id) {
        if (id !== RESOLVED_WARP_MODULE_ID) return undefined;
        this.addWatchFile(warpPath);
        return `export default ${JSON.stringify(parseWarpTsv(readFileSync(warpPath, "utf8")))};`;
      },
    },
    {
      name: "map-npcs",
      resolveId(id) {
        return id === NPC_MODULE_ID ? RESOLVED_NPC_MODULE_ID : undefined;
      },
      load(id) {
        if (id !== RESOLVED_NPC_MODULE_ID) return undefined;
        this.addWatchFile(npcPath);
        const definitions = parseNpcCatalog(readFileSync(npcPath, "latin1"));
        return `export default ${JSON.stringify(definitions)};`;
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: 8081,
    strictPort: true,
  },
});
