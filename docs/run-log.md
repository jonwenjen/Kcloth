# 執行紀錄

每月執行在最上方新增一筆：日期、模型、模式（完整／部分）、方法改進、資料筆數、待改事項。

## 2026-10-25　2026-10 月報（claude-opus-5-5，完整模式）

- 模式：完整（內建瀏覽器可用）。資料：候選池約 450 件（KC.list 11 格 × 1–5 組關鍵字＋15 個品牌頁），排雷掃描 80 件，入選 17 件，剔除列 17 筆；已購 12 件全部補 goodsNo／成分／實測尺寸。
- 方法改進（rules 2026-10-25.3）：
  1. 排雷關鍵字「先刪否定片語再比對」（보풀 없어요、뱃살 커버…），修正把正評算成負評的誤判。
  2. 客觀收口判定 `fit.hem_cinch`：上衣下擺比胸寬小 > 6cm 視同羅紋收口（kcloth.py build 會擋）。
  3. 韓國站評論 API 抓約 400 次後被暫時封鎖（Failed to fetch／서비스 연결이 지연）→ 自動改用 Global 評論 API（英譯，含身高體重），英文關鍵字見 `review_screen.fallback_en`；1864004 校正：韓文 0.8%、英文 0.7%。
  4. `KC.list` 結構化搜尋（api.musinsa.com plp）；所有 API 都能從 global.musinsa.com 分頁跨域呼叫。
  5. getJSON 自動重試；javascript_tool 45 秒上限 → 用 `window.QUEUE` 背景佇列＋多 worker；隱藏分頁不 sleep。
  6. 實測尺寸全 0 時解析商品公告「치수」表。
  7. 網站單品卡片顯示評論來源。
- 檔期：已在 Google Calendar 建 11/14（韓國站무진장，預估）、11/18（Global Monster Sale，預估）全天提醒。
- Gmail：只有 10/24 兩筆訂單確認信，無取消／出貨信。清單 Issue：無。
- 未解決：Global 評論只含同一 goodsNo（不合併他色）；針織類多數沒有下擺數字，本月靠商品照片判斷 5 件；DRAW FIT 華夫格亨利領、COOR 品牌 id 未查到。

## 2026-10-25　架構重建（claude-opus-5-5）

- 依 Robin 的新條件全面重做：規則改成機器可讀的 `config/rules.json`，每月流程寫成 `PLAYBOOK.md`，
  `scripts/kcloth.py` 驗證硬性條件（負評 5%、貼身 10%、預算＋50%、溢價 20%、版型禁令），網站改為讀 `data/latest.json`。
- 實測資料來源（見 `docs/endpoints.md`）：韓國站商品／實測尺寸／評論 API、Global 台灣站價格，都需在 Robin 的 Mac 內建瀏覽器內抓；
  評論 API 每頁上限 20 則，30 頁約 2 秒。
- 修正：薄透關鍵字「비침」會把「비침이 없어서（不透）」算進去 → 加入否定詞排除（`thin.negations`）。
- 購買紀錄改由 Gmail 訂單信匯入；內建瀏覽器目前未登入 MUSINSA Global。
- 匯入 2026-10-24 兩筆訂單共 12 件，依新規則初判：4 件建議退換（Supima 薄針織 ×2、Supima 2 入 T 恤 M 號、美麗諾細針織象牙白），
  3 件需到貨確認（Balmacaan 是否連肩袖、錐形褲褲腳、32 腰丹寧）。
- 待辦：首次每月執行補齊已購單品的 goodsNo、成分與實測尺寸並重新核對 audit。
