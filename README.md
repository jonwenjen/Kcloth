# KCLOTH

Robin 的韓系男裝選物：每月 15 日自動分析 MUSINSA（韓國站＋Global 台灣站），
依身形（175／75、肩 44、胸 48、腰 43.5）、膚色與膠囊衣櫥挑選單品。

**網站：** https://jonwenjen.github.io/Kcloth/

| 區塊 | 內容 |
|---|---|
| 折扣提醒 | 本月與 45 天內的大檔期、目前折價券 |
| 潮流 | 本季、下季、不退流行單品、該避開的流行 |
| 本月選品 | 五位專家（材質／版型／車工／保養／機能）評分、尺寸表 × 同身形評論的尺寸建議、Global vs 韓國價差、排雷數據、加入清單 |
| 20 大品牌 | 強項、特點、適合 Robin 的單品 |
| 我的衣櫥 | 已購＋清單的膠囊衣櫥缺口、依溫度的穿搭 |
| 剔除名單 | 被負評、貼身、版型或預算規則排除的單品與原因 |

## 結構

```
config/profile.json   身形與預算
config/rules.json     版型、排雷、預算、溢價、膠囊衣櫥、溫度帶（機器可讀）
PLAYBOOK.md           每月執行手冊
scripts/collect.js    在瀏覽器內抓 MUSINSA 商品、尺寸、評論並排雷
scripts/kcloth.py     驗證與建置（bundle／validate／build／wardrobe／check）
data/months/*.json    每月月報；data/latest.json 為最新一期
data/orders.json      購買紀錄（Gmail 訂單信）
data/wishlist.json    已同步的清單
docs/                 資料端點、欄位格式、執行紀錄
```
