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
    fb = r["review_screen"].get("fallback_en")
    if fb:
        # 英文備援：關鍵字轉成單字邊界正規式（'/'開頭），避免 thin 誤中 think
        rx = lambda ws: ["/\\b" + w.replace("-", "\\-") + "\\b" for w in ws]
        base = r["review_screen"]
        cfg["review_screen_en"] = {
            "body_filter": base["body_filter"],
            "negative": {**base["negative"], "keywords": {k2: rx(v) for k2, v in fb["negative"].items()},
                         "negations": fb["negative_negations"]},
            "clingy": {**base["clingy"], "keywords": rx(fb["clingy"]), "negations": fb["clingy_negations"]},
            "thin": {**base["thin"], "keywords": rx(fb["thin"]), "negations": fb["thin_negations"]},
            "size_tendency": {k2: rx(v) for k2, v in fb["size_tendency"].items()},
        }
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
    ref = price.get("twd") or price.get("krw_twd")   # 沒上 Global 時用韓國站換算價判斷預算
    if cat in R["categories"] and ref:
        cap = R["budget_twd"][R["categories"][cat]["budget"]]
        cap_max = round(cap * (1 + R["budget_twd"]["stretch_pct"] / 100))
        over = ref - cap
        it["budget"] = {
            "cap": cap,
            "cap_max": cap_max,
            "over_pct": round(over / cap * 100, 1) if over > 0 else 0,
            "status": "ok" if over <= 0 else ("stretch" if ref <= cap_max else "over"),
            "reason": it.get("budget_reason"),
        }
    sc = it.get("scores", {})
    vals = [sc[a] for a in SCORE_AXES if isinstance(sc.get(a), (int, float))]
    if vals:
        sc["mean"] = round(sum(vals) / len(vals), 2)
    it["alerts"] = alerts_for(it, R) + [a for a in it.get("alerts_manual", [])]
    pen = {int(k): (v.get("penalty") or 0) for k, v in R["selection"]["levels"].items()}
    if isinstance(sc.get("overall"), (int, float)):
        it["rank"] = round(sc["overall"] - sum(pen.get(a["level"], 0) for a in it["alerts"]), 2)
    return it


def _level(value, levels):
    """levels = [[門檻, 等級], ...]（遞增）；回傳 value 超過的最高等級，沒超過回傳 0。"""
    lv = 0
    for th, l in levels:
        if value > th:
            lv = l
    return lv


def alerts_for(it, R):
    """依 rules.json severity 產生分級提醒（1 注意／2 警告／3 嚴重）。每條都寫出程度。"""
    V = R["severity"]
    S = R["review_screen"]
    out = []
    add = lambda lv, code, text: lv and out.append({"level": lv, "code": code, "text": text})
    cat = it.get("cat")
    sc = it.get("screen", {}) or {}
    fetched = sc.get("fetched") or 0
    size = it.get("size", {}) or {}
    body_n = (size.get("reviews_body") or {}).get("n") or 0

    # 評論排雷（多人反應才嚴重）
    neg = V["review_negative"]
    by = sc.get("neg_by") or {}
    hits = sum(by.values()) if by else round((sc.get("neg_pct") or 0) * fetched / 100)
    detail = "、".join(f"{lab} {by.get(k, 0)} 則" for k, lab in (("shrink", "縮水"), ("pilling", "起毛球"), ("neck", "領口鬆垮")) if by.get(k))
    p = sc.get("neg_pct") or 0
    if fetched >= S["negative"]["min_sample"] and p > neg["warn_pct"]:
        severe = p >= neg["severe_pct"] and hits >= neg["severe_min_hits"]
        add(3 if severe else 2, "neg", f"1–3 星負評 {p}%（{fetched} 則中 {hits} 則：{detail or '縮水／起毛球／領口'}）{'，多人反應' if hits >= neg['severe_min_hits'] else ''}")
    pb = sc.get("neg_body_pct") or 0
    if body_n >= S["negative"]["body_min_sample"] and pb > neg["warn_pct"]:
        add(2, "neg_body", f"同身形負評 {pb}%（{body_n} 則同身形）")
    if cat in S["clingy"]["applies_to"]:
        c, cv = sc.get("clingy_pct") or 0, V["review_clingy"]
        if c > cv["warn_pct"]:
            n = round(c * fetched / 100)
            add(3 if c >= cv["severe_pct"] and n >= cv["severe_min_hits"] else 2, "clingy", f"貼身／顯肚評論 {c}%（約 {n} 人提到）")
    if cat in S["thin"]["applies_to"]:
        t, tv = sc.get("thin_pct") or 0, V["review_thin"]
        if t > tv["warn_pct"]:
            n = round(t * fetched / 100)
            add(3 if t >= tv["severe_pct"] and n >= tv["severe_min_hits"] else 2, "thin", f"薄透評論 {t}%（約 {n} 人提到）")
        if sc.get("thickness") in S["thin"]["material_fail"]["두께"]:
            add(tv["material_thin_level"], "thin_label", f"商品標示厚度「{sc['thickness']}」（薄）")
    if fetched < S["negative"]["min_sample"]:
        add(V["sample"]["few_reviews"], "few_reviews", f"評論只有 {fetched} 則，耐穿度判斷信心低")
    if body_n < 10:
        add(V["sample"]["few_body"], "few_body", f"同身形評論只有 {body_n} 則")

    # 預算、溢價
    b = it.get("budget")
    if b and b.get("over_pct"):
        add(_level(b["over_pct"], V["budget"]["levels"]), "budget",
            f"超出預算 {b['over_pct']}%（NT${(it['price'].get('twd') or it['price'].get('krw_twd')):,} ／上限 NT${b['cap']:,}）" + (f"：{it['budget_reason']}" if it.get("budget_reason") else ""))
    if (it.get("price") or {}).get("global_available") is False:
        add(1, "kr_only", "Global 台灣站沒有上架，只能韓國站代購（價格以韓國站換算）")
    pr = (it.get("price") or {}).get("premium_pct")
    if pr is not None:
        add(_level(pr, V["premium"]["levels"]), "premium", f"Global 比韓國站貴 {pr}%")

    # 版型
    fit = it.get("fit", {}) or {}
    bans = V["bans"]
    chart = size.get("chart") or {}
    if fit.get("shoulder_type") == "raglan":
        add(bans["raglan"], "raglan", "連肩袖：肩線沒有支撐，會貼合 44cm 窄肩")
    if cat in TOPS:
        hc = R["fit"].get("hem_cinch")
        gap = round(chart["chest"] - chart["hem"], 1) if chart.get("hem") and chart.get("chest") else None
        if gap is not None and hc and gap > hc["max_gap_cm"]:
            add(3 if gap >= bans["hem_cinch_severe_gap"] else bans["ribbed_hem"], "hem", f"下擺收口：下擺 {chart['hem']}cm 比胸寬 {chart['chest']}cm 窄 {gap}cm")
        elif fit.get("hem") == "ribbed":
            add(bans["ribbed_hem"], "hem", "羅紋收口下擺（照片判斷）")
    if cat == "pants" and fit.get("leg") in ("slim", "skinny", "slim-tapered"):
        add(bans["slim_tapered"], "slim", "Slim／Skinny 褲型：小腿收太緊")
    if cat == "pants" and chart.get("rise") is not None and chart["rise"] < 28:
        add(3 if chart["rise"] < bans["low_rise_severe_cm"] else bans["low_rise"], "low_rise", f"前襠 {chart['rise']}cm 偏低（< 28），肚子會壓在褲頭上")
    if cat == "outer" and fit.get("zip") is True and fit.get("two_way_zip") is False:
        add(bans["one_way_zip"], "zip", "單向拉鍊（無法做倒 V）")
    labels = {"shoulder": "肩寬", "chest": "胸寬", "length": "褲長" if cat == "pants" else "衣長", "rise": "前襠", "thigh": "大腿", "leg_opening": "褲腳", "waist": "腰"}
    if not chart:
        add(1, "no_chart", "尺寸表沒有實測數字，尺寸以同身形評論判斷")
    for k, rg in R["fit"]["ranges"].get(cat, {}).items():
        v = chart.get(k)
        if v is None and k == "leg_opening":
            v = chart.get("hem")
        if v is None:
            continue
        dev = round(rg[0] - v if v < rg[0] else v - rg[1], 1)
        if dev > 0:
            add(_level(dev - 0.001, V["fit_range"]["levels"]) or 1, f"fit_{k}",
                f"{labels.get(k, k)} {v}cm {'少' if v < rg[0] else '多'} {dev}cm（規則 {rg[0]}–{rg[1]}）")
    return out


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
    # 分級提醒（derive_item 已算好）：第 3 級不能留在 items；第 2 級必須在 comment 或 fit.note 交代
    fit = it.get("fit", {}) or {}
    for a in it.get("alerts", []):
        if a["level"] >= 3:
            rep.err(where, f"嚴重：{a['text']} → 移到 excluded")
        elif a["level"] == 2:
            rep.warn(where, f"警告：{a['text']}")
    if any(a["level"] == 2 for a in it.get("alerts", [])) and not (fit.get("note") or it.get("comment")):
        rep.err(where, "有警告級提醒，comment 或 fit.note 要說明")
    b = it.get("budget")
    if b and b.get("over_pct") and not (it.get("budget_reason") or "").strip():
        rep.warn(where, f"超出預算 {b['over_pct']}%，建議寫 budget_reason（加價理由）")
    size = it.get("size", {})
    if cat in TOPS | {"outer"} and size.get("pick") not in (None, "L", "2", "100") and not fit.get("note"):
        rep.warn(where, f"上衣基準是 L，推薦 {size.get('pick')} 需在 fit.note 說明")

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
    BR = R.get("brands", {})
    for key, conf in (("brands", BR.get("material_top")), ("brands_premium", BR.get("premium_top"))):
        lst = month.get(key, [])
        want = (conf or {}).get("count", 20)
        if len(lst) != want:
            rep.warn(key, f"品牌 {len(lst)} 個，目標是 {want}")
        w = (conf or {}).get("weights")
        for i, b in enumerate(lst):
            where = f"{key}[{i}] {b.get('name', '?')}"
            for k in ["name", "strengths", "features", "for_robin"]:
                if not b.get(k):
                    rep.err(where, f"缺 {k}")
            sc = b.get("scores") or {}
            if w:
                miss = [a for a in SCORE_AXES if not isinstance(sc.get(a), (int, float))]
                if miss:
                    rep.err(where, f"品牌五項指標缺 {miss}")
                else:
                    sc["weighted"] = round(sum(sc[a] * w.get(a, 0) for a in SCORE_AXES), 2)
                    if not isinstance(sc.get("overall"), (int, float)):
                        sc["overall"] = round(sc["weighted"] * 2) / 2
        if w and lst and all(isinstance((b.get("scores") or {}).get("weighted"), (int, float)) for b in lst):
            lst.sort(key=lambda b: (-b["scores"]["weighted"], -b["scores"]["material"]))
            for i, b in enumerate(lst):
                b["rank"] = i + 1
    items = month.get("items", [])
    if len(items) > R.get("selection", {}).get("max_items", 100):
        rep.err("items", f"{len(items)} 件超過上限 {R['selection']['max_items']}")
    ids = [it.get("id") for it in items]
    dup = {x for x in ids if ids.count(x) > 1}
    if dup:
        rep.err("items", f"重複 id {sorted(dup)}")
    for i, it in enumerate(items):
        derive_item(it, month, R)
        check_item(it, i, month, R, rep)
    items.sort(key=lambda it: (-(it.get("rank") or 0), -((it.get("scores") or {}).get("mean") or 0)))
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
