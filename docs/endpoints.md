# MUSINSA 資料怎麼抓（2026-10-25 實測可用；同日第二次修訂）

所有抓取都在 **Robin 的 Mac（jonwenjens-mac-mini）Claude 桌面 App 內建瀏覽器** 裡執行，
透過 `javascript_tool` 在 MUSINSA 自己的網頁內 `fetch`，不需要登入，也不送出任何表單。
雲端工作區的 shell 連不到 musinsa.com（allowlist 擋），WebFetch 只拿得到 Global 頁的空殼，所以一定要用瀏覽器。

`scripts/collect.js` 把下面這些包成 `KC.*` 函式。用 `python3 scripts/kcloth.py bundle` 產生
`.cache/collect.bundle.js`（含 rules.json 的門檻與關鍵字），整份交給 `javascript_tool` 執行一次即可。

## 先看這裡（2026-10 月報實測）

- **載入抓取器不必貼 bundle**：在 global 分頁 `fetch` GitHub raw 的 `scripts/collect.js`＋`config/rules.json`，`(0,eval)(t); KC.init(rules)`（2026-10-25 實測，頁面 CSP 不擋）。
- Global 商品頁出現「not available in your country」＝對台灣不販售，`KC.globalPrice` 回 `status: 'not-in-country'`（例：DIMITRI BLACK 7108771）。

- **一個 `global.musinsa.com` 分頁就能抓全部**：台灣 IP 開 `www.musinsa.com` 常被導到 Global，但下面的韓國站 API 都允許從 Global 分頁跨域 `fetch`。
- 面板在背景時 `setTimeout` 會被節流（1 秒～1 分鐘），計時請用 MessageChannel（collect.js 的 sleep 已改）。
- `javascript_tool` 每次最多 45 秒：大量抓取要「丟到背景跑、結果存在 `window`、之後再讀」，例如 `window.SCR`＋佇列（見 run-log 2026-10）。
- 韓國站評論 API **依序、間隔 250ms** 抓 2,500 次都沒問題；5 併發約 400 次就會被暫時封鎖，症狀是 `TypeError: Failed to fetch`、評論頁顯示「서비스 연결이 지연되고 있습니다」。
  `KC.item` 會自動改用 **Global 評論 API**（同批韓國評論的英文機器翻譯，含身高體重、購買尺寸），並套用 `rules.json review_screen.fallback_en` 的英文關鍵字；門檻不變。
  校正：MUSINSA STANDARD 重磅長袖 T（1864004）韓文 600 則負評 0.8%、英文 422 則 0.7%，結果一致。
- 結構化搜尋用 `KC.list`（`api.musinsa.com/api2/dp/v1/plp/goods`），直接拿到品名、價格、評論數，比解析搜尋頁 HTML 好用。

## 韓國站 API（`www` 或 `global` 分頁皆可）

| 用途 | 端點 | 備註 |
|---|---|---|
| 商品資料 | `https://goods-detail.musinsa.com/api2/goods/{goodsNo}` | `data.goodsPrice`（normalPrice / salePrice / finalPrice，KRW）、`goodsMaterial.materials`（핏、촉감、신축성、비침、두께、계절）、`goodsReview`（satisfactionScore、totalCount）、`similarNo` |
| 實測尺寸 | `.../api2/goods/{goodsNo}/actual-size` | `data.sizes[].items[]`：총장、어깨너비、가슴단면、소매길이、밑단단면、허리단면、허벅지단면、밑위… 值為 0 代表沒提供 |
| 商品資訊公告 | `.../api2/goods/{goodsNo}/essential` | 제품 소재（成分）、제조국、세탁방법 |
| 選項 | `.../api2/goods/{goodsNo}/options?goodsSaleType=SALE&optKindCd=CLOTHES` | 尺寸／顏色選項 |
| 評論 | `https://goods.musinsa.com/api2/review/v1/view/list?page={p}&pageSize=20&goodsNo={no}&sort=new&myFilter=false&hasPhoto=false&isExperience=false` | **pageSize 上限 20**。每則有 `grade`、`content`、`goodsOption`（購買尺寸）、`userProfileInfo.userHeight / userWeight`。評論會合併同款不同色（similarNo）。30 頁約 2 秒 |
| 搜尋 | `https://www.musinsa.com/search/goods?keyword={kw}&gf=M` | 伺服器端渲染；用正則抓 `products/(\d+)`，一頁約 60 個商品編號 |
| 品牌頁 | `https://www.musinsa.com/brand/{brandId}?gf=M` | 同上；brandId 例如 `musinsastandard`、`drawfit` |
| 結構化列表 | `https://api.musinsa.com/api2/dp/v1/plp/goods?gf=M&keyword={kw}&sortCode=POPULAR&page=1&size=60&caller=SEARCH` | 也可用 `brand={id}&caller=BRAND`、`category=001/002/003`；回傳 goodsNo、goodsName、price、reviewCount、displayGenderText、isSoldOut |

## Global 台灣站（分頁要停在 `https://global.musinsa.com/...`）

| 用途 | 端點 | 備註 |
|---|---|---|
| 台灣售價 | `https://global.musinsa.com/tw/products/{goodsNo}` 的 HTML | 內嵌 `"goodsPrice":{"normalPrice":899,"price":450,"saleRate":50,"currencyCode":"TWD"…}`；沒上架 Global 的商品找不到 goodsPrice → 視為不可買 |
| 折價券／活動 | `https://global.musinsa.com/tw` 首頁文字 | 例：「20% off on all orders TWD 3,600+」、「18% off outerwear TWD 1,600+」 |
| 評論（備援） | `https://global.musinsa.com/api2/global/global-review/v1/list?countryCode=TW&localeCode=en-US&goodsNo={no}&sort=new&page={1..}&pageSize=20` | pageSize 上限 20；`content` 是英譯；`userProfile.userHeight/userWeight`、`goodsOptionList`；只含該 goodsNo（不合併同款他色） |
| 訂單紀錄 | `https://global.musinsa.com/order/mypage/order_list` | 需登入。2026-10-25 內建瀏覽器**未登入**（會轉址），改用 Gmail 訂單信 |

商品編號（goodsNo）在韓國站與 Global 站相同。

## 購買紀錄

Gmail：`from:mail.global@musinsa.com subject:"order has been confirmed"`（另查 `cancel OR refund OR return`）。
信件內有品牌、品名、選項（顏色／尺寸）、數量、TWD 價格。
**不要**把訂單編號、收件人、地址、電話寫進 repo（這個 repo 是公開的）。

## 匯率

`https://open.er-api.com/v6/latest/KRW` 取 `rates.TWD`（雲端 shell 被擋，改在內建瀏覽器分頁 `fetch`）；失敗就 WebSearch「KRW TWD 匯率」。

## 端點壞掉時

在商品頁開 `read_network_requests` 找新的 API，更新本檔與 `scripts/collect.js`，並寫進 `docs/run-log.md`。
