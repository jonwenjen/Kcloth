#!/usr/bin/env python3
"""KCLOTH 每月流程工具（只用標準函式庫）。

  python3 scripts/kcloth.py bundle             產生 .cache/collect.bundle.js（瀏覽器抓取器＋規則）
  python3 scripts/kcloth.py validate 2026-11   檢查月報（硬性規則、預算、排雷、溢價）
  python3 scripts/kcloth.py build 2026-11      檢查通過後寫出 data/latest.json 與 data/months/index.json
  python3 scripts/kcloth.py wardrobe           依購買紀錄＋清單列出膠囊衣櫥各格的缺口
  python3 scripts/kcloth.py check              檢查 orders.json、wishlist.json、latest.json

錯誤（ERROR）會讓 build 失敗；警告（WARN）會列出但不擋，必須在月報裡說明理由。
"""
import json
import pathlib
import sys
from datetime import date, datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config"
DATA = ROOT / "data"
MONTHS = DATA / "months"
CACHE = ROOT / ".cache"

TOPS = {"tee", "knit", "shirt"}
CATS = {"tee", "knit", "shirt", "outer", "pants"}
SCORE_AXES = ["material", "fit", "make", "care", "function"]


def load(path):
    return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))


def dump(path, obj):
    pathlib.Path(path).parent.mkdir(parents=True, exist_ok=True)
    pathlib.Path(path).write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def rules():
    return load(CONFIG / "rules.json")


class Report:
    def __init__(self):
        self.errors, self.warns = [], []

    def err(self, where, msg):
        self.errors.append(f"ERROR {where}: {msg}")

    def warn(self, where, msg):
        self.warns.append(f"WARN  {where}: {msg}")

    def show(self):
        for line in self.errors + self.warns:
            print(line)
        print(f"-- {len(self.errors)} error(s), {len(self.warns)} warning(s)")
        return not self.errors


# ---------------------------------------------------------------- bundle

def cmd_bundle():
    r = rules()
    src = (ROOT / "scripts" / "collect.js").read_text(encoding="utf-8")
    cfg = {"review_screen": r["review_screen"], "fit": r["fit"]}
    out = src + "\nKC.init(" + json.dumps(cfg, ensure_ascii=False) + ");\n"
    CACHE.mkdir(exist_ok=True)
    path = CACHE / "collect.bundle.js"
    path.write_text(out, encoding="utf-8")
    print(path)


# ---------------------------------------------------------------- derive

def derive_item(it, month, R):
    """Fill computed fields: KRW→TWD, premium %, budget status, score mean."""
    price = it.setdefault("price", {})
    fx = month.get("fx", {}).get("twd_per_krw")
    krw = price.get("krw")
    if fx and krw:
        price["krw_twd"] = round(krw * fx)
        if price.get("twd"):
            price["premium_pct"] = round((price["twd"] / (krw * fx) - 1) * 100, 1)
            price["premium_flag"] = price["premium_pct"] >= R["premium"]["warn_pct"]
    cat = it.get("cat")
    if cat in R["categories"] and price.get("twd"):
        cap = R["budget_twd"][R["categories"][cat]["budget"]]
        cap_max = round(cap * (1 + R["budget_twd"]["stretch_pct"] / 100))
        over = price["twd"] - cap
        it["budget"] = {
            "cap": cap,
            "cap_max": cap_max,
            "over_pct": round(over / cap * 100, 1) if over > 0 else 0,
            "status": "ok" if over <= 0 else ("stretch" if price["twd"] <= cap_max else "over"),
            "reason": it.get("budget_reason"),
        }
    sc = it.get("scores", {})
    vals = [sc[a] for a in SCORE_AXES if isinstance(sc.get(a), (int, float))]
    if vals:
        sc["mean"] = round(sum(vals) / len(vals), 2)
    return it


# ---------------------------------------------------------------- validate

def in_range(v, rng):
    return v is None or rng[0] <= v <= rng[1]


def check_item(it, idx, month, R, rep):
    where = f"items[{idx}] {it.get('id', '?')} {it.get('brand', '')} {it.get('name', '')}"[:90]
    for key in ["id", "goodsNo", "cat", "slot", "brand", "name", "color", "urls", "price", "size",
                "screen", "scores", "experts", "comment", "styling", "temps", "role", "fit"]:
        if key not in it or it[key] in (None, "", {}, []):
            rep.err(where, f"缺少欄位 {key}")
    cat = it.get("cat")
    if cat not in CATS:
        rep.err(where, f"cat 必須是 {sorted(CATS)}")
        return
    slots = {s["id"] for s in R["capsule_slots"]}
    if it.get("slot") and it["slot"] not in slots:
        rep.err(where, f"slot {it['slot']} 不在 rules.json capsule_slots")
    urls = it.get("urls", {})
    if not urls.get("global") and not urls.get("kr"):
        rep.err(where, "沒有商品網址")

    # 價格、預算、溢價
    price = it.get("price", {})
    if not price.get("twd") and not price.get("krw"):
        rep.err(where, "沒有任何價格")
    if price.get("twd") and not price.get("krw"):
        rep.warn(where, "缺韓國站價格，無法計算溢價")
    b = it.get("budget")
    if b:
        if b["status"] == "over":
            rep.err(where, f"NT${price['twd']} 超過上限 {b['cap']} 的 150%（{b['cap_max']}）")
        elif b["status"] == "stretch" and not (it.get("budget_reason") or "").strip():
            rep.err(where, f"超出預算 {b['over_pct']}%，必須寫 budget_reason（加價理由）")
    if price.get("premium_flag"):
        rep.warn(where, f"Global 溢價 {price['premium_pct']}% ≥ {R['premium']['warn_pct']}%（網站會標紅）")

    # 排雷
    S = R["review_screen"]
    sc = it.get("screen", {})
    fetched = sc.get("fetched") or 0
    body_n = (it.get("size", {}).get("reviews_body") or {}).get("n") or 0
    neg_max = S["negative"]["max_pct"]
    if fetched >= S["negative"]["min_sample"] and (sc.get("neg_pct") or 0) > neg_max:
        rep.err(where, f"負評排雷 {sc['neg_pct']}% > {neg_max}% → 移到 excluded")
    if body_n >= S["negative"]["body_min_sample"] and (sc.get("neg_body_pct") or 0) > neg_max:
        rep.err(where, f"體型樣本負評 {sc['neg_body_pct']}% > {neg_max}% → 移到 excluded")
    if cat in S["clingy"]["applies_to"] and (sc.get("clingy_pct") or 0) > S["clingy"]["max_pct"]:
        rep.err(where, f"貼身顯肚 {sc['clingy_pct']}% > {S['clingy']['max_pct']}% → 移到 excluded")
    if cat in S["thin"]["applies_to"] and (sc.get("thin_pct") or 0) > S["thin"]["max_pct"]:
        rep.err(where, f"薄透 {sc['thin_pct']}% > {S['thin']['max_pct']}% → 移到 excluded")
    if cat in S["thin"]["applies_to"] and sc.get("thickness") in S["thin"]["material_fail"]["두께"]:
        rep.err(where, f"商品標示두께={sc['thickness']}（薄）→ 移到 excluded")
    if fetched < S["negative"]["min_sample"]:
        rep.warn(where, f"評論只抓到 {fetched} 則，耐穿度判斷信心低")
    if body_n < 10:
        rep.warn(where, f"同身形評論只有 {body_n} 則")

    # 版型
    fit = it.get("fit", {})
    if fit.get("shoulder_type") == "raglan":
        rep.err(where, "連肩袖 Raglan 禁用")
    if cat in TOPS and fit.get("hem") == "ribbed":
        rep.err(where, "上衣下擺緊羅紋收口禁用")
    if cat == "pants" and fit.get("leg") in ("slim", "skinny", "slim-tapered"):
        rep.err(where, "Slim／Skinny 褲型禁用")
    if cat == "outer" and fit.get("zip") is True and fit.get("two_way_zip") is False:
        rep.err(where, "拉鍊外套必須是雙向拉鍊")
    size = it.get("size", {})
    if cat in TOPS | {"outer"} and size.get("pick") not in (None, "L", "2", "100") and not fit.get("note"):
        rep.warn(where, f"上衣基準是 L，推薦 {size.get('pick')} 需在 fit.note 說明")
    rng = R["fit"]["ranges"].get(cat, {})
    chart = size.get("chart") or {}
    for k, r in rng.items():
        v = chart.get(k)
        if v is None and k == "leg_opening":
            v = chart.get("hem")
        if v is None:
            if cat == "pants" and k in ("rise", "leg_opening"):
                rep.warn(where, f"尺寸表缺 {k}，請在 fit.note 估計")
            continue
        if not in_range(v, r):
            msg = f"{k} {v}cm 不在 {r[0]}–{r[1]}cm"
            if fit.get("note"):
                rep.warn(where, msg + "（已有 fit.note 說明）")
            else:
                rep.warn(where, msg + "，請在 fit.note 說明為何仍推薦")
    if cat == "pants" and chart.get("rise") is not None and chart["rise"] < 28:
        rep.err(where, f"前襠 {chart['rise']}cm < 28cm 低腰禁用")

    # 評分
    scores = it.get("scores", {})
    for a in SCORE_AXES + ["overall"]:
        v = scores.get(a)
        if not isinstance(v, (int, float)) or not 1 <= v <= 5:
            rep.err(where, f"scores.{a} 必須是 1–5")
    if scores.get("mean") and isinstance(scores.get("overall"), (int, float)) and abs(scores["overall"] - scores["mean"]) > 0.75:
        rep.warn(where, f"綜合 {scores['overall']} 與五項平均 {scores['mean']} 相差 > 0.75，comment 需說明")
    for a in SCORE_AXES:
        if not (it.get("experts", {}).get(a) or "").strip():
            rep.err(where, f"experts.{a} 缺專家評語")
    temps = it.get("temps")
    if not (isinstance(temps, list) and len(temps) == 2 and temps[0] < temps[1]):
        rep.err(where, "temps 必須是 [低溫, 高溫]")


def validate_month(month, R, rep):
    for key in ["month", "run", "fx", "sales", "trends", "brands", "items", "excluded", "outfits", "wardrobe", "self_review"]:
        if key not in month:
            rep.err("month", f"缺少 {key}")
    if not month.get("fx", {}).get("twd_per_krw"):
        rep.err("fx", "缺 twd_per_krw 匯率")
    brands = month.get("brands", [])
    if len(brands) != 20:
        rep.warn("brands", f"品牌 {len(brands)} 個，目標是 20")
    for i, b in enumerate(brands):
        for key in ["name", "strengths", "features", "for_robin"]:
            if not b.get(key):
                rep.err(f"brands[{i}] {b.get('name', '?')}", f"缺 {key}")
    items = month.get("items", [])
    ids = [it.get("id") for it in items]
    dup = {x for x in ids if ids.count(x) > 1}
    if dup:
        rep.err("items", f"重複 id {sorted(dup)}")
    for i, it in enumerate(items):
        derive_item(it, month, R)
        check_item(it, i, month, R, rep)
    for i, ex in enumerate(month.get("excluded", [])):
        if not ex.get("reasons"):
            rep.err(f"excluded[{i}]", "缺剔除理由")
    refs = set(ids) | order_refs()
    for i, o in enumerate(month.get("outfits", [])):
        for ref in o.get("items", []):
            if ref not in refs:
                rep.err(f"outfits[{i}] {o.get('title', '')}", f"找不到單品 {ref}")
        bands = {b["id"] for b in R["temp_bands"]}
        if o.get("band") not in bands:
            rep.err(f"outfits[{i}]", f"band 必須是 {sorted(bands)}")
    for s in month.get("sales", []):
        if s.get("status") not in ("live", "upcoming", "expected", "ended"):
            rep.err(f"sales {s.get('name')}", "status 必須是 live/upcoming/expected/ended")


def order_refs():
    p = DATA / "orders.json"
    if not p.exists():
        return set()
    return {it["ref"] for o in load(p).get("orders", []) for it in o.get("items", [])}


def check_orders(R, rep):
    p = DATA / "orders.json"
    if not p.exists():
        rep.warn("orders", "沒有 data/orders.json")
        return
    od = load(p)
    seen = set()
    slots = {s["id"] for s in R["capsule_slots"]}
    for o in od.get("orders", []):
        for it in o.get("items", []):
            where = f"orders {it.get('ref')}"
            if it.get("ref") in seen:
                rep.err(where, "ref 重複")
            seen.add(it.get("ref"))
            for key in ["ref", "brand", "name", "size", "twd", "cat", "status"]:
                if it.get(key) in (None, ""):
                    rep.err(where, f"缺 {key}")
            if it.get("cat") not in CATS:
                rep.err(where, f"cat 必須是 {sorted(CATS)}")
            if it.get("slot") and it["slot"] not in slots:
                rep.err(where, f"slot {it['slot']} 不存在")


def check_wishlist(rep):
    p = DATA / "wishlist.json"
    if not p.exists():
        rep.warn("wishlist", "沒有 data/wishlist.json")
        return
    wl = load(p)
    for i, it in enumerate(wl.get("items", [])):
        if not it.get("id") or not it.get("name"):
            rep.err(f"wishlist[{i}]", "需要 id 與 name")


def month_path(m):
    try:
        datetime.strptime(m, "%Y-%m")
    except ValueError:
        sys.exit(f"月份格式應為 YYYY-MM，收到 {m!r}")
    return MONTHS / f"{m}.json"


def cmd_validate(m, write=False):
    R = rules()
    path = month_path(m)
    if not path.exists():
        sys.exit(f"找不到 {path}")
    month = load(path)
    rep = Report()
    validate_month(month, R, rep)
    check_orders(R, rep)
    check_wishlist(rep)
    ok = rep.show()
    if write and ok:
        month["built_at"] = datetime.now().isoformat(timespec="seconds")
        month["rules_version"] = R["version"]
        dump(path, month)
        dump(DATA / "latest.json", month)
        months = sorted(p.stem for p in MONTHS.glob("????-??.json"))
        dump(MONTHS / "index.json", {"months": months, "latest": m})
        print(f"wrote data/latest.json ({len(month['items'])} items) and data/months/index.json")
    return ok


def cmd_check():
    R = rules()
    rep = Report()
    check_orders(R, rep)
    check_wishlist(rep)
    latest = DATA / "latest.json"
    if latest.exists():
        month = load(latest)
        if month.get("items") is not None and month.get("month"):
            validate_month(month, R, rep)
    return rep.show()


def cmd_wardrobe():
    R = rules()
    owned, wish = {}, {}
    if (DATA / "orders.json").exists():
        for o in load(DATA / "orders.json").get("orders", []):
            for it in o.get("items", []):
                if it.get("status") in ("returned", "cancelled"):
                    continue
                if (it.get("audit") or {}).get("verdict") == "return":
                    continue
                owned.setdefault(it.get("slot"), []).append(it["name"])
    if (DATA / "wishlist.json").exists():
        for it in load(DATA / "wishlist.json").get("items", []):
            wish.setdefault(it.get("slot"), []).append(it["name"])
    print(f"{'slot':18} {'目標':>4} {'已有':>4} {'清單':>4} {'缺':>3}  說明")
    for s in R["capsule_slots"]:
        have, plan = len(owned.get(s["id"], [])), len(wish.get(s["id"], []))
        gap = max(0, s["target"] - have - plan)
        print(f"{s['id']:18} {s['target']:>4} {have:>4} {plan:>4} {gap:>3}  {s['label']}")
    other = [n for k, v in owned.items() if k not in {s['id'] for s in R['capsule_slots']} for n in v]
    if other:
        print("未分類已購：", "、".join(other))


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 1
    cmd = argv[1]
    if cmd == "bundle":
        cmd_bundle()
        return 0
    if cmd in ("validate", "build"):
        if len(argv) < 3:
            sys.exit(f"用法：kcloth.py {cmd} YYYY-MM")
        return 0 if cmd_validate(argv[2], write=(cmd == "build")) else 1
    if cmd == "check":
        return 0 if cmd_check() else 1
    if cmd == "wardrobe":
        cmd_wardrobe()
        return 0
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
