export const REQUIRED_PATHS = [
  "Assets/bin/GraphicInfoV3_19.bin",
  "Assets/bin/GraphicV3_19.bin",
  "Assets/bin/GraphicInfo_66.bin",
  "Assets/bin/Graphic_66.bin",
  "Assets/bin/AnimeInfo_4.bin",
  "Assets/bin/Anime_4.bin",
  "Assets/bin/pal/palet_00.cgp",
] as const;

export type RequiredPath = (typeof REQUIRED_PATHS)[number];
export type GameFiles = Record<RequiredPath, File>;

export interface MapFile {
  path: string;
  id: number | null;
  npcMapId: number | null;
  getFile: () => Promise<File>;
}

export interface GameCatalog {
  files: GameFiles;
  maps: MapFile[];
}

interface DirectoryHandle extends FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<
    FileSystemDirectoryHandle | FileSystemFileHandle
  >;
}

export function mapFile(path: string, getFile: MapFile["getFile"]): MapFile {
  const match = /^Assets\/map\/(?:[^/]+\/)*([^/]+)\.dat$/i.exec(path);
  if (!match) throw new Error(`無效地圖路徑：${path}`);
  const id = /^\d+$/.test(match[1]) ? Number(match[1]) : null;
  return {
    path,
    id,
    // Only the static map directory has a verified NPC floor-ID mapping.
    npcMapId: /^Assets\/map\/0\/\d+\.dat$/i.test(path) ? id : null,
    getFile,
  };
}

function sortedMaps(maps: MapFile[]) {
  if (!maps.length) throw new Error("找不到地圖：Assets/map/**/*.dat");
  return maps.sort((a, b) =>
    a.path.localeCompare(b.path, "en", { numeric: true }),
  );
}

export function defaultMap(maps: readonly MapFile[]) {
  return (
    maps.find(({ path }) => path.toLowerCase() === "assets/map/0/1011.dat") ??
    maps[0]
  );
}

interface DirectoryPickerWindow {
  showDirectoryPicker?: (options: {
    id: string;
    mode: "read";
  }) => Promise<FileSystemDirectoryHandle>;
}

const pickerWindow = globalThis as unknown as DirectoryPickerWindow;
export const directoryPicker =
  pickerWindow.showDirectoryPicker?.bind(globalThis);

async function fileAt(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<File> {
  const parts = path.split("/");
  const name = parts.pop();
  if (!name) throw new Error(`無效資源路徑：${path}`);
  let directory = root;
  for (const part of parts)
    directory = await directory.getDirectoryHandle(part, { create: false });
  return (await directory.getFileHandle(name, { create: false })).getFile();
}

export async function fromDirectory(
  root: FileSystemDirectoryHandle,
): Promise<GameCatalog> {
  const entries = await Promise.all(
    REQUIRED_PATHS.map(
      async (path) => [path, await fileAt(root, path)] as const,
    ),
  );
  const assets = await root.getDirectoryHandle("Assets", { create: false });
  const mapRoot = await assets.getDirectoryHandle("map", { create: false });
  const maps: MapFile[] = [];
  async function scan(directory: FileSystemDirectoryHandle, path: string) {
    for await (const entry of (directory as DirectoryHandle).values()) {
      const childPath = `${path}/${entry.name}`;
      if (entry.kind === "directory") await scan(entry, childPath);
      else if (/\.dat$/i.test(entry.name))
        maps.push(mapFile(childPath, () => entry.getFile()));
    }
  }
  await scan(mapRoot, "Assets/map");
  return {
    files: Object.fromEntries(entries) as GameFiles,
    maps: sortedMaps(maps),
  };
}

export function fromFileList(files: FileList | File[]): GameCatalog {
  const entries = Array.from(files).map((file) => {
    const parts = file.webkitRelativePath.split("/");
    return [parts.slice(1).join("/"), file] as const;
  });
  const byPath = new Map(
    entries.map(([path, file]) => [path.toLowerCase(), file]),
  );
  const missing = REQUIRED_PATHS.filter(
    (path) => !byPath.has(path.toLowerCase()),
  );
  if (missing.length) throw new Error(`缺少必要檔案：${missing.join("、")}`);
  const maps = entries
    .filter(([path]) => /^Assets\/map\/(?:[^/]+\/)*[^/]+\.dat$/i.test(path))
    .map(([path, file]) => mapFile(path, async () => file));
  return {
    files: Object.fromEntries(
      REQUIRED_PATHS.map((path) => [path, byPath.get(path.toLowerCase())!]),
    ) as GameFiles,
    maps: sortedMaps(maps),
  };
}
