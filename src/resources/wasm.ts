import init, * as bindings from "../../.generated/xglib/xglib.js";
import type * as Contract from "../../.generated/xglib/contract";

export const parser = bindings as unknown as typeof Contract;

export async function initializeParser() {
  await init();
}
