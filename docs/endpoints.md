# MUSINSA 資料怎麼抓（2026-10-25 實測可用）

所有抓取都在 **Robin 的 Mac（jonwenjens-mac-mini）Claude 桌面 App 內建瀏覽器** 裡執行，
透過 `javascript_tool` 在 MUSINSA 自己的網頁內 `fetch`，不需要登入，也不送出任何表單。
雲端工作區的 shell 連不到 musinsa.com（allowlist 擋），WebFetch 只拿得到 Global 頁的空殼，所以一定要用瀏覽器。

`scripts/collect.js` 把下面這些包成 `KC.*` 函式。用 `python3 scripts/kcloth.py bundle` 產生
`.cache/collect.bundle.js`（含 rules.json 的門檻與關鍵字），整份交給 `javascript_tool` 執行一次即可。

## 韓國站（分頁要停在 `https://www.musinsa.com/...`）

| 用途 | 端點 | 備註 |
|---|---|---|
| 商品資料 | `https://goods-detail.musinsa.com/api2/goods/{goodsNo}` | `data.goodsPrice`（normalPrice / salePrice / finalPrice，KRW）、`goodsMaterial.materials`（핏、촉감、신축성、비침、두께、계절）、`goodsReview`（satisfactionScore、totalCount）、`similarNo` |
| 實測尺寸 | `.../api2/goods/{goodsNo}/actual-size` | `data.sizes[].items[]`：총장、어깨너비、가슴단면、소매길이、밑단단면、허리단면、허벅지단면、밑위… 值為 0 代表沒提供 |
| 商品資訊公告 | `.../api2/goods/{goodsNo}/essential` | 제품 소재（成分）、제조국、세탁방법 |
| 選項 | `.../api2/goods/{goodsNo}/options?goodsSaleType=SALE&optKindCd=CLOTHES` | 尺寸／顏色選項 |
| 評論 | `https://goods.musinsa.com/api2/review/v1/view/list?page={p}&pageSize=20&goodsNo={no}&sort=new&myFilter=false&hasPhoto=false&isExperience=false` | **pageSize 上限 20**。每則有 `grade`、`content`、`goodsOption`（購買尺寸）、`userProfileInfo.userHeight / userWeight`。評論會合併同款不同色（similarNo）。30 頁約 2 秒 |
| 搜尋 | `https://www.musinsa.com/search/goods?keyword={kw}&gf=M` | 伺服器端渲染；用正則抓 `products/(\d+)`，一頁約 60 個商品編號 |
| 品牌頁 | `https://www.musinsa.com/brand/{brandId}?gf=M` | 同上；brandId 例如 `musinsastandard`、`drawfit` |

## Global 台灣站（分頁要停在 `https://global.musinsa.com/...`）

| 用途 | 端點 | 備註 |
|---|---|---|
| 台灣售價 | `https://global.musinsa.com/tw/products/{goodsNo}` 的 HTML | 內嵌 `"goodsPrice":{"normalPrice":899,"price":450,"saleRate":50,"currencyCode":"TWD"…}`；沒上架 Global 的商品找不到 goodsPrice → 視為不可買 |
| 折價券／活動 | `https://global.musinsa.com/tw` 首頁文字 | 例：「20% off on all orders TWD 3,600+」、「18% off outerwear TWD 1,600+」 |
| 訂單紀錄 | `https://global.musinsa.com/order/mypage/order_list` | 需登入。2026-10-25 內建瀏覽器**未登入**（會轉址），改用 Gmail 訂單信 |

商品編號（goodsNo）在韓國站與 Global 站相同。

## 購買紀錄

Gmail：`from:mail.global@musinsa.com subject:"order has been confirmed"`（另查 `cancel OR refund OR return`）。
信件內有品牌、品名、選項（顏色／尺寸）、數量、TWD 價格。
**不要**把訂單編號、收件人、地址、電話寫進 repo（這個 repo 是公開的）。

## 匯率

`https://open.er-api.com/v6/latest/KRW`（WebFetch）取 `rates.TWD`；失敗就 WebSearch「KRW TWD 匯率」。

## 端點壞掉時

在商品頁開 `read_network_requests` 找新的 API，更新本檔與 `scripts/collect.js`，並寫進 `docs/run-log.md`。
