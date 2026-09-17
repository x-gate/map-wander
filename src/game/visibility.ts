import type { GraphicRecord } from "../resources/binary";
import type { LoadedGame } from "../resources/game-resources";
import { tilePosition } from "./geometry";

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Placement extends Bounds {
  key: number;
  record: GraphicRecord;
  layer: "ground" | "object" | "npc";
  depth: number;
  label?: string;
}

export function intersects(a: Bounds, b: Bounds) {
  return (
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  );
}

export function viewportBounds(
  x: number,
  y: number,
  zoom: number,
  width: number,
  height: number,
): Bounds {
  return {
    left: -x / zoom,
    top: -y / zoom,
    right: (width - x) / zoom,
    bottom: (height - y) / zoom,
  };
}

// Only metadata is indexed. Chunk bounds include image offsets and overhangs,
// so a tree remains visible even when its anchor cell is outside the viewport.
export class MapVisibility {
  private chunks = new Map<
    string,
    { bounds: Bounds; placements: Placement[] }
  >();
  readonly total: number;

  constructor(resources: Pick<LoadedGame, "map" | "mapRecords" | "npcs">) {
    const { map, mapRecords, npcs } = resources;
    const { width, height } = map.header;
    let key = 0;
    const add = (
      x: number,
      y: number,
      record: GraphicRecord,
      layer: Placement["layer"],
      label?: string,
    ) => {
      const foot = tilePosition(x, y, width);
      const left = foot.x + record.offX;
      const top = foot.y + record.offY;
      const placement: Placement = {
        key: key++,
        record,
        layer,
        label,
        left,
        top,
        right: left + record.width,
        bottom: top + record.height,
        depth: foot.y + (layer === "npc" ? 0.25 : 0),
      };
      const chunkKey = `${Math.floor(x / 16)},${Math.floor(y / 16)}`;
      let chunk = this.chunks.get(chunkKey);
      if (!chunk) {
        chunk = { bounds: { ...placement }, placements: [] };
        this.chunks.set(chunkKey, chunk);
      }
      chunk.placements.push(placement);
      chunk.bounds.left = Math.min(chunk.bounds.left, placement.left);
      chunk.bounds.top = Math.min(chunk.bounds.top, placement.top);
      chunk.bounds.right = Math.max(chunk.bounds.right, placement.right);
      chunk.bounds.bottom = Math.max(chunk.bounds.bottom, placement.bottom);
    };
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        for (const layer of ["ground", "object"] as const) {
          const record = mapRecords.get(map[layer][y * width + x]);
          if (record)
            add(
              x,
              y,
              record,
              layer === "ground" || record.asGround ? "ground" : "object",
            );
        }
    for (const npc of npcs) {
      const { x, y } = npc.positions[0];
      add(
        x,
        y,
        npc.graphic,
        "npc",
        `npc:${npc.sourceLine}:direction:${npc.direction}`,
      );
    }
    this.total = key;
  }

  query(bounds: Bounds): Placement[] {
    const result: Placement[] = [];
    for (const chunk of this.chunks.values()) {
      if (!intersects(bounds, chunk.bounds)) continue;
      for (const placement of chunk.placements)
        if (intersects(bounds, placement)) result.push(placement);
    }
    return result.sort((a, b) => a.key - b.key);
  }
}
