# KCLOTH — 給 Claude 的說明

Robin 的 MUSINSA 男裝選物網站（GitHub Pages：https://jonwenjen.github.io/Kcloth/）。

- 每月 15 日排程執行：**照 `PLAYBOOK.md` 從頭做到尾，不要問使用者。**
- 規則：`config/rules.json`（硬性條件不可自行放寬）；使用者資料：`config/profile.json`。
- 抓資料：`docs/endpoints.md`＋`scripts/collect.js`（在 Robin 的 Mac 內建瀏覽器內執行）。
- 驗證：`python3 scripts/kcloth.py build YYYY-MM` 必須 0 error 才能 push。
- 網站：`index.html`＋`assets/app.js`＋`assets/style.css`，純靜態、讀 `data/*.json`，不需要建置。
- repo 是公開的：不要寫入訂單編號、地址、電話等個資。
