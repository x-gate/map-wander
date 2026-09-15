import { expect, test } from "bun:test";
import { fromFileList, REQUIRED_PATHS } from "../../src/resources/catalog";

function file(path: string) {
  const value = new File([path], path.split("/").at(-1)!);
  Object.defineProperty(value, "webkitRelativePath", {
    value: `CrossGate/${path}`,
  });
  return value;
}

test("相容模式只接受完整且固定的本機資源集合", () => {
  const files = REQUIRED_PATHS.map(file);
  const result = fromFileList(files);
  expect(Object.keys(result)).toEqual([...REQUIRED_PATHS]);
  expect(() => fromFileList(files.slice(1))).toThrow("缺少必要檔案");
});
