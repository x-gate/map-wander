export const REQUIRED_PATHS = [
  "Assets/bin/GraphicInfoV3_19.bin",
  "Assets/bin/GraphicV3_19.bin",
  "Assets/bin/GraphicInfo_66.bin",
  "Assets/bin/Graphic_66.bin",
  "Assets/bin/AnimeInfo_4.bin",
  "Assets/bin/Anime_4.bin",
  "Assets/bin/pal/palet_00.cgp",
  "Assets/map/0/1011.dat",
] as const;

export type RequiredPath = (typeof REQUIRED_PATHS)[number];
export type GameFiles = Record<RequiredPath, File>;

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
): Promise<GameFiles> {
  const entries = await Promise.all(
    REQUIRED_PATHS.map(
      async (path) => [path, await fileAt(root, path)] as const,
    ),
  );
  return Object.fromEntries(entries) as GameFiles;
}

export function fromFileList(files: FileList | File[]): GameFiles {
  const entries = Array.from(files).map((file) => {
    const parts = file.webkitRelativePath.split("/");
    return [parts.slice(1).join("/").toLowerCase(), file] as const;
  });
  const byPath = new Map(entries);
  const missing = REQUIRED_PATHS.filter(
    (path) => !byPath.has(path.toLowerCase()),
  );
  if (missing.length) throw new Error(`缺少必要檔案：${missing.join("、")}`);
  return Object.fromEntries(
    REQUIRED_PATHS.map((path) => [path, byPath.get(path.toLowerCase())!]),
  ) as GameFiles;
}
