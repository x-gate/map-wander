import { WanderGame } from "./game/game";
import {
  directoryPicker,
  fromDirectory,
  fromFileList,
  REQUIRED_PATHS,
} from "./resources/catalog";
import type { GameFiles } from "./resources/catalog";
import { loadGame } from "./resources/game-resources";
import { initializeParser, parser } from "./resources/wasm";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <header class="app-header">
    <div class="brand"><span class="brand-mark">XG</span><span><strong>地圖漫遊</strong><small>PixiJS 操作試驗</small></span></div>
    <div class="header-actions"><span class="local-badge"><i></i> 僅在本機讀取</span><button id="change-folder" class="button secondary" type="button">重新選擇資料夾</button></div>
  </header>
  <main>
    <section id="welcome" class="welcome">
      <div class="welcome-card">
        <p class="eyebrow">MAP 1011 · CHARACTER 100052</p>
        <h1>把角色放進原版地圖，試著走走看。</h1>
        <p class="lead">選擇包含 <code>Assets</code> 的遊戲根目錄。指定檔案只會由你的瀏覽器在本機讀取，不會上傳、修改或保存。</p>
        <button id="choose-folder" class="button primary" type="button">選擇遊戲資料夾</button>
        <button id="compat-folder" class="text-button" type="button">改用相容模式選取</button>
        <input id="folder-input" type="file" multiple hidden />
        <details>
          <summary>本次需要的檔案</summary>
          <ul>${REQUIRED_PATHS.map((path) => `<li><code>${path}</code></li>`).join("")}</ul>
        </details>
        <p id="welcome-status" class="status" role="status">尚未選擇資料夾</p>
      </div>
    </section>
    <section id="game-shell" class="game-shell" hidden>
      <div id="game-canvas" class="game-canvas"></div>
      <aside class="hud" aria-live="polite">
        <div><span>角色</span><strong id="player-coordinate">—</strong></div>
        <div><span>游標格位</span><strong id="hover-coordinate">—</strong></div>
        <p id="movement-status">左鍵移動，右鍵改變朝向</p>
      </aside>
      <div class="controls-hint"><span>左鍵</span> 移動 <span>右鍵</span> 轉向 <span>左鍵拖曳</span> 平移 <span>滾輪</span> 縮放</div>
      <div id="resource-note" class="resource-note"></div>
    </section>
  </main>
`;

const welcome = document.querySelector<HTMLElement>("#welcome")!;
const gameShell = document.querySelector<HTMLElement>("#game-shell")!;
const canvasHost = document.querySelector<HTMLElement>("#game-canvas")!;
const welcomeStatus = document.querySelector<HTMLElement>("#welcome-status")!;
const chooseButton =
  document.querySelector<HTMLButtonElement>("#choose-folder")!;
const compatButton =
  document.querySelector<HTMLButtonElement>("#compat-folder")!;
const changeButton =
  document.querySelector<HTMLButtonElement>("#change-folder")!;
const folderInput = document.querySelector<HTMLInputElement>("#folder-input")!;
const playerCoordinate =
  document.querySelector<HTMLElement>("#player-coordinate")!;
const hoverCoordinate =
  document.querySelector<HTMLElement>("#hover-coordinate")!;
const movementStatus = document.querySelector<HTMLElement>("#movement-status")!;
const resourceNote = document.querySelector<HTMLElement>("#resource-note")!;

folderInput.setAttribute("webkitdirectory", "");
let game: WanderGame | undefined;
let loading = false;

function setLoading(value: boolean) {
  loading = value;
  chooseButton.disabled = value;
  compatButton.toggleAttribute("disabled", value);
  changeButton.disabled = value;
}

async function start(files: GameFiles) {
  if (loading) return;
  setLoading(true);
  game?.destroy();
  game = undefined;
  welcome.hidden = false;
  gameShell.hidden = true;
  welcomeStatus.classList.remove("error");
  try {
    welcomeStatus.textContent = "啟動 xglib 解析器…";
    await initializeParser();
    const resources = await loadGame(parser, files, (message) => {
      welcomeStatus.textContent = message;
    });
    welcomeStatus.textContent = "建立 PixiJS 場景…";
    welcome.hidden = true;
    gameShell.hidden = false;
    game = new WanderGame(canvasHost, resources);
    game.onStatus = (status) => {
      playerCoordinate.textContent = `(${status.player.x}, ${status.player.y})`;
      hoverCoordinate.textContent = status.hover
        ? `(${status.hover.x}, ${status.hover.y})`
        : "—";
      movementStatus.textContent = status.message;
    };
    await game.initialize();
    resourceNote.textContent =
      `動畫 100052 使用索引列 ${resources.animeRow}` +
      (resources.animeDuplicateCount > 1
        ? `（共 ${resources.animeDuplicateCount} 筆同號資料，明確指定此列）`
        : "") +
      (resources.missingMapIds.length
        ? `；Graphic_66 無對應地圖圖像 ID：${resources.missingMapIds.join("、")}，該物件層保持透明。`
        : "");
  } catch (error) {
    game?.destroy();
    game = undefined;
    welcome.hidden = false;
    gameShell.hidden = true;
    welcomeStatus.textContent = `載入失敗：${error instanceof Error ? error.message : String(error)}`;
    welcomeStatus.classList.add("error");
  } finally {
    setLoading(false);
  }
}

async function chooseDirectory() {
  if (!directoryPicker) {
    folderInput.click();
    return;
  }
  try {
    const handle = await directoryPicker({
      id: "x-gate-map-wander",
      mode: "read",
    });
    await start(await fromDirectory(handle));
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    welcomeStatus.textContent = `無法讀取資料夾：${error instanceof Error ? error.message : String(error)}`;
    welcomeStatus.classList.add("error");
  }
}

chooseButton.addEventListener("click", () => void chooseDirectory());
changeButton.addEventListener("click", () => {
  game?.destroy();
  game = undefined;
  canvasHost.replaceChildren();
  welcome.hidden = false;
  gameShell.hidden = true;
  welcomeStatus.textContent = "請選擇另一個遊戲根目錄";
  welcomeStatus.classList.remove("error");
});
compatButton.addEventListener("click", () => folderInput.click());
folderInput.addEventListener("change", () => {
  if (!folderInput.files?.length) return;
  try {
    void start(fromFileList(folderInput.files));
  } catch (error) {
    welcomeStatus.textContent = `無法讀取資料夾：${error instanceof Error ? error.message : String(error)}`;
    welcomeStatus.classList.add("error");
  } finally {
    folderInput.value = "";
  }
});
