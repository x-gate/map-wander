/// <reference types="vite/client" />

declare module "virtual:map-warps" {
  const data: import("./resources/warp").WarpData;
  export default data;
}

declare module "virtual:map-npcs" {
  const definitions: import("./resources/npc").NpcCatalog;

  export default definitions;
}
