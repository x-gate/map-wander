import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { parseNpcTsv } from "./src/resources/npc";

const NPC_MODULE_ID = "virtual:map-npcs";
const RESOLVED_NPC_MODULE_ID = `\0${NPC_MODULE_ID}`;
const npcPath = fileURLToPath(
  new URL("../cgmsv/gmsv/data/npc.txt", import.meta.url),
);

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "map-npcs",
      resolveId(id) {
        return id === NPC_MODULE_ID ? RESOLVED_NPC_MODULE_ID : undefined;
      },
      load(id) {
        if (id !== RESOLVED_NPC_MODULE_ID) return undefined;
        this.addWatchFile(npcPath);
        const definitions = parseNpcTsv(readFileSync(npcPath, "latin1"), 1011);
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
