export interface WarpEndpoint {
  mapId: number;
  x: number;
  y: number;
}

export interface WarpDefinition {
  id: number;
  sourceLine: number;
  from: WarpEndpoint;
  to: WarpEndpoint;
}

export interface WarpData {
  warps: WarpDefinition[];
  issues: string[];
}

export function parseWarpTsv(text: string): WarpData {
  const warps: WarpDefinition[] = [];
  const issues: string[] = [];
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const fields = line.split("\t").map((field) => field.trim());
    const values = fields.map(Number);
    if (
      fields.length !== 7 ||
      fields.some((field) => !/^\d+$/.test(field)) ||
      values.some((value) => !Number.isSafeInteger(value))
    ) {
      issues.push(`warp.txt 第 ${index + 1} 行的欄位無效，已略過。`);
      continue;
    }
    const [id, fromMap, fromX, fromY, toMap, toX, toY] = values;
    warps.push({
      id,
      sourceLine: index + 1,
      from: { mapId: fromMap, x: fromX, y: fromY },
      to: { mapId: toMap, x: toX, y: toY },
    });
  }
  return { warps, issues };
}
