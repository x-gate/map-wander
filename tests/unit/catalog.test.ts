import { expect, test } from "bun:test";
import {
  defaultMap,
  fromDirectory,
  fromFileList,
  REQUIRED_PATHS,
  staticMap,
} from "../../src/resources/catalog";

function file(path: string) {
  const value = new File([path], path.split("/").at(-1)!);
  Object.defineProperty(value, "webkitRelativePath", {
    value: `CrossGate/${path}`,
  });
  return value;
}

test("相容模式驗證共用資源與至少一張地圖，不再依賴 1011", () => {
  const files = [...REQUIRED_PATHS.map(file), file("Assets/map/0/2000.dat")];
  const result = fromFileList(files);
  expect(Object.keys(result.files)).toEqual([...REQUIRED_PATHS]);
  expect(defaultMap(result.maps).id).toBe(2000);
  expect(() => fromFileList(files.slice(1))).toThrow("缺少必要檔案");
  expect(() => fromFileList(REQUIRED_PATHS.map(file))).toThrow("找不到地圖");
});

test("列出多層地圖並保留同名檔案來源，預設優先選擇 1530", async () => {
  const result = fromFileList([
    ...REQUIRED_PATHS.map(file),
    file("Assets/map/1/5/1011.dat"),
    file("Assets/map/0/1011.dat"),
    file("Assets/map/0/1530.dat"),
    file("Assets/map/0/20.dat"),
    file("Assets/map/0/3.dat"),
    file("Assets/map/0/ignore.txt"),
    file("Elsewhere/1.dat"),
  ]);
  expect(result.maps.map(({ path }) => path)).toEqual([
    "Assets/map/0/3.dat",
    "Assets/map/0/20.dat",
    "Assets/map/0/1011.dat",
    "Assets/map/0/1530.dat",
    "Assets/map/1/5/1011.dat",
  ]);
  expect(defaultMap(result.maps).path).toBe("Assets/map/0/1530.dat");
  expect(result.maps[4].npcMapId).toBeNull();
  expect(staticMap(result.maps, 1011)?.path).toBe("Assets/map/0/1011.dat");
  expect(staticMap([result.maps[4]], 1011)).toBeUndefined();
  expect((await result.maps[0].getFile()).name).toBe("3.dat");
});

test("目錄模式與相容模式一致，掃描時不讀取地圖內容", async () => {
  let mapReads = 0;
  const paths = [
    ...REQUIRED_PATHS,
    "Assets/map/0/1011.dat",
    "Assets/map/1/5/1011.dat",
  ];
  const makeDirectory = (prefix: string): FileSystemDirectoryHandle =>
    ({
      kind: "directory",
      name: prefix.split("/").at(-1),
      async getDirectoryHandle(name: string) {
        return makeDirectory(prefix ? `${prefix}/${name}` : name);
      },
      async getFileHandle(name: string) {
        return makeFile(prefix ? `${prefix}/${name}` : name);
      },
      async *values() {
        const names = new Set(
          paths
            .filter((p) => p.startsWith(`${prefix}/`))
            .map((p) => p.slice(prefix.length + 1).split("/")[0]),
        );
        for (const name of names) {
          const path = `${prefix}/${name}`;
          yield paths.includes(path) ? makeFile(path) : makeDirectory(path);
        }
      },
    }) as unknown as FileSystemDirectoryHandle;
  const makeFile = (path: string) => ({
    kind: "file",
    name: path.split("/").at(-1),
    async getFile() {
      if (path.startsWith("Assets/map/")) mapReads++;
      return file(path);
    },
  });
  const result = await fromDirectory(makeDirectory(""));
  expect(mapReads).toBe(0);
  expect(result.maps.map(({ path }) => path)).toEqual(
    fromFileList(paths.map(file)).maps.map(({ path }) => path),
  );
  await result.maps[1].getFile();
  expect(mapReads).toBe(1);
});
