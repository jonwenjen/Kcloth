# KCLOTH 每月執行手冊

每月 15 日清晨由排程啟動一個全新的 Claude 工作階段，照本手冊從頭跑到尾，**全程不問 Robin**，
最後把網站更新推上 GitHub Pages（https://jonwenjen.github.io/Kcloth/）並回報。

- 使用者資料：`config/profile.json`（175cm／75kg、肩 44、胸 48、腰 43.5、黃偏黑膚色、43 歲想穿出 35 歲感）
- 硬性規則：`config/rules.json`（版型、排雷門檻、預算、溢價、膠囊衣櫥格、溫度帶）
- 抓資料方式：`docs/endpoints.md`；欄位格式：`docs/schema.md`；歷次改進：`docs/run-log.md`
- 一律用繁體中文寫內容。

---

## 步驟 0　準備

1. 確認 repo：`/home/user/Kcloth`、`/home/claude/kcloth` 或工作目錄下任何 `Kcloth` clone。沒有就 `add_repo(jonwenjen, Kcloth, push)` 後照工具指示 clone。`git checkout main && git pull --ff-only`。
2. `MONTH` = 台灣時間（UTC+8）的 `YYYY-MM`。若 `data/months/MONTH.json` 已存在，表示本月跑過：沿用並更新它，不要另開。
3. 讀：`config/*.json`、`docs/run-log.md` 最後一筆、`data/latest.json`（上月結果）、`data/orders.json`、`data/wishlist.json`。
4. 建工作清單（TaskCreate），每完成一步就打勾。

## 步驟 1　用目前的模型先自我審查（目標 13）

在跑分析前，用本次的模型重新檢視：`PLAYBOOK.md`、`config/rules.json`、`scripts/collect.js`、`scripts/kcloth.py`、`assets/app.js`，以及上月月報的品質（例如：關鍵字誤判、尺寸建議與評論矛盾、網站顯示問題、上月 run-log 列的待改事項）。

- 能改進就直接改、跑一次驗證（`python3 scripts/kcloth.py bundle`、`node --check`、`python3 -m py_compile`），並寫進 `docs/run-log.md` 本月條目的「方法改進」。
- **Robin 定下的硬性條件不可自行放寬**：體型過濾 173–177cm／73–77kg、負評 5%、貼身 10%、預算上限與 +50%、溢價 20%、L 號基準、各項版型禁令。只能更嚴格或修正誤判（例如否定句誤算）。
- `rules.json` 有改就更新 `version`。

## 步驟 2　確認工具

- 瀏覽器：工具名稱含 `Claude_Browser__`（Robin 的 Mac 內建瀏覽器）。載入方式依該工具說明；有 `built-in-browser` skill 先讀。
- 若瀏覽器連不上（Mac 睡眠或 App 沒開）：改走 **部分更新模式**（見文末），不要硬試超過 2 次。
- Gmail、Google Calendar、PushNotification 若有就用，沒有就略過並記錄。

## 步驟 3　購買紀錄（目標 3）

1. Gmail 搜尋 `from:mail.global@musinsa.com subject:"order has been confirmed" after:<orders.json 的 updated>`，再搜 `from:mail.global@musinsa.com (cancel OR cancelled OR refund OR return)`。
2. 每件新商品加進 `data/orders.json`：品牌、品名、顏色、尺寸、TWD、`cat`、`slot`、`role`、`temps`、`status`（ordered／received／returned／cancelled）。**不要寫訂單編號、收件人、地址、電話。**
3. 找出 goodsNo（韓國站 `KC.search('品牌 英文品名')` 比對名稱），用 `KC.item` 補 `fabric`、該尺寸實測（`chart`）與 `goodsNo`。
4. 依新規則替每件寫 `audit`：`verdict` = keep（符合）／tip（可穿但要用特定穿法）／watch（觀察洗後狀況）／return（違反硬性規則、仍可退時建議退換）＋ `note`（一兩句，說明哪條規則與怎麼穿）。
5. 若瀏覽器已登入 MUSINSA Global，可另讀訂單頁補資料；**不要嘗試登入**。

## 步驟 4　清單同步（目標 9、10）

網站的「加入清單」存在 Robin 手機的瀏覽器，按「同步到 GitHub」會開一個標題以「清單同步」開頭的 Issue，內文有 JSON。

1. `gh issue list --repo jonwenjen/Kcloth --state open --search "清單同步 in:title" --json number,title,body,createdAt`
2. 取最新一則的 JSON 當完整清單（網站送的是精簡欄位），用 `id` 對回 `data/months/*.json` 的單品補齊 `color`、`hex`、`tone`、`role`、`temps`、`url`、`img`，覆寫 `data/wishlist.json`（保留 `added` 日期、`source` 寫 Issue 編號），其餘舊 Issue 一併關閉：`gh issue close N --comment "已於 MONTH 月報同步"`。
   - 清單內單品若本月仍在售，重新檢查價格；若已在 `orders.json`（買了）就從清單移除。
3. `gh` 不能用時記錄在 run-log，沿用現有 wishlist.json。

## 步驟 5　匯率、折扣、折價券（目標 2、8）

1. 匯率：WebFetch `https://open.er-api.com/v6/latest/KRW` 取 `rates.TWD` → `fx.twd_per_krw`（附日期與來源）。
2. Global 台灣站首頁（瀏覽器）讀目前折價券與活動文字 → `coupons`。
3. WebSearch 至少 4 次：「무신사 무진장 블랙프라이데이 2026」「무신사 세일 일정」「MUSINSA Global Black Friday」「MUSINSA global sale 台灣」等（換成當年年份），整理 `sales`：名稱、站別、起訖、折扣、`status`（live／upcoming／expected／ended）、建議行動（清單裡哪些等這檔買）。傳統大檔：6 月中（夏季무진장）、11 月中（冬季무진장／블랙프라이데이）、11 月底 Black Friday、12 月年末。
4. 45 天內有大檔：若有 Google Calendar 工具，先搜尋是否已有同名事件，沒有才建全天事件「🛍 MUSINSA ＜檔期＞」，備註寫要買的清單品項。7 天內開跑的檔期，最後用 PushNotification 提醒。

## 步驟 6　潮流（目標 4）

WebSearch 4–6 次（本季與下季的韓系男裝、MUSINSA 趨勢報告、秋冬／春夏關鍵字），寫 `trends`：
- `now`：本季重點 3–5 條；`next`：下季 3–5 條；`timeless`：不退流行單品 5–8 項（膠囊衣櫥優先）；`avoid`：對 Robin 身形不利的流行（例如連肩袖超大廓形、短版緊身針織）。
- 每條都要寫 `fit_for_robin`：怎麼套用到他的規則（L 號、微落肩、深內亮外、單打褶）。
- 引用來源只轉述，不大段照抄。

## 步驟 7　20 大品牌（目標 5）

選 20 個 MUSINSA 上適合 Robin 的男裝品牌（延續上月並註明新增／移除原因）。每個寫：`strengths`（強項）、`features`（特點：版型／面料／價位）、`for_robin`（哪一類單品最適合他、要避開什麼）、`price_band`、`picks`（本月入選單品 id）。

## 步驟 8　選品：搜尋 → 排雷 → 專家評分（目標 1、6、7、12、14）

**8a 候選池**（80–150 件）：先跑 `python3 scripts/kcloth.py wardrobe` 看哪幾格缺最多，優先補缺；在 www.musinsa.com 分頁執行 bundle 後：
- `KC.search(關鍵字)`：下方關鍵字庫每格 1–3 組
- `KC.brand(brandId)`：20 大品牌各取前 30–60
- 上月入選、清單內、已購同款的後續款也放進來重新檢查（價格與庫存會變）

| 格 | 韓文搜尋關鍵字 |
|---|---|
| inner-dark-tee | 헤비웨이트 티셔츠, 12수 티셔츠, 긴팔 헤비웨이트 |
| white-tee | 화이트 헤비웨이트 티셔츠, 크루넥 화이트 티 |
| single-top | 밀라노 니트 폴로, 인터록 티셔츠, 헤비 피케 |
| light-overshirt | 옥스포드 셔츠 세미오버, 오버셔츠, 셔츠 자켓, 트윌 셔츠 |
| structured-knit | 밀라노 니트, 와플 니트 헤비, 투웨이 니트 집업 |
| zip-jacket | 투웨이 지퍼 블루종, 투웨이 집업 자켓, 드롭숄더 블루종 |
| tailored-jacket | 세미오버 싱글 블레이저, 컴포트 자켓 |
| winter-coat | 싱글 코트 세미오버, 숏 코트 (避開 발마칸＝連肩袖) |
| tuck-slacks | 원턱 세미와이드 슬랙스, 원턱 밴딩 슬랙스 숏, 무신사 스탠다드 원턱 |
| denim | 세미와이드 데님, 스트레이트 셀비지 데님 |
| chino | 원턱 치노, 세미와이드 치노 |

**8b 快速排雷**：`KC.screen([...], {cat})` 每批 10 件。直接剔除：`exclude` 非空、`oos`、女裝、韓國價換算 > 上限 ×1.5。
剔除的寫進 `excluded`（品名、網址、理由與數字），挑最有參考價值的 10–20 筆即可。

**8c 入圍分析**（約 40 件）：`KC.item(no, {cat})` 取完整資料；在 global.musinsa.com 分頁 `KC.globalPrices([...])` 取台灣價（不可買的標 `global_available:false`，仍可列但寫明只能韓國站）。
依 `rules.json` 判斷版型：
- 上衣：L 號平量肩 48–51、胸 57–60、衣長 68–71（襯衫可到 74）；微落肩硬挺；直筒不收口；厚度 보통以上；禁連肩袖、下擺羅紋、薄軟布。
- 外套：微落肩或結構肩、拉鍊必須雙向；日系 Size 2 可接受肩 47–48。
- 褲子：前襠 30–32、單打褶優先、後腰鬆緊加分、大腿 34–35、褲腳 21–23、褲長 100–102（Short）；禁 Slim／Skinny。
- 顏色：單穿上衣用炭灰／深霧藍／深鼠尾草綠；外搭亮色用冰川藍／霧灰藍／淺卡其灰／燕麥；避免單穿純白／象牙白。

**8d 專家評分**（每件）：五位專家各給 1–5 星並各寫一句（`experts`）：
材質（面料紡織）、版型（打版，以 Robin 身形）、車工（品管）、保養（縮水／起毛球／領口實際評論）、機能（高雄氣候、彈性、場合）。
再給 `overall`（1–5）、`comment`（綜合評語，2–3 句）、`styling`（搭配建議，引用顏色公式與已購／清單單品）。

**8e 尺寸建議**（每件，分開列）：
- A 尺寸表：Robin 的目標數值 vs 各尺寸 → `chart_pick` 與 `chart_why`
- B 評論：同身形 n 則、各尺寸人數、偏大／偏小關鍵字數 → `reviews_body`（`tendency` 偏大／正常／偏小）
- 最終 `pick` ＋ `why`（兩者衝突時說明取捨）。上衣以 L 為基準，不要因腰圍推 XL。

**8f 價格**：`price.twd`（Global）、`price.krw`（韓國站）。預算上限：上衣／褲 NT$3,000、外套 NT$5,000；超出上限但 ≤ +50% 時必須寫 `budget_reason`。溢價由 build 自動計算，≥ 20% 網站標紅。

**8g 最終名單**：20–30 件，各格平衡、缺口優先；`is_new` 標示本月新入選；上月入選若仍適合可保留（重新抓價格與評論）。

## 步驟 9　衣櫥分析與穿搭（目標 10、11）

1. 再跑 `python3 scripts/kcloth.py wardrobe`（含新清單）。
2. `wardrobe.summary`：已購＋清單的整體評估（2–4 句）；`gaps`：每個缺口寫 `slot`、`need`、`suggest`（本月單品 id）；`owned_review`：已購單品怎麼搭、哪些不建議再買同類。
3. `outfits`：下一季會遇到的每個溫度帶（`rules.json temp_bands`）至少 2 套，優先用已購（`order` ref）＋清單＋本月單品；每套寫 `how`（穿法，含白邊、倒 V、開襟等）與 `why`。
4. `carryover`：上月推薦單品的去留（保留／換尺寸／剔除）與理由。

## 步驟 10　寫月報並建置

1. 寫 `data/months/MONTH.json`（格式見 `docs/schema.md`）。
2. `python3 scripts/kcloth.py build MONTH`：**ERROR 必須為 0**（違規單品改放 `excluded`、補缺欄位）；WARN 要在 `fit.note`／`comment` 交代。
3. `python3 scripts/kcloth.py check` 通過。

## 步驟 11　推送與檢查網站

1. `docs/run-log.md` 新增本月條目：模式（完整／部分）、方法改進、資料筆數、未解決問題。
2. `git add -A && git commit -m "Monthly run MONTH"`（訊息照 repo 慣例），`git push origin main`；只有網路錯誤才重試，最多 4 次（2/4/8/16 秒）。
3. 等 GitHub Pages 更新（每 20 秒、最多 15 次比對 `data/latest.json` 的 `month`），用內建瀏覽器開網站、手機尺寸檢查無 console error、主要區塊有內容。

## 步驟 12　回報

用繁體中文簡短回報（也是 PushNotification 內容的來源）：
- 折扣提醒（日期、該等哪幾件）
- 本月最推 3–5 件（品名、尺寸、價格、一句理由）
- 衣櫥缺口、已購單品的退換建議
- 方法改進、部分更新或失敗之處

---

## 部分更新模式（瀏覽器連不上時）

照做：步驟 1、3（Gmail）、4、5（匯率與 WebSearch 檔期）、6、7。
選品沿用上月 `items`（不要捏造新數據），`run.mode = "partial"`，`run.notes` 寫明原因；仍然 build、push、回報，並在回報開頭說明「Mac 未連線，選品沿用上月」。

## 不可做

- 不登入任何網站、不輸入密碼、不下單、不加入購物車、不送出表單。
- 不寫入訂單編號、地址、電話等個資。
- 不放寬 Robin 的硬性條件；不捏造評論數字（都要來自 `KC.*` 的實際輸出）。
- 不大段複製評論或文章原文；評論只取數字與簡短轉述。
