import { WanderGame } from "./game/game";
import npcCatalog from "virtual:map-npcs";
import {
  directoryPicker,
  defaultMap,
  fromDirectory,
  fromFileList,
  REQUIRED_PATHS,
} from "./resources/catalog";
import type { GameCatalog, MapFile } from "./resources/catalog";
import { loadGame } from "./resources/game-resources";
import { initializeParser, parser } from "./resources/wasm";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <header class="app-header">
    <div class="brand"><span class="brand-mark">XG</span><span><strong>地圖漫遊</strong><small>PixiJS 操作試驗</small></span></div>
    <div class="header-actions"><span class="local-badge"><i></i> 僅在本機讀取</span><button id="change-folder" class="button secondary" type="button">重新選擇資料夾</button></div>
  </header>
  <form id="map-toolbar" class="map-toolbar" hidden>
    <label for="map-select">地圖</label>
    <input id="map-search" type="search" placeholder="搜尋編號或路徑" aria-label="搜尋地圖" />
    <select id="map-select" aria-label="選擇地圖"></select>
    <button id="load-map" class="button secondary" type="submit">前往</button>
    <span id="map-count"></span>
    <span id="map-status" role="status"></span>
  </form>
  <main>
    <section id="welcome" class="welcome">
      <div class="welcome-card">
        <p class="eyebrow">MAP WANDER · CHARACTER 100052</p>
        <h1>把角色放進原版地圖，試著走走看。</h1>
        <p class="lead">選擇包含 <code>Assets</code> 的遊戲根目錄。指定檔案只會由你的瀏覽器在本機讀取，不會上傳、修改或保存。</p>
        <button id="choose-folder" class="button primary" type="button">選擇遊戲資料夾</button>
        <button id="compat-folder" class="text-button" type="button">改用相容模式選取</button>
        <input id="folder-input" type="file" multiple hidden />
        <details>
          <summary>本次需要的檔案</summary>
          <ul>${REQUIRED_PATHS.map((path) => `<li><code>${path}</code></li>`).join("")}<li><code>Assets/map/**/*.dat</code>（至少一張地圖）</li></ul>
        </details>
        <p id="welcome-status" class="status" role="status">尚未選擇資料夾</p>
      </div>
    </section>
    <section id="game-shell" class="game-shell" hidden>
      <div id="game-canvas" class="game-canvas"></div>
      <aside class="hud" aria-live="polite">
        <div><span>目前地圖</span><strong id="current-map">—</strong></div>
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
const mapToolbar = document.querySelector<HTMLFormElement>("#map-toolbar")!;
const mapSearch = document.querySelector<HTMLInputElement>("#map-search")!;
const mapSelect = document.querySelector<HTMLSelectElement>("#map-select")!;
const loadMapButton = document.querySelector<HTMLButtonElement>("#load-map")!;
const mapCount = document.querySelector<HTMLElement>("#map-count")!;
const mapStatus = document.querySelector<HTMLElement>("#map-status")!;
const currentMap = document.querySelector<HTMLElement>("#current-map")!;

folderInput.setAttribute("webkitdirectory", "");
let game: WanderGame | undefined;
let gameHost: HTMLElement | undefined;
let catalog: GameCatalog | undefined;
let loading = false;

function setLoading(value: boolean) {
  loading = value;
  chooseButton.disabled = value;
  compatButton.toggleAttribute("disabled", value);
  changeButton.disabled = value;
  mapSelect.disabled = value || !mapSelect.options.length;
  mapSearch.disabled = value;
  loadMapButton.disabled = value || !mapSelect.options.length;
}

function filterMaps() {
  const previous = mapSelect.value;
  const query = mapSearch.value.trim().toLowerCase();
  const maps =
    catalog?.maps.filter(({ path }) => path.toLowerCase().includes(query)) ??
    [];
  mapSelect.replaceChildren(
    ...maps.map(
      ({ path }) => new Option(path.replace(/^Assets\/map\//i, ""), path),
    ),
  );
  if (maps.some(({ path }) => path === previous)) mapSelect.value = previous;
  mapCount.textContent = `${maps.length} / ${catalog?.maps.length ?? 0} 張`;
  if (!maps.length) mapSelect.add(new Option("沒有符合的地圖", ""));
  mapSelect.disabled = loading || !maps.length;
  loadMapButton.disabled = loading || !maps.length;
}

async function openCatalog(next: GameCatalog) {
  catalog = next;
  mapToolbar.hidden = false;
  app.classList.add("has-map-toolbar");
  mapSearch.value = "";
  filterMaps();
  const selected = defaultMap(next.maps);
  mapSelect.value = selected.path;
  await start(selected);
}

async function start(selectedMap: MapFile) {
  if (loading || !catalog) return;
  setLoading(true);
  welcomeStatus.classList.remove("error");
  mapStatus.classList.remove("error");
  let nextGame: WanderGame | undefined;
  let nextHost: HTMLElement | undefined;
  const progress = (message: string) => {
    welcomeStatus.textContent = message;
    mapStatus.textContent = message;
  };
  try {
    progress("啟動 xglib 解析器…");
    await initializeParser();
    const resources = await loadGame(
      parser,
      catalog.files,
      selectedMap,
      progress,
      selectedMap.npcMapId === null
        ? undefined
        : npcCatalog[selectedMap.npcMapId],
    );
    progress("建立 PixiJS 場景…");
    welcome.hidden = true;
    gameShell.hidden = false;
    nextHost = document.createElement("div");
    nextHost.className = "map-view";
    nextHost.style.visibility = "hidden";
    canvasHost.append(nextHost);
    nextGame = new WanderGame(nextHost, resources);
    await nextGame.initialize();
    // Publish only a fully initialized scene. Failed loads leave the old scene usable.
    game?.destroy();
    gameHost?.remove();
    game = nextGame;
    gameHost = nextHost;
    nextHost.style.visibility = "visible";
    nextGame = undefined;
    nextHost = undefined;
    game.onStatus = (status) => {
      playerCoordinate.textContent = `(${status.player.x}, ${status.player.y})`;
      hoverCoordinate.textContent = status.hover
        ? `(${status.hover.x}, ${status.hover.y})`
        : "—";
      movementStatus.textContent = status.message;
    };
    game.publishStatus();
    currentMap.textContent = selectedMap.path.replace(/^Assets\/map\//i, "");
    mapStatus.textContent = "";
    resourceNote.textContent =
      `動畫 100052 使用索引列 ${resources.animeRow}` +
      (resources.animeDuplicateCount > 1
        ? `（共 ${resources.animeDuplicateCount} 筆同號資料，明確指定此列）`
        : "") +
      (resources.missingMapIds.length
        ? `；Graphic_66 無對應地圖圖像 ID：${resources.missingMapIds.join("、")}，該物件層保持透明。`
        : "") +
      `；NPC：${resources.npcs.length} 筆` +
      (resources.missingNpcGraphicMapIds.length
        ? `（Graphic_66 無對應 MapID：${resources.missingNpcGraphicMapIds.join("、")}）`
        : "") +
      (resources.npcIssues.length
        ? `；NPC 資料略過 ${resources.npcIssues.length} 筆`
        : "") +
      (selectedMap.npcMapId === null ? "；此目錄尚未定義 NPC 地圖對應" : "");
    resourceNote.title = resources.npcIssues.join("\n");
  } catch (error) {
    nextGame?.destroy();
    nextHost?.remove();
    welcome.hidden = !!game;
    gameShell.hidden = !game;
    const message = `載入失敗：${error instanceof Error ? error.message : String(error)}`;
    welcomeStatus.textContent = message;
    welcomeStatus.classList.add("error");
    mapStatus.textContent = message;
    mapStatus.classList.add("error");
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
    setLoading(true);
    welcomeStatus.textContent = "掃描可用地圖…";
    const next = await fromDirectory(handle);
    setLoading(false);
    await openCatalog(next);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    welcomeStatus.textContent = `無法讀取資料夾：${error instanceof Error ? error.message : String(error)}`;
    welcomeStatus.classList.add("error");
  } finally {
    setLoading(false);
  }
}

chooseButton.addEventListener("click", () => void chooseDirectory());
changeButton.addEventListener("click", () => {
  game?.destroy();
  game = undefined;
  gameHost = undefined;
  catalog = undefined;
  canvasHost.replaceChildren();
  mapToolbar.hidden = true;
  app.classList.remove("has-map-toolbar");
  welcome.hidden = false;
  gameShell.hidden = true;
  welcomeStatus.textContent = "請選擇另一個遊戲根目錄";
  welcomeStatus.classList.remove("error");
});
compatButton.addEventListener("click", () => folderInput.click());
folderInput.addEventListener("change", () => {
  if (!folderInput.files?.length) return;
  try {
    void openCatalog(fromFileList(folderInput.files));
  } catch (error) {
    welcomeStatus.textContent = `無法讀取資料夾：${error instanceof Error ? error.message : String(error)}`;
    welcomeStatus.classList.add("error");
  } finally {
    folderInput.value = "";
  }
});

mapSearch.addEventListener("input", filterMaps);
mapToolbar.addEventListener("submit", (event) => {
  event.preventDefault();
  const selected = catalog?.maps.find(({ path }) => path === mapSelect.value);
  if (selected) void start(selected);
});
