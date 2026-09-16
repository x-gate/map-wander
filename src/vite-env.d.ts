/// <reference types="vite/client" />

declare module "virtual:map-npcs" {
  import type { NpcDefinition } from "./resources/npc";

  const definitions: readonly NpcDefinition[];
  export default definitions;
}
