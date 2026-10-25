# 月報格式 `data/months/YYYY-MM.json`

由每月執行寫入，`python3 scripts/kcloth.py build YYYY-MM` 驗證後複製成 `data/latest.json` 給網站讀。
標 *（build 計算）* 的欄位不用自己寫。

```jsonc
{
  "month": "2026-11",
  "run": { "date": "2026-11-15", "model": "claude-opus-5-5", "mode": "full", "notes": "" },
  "fx": { "twd_per_krw": 0.0229, "date": "2026-11-15", "source": "open.er-api.com" },

  "coupons": [ { "text": "全館滿 TWD 3,600 打 8 折", "until": "2026-11-30", "store": "global" } ],
  "sales": [
    { "name": "무진장 블랙프라이데이", "store": "kr", "start": "2026-11-14", "end": "2026-11-30",
      "status": "live", "detail": "最高 80%＋額外券", "action": "清單裡的 2026-11-03、2026-11-07 等這檔買", "url": "https://..." }
  ],

  "trends": {
    "season": "2026 秋冬", "next_season": "2027 春夏", "summary": "兩三句總結",
    "now":      [ { "title": "…", "detail": "…", "fit_for_robin": "…" } ],
    "next":     [ { "title": "…", "detail": "…", "fit_for_robin": "…" } ],
    "timeless": [ { "title": "…", "detail": "…", "fit_for_robin": "…" } ],
    "avoid":    [ { "title": "…", "detail": "…", "fit_for_robin": "…" } ],
    "sources": [ { "title": "…", "url": "…" } ]
  },

  "brands": [
    { "rank": 1, "name": "DRAW FIT", "id": "drawfit", "strengths": "…", "features": "…",
      "for_robin": "…", "price_band": "NT$1,200–3,500", "picks": ["2026-11-04"], "change": "新進／續留／說明" }
  ],

  "items": [
    {
      "id": "2026-11-01", "goodsNo": 1864004, "is_new": true,
      "cat": "tee", "slot": "inner-dark-tee", "role": "inner",
      "brand": "MUSINSA STANDARD", "name": "重磅寬鬆長袖 T（深灰）", "name_en": "Heavyweight Relaxed …",
      "color": "深灰 Dark Gray", "hex": "#55585c", "tone": "dark",
      "img": "https://image.msscdn.net/…_big.jpg",
      "urls": { "global": "https://global.musinsa.com/tw/products/1864004",
                "kr": "https://www.musinsa.com/products/1864004",
                "reviews": "https://www.musinsa.com/review/goods/1864004" },
      "price": { "twd": 450, "twd_normal": 899, "krw": 18490, "krw_normal": 29900, "global_available": true,
                 "krw_twd": 423, "premium_pct": 6.4, "premium_flag": false },          // 後三項 *（build 計算）*
      "budget_reason": null,                                                             // 超出上限時必填
      "budget": { "cap": 3000, "cap_max": 4500, "over_pct": 0, "status": "ok" },       // *（build 計算）*
      "fabric": "棉 100%（重磅）", "origin": "越南", "care": "冷水洗衣袋、陰乾",
      "fit": { "shoulder_type": "drop-structured", "hem": "open", "zip": false, "two_way_zip": null,
               "leg": null, "tuck": null, "note": "衣長 72cm 比規則長 1cm：下擺不紮，蓋住腰線反而修飾" },
      "size": {
        "pick": "L",
        "chart": { "shoulder": 50, "chest": 57.5, "length": 72.05 },
        "chart_pick": "L", "chart_why": "肩 50 撐出 6cm、胸 57.5 有 9.5cm 架空層",
        "reviews_body": { "n": 57, "dist": { "L": 35, "XL": 17, "2XL": 3, "M": 2 }, "tendency": "正常", "note": "1 則說偏寬鬆" },
        "reviews_all": { "n": 600, "dist": { "L": 210, "XL": 190 } },
        "why": "尺寸表與同身形評論都指向 L（35/57 人）"
      },
      "screen": { "fetched": 600, "neg_pct": 0.8, "neg_body_pct": 0, "neg_by": { "shrink": 4, "pilling": 0, "neck": 1 },
                  "clingy_pct": 0.5, "thin_pct": 1.2, "thickness": "약간|두꺼움", "warn": [] },
      "scores": { "material": 4, "fit": 4.5, "make": 3, "care": 4, "function": 4, "overall": 4, "mean": 3.9 },  // mean *（build 計算）*
      "experts": { "material": "…", "fit": "…", "make": "…", "care": "…", "function": "…" },
      "comment": "專家綜合評語", "styling": "搭配建議",
      "temps": [16, 26], "rating": { "score": 4.8, "count": 422 }
    }
  ],

  "excluded": [ { "goodsNo": 0, "brand": "…", "name": "…", "cat": "knit", "url": "…", "reasons": ["負評排雷 7.2% > 5%（起毛球 18 則）"] } ],

  "wardrobe": {
    "summary": "…",
    "gaps": [ { "slot": "zip-jacket", "need": "…", "suggest": ["2026-11-12"] } ],
    "owned_review": [ { "ref": "o-20261024a-3", "note": "…" } ]
  },

  "outfits": [
    { "id": "mild-1", "band": "mild", "title": "…", "items": ["o-20261024a-3", "2026-11-01"], "how": "…", "why": "…" }
  ],

  "carryover": [ { "ref": "2026-10-03", "name": "…", "decision": "保留／換尺寸／剔除", "note": "…" } ],
  "self_review": { "changes": ["…"], "todo": ["…"] }
}
```

## 欄位值

- `cat`：tee／knit／shirt／outer／pants
- `slot`：`config/rules.json` 的 `capsule_slots[].id`
- `role`：inner（內搭）／single（單穿）／outer（外搭）／bottom（下身）
- `tone`：dark／mid／light
- `fit.shoulder_type`：drop-structured／set-in／raglan（raglan 禁用）
- `fit.hem`：open／shirt-tail／ribbed（上衣 ribbed 禁用）
- `fit.leg`：semi-wide／wide／straight／tapered／slim（slim、skinny 禁用）
- `fit.tuck`：one-tuck／two-tuck／flat
- `outfits[].band`：hot／warm／mild／cool／cold
- `outfits[].items`：本月單品 `id` 或 `data/orders.json` 的 `ref`

# `data/orders.json`

```jsonc
{ "updated": "2026-10-25", "source": "Gmail：MUSINSA Global Order Confirmation",
  "orders": [ { "date": "2026-10-24", "key": "20261024a", "store": "global",
      "items": [ { "ref": "o-20261024a-1", "brand": "…", "name": "…", "color": "…", "size": "32", "twd": 2304,
                   "cat": "pants", "slot": "denim", "role": "bottom", "temps": [14, 28], "goodsNo": null,
                   "fabric": null, "status": "ordered",
                   "audit": { "verdict": "keep", "note": "…", "checked": "名稱判斷｜已核對尺寸表" } } ] } ] }
```
不寫訂單編號、收件人、地址、電話。

# `data/wishlist.json`

```jsonc
{ "updated": "2026-11-16", "source": "GitHub Issue #12",
  "items": [ { "id": "2026-11-03", "goodsNo": 123, "name": "…", "brand": "…", "cat": "knit", "slot": "single-top",
               "color": "…", "hex": "#…", "tone": "dark", "role": "single", "temps": [18, 26],
               "twd": 1800, "url": "…", "img": "…", "size": "L", "added": "2026-11-15" } ] }
```
