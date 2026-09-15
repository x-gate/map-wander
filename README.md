# x-gate 地圖漫遊試驗

以 PixiJS 8 與同工作區的 `xglib` WASM，在瀏覽器中把動畫角色放進 `1011.dat`，試驗原版風格的游標、格位提示、八方向動畫、左鍵移動與右鍵轉向。

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

檔案只在本機瀏覽器內解析，沒有上傳端點，也不會寫入、變更或保存遊戲資源。repository 和正式建置不包含這些檔案。

## 操作

- 移動滑鼠：解碼原版圖像 ID 1899 並以 CSS `cursor` 取代作業系統游標；有效地圖格以 ID 1900 覆蓋提示。
- 左鍵點擊格位：以 A* 尋找八方向路徑，角色切換至動作 1 並依移動方向循環播放；跨格與轉彎會延續動畫相位，抵達後才切回動作 0。
- 單軸移動以一格時間計算；`x`、`y` 同時變動的斜向步驟依 `√2` 距離延長時間，保持一致的邏輯移動速度。
- 右鍵點擊格位：角色原地轉向該格位；移動中會取消後續路徑、走完目前一步後轉向。
- 左鍵拖曳：平移地圖，不觸發移動。
- 滾輪：以游標為中心縮放。

方向遵循這個專案的明確契約：0 西北、1 北，之後順時針至 7 西。動畫 ID 100052 在目前參考索引中有同號資料；載入器明確採用索引列 2425，並驗證該列仍為 AnimeID 100052，避免無聲套用其他動畫。

## 碰撞與已知界限

可行走網格以 `GraphicInfo.access` 建立：缺少或不可通行的地面不能進入；已知且不是 `AsGround` 的不可通行物件會依 `grid_w` × `grid_h` 占地阻擋。缺少對應 `Graphic_66` 圖像的物件 ID 維持透明，也不會在證據不足時臆測成障礙。這是試驗性相容策略，不宣稱已完整還原原版網路校正或移動速度。

## 開發與驗證

```sh
bun run lint
bun run typecheck
bun run test
bun run build
bun run audit:local
```

`audit:local` 是選用的唯讀整合驗證：以 SHA-256 比對所有輸入在解析前後未變，輸出尺寸、索引列與動畫幀數，不輸出或保存像素。若遊戲根目錄不在 `../CGoriginmood`，可執行 `bun scripts/audit-local.ts /絕對路徑`。

## 架構

- `src/resources/`：固定路徑的本機檔案取得、40-byte GraphicInfo 尋址、12-byte AnimeInfo 尋址與 xglib 解碼。
- `src/game/geometry.ts`：64×48 等角格位投影。
- `src/game/movement.ts`：方向契約、A* 與初始可行走格搜尋。
- `src/game/game.ts`：PixiJS 地圖、角色影格、定位點、游標、鏡頭與輸入。

這是非官方研究用原型，未由 Square Enix 授權或背書；遊戲名稱及商標屬各權利人。請只選擇你有權使用的本機資料。
