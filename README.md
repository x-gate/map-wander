# x-gate 地圖漫遊試驗

以 PixiJS 8 與同工作區的 `xglib` WASM，在瀏覽器中把動畫角色與 NPC 放進 `1011.dat`，試驗原版風格的游標、格位提示、八方向動畫、左鍵移動與右鍵轉向。

## 使用方式

需要 Bun、支援 edition 2024 的 Rust、`wasm32-unknown-unknown` target，以及與 `../xglib/Cargo.lock` 一致的 `wasm-bindgen-cli`（目前為 0.2.118）。

```sh
bun install --frozen-lockfile
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.118 --locked
bun run dev
```

開啟 <http://127.0.0.1:8081>，選擇包含 `Assets` 的遊戲根目錄。應用程式只讀取以下指定來源：

- `GraphicInfoV3_19.bin` / `GraphicV3_19.bin`：圖像 ID 1899 游標、1900 格位定位點。
- `GraphicInfo_66.bin` / `Graphic_66.bin`：地圖圖像與角色影格。
- `AnimeInfo_4.bin` / `Anime_4.bin`：動畫 ID 100052。
- `pal/palet_00.cgp`：基礎圖像調色盤。
- `map/0/1011.dat`：演示地圖。
- `../cgmsv/gmsv/data/npc.txt`：開發／建置時唯讀解析地圖 1011 的 NPC 數值欄位。

遊戲根目錄中的檔案只在本機瀏覽器內解析；`npc.txt` 則由 Vite 在本機啟動或建置時讀取。程式只把地圖、座標、朝向與 Graphic MapID 的結構資料交給前端，不帶入 NPC 名稱、對話或腳本欄位。沒有上傳端點，也不會寫入、變更或把原始資源保存至 repository。

## 操作

- 移動滑鼠：解碼原版圖像 ID 1899 並以 CSS `cursor` 取代作業系統游標；有效地圖格以 ID 1900 覆蓋提示。
- 左鍵點擊格位：以 A* 尋找八方向路徑；若點擊位置不可穿越或與角色隔離，會走到可達範圍中最接近該位置的格位，並停在障礙物前。角色移動時切換至動作 1 並依方向循環播放；跨格與轉彎會延續動畫相位，停下後才切回動作 0。
- 單軸移動以一格時間計算；`x`、`y` 同時變動的斜向步驟依 `√2` 距離延長時間，保持一致的邏輯移動速度。
- 右鍵點擊格位：角色原地轉向該格位；移動中會取消後續路徑、走完目前一步後轉向。
- 攝影機：隨角色的步行位置平滑移動，並在縮放時維持角色置中。
- 左鍵拖曳：平移地圖並暫停攝影機跟隨，不觸發移動；下一次下達移動指令時恢復跟隨。
- 滾輪：跟隨中以角色為中心縮放；手動平移後以游標為中心縮放。

方向遵循這個專案的明確契約：0 西北、1 北，之後順時針至 7 西。動畫 ID 100052 在目前參考索引中有同號資料；載入器明確採用索引列 2425，並驗證該列仍為 AnimeID 100052，避免無聲套用其他動畫。

## NPC 圖層

`npc.txt` 以 tab 分欄；程式使用第 9 個值的地圖編號篩選 1011，保留第 10–17 個值的四組座標、第 20 個值的朝向，以及第 21 個值的圖像 MapID。圖像 MapID 透過 `GraphicInfo_66.bin` 的 `map_id` 查找並從 `Graphic_66.bin` 解碼，不會當成 AnimeID 或 GraphicInfo 的列索引。

NPC 保留在獨立的邏輯圖層，並與非地面物件及玩家共用依腳底高度排序的 PixiJS 渲染層。現在 1011 的 NPC 都是四組座標相同的 1×1 記錄，因此以第一組座標作為顯示位置；四組來源座標仍完整保留，未自行推測其餘語意。`npc.txt` 提供的朝向也保留在資料與場景標記中，但目前 MapID 對應的是單張靜態圖像，未推測不存在的方向動畫映射。

## 碰撞與已知界限

可行走網格以 `GraphicInfo.access` 建立：缺少或不可通行的地面不能進入；已知且不是 `AsGround` 的不可通行物件會依 `grid_w` × `grid_h` 封鎖完整占地，而非只封鎖物件錨點。在原始地圖座標中，`grid_w` 從錨點向正 `x` 展開，`grid_h` 從錨點向負 `y` 展開。`1011.dat` 的物件 ID 2 在 `GraphicInfo_66` 缺少圖像，目前暫時維持透明且不視為障礙。這是試驗性相容策略，不宣稱已完整還原原版網路校正或移動速度。

## 開發與驗證

```sh
bun run lint
bun run typecheck
bun run test
bun run build
bun run audit:local
```

`audit:local` 是選用的唯讀整合驗證：以 SHA-256 比對所有遊戲輸入與 `npc.txt` 在解析前後未變，輸出尺寸、索引列、動畫幀數與 NPC Graphic MapID，不輸出或保存像素。若遊戲根目錄不在 `../CGoriginmood`，可執行 `bun scripts/audit-local.ts /絕對路徑`。

## 架構

- `src/resources/`：固定路徑的本機檔案取得、NPC TSV 結構解析、40-byte GraphicInfo 尋址、12-byte AnimeInfo 尋址與 xglib 解碼。
- `src/game/geometry.ts`：64×48 等角格位投影。
- `src/game/movement.ts`：方向契約、A* 與初始可行走格搜尋。
- `src/game/game.ts`：PixiJS 地圖、角色影格、定位點、游標、鏡頭與輸入。

這是非官方研究用原型，未由 Square Enix 授權或背書；遊戲名稱及商標屬各權利人。請只選擇你有權使用的本機資料。
