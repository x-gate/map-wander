import type * as Contract from "../../.generated/xglib/contract";
import { animeHeader, GraphicArchive, loadAnime } from "./binary";
import type { DecodedGraphic, GraphicCollision, GraphicRecord } from "./binary";
import type { GameFiles } from "./catalog";

export const INVISIBLE_BLOCKER_MAP_ID = 2;

export interface AnimationClip {
  direction: number;
  action: 0 | 1;
  duration: number;
  frames: Array<{
    graphic: DecodedGraphic;
    offsetX: number;
    offsetY: number;
  }>;
}

export interface LoadedGame {
  map: Contract.Map;
  mapGraphics: Map<number, DecodedGraphic>;
  mapRecords: Map<number, GraphicRecord>;
  collisionRecords: Map<number, GraphicCollision>;
  cursor: DecodedGraphic;
  marker: DecodedGraphic;
  clips: Map<string, AnimationClip>;
  animeRow: number;
  animeDuplicateCount: number;
  missingMapIds: number[];
}

export const clipKey = (direction: number, action: 0 | 1) =>
  `${direction}:${action}`;

export function collisionRecordsForMap(
  records: Map<number, GraphicRecord>,
  objectIds: Iterable<number>,
) {
  const collisions = new Map<number, GraphicCollision>(records);
  for (const id of objectIds)
    if (id === INVISIBLE_BLOCKER_MAP_ID && !collisions.has(id))
      collisions.set(id, {
        access: 0,
        asGround: false,
        gridWidth: 1,
        gridHeight: 1,
      });
  return collisions;
}

export async function loadGame(
  parser: typeof Contract,
  files: GameFiles,
  onProgress: (message: string) => void = () => {},
): Promise<LoadedGame> {
  onProgress("讀取調色盤與索引…");
  const palette = new Uint8Array(
    await files["Assets/bin/pal/palet_00.cgp"].arrayBuffer(),
  );
  if (![672, 708].includes(palette.byteLength))
    throw new Error("palet_00.cgp 必須為 672 或 708 bytes。");
  parser.game_palette_build_from_cgp(palette);

  const [base, interfaceArchive, animeResult] = await Promise.all([
    GraphicArchive.create(
      parser,
      files["Assets/bin/GraphicInfo_66.bin"],
      files["Assets/bin/Graphic_66.bin"],
      palette,
    ),
    GraphicArchive.create(
      parser,
      files["Assets/bin/GraphicInfoV3_19.bin"],
      files["Assets/bin/GraphicV3_19.bin"],
      palette,
    ),
    loadAnime(
      parser,
      files["Assets/bin/AnimeInfo_4.bin"],
      files["Assets/bin/Anime_4.bin"],
      100052,
      2425,
    ),
  ]);

  const cursorRecord = interfaceArchive.graphic(1899);
  const markerRecord = interfaceArchive.graphic(1900);
  if (!cursorRecord || !markerRecord)
    throw new Error("GraphicInfoV3_19.bin 缺少圖像 ID 1899 或 1900。");
  onProgress("解碼游標與定位點…");
  const [cursor, marker] = await Promise.all([
    interfaceArchive.decode(cursorRecord),
    interfaceArchive.decode(markerRecord),
  ]);

  const wantedActions = animeResult.anime.actions.filter((entry) => {
    const header = animeHeader(entry);
    return (
      header.direct >= 0 &&
      header.direct <= 7 &&
      (header.action === 0 || header.action === 1)
    );
  });
  if (wantedActions.length !== 16)
    throw new Error("動畫 ID 100052 缺少方向 0–7 的動作 0 或動作 1。");

  const frameIds = new Set(
    wantedActions.flatMap((entry) =>
      entry.frames.map((frame) => frame.graphic_id),
    ),
  );
  const characterGraphics = new Map<number, DecodedGraphic>();
  let decodedFrames = 0;
  for (const id of frameIds) {
    const record = base.graphic(id);
    if (!record) throw new Error(`GraphicInfo_66.bin 缺少角色影格 ${id}。`);
    characterGraphics.set(id, await base.decode(record));
    decodedFrames++;
    if (decodedFrames % 12 === 0)
      onProgress(`解碼角色動畫… ${decodedFrames}/${frameIds.size}`);
  }

  const clips = new Map<string, AnimationClip>();
  for (const entry of wantedActions) {
    const header = animeHeader(entry);
    const action = header.action as 0 | 1;
    clips.set(clipKey(header.direct, action), {
      direction: header.direct,
      action,
      duration: Math.max(1, header.duration),
      frames: entry.frames.map((frame) => ({
        graphic: characterGraphics.get(frame.graphic_id)!,
        offsetX: frame.off_x,
        offsetY: frame.off_y,
      })),
    });
  }

  onProgress("解析 1011.dat 並解碼地圖…");
  const map = parser.map_build_from_bytes(
    new Uint8Array(await files["Assets/map/0/1011.dat"].arrayBuffer()),
  );
  const ids = new Set([...map.ground, ...map.object]);
  ids.delete(0);
  const mapGraphics = new Map<number, DecodedGraphic>();
  const mapRecords = new Map<number, GraphicRecord>();
  const missingMapIds: number[] = [];
  let decodedTiles = 0;
  for (const mapId of ids) {
    const record = base.mapGraphic(mapId);
    if (!record) {
      missingMapIds.push(mapId);
      continue;
    }
    mapRecords.set(mapId, record);
    mapGraphics.set(mapId, await base.decode(record));
    decodedTiles++;
    if (decodedTiles % 10 === 0)
      onProgress(`解碼地圖圖塊… ${decodedTiles}/${ids.size}`);
  }
  // 1011.dat uses object map ID 2 as an invisible one-cell blocker. It is
  // absent from GraphicInfo_66, while all audited cross-source candidates
  // agree on access=0, grid_w=1, grid_h=1, and AsGround=false.
  const collisionRecords = collisionRecordsForMap(mapRecords, map.object);

  return {
    map,
    mapGraphics,
    mapRecords,
    collisionRecords,
    cursor,
    marker,
    clips,
    animeRow: animeResult.selected.row,
    animeDuplicateCount: animeResult.duplicateCount,
    missingMapIds: missingMapIds.sort((a, b) => a - b),
  };
}
