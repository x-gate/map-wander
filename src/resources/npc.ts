export interface NpcPosition {
  x: number;
  y: number;
}

export interface NpcDefinition {
  sourceLine: number;
  mapId: number;
  positions: [NpcPosition, NpcPosition, NpcPosition, NpcPosition];
  direction: number;
  graphicMapId: number;
}

function strictInteger(value: string | undefined, field: string, line: number) {
  const text = value?.trim() ?? "";
  if (!/^-?\d+$/.test(text))
    throw new Error(`npc.txt 第 ${line} 行的${field}不是整數。`);
  return Number(text);
}

export function parseNpcTsv(text: string, wantedMapId: number) {
  const result: NpcDefinition[] = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const fields = line.split("\t");
    if (fields.length < 21 || fields[8]?.trim() !== String(wantedMapId))
      continue;
    const sourceLine = index + 1;
    const positions = [9, 11, 13, 15].map((offset) => ({
      x: strictInteger(fields[offset], `第 ${offset + 1} 個值`, sourceLine),
      y: strictInteger(fields[offset + 1], `第 ${offset + 2} 個值`, sourceLine),
    })) as NpcDefinition["positions"];
    result.push({
      sourceLine,
      mapId: strictInteger(fields[8], "地圖編號", sourceLine),
      positions,
      direction: strictInteger(fields[19], "朝向", sourceLine),
      graphicMapId: strictInteger(fields[20], "圖像 MapID", sourceLine),
    });
  }
  return result;
}
