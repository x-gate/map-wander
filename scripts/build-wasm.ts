import { copyFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const source = resolve(root, process.env.XGLIB_DIR ?? "../xglib");
const output = resolve(root, ".generated/xglib");
const cli = process.env.WASM_BINDGEN ?? "wasm-bindgen";
const lock = await readFile(resolve(source, "Cargo.lock"), "utf8");
const version = lock.match(/name = "wasm-bindgen"\nversion = "([^"]+)"/)?.[1];

async function run(command: string[]) {
  const result = Bun.spawn(command, {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (await result.exited) throw new Error(`指令失敗：${command.join(" ")}`);
}

try {
  const check = Bun.spawn([cli, "--version"], { stdout: "pipe" });
  if (
    !version ||
    (await new Response(check.stdout).text()).trim() !==
      `wasm-bindgen ${version}`
  )
    throw new Error("wasm-bindgen 版本不符");

  await mkdir(output, { recursive: true });
  await run([
    "cargo",
    "build",
    "--locked",
    "--release",
    "--target",
    "wasm32-unknown-unknown",
    "--manifest-path",
    resolve(source, "Cargo.toml"),
    "--target-dir",
    resolve(root, ".generated/target"),
  ]);
  await run([
    cli,
    resolve(
      root,
      ".generated/target/wasm32-unknown-unknown/release/xglib.wasm",
    ),
    "--target",
    "web",
    "--out-dir",
    output,
  ]);
  await copyFile(
    resolve(source, "xglib.d.ts"),
    resolve(output, "contract.d.ts"),
  );
  console.log("xglib WASM bindings 已產生。");
} catch (error) {
  console.error(error);
  console.error(
    `請安裝 Rust wasm32-unknown-unknown target 與 wasm-bindgen-cli ${version ?? "相符版本"}；可用 XGLIB_DIR / WASM_BINDGEN 指定路徑。`,
  );
  process.exitCode = 1;
}
