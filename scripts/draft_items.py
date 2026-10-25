#!/usr/bin/env python3
"""把瀏覽器抓回來的原始資料（data/raw/YYYY-MM.json）轉成月報 items 草稿。

  python3 scripts/draft_items.py data/raw/2026-10.json > /tmp/items.json

做的事（全部可重現，數字都來自原始資料）：
  - 依 Robin 的尺寸規則替每件挑「最接近」的尺寸（chart_pick），再對照同身形評論給最終建議
  - 五位專家分數：材質（成分／厚度／磅數）、版型（離規則幾 cm、禁令）、車工（滿意度＋評論量）、
    保養（1–3 星縮水／起毛球／領口比例、洗滌方式）、機能（高雄氣候、彈性、雙向拉鍊）
  - overall = 加權平均（版型 30%、材質 25%、保養 20%、車工 15%、機能 10%），四捨五入到 0.5
  - 每軸一句依數據產生的專家評語；comment／styling 為模板，入選的重點單品再由 Claude 人工改寫
分級提醒（alerts）不在這裡算，由 kcloth.py build 依 rules.json severity 統一計算。
"""
import json
import math
import re
import sys

RANGES = {
    "tee": {"shoulder": [48, 51], "chest": [57, 60], "length": [68, 71]},
    "knit": {"shoulder": [48, 51], "chest": [57, 60], "length": [68, 71]},
    "shirt": {"shoulder": [48, 51], "chest": [57, 61], "length": [68, 74]},
    "outer": {"shoulder": [47, 51], "chest": [57, 62]},
    "pants": {"rise": [30, 32], "thigh": [34, 35.5], "hem": [21, 23], "length": [99, 103]},
}
COLORS = [  # (關鍵字, 中文, hex, tone)
    ("차콜", "炭灰", "#45474b", "dark"), ("charcoal", "炭灰", "#45474b", "dark"),
    ("다크 그레이", "深灰", "#55585c", "dark"), ("dark gray", "深灰", "#55585c", "dark"), ("dark grey", "深灰", "#55585c", "dark"),
    ("멜란지", "麻花灰", "#9a9ca0", "mid"), ("미디엄 그레이", "中灰", "#8a8d91", "mid"), ("라이트 그레이", "淺灰", "#c4c6c9", "light"),
    ("그레이", "灰", "#9a9ca0", "mid"), ("grey", "灰", "#9a9ca0", "mid"), ("gray", "灰", "#9a9ca0", "mid"),
    ("블랙", "黑", "#1e1f21", "dark"), ("black", "黑", "#1e1f21", "dark"),
    ("네이비", "深藍", "#2b3446", "dark"), ("navy", "深藍", "#2b3446", "dark"), ("다크 인디고", "深靛藍", "#27324a", "dark"),
    ("인디고", "靛藍", "#34416a", "dark"), ("indigo", "靛藍", "#34416a", "dark"), ("흑청", "黑藍丹寧", "#2a2f3a", "dark"), ("진청", "深藍丹寧", "#33405e", "dark"),
    ("스카이 블루", "天空藍", "#a9c6e3", "light"), ("sky blue", "天空藍", "#a9c6e3", "light"), ("아이스 블루", "冰川藍", "#bcd4e8", "light"), ("ice blue", "冰川藍", "#bcd4e8", "light"),
    ("연청", "淺藍丹寧", "#8fa9c9", "light"), ("블루", "藍", "#6f8fbf", "mid"), ("blue", "藍", "#6f8fbf", "mid"),
    ("올리브", "橄欖綠", "#5d6045", "mid"), ("olive", "橄欖綠", "#5d6045", "mid"), ("카키", "卡其綠", "#6b6a4a", "mid"), ("khaki", "卡其綠", "#6b6a4a", "mid"),
    ("세이지", "鼠尾草綠", "#7d8b78", "mid"), ("그린", "綠", "#4f6b5d", "mid"), ("green", "綠", "#4f6b5d", "mid"), ("포레스트", "森林綠", "#3b4a3f", "dark"),
    ("오트밀", "燕麥", "#d8cdb8", "light"), ("oatmeal", "燕麥", "#d8cdb8", "light"), ("베이지", "米色", "#d6c9b0", "light"), ("beige", "米色", "#d6c9b0", "light"),
    ("크림", "奶油白", "#efe7d6", "light"), ("cream", "奶油白", "#efe7d6", "light"), ("아이보리", "象牙白", "#f1ece0", "light"), ("ivory", "象牙白", "#f1ece0", "light"),
    ("화이트", "白", "#f5f5f2", "light"), ("white", "白", "#f5f5f2", "light"),
    ("브라운", "咖啡", "#6b4f3a", "dark"), ("brown", "咖啡", "#6b4f3a", "dark"), ("모카", "摩卡", "#7a5e48", "mid"), ("카멜", "駝色", "#a57a4f", "mid"),
    ("버건디", "酒紅", "#5e2630", "dark"), ("레드", "紅", "#a33a35", "mid"), ("rigid", "原色丹寧", "#2b3446", "dark"),
]
SLOT_TEMPS = {
    "inner-dark-tee": [16, 30], "white-tee": [14, 34], "single-top": [20, 32], "light-overshirt": [20, 30],
    "structured-knit": [12, 22], "zip-jacket": [14, 22], "short-jacket": [15, 24], "tailored-jacket": [14, 26],
    "winter-coat": [6, 16], "tuck-slacks": [12, 30], "denim": [10, 28], "chino": [14, 30],
}
LAB = {"shoulder": "肩", "chest": "胸", "length": "衣長", "rise": "前襠", "thigh": "大腿", "hem": "褲腳", "waist": "腰"}


def r05(x):
    return max(1.0, min(5.0, round(x * 2) / 2))


def color_of(name):
    low = name.lower()
    m = re.findall(r"\[([^\]]+)\]|\(([^)]+)\)", name)
    seg = " ".join(a or b for a, b in m).lower() or low
    for src in (seg, low):
        for kw, zh, hx, tone in COLORS:
            if kw in src:
                return zh, hx, tone
    return "見商品頁", "#9a9ca0", "mid"


def slot_of(p, tone):
    n = p["name"].lower()
    cat = p["cat"]
    if p.get("slot"):
        s = p["slot"]
        if s == "white-tee" and tone != "light":
            return "inner-dark-tee"
        if s == "inner-dark-tee" and tone == "light":
            return "white-tee"
        return s
    if cat == "tee":
        if re.search(r"피케|폴로|polo|pique|카라", n):
            return "single-top"
        return "white-tee" if tone == "light" else ("inner-dark-tee" if tone == "dark" else "single-top")
    if cat == "knit":
        return "single-top" if re.search(r"폴로|polo|카라", n) else "structured-knit"
    if cat == "shirt":
        return "light-overshirt" if tone == "light" or re.search(r"옥스|oxford|셔츠 자켓|오버셔츠", n) else "single-top"
    if cat == "outer":
        if re.search(r"블레이저|blazer|수트|셋업|setup|테일러|컴포트 자켓|notched", n):
            return "tailored-jacket"
        if re.search(r"코트|coat|다운|패딩|파카|parka|puffer|down", n):
            return "winter-coat"
        if re.search(r"데님|denim|트러커|trucker|워크|work|초어|chore|커버올", n):
            return "short-jacket"
        return "zip-jacket"
    if cat == "pants":
        if re.search(r"데님|denim|진\b|jean|501|505", n):
            return "denim"
        if re.search(r"슬랙스|slacks|트라우저|trouser", n):
            return "tuck-slacks"
        return "chino"
    return "single-top"


def role_of(slot, cat):
    return {"inner-dark-tee": "inner", "white-tee": "inner", "single-top": "single", "structured-knit": "single"}.get(slot) or ("bottom" if cat == "pants" else "outer")


def fabric_score(p):
    f = (p.get("fabric") or "").lower()
    name = p["name"].lower()
    mat = p.get("mat") or {}
    def pc(*keys):
        best = 0
        for k in keys:
            for m in re.finditer(k + r"[^\d%]{0,12}(\d{1,3})\s*%", f):
                best = max(best, int(m.group(1)))
            for m in re.finditer(r"(\d{1,3})\s*%?\s*" + k, f):
                best = max(best, int(m.group(1)))
        return best
    notes = []
    s = 3.0
    cash, wool = pc("캐시미어", "cashmere"), pc("울", "모", "wool", "메리노", "merino")
    cot, lin = pc("면", "코튼", "cotton"), pc("린넨", "마", "linen")
    poly, acr = pc("폴리에스터", "폴리", "polyester", "poly"), pc("아크릴", "acryl")
    ray, nyl = pc("레이온", "rayon", "비스코스", "viscose", "모달", "modal"), pc("나일론", "nylon")
    pu = "폴리우레탄 100" in f or re.search(r"\bpu\b", f) or "비건" in name or "faux" in name
    if cash >= 10:
        s = 4.5 + (0.5 if cash >= 50 else 0); notes.append(f"喀什米爾 {cash}%")
    elif wool >= 50:
        s = 4.5; notes.append(f"羊毛 {wool}%")
    elif cot >= 95:
        s = 4.0; notes.append(f"純棉 {cot}%")
    elif lin >= 50:
        s = 4.0; notes.append(f"亞麻 {lin}%")
    elif wool >= 20:
        s = 3.5; notes.append(f"羊毛混紡 {wool}%")
    elif cot >= 60:
        s = 3.5; notes.append(f"棉 {cot}% 混紡")
    elif acr >= 40:
        s = 2.5; notes.append(f"壓克力 {acr}%（易起毛球）")
    elif poly >= 50 or ray >= 30:
        s = 3.0; notes.append("聚酯／嫘縈混紡" + ("（彈性抗皺）" if pc("폴리우레탄", "spandex", "스판") else ""))
    elif nyl >= 50:
        s = 3.5; notes.append(f"尼龍 {nyl}%（機能）")
    elif pu:
        s = 2.5; notes.append("合成皮")
    elif "가죽" in f or "leather" in f or "cowhide" in f:
        s = 4.5; notes.append("真皮")
    else:
        notes.append("成分見商品頁")
    thick = mat.get("두께", "")
    if "두꺼움" in thick:
        s += 0.5; notes.append("標示厚")
    elif thick == "얇음":
        s -= 0.5; notes.append("標示薄")
    if re.search(r"헤비|heavy|\d+(\.\d)?\s*oz|10수|12수|14수|밀라노|milano|인터록|interlock|와플|waffle|헤링본|트윌|twill", name):
        s += 0.5; notes.append("重磅／立體組織")
    if re.search(r"셀비지|셀비|selvage|selvedge|cone mill", name):
        s += 0.5; notes.append("赤耳布")
    origin = (p.get("origin") or "").lower()
    if any(k in origin for k in ("대한민국", "한국", "korea", "일본", "japan", "italy", "이탈리아", "usa", "미국", "portugal")):
        s += 0.25; notes.append("產地 " + p["origin"][:10])
    return r05(s), "、".join(notes)


def pick_size(p):
    rg = RANGES[p["cat"]]
    band = bool(re.search(r"밴딩|banding|이지", p["name"].lower()))
    best = None
    for sz, row in (p.get("chart") or {}).items():
        if not row:
            continue
        dev, mx, n, parts = 0.0, 0.0, 0, []
        loose = p["cat"] in ("shirt", "outer")
        for k, (a, b) in rg.items():
            v = row.get(k)
            if v is None:
                continue
            n += 1
            d = a - v if v < a else (v - b if v > b else 0)
            # 權重：胸寬不足最傷（藏肚架空層）、肩寬不足次之；襯衫／外套衣長影響小
            w = 2 if (k == "chest" and v < a) else 1.5 if (k == "shoulder" and v < a) else 0.5 if (k == "length" and loose) else 1
            dev += d * w; mx = max(mx, d)
            if d:
                parts.append(f"{LAB[k]} {v}（{'少' if v < a else '多'} {round(d, 1)}）")
        if p["cat"] == "pants" and row.get("waist"):
            lo, hi = (42, 46) if band else (43.5, 46.5)
            d = lo - row["waist"] if row["waist"] < lo else (row["waist"] - hi if row["waist"] > hi else 0)
            dev += d * 3; mx = max(mx, d); n += 1
            if d:
                parts.append(f"腰 {row['waist']}（{'小' if row['waist'] < lo else '大'} {round(d, 1)}）")
        if not n:
            continue
        # 同樣都在範圍內時，選最接近範圍中點的尺寸（避免外套範圍寬而一律挑到最小號）
        cd = sum(abs(row[k] - (a + b) / 2) for k, (a, b) in rg.items() if row.get(k) is not None)
        if p["cat"] == "pants" and row.get("waist"):
            cd += abs(row["waist"] - (43.5 if band else 44.5)) * 1.5
        key = (round(dev, 1), round(cd, 2))
        cand = (key, sz, row, round(dev, 1), round(mx, 1), parts)
        p.setdefault("_cands", {})[sz] = cand
        if best is None or key < best[0]:
            best = cand
    return best


def fit_text(pick, chart, fit_notes, best):
    lab = dict(LAB, leg_opening="褲腳")
    if chart:
        nums = "、".join(f"{lab.get(k, k)} {v}" for k, v in chart.items() if k in ("shoulder", "chest", "length", "rise", "thigh", "leg_opening"))
        head = f"{pick} 號：{nums}。"
    else:
        head = "尺寸表未提供數字，版型以同身形評論判斷。"
    if fit_notes:
        return head + "；".join(fit_notes)
    if best and best[5]:
        return head + "超出規則：" + "、".join(best[5])
    return head + "各項都在規則內。"


def norm_size_label(s):
    m = re.match(r"^\s*(\d)\s*\((XS|S|M|L|XL|XXL|2XL)\)", s)
    return m.group(2) if m else s.split("(")[0].strip()


def draft(raw, fx):
    items = []
    for no, p in raw.items():
        sr = p.get("sr") or {}
        if sr.get("err") or not sr.get("fetched"):
            continue
        cat = p["cat"]
        name = p["name"]
        zh_color, hx, tone = color_of(name)
        slot = slot_of(p, tone)
        role = role_of(slot, cat)
        low = name.lower()
        flags = sr.get("warn") or []
        best = pick_size(p) if p.get("chart") else None
        body = sr.get("body") or {}
        bdist = {k: v for k, v in sorted((body.get("dist") or {}).items(), key=lambda kv: -kv[1])}
        bn = body.get("n") or 0

        # 尺寸：尺寸表 vs 同身形
        if best:
            chart_pick = best[1]
            chart = {("leg_opening" if (k == "hem" and cat == "pants") else k): v for k, v in best[2].items() if k in ("shoulder", "chest", "length", "hem", "rise", "thigh", "waist")}
            chart_why = "最接近規則的尺寸" + ("；" + "、".join(best[5]) if best[5] else "，各項都在範圍內")
        else:
            chart_pick, chart, chart_why = None, {}, "尺寸表未提供數字"
        top_b = next(iter(bdist), None)
        pick = chart_pick or top_b or ("L" if cat != "pants" else "33")
        why = ""
        # 同身形多數（≥ 50%）選的尺寸若也在規則內（偏差 ≤ 1.5），改採評論的尺寸
        if best and top_b and bn >= 8 and bdist[top_b] / bn >= 0.5:
            alt = next((c for k2, c in (p.get("_cands") or {}).items() if norm_size_label(k2).upper() == norm_size_label(top_b).upper()), None)
            if alt and alt[1] != chart_pick and alt[3] <= 1.5:
                best = alt
                chart = {("leg_opening" if (k == "hem" and cat == "pants") else k): v for k, v in alt[2].items() if k in ("shoulder", "chest", "length", "hem", "rise", "thigh", "waist")}
                why = f"尺寸表最接近的是 {chart_pick}，但同身形 {bdist[top_b]}/{bn} 人選 {top_b}，而且 {alt[1]} 也在規則範圍內（偏差 {alt[3]}cm），採用評論的 {alt[1]}"
                chart_why = f"{chart_pick} 最接近規則；{alt[1]}：" + ("、".join(alt[5]) if alt[5] else "各項都在範圍內")
                pick = alt[1]
        if why:
            pass
        elif chart_pick and top_b and bn >= 8:
            share = bdist[top_b] / bn
            lab_c, lab_b = norm_size_label(chart_pick), norm_size_label(top_b)
            if lab_c.upper() == lab_b.upper():
                why = f"尺寸表與同身形評論一致（{bdist[top_b]}/{bn} 人選 {top_b}）"
            elif share >= 0.6:
                why = f"尺寸表指向 {chart_pick}，但同身形 {bdist[top_b]}/{bn} 人選 {top_b}；以尺寸表為準，想穿寬鬆可改 {top_b}"
            else:
                why = f"尺寸表選 {chart_pick}；同身形最多人選 {top_b}（{bdist[top_b]}/{bn}）"
        elif chart_pick:
            why = f"依尺寸表選 {chart_pick}（同身形評論 {bn} 則，樣本少）"
        else:
            why = f"沒有尺寸表，依同身形評論最多人選的 {top_b}（{bdist.get(top_b, 0)}/{bn}）" if top_b else "沒有尺寸表也沒有同身形評論，請看商品頁尺寸"
        tend_raw = body.get("tendency") or {}
        tend = "偏大" if tend_raw.get("big", 0) > max(1, tend_raw.get("small", 0)) else ("偏小" if tend_raw.get("small", 0) > max(1, tend_raw.get("big", 0)) else "正常")

        # 專家分數
        m_s, m_note = fabric_score(p)
        dev = best[3] if best else None
        mxd = best[4] if best else None
        f_s = 3.0 if dev is None else (5 if dev == 0 else 4.5 if dev <= 1 else 4 if dev <= 2.5 else 3.5 if dev <= 5 else 3 if dev <= 8 else 2.5)
        if mxd is not None and mxd > 4:
            f_s = min(f_s, 3.5 if mxd <= 6 else 3)
        fit = {"shoulder_type": "drop-structured" if cat != "pants" else None, "hem": None, "zip": None, "two_way_zip": None, "leg": None, "tuck": None}
        fit_notes = []
        if "raglan" in flags or (cat in ("tee", "knit", "outer") and best and "shoulder" not in best[2] and "chest" in best[2]):
            fit["shoulder_type"] = "raglan"; f_s -= 1; fit_notes.append("連肩袖（尺寸表沒有肩寬或品名標示）")
        if cat in ("tee", "knit", "shirt") and best and best[2].get("hem") and best[2].get("chest"):
            gap = best[2]["chest"] - best[2]["hem"]
            fit["hem"] = "ribbed" if gap > 6 else "open"
            if gap > 6:
                f_s -= 1
        if cat == "pants":
            fit["tuck"] = "one-tuck" if re.search(r"원턱|원 턱|one tuck|싱글 플리츠|single pleat", low) else ("two-tuck" if re.search(r"투턱|투 턱|two tuck", low) else "flat")
            fit["leg"] = "slim" if "slim" in flags else ("tapered" if "tapered" in flags else ("wide" if re.search(r"와이드|wide", low) and not re.search(r"세미", low) else ("semi-wide" if "세미" in low else "straight")))
            if fit["tuck"] == "one-tuck":
                f_s += 0.5
            if fit["leg"] == "slim":
                f_s -= 1
        if cat == "outer":
            two = "2way" in flags
            zip_ = two or bool(re.search(r"집업|zip|블루종|blouson|해링턴|harrington|점퍼|자켓", low)) and not re.search(r"블레이저|blazer|코트|coat|셔츠", low)
            fit["zip"] = bool(zip_) if not re.search(r"블레이저|blazer|코트|coat", low) else False
            fit["two_way_zip"] = True if two else (None if not fit["zip"] else None)
            if two:
                f_s += 0.5
        f_s = r05(f_s)
        rating = p.get("rating") or 0
        k_s = 4.5 if rating >= 4.9 else 4 if rating >= 4.8 else 3.5 if rating >= 4.7 else 3
        if (p.get("n") or 0) >= 1000:
            k_s += 0.5
        if p.get("src") == "pbrand":
            k_s += 0.5
        k_s = r05(k_s)
        neg = sr.get("neg") or {}
        npct = neg.get("pct") or 0
        c_s = 5 if npct == 0 else 4.5 if npct <= 1 else 4 if npct <= 2 else 3.5 if npct <= 5 else 2.5 if npct <= 12 else 1.5
        care_txt = (p.get("care") or "")
        if re.search(r"드라이|dry", care_txt.lower()):
            c_s -= 0.5
        c_s = r05(c_s)
        mat = p.get("mat") or {}
        fn = {"tee": 4, "shirt": 4, "pants": 4, "knit": 3.5, "outer": 4}[cat]
        if cat == "outer" and "두꺼움" in mat.get("두께", ""):
            fn -= 0.5
        if "있음" in mat.get("신축성", "") or "보통" == mat.get("신축성", ""):
            fn += 0.5
        if cat == "outer" and fit.get("two_way_zip"):
            fn += 0.5
        fn_s = r05(fn)
        overall = round(max(1, min(5, 0.25 * m_s + 0.3 * f_s + 0.15 * k_s + 0.2 * c_s + 0.1 * fn_s)), 1)

        by = neg.get("by") or {}
        src_lab = "韓國站評論" if (sr.get("src") or "").startswith("musinsa") else "Global 英譯評論"
        experts = {
            "material": f"{m_note}。" + (f"商品標示厚度「{mat.get('두께')}」。" if mat.get("두께") else ""),
            "fit": fit_text(pick, chart, fit_notes, best),
            "make": f"滿意度 {rating or '—'}（{p.get('n') or 0:,} 則評論）" + ("，品牌以品質著稱" if p.get("src") == "pbrand" else ""),
            "care": f"{src_lab}最新 {sr['fetched']} 則中，1–3 星提到縮水 {by.get('shrink', 0)}、起毛球 {by.get('pilling', 0)}、領口 {by.get('neck', 0)} 則（{npct}%）" + ("；建議乾洗" if re.search(r"드라이|dry", care_txt.lower()) else ""),
            "function": {"tee": "高雄四季可用，內搭或單穿", "shirt": "冷氣房與春秋的外搭層", "knit": "高雄 12–22°C 的中間層", "pants": "四季可穿", "outer": "高雄秋冬（14–24°C）主力外套"}[cat] + ("；有彈性" if fn_s > {"tee": 4, "shirt": 4, "pants": 4, "knit": 3.5, "outer": 4}[cat] else ""),
        }
        gp = p.get("gp") or {}
        price = {"twd": gp.get("twd") if gp.get("available") else None, "twd_normal": gp.get("twdNormal") if gp.get("available") else None,
                 "krw": p.get("krw"), "krw_normal": p.get("normal"), "global_available": bool(gp.get("available"))}
        it = {
            "id": None, "goodsNo": int(no), "is_new": True, "cat": cat, "slot": slot, "role": role,
            "brand": p.get("brandName") or p.get("brand"), "name": name, "name_en": p.get("en") or "",
            "color": zh_color, "hex": hx, "tone": tone, "img": p.get("img"),
            "urls": {"global": f"https://global.musinsa.com/tw/products/{no}", "kr": f"https://www.musinsa.com/products/{no}", "reviews": f"https://www.musinsa.com/review/goods/{no}"},
            "price": price, "budget_reason": None,
            "fabric": (p.get("fabric") or "見商品頁")[:90], "origin": (p.get("origin") or "")[:30], "care": care_txt[:80],
            "fit": {**fit, "note": "；".join(fit_notes)},
            "size": {"pick": pick, "chart": chart, "chart_pick": chart_pick, "chart_why": chart_why,
                     "reviews_body": {"n": bn, "dist": dict(list(bdist.items())[:6]), "tendency": tend, "note": ""},
                     "reviews_all": {"n": sr.get("fetched"), "dist": dict(sorted((sr.get("allDist") or {}).items(), key=lambda kv: -kv[1])[:6])},
                     "why": why},
            "screen": {"fetched": sr.get("fetched"), "neg_pct": npct, "neg_body_pct": neg.get("body_pct") or 0, "neg_by": by,
                       "clingy_pct": (sr.get("clingy") or {}).get("pct") or 0, "thin_pct": (sr.get("thin") or {}).get("pct") or 0,
                       "thickness": mat.get("두께") or None, "warn": [], "source": sr.get("src")},
            "scores": {"material": m_s, "fit": f_s, "make": k_s, "care": c_s, "function": fn_s, "overall": overall},
            "experts": experts, "comment": "", "styling": "",
            "temps": SLOT_TEMPS.get(slot, [14, 28]), "rating": {"score": rating, "count": p.get("n")},
            "_src": p.get("src"),
        }
        items.append(it)
    return items


def expand(a):
    """瀏覽器 exportTrim() 的精簡陣列格式 → dict。"""
    if isinstance(a, dict):
        return a
    cat, slot, src, brand, brandName, name, img, krw, normal, rating, n, mt, fabric, origin, dry, chart, s, g = a
    sr = {"err": 1} if isinstance(s, dict) else {
        "src": "musinsa-review(ko)" if s[0] == "ko" else "global-review(en)", "fetched": s[1],
        "body": {"n": s[2], "dist": s[3], "tendency": s[4]}, "allDist": s[5],
        "neg": {"pct": s[6], "body_pct": s[7], "by": s[8]}, "clingy": {"pct": s[9]}, "thin": {"pct": s[10]},
        "warn": s[11], "ex": s[12]}
    return {"cat": cat, "slot": slot, "src": src, "brand": brand, "brandName": brandName, "name": name,
            "img": ("https://image.msscdn.net" + img) if img else None, "krw": krw, "normal": normal, "rating": rating, "n": n,
            "mat": {k2: v for k2, v in (("두께", mt.get("t")), ("신축성", mt.get("s")), ("비침", mt.get("b"))) if v},
            "fabric": fabric, "origin": origin, "care": "드라이클리닝" if dry else "", "chart": chart, "sr": sr,
            "gp": {"available": bool(g), "twd": g[0], "twdNormal": g[1]} if g else {"available": False}}


if __name__ == "__main__":
    raw = json.load(open(sys.argv[1], encoding="utf-8"))
    fx = raw.get("_fx", 0.0246)
    out = draft({k: expand(v) for k, v in raw.items() if not k.startswith("_")}, fx)
    json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
