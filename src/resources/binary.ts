import type * as Contract from "../../.generated/xglib/contract";

export const GRAPHIC_INFO_SIZE = 40;
export const ANIME_INFO_SIZE = 12;

export interface GraphicCollision {
  gridWidth: number;
  gridHeight: number;
  access: number;
  asGround: boolean;
}

export interface GraphicRecord extends GraphicCollision {
  row: number;
  id: number;
  addr: number;
  len: number;
  offX: number;
  offY: number;
  width: number;
  height: number;
  mapId: number;
}

export interface DecodedGraphic extends GraphicRecord {
  rgba: Uint8Array;
}

export interface AnimeRecord {
  row: number;
  id: number;
  addr: number;
  actionCount: number;
}

export function readGraphicRecord(
  bytes: Uint8Array,
  row: number,
): GraphicRecord {
  if (bytes.byteLength !== GRAPHIC_INFO_SIZE)
    throw new Error("圖像索引列必須恰好為 40 bytes。");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    row,
    id: view.getInt32(0, true),
    addr: view.getUint32(4, true),
    len: view.getInt32(8, true),
    offX: view.getInt32(12, true),
    offY: view.getInt32(16, true),
    width: view.getInt32(20, true),
    height: view.getInt32(24, true),
    gridWidth: view.getUint8(28),
    gridHeight: view.getUint8(29),
    access: view.getUint8(30),
    asGround: view.getUint8(31) === 1,
    mapId: view.getInt32(36, true),
  };
}

export function readAnimeRecord(bytes: Uint8Array, row: number): AnimeRecord {
  if (bytes.byteLength !== ANIME_INFO_SIZE)
    throw new Error("動畫索引列必須恰好為 12 bytes。");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    row,
    id: view.getInt32(0, true),
    addr: view.getInt32(4, true),
    actionCount: view.getInt16(8, true),
  };
}

export function validGraphicRecord(record: GraphicRecord, dataSize: number) {
  return (
    record.addr >= 0 &&
    record.len >= 16 &&
    record.addr + record.len <= dataSize &&
    record.width > 0 &&
    record.height > 0 &&
    record.width <= 4096 &&
    record.height <= 4096 &&
    record.width * record.height <= 4_194_304
  );
}

export class GraphicArchive {
  private byId = new Map<number, GraphicRecord[]>();
  private byMapId = new Map<number, GraphicRecord[]>();

  private constructor(
    private parser: typeof Contract,
    private index: Uint8Array,
    private data: File,
    private palette: Uint8Array,
  ) {
    for (
      let offset = 0;
      offset < index.byteLength;
      offset += GRAPHIC_INFO_SIZE
    ) {
      const record = readGraphicRecord(
        index.subarray(offset, offset + GRAPHIC_INFO_SIZE),
        offset / GRAPHIC_INFO_SIZE,
      );
      const ids = this.byId.get(record.id) ?? [];
      ids.push(record);
      this.byId.set(record.id, ids);
      if (record.mapId > 0) {
        const mapIds = this.byMapId.get(record.mapId) ?? [];
        mapIds.push(record);
        this.byMapId.set(record.mapId, mapIds);
      }
    }
  }

  static async create(
    parser: typeof Contract,
    info: File,
    data: File,
    palette: Uint8Array,
  ) {
    if (!info.size || info.size % GRAPHIC_INFO_SIZE)
      throw new Error("GraphicInfo 長度必須為 40 bytes 的倍數。");
    const index = new Uint8Array(await info.arrayBuffer());
    return new GraphicArchive(parser, index, data, palette);
  }

  graphic(id: number) {
    return this.byId.get(id)?.[0];
  }

  mapGraphic(mapId: number) {
    return this.byMapId.get(mapId)?.slice(-1)[0];
  }

  graphicCount(id: number) {
    return this.byId.get(id)?.length ?? 0;
  }

  async decode(record: GraphicRecord): Promise<DecodedGraphic> {
    if (!validGraphicRecord(record, this.data.size))
      throw new Error(`圖像 ${record.id} 的索引範圍或尺寸無效。`);
    const bytes = new Uint8Array(
      await this.data
        .slice(record.addr, record.addr + record.len)
        .arrayBuffer(),
    );
    if (bytes.byteLength !== record.len)
      throw new Error(`圖像 ${record.id} 的資料長度不足。`);
    const info = this.index.subarray(
      record.row * GRAPHIC_INFO_SIZE,
      (record.row + 1) * GRAPHIC_INFO_SIZE,
    );
    const graphic = this.parser.graphic_strict_build_from_cgp(
      info,
      bytes,
      this.palette,
    );
    const rgba = new Uint8Array(record.width * record.height * 4);
    for (let source = 0; source < graphic.payload.length; source++) {
      const color = graphic.palette.colors[graphic.payload[source]];
      if (!color) throw new Error(`圖像 ${record.id} 的色彩索引超出調色盤。`);
      const x = source % record.width;
      const y = record.height - 1 - Math.floor(source / record.width);
      rgba.set(
        [color.red, color.green, color.blue, color.alpha],
        (y * record.width + x) * 4,
      );
    }
    return { ...record, rgba };
  }
}

export function animeHeader(action: Contract.AnimeAction) {
  return "Standard" in action.header
    ? action.header.Standard
    : action.header.Extended;
}

export async function loadAnime(
  parser: typeof Contract,
  infoFile: File,
  dataFile: File,
  id: number,
  row?: number,
) {
  if (!infoFile.size || infoFile.size % ANIME_INFO_SIZE)
    throw new Error("AnimeInfo 長度必須為 12 bytes 的倍數。");
  const index = new Uint8Array(await infoFile.arrayBuffer());
  const records: AnimeRecord[] = [];
  for (let offset = 0; offset < index.byteLength; offset += ANIME_INFO_SIZE)
    records.push(
      readAnimeRecord(
        index.subarray(offset, offset + ANIME_INFO_SIZE),
        offset / ANIME_INFO_SIZE,
      ),
    );
  const matches = records.filter((record) => record.id === id);
  const selected = row === undefined ? matches[0] : records[row];
  if (!selected || selected.id !== id)
    throw new Error(
      row === undefined
        ? `找不到動畫 ID ${id}。`
        : `動畫索引列 ${row} 不是 AnimeID ${id}。`,
    );
  const end = records[selected.row + 1]?.addr ?? dataFile.size;
  if (selected.addr < 0 || end <= selected.addr || end > dataFile.size)
    throw new Error(`動畫 ID ${id} 的索引範圍無效。`);
  const data = new Uint8Array(
    await dataFile.slice(selected.addr, end).arrayBuffer(),
  );
  const info = index.subarray(
    selected.row * ANIME_INFO_SIZE,
    (selected.row + 1) * ANIME_INFO_SIZE,
  );
  return {
    anime: parser.anime_build_from_bytes_with_header_size(info, data, 12),
    selected,
    duplicateCount: matches.length,
  };
}
