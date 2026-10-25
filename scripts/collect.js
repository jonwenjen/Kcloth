/* KCLOTH collector
 * 在使用者電腦「內建瀏覽器」的 MUSINSA 分頁裡執行（javascript_tool）。
 * 先跑 `python3 scripts/kcloth.py bundle`，它會產生 .cache/collect.bundle.js
 * （本檔 + rules.json 的 review_screen / fit 設定）。把那個檔案全文交給
 * javascript_tool 執行一次，之後在同一個分頁呼叫：
 *
 *   www.musinsa.com 或 global.musinsa.com 分頁皆可（API 允許跨域；台灣 IP 開 www 常被導到 global）：
 *     await KC.item(goodsNo, {cat: 'tee'})   單品：商品資料、實測尺寸、評論排雷、尺寸分布
 *     await KC.items([no1, no2], {cat})      多筆（依序）
 *     await KC.search('원턱 슬랙스', 60)      搜尋（男裝）→ 商品編號
 *     await KC.brand('drawfit', 60)          品牌頁 → 商品編號
 *     await KC.list({keyword:'원턱 슬랙스'}, {minReviews:50, maxKrw:70000})  結構化列表（品名、價格、評論數）
 *     await KC.list({brand:'drawfit', category:'001'})
 *   global.musinsa.com 分頁：
 *     await KC.globalPrice(goodsNo)          Global 台灣站 TWD 售價與是否可買
 *
 * 只讀取公開商品資料，不登入、不送出任何表單。
 */
(() => {
  const KC = (window.KC = window.KC || {});
  KC.version = '2026-10-25.4';

  const MEASURE = {
    '총장': 'length', '어깨너비': 'shoulder', '가슴단면': 'chest', '소매길이': 'sleeve',
    '밑단단면': 'hem', '허리단면': 'waist', '엉덩이단면': 'hip', '허벅지단면': 'thigh',
    '밑위': 'rise', '소매부리단면': 'cuff', '암홀': 'armhole',
  };

  KC.init = (cfg) => { KC.cfg = cfg; return 'KC ready ' + KC.version; };
  const cfg = () => {
    if (!KC.cfg) throw new Error('KC.init(rules) 尚未執行：請用 kcloth.py bundle 產生的檔案');
    return KC.cfg;
  };

  // 連續抓太快會出現 TypeError: Failed to fetch／429：自動重試 4 次（1.5s、3s、6s 退避）
  // 內建瀏覽器面板在背景時 setTimeout 會被節流到 1 秒～1 分鐘；改用 MessageChannel 計時（不受背景節流）
  const sleep = (ms) => new Promise((ok) => {
    const t0 = performance.now();
    const ch = new MessageChannel();
    ch.port1.onmessage = () => { if (performance.now() - t0 >= ms) { ch.port1.close(); ok(); } else ch.port2.postMessage(0); };
    ch.port2.postMessage(0);
  });
  const getJSON = async (url, tries = 4) => {
    for (let i = 0; ; i++) {
      try {
        const r = await fetch(url, { credentials: 'include' });
        if (r.status === 429 || r.status >= 500) throw new Error(`${r.status} ${url}`);
        if (!r.ok) { const e = new Error(`${r.status} ${url}`); e.fatal = true; throw e; }
        return await r.json();
      } catch (e) {
        if (e.fatal || i >= tries - 1) throw e;
        await sleep(1500 * 2 ** i);
      }
    }
  };
  const low = (s) => (s || '').toLowerCase();
  // 關鍵字以 '/' 開頭代表正規式（英文備援用單字邊界）
  const rxCache = {};
  const hit = (txt, kws) => kws.some((k) => (k[0] === '/'
    ? (rxCache[k] ||= new RegExp(k.slice(1), 'i')).test(txt)
    : txt.includes(low(k))));
  // 先刪掉否定片語（例：보풀 없어요、뱃살 커버）再比對，避免把正評算成負評
  const strip = (txt, negs) => (negs || []).reduce((t, n) => t.split(low(n)).join(' '), txt);
  const hitN = (txt, kws, negs) => hit(strip(txt, negs), kws);
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);

  const normSize = (opt) => {
    if (!opt) return '?';
    const last = String(opt).split('/').pop().trim();
    const m = last.match(/\b(XS|S|M|L|XL|XXL|2XL|3XL|4XL|FREE|F)\b/i) || last.match(/\b(\d{1,3})\b/);
    return (m ? m[1] : last).toUpperCase().slice(0, 12);
  };

  const count = (arr, f) => arr.reduce((acc, x) => { const k = f(x); acc[k] = (acc[k] || 0) + 1; return acc; }, {});

  const tendency = (arr, kw) => {
    const t = { big: 0, small: 0, true: 0 };
    for (const r of arr) {
      const c = r.c;
      if (hit(c, kw.big)) t.big++;
      if (hit(c, kw.small)) t.small++;
      if (hit(c, kw.true)) t.true++;
    }
    return t;
  };

  // 韓國站評論 API 被擋（Failed to fetch／서비스 연결이 지연）時，改抓 Global 評論 API（英文翻譯，含身高體重）
  async function reviewsGlobal(goodsNo, pages) {
    const base = `https://global.musinsa.com/api2/global/global-review/v1/list?countryCode=TW&localeCode=en-US&goodsNo=${goodsNo}&sort=new&pageSize=20`;
    const out = [];
    let total = null;
    for (let p = 1; p <= pages; p++) {
      const j = await getJSON(`${base}&page=${p}`);
      if (!j.data) break;
      total = j.data.totalCount ?? total;
      out.push(...(j.data.list || []));
      if (!j.data.hasNextPage) break;
      await sleep(120);
    }
    return {
      lang: 'en', source: 'global-review(en)', total,
      list: out.map((r) => ({
        g: Number(r.grade), c: low(r.content), raw: r.content || '',
        s: normSize((r.goodsOptionList || []).join('/')),
        h: r.userProfile?.userHeight ?? null, w: r.userProfile?.userWeight ?? null,
        d: (r.createDate || '').slice(0, 10),
      })),
    };
  }

  // 韓國站評論為主（Robin 指定）。被擋時冷卻 cooldown_ms 後自動再試韓國站，冷卻期間才用 Global 英譯備援。
  const PG = () => cfg().review_screen.pages || { screen: 10, size: 30, min_interval_ms: 250, cooldown_ms: 180000 };
  KC.krBlockedUntil = KC.krBlockedUntil || 0;
  let lastKr = 0;
  const krGet = async (url) => {   // 韓國站請求節流：兩次請求至少間隔 min_interval_ms
    const wait = lastKr + PG().min_interval_ms - Date.now();
    if (wait > 0) await sleep(wait);
    lastKr = Date.now();
    return getJSON(url, 2);
  };

  async function reviews(goodsNo, pages) {
    const forceGlobal = KC.reviewSource === 'global';
    if (!forceGlobal && Date.now() >= KC.krBlockedUntil) {
      try {
        return await reviewsKr(goodsNo, pages);
      } catch (e) {
        if (!location.hostname.endsWith('global.musinsa.com')) throw e;
        KC.krBlockedUntil = Date.now() + PG().cooldown_ms;
        KC.krBlocks = (KC.krBlocks || 0) + 1;
      }
    }
    return reviewsGlobal(goodsNo, pages);
  }

  async function reviewsKr(goodsNo, pages) {
    const base = `https://goods.musinsa.com/api2/review/v1/view/list?pageSize=20&goodsNo=${goodsNo}&sort=new&myFilter=false&hasPhoto=false&isExperience=false`;
    const first = await krGet(`${base}&page=0`);
    if (!first.data) return { lang: 'ko', source: 'musinsa-review(ko)', list: [], total: 0 };
    const totalPages = first.data.page?.totalPages || 1;
    const n = Math.min(pages, totalPages);
    const out = [...first.data.list];
    for (let p = 1; p < n; p++) {   // 依序抓（不併發），避免觸發封鎖
      const res = await krGet(`${base}&page=${p}`);
      if (res?.data?.list) out.push(...res.data.list);
    }
    return {
      lang: 'ko', source: 'musinsa-review(ko)',
      total: first.data.total ?? null,
      list: out.map((r) => ({
        g: Number(r.grade),
        c: low(r.content),
        raw: r.content || '',
        s: normSize(r.goodsOption),
        h: r.userProfileInfo?.userHeight ?? null,
        w: r.userProfileInfo?.userWeight ?? null,
        d: (r.createDate || '').slice(0, 10),
      })),
    };
  }

  KC.item = async (goodsNo, opts = {}) => {
    const C = cfg();
    let S = C.review_screen;
    const cat = opts.cat || null;
    // 排雷先抓 10 頁；要估尺寸（opts.size=true）才抓到 30 頁
    const pages = opts.pages || (opts.size ? PG().size : PG().screen);

    const [g, size, ess] = await Promise.all([
      getJSON(`https://goods-detail.musinsa.com/api2/goods/${goodsNo}`),
      getJSON(`https://goods-detail.musinsa.com/api2/goods/${goodsNo}/actual-size`).catch(() => null),
      getJSON(`https://goods-detail.musinsa.com/api2/goods/${goodsNo}/essential`).catch(() => null),
    ]);
    const d = g.data;

    const material = {};
    for (const m of d.goodsMaterial?.materials || []) {
      material[m.name] = m.items.filter((i) => i.isSelected).map((i) => i.name).join('/');
    }
    const essentials = {};
    for (const e of ess?.data?.essentials || []) essentials[e.name] = String(e.value).slice(0, 220);

    const chart = {};
    for (const sz of size?.data?.sizes || []) {
      const row = {};
      for (const it of sz.items || []) {
        const k = MEASURE[it.name] || it.name;
        if (it.value) row[k] = it.value;
      }
      chart[sz.name] = row;
    }

    // 實測尺寸 API 全是 0 時（常見於 LMOOD 等），改解析商品資訊公告「치수」的表格
    if (!Object.values(chart).some((r) => Object.keys(r).length)) {
      const raw = (ess?.data?.essentials || []).find((e) => e.name === '치수')?.value || '';
      const lines = String(raw).split(/<br\s*\/?>|\n/).map((s) => s.trim()).filter(Boolean);
      const head = (lines[0] || '').split(/\t+/).map((h) => MEASURE[h.trim()]).filter(Boolean);
      const names = Object.keys(chart);
      if (head.length) {
        lines.slice(1).forEach((ln, i) => {
          const nums = (ln.match(/[\d.]+/g) || []).map(Number);
          if (nums.length >= head.length && names[i]) chart[names[i]] = Object.fromEntries(head.map((h, k) => [h, nums[k]]));
        });
      }
    }

    const rv = await reviews(goodsNo, pages);
    if (rv.lang === 'en' && C.review_screen_en) S = C.review_screen_en;
    const all = rv.list;
    const [h0, h1] = S.body_filter.height;
    const [w0, w1] = S.body_filter.weight;
    const body = all.filter((r) => r.h >= h0 && r.h <= h1 && r.w >= w0 && r.w <= w1);

    const NK = S.negative.keywords;
    const negFlags = (r) => (r.g <= Math.max(...S.negative.grades)
      ? { shrink: hitN(r.c, NK.shrink, S.negative.negations), pilling: hitN(r.c, NK.pilling, S.negative.negations), neck: hitN(r.c, NK.neck, S.negative.negations) }
      : { shrink: false, pilling: false, neck: false });
    const anyNeg = (r) => { const f = negFlags(r); return f.shrink || f.pilling || f.neck; };
    const negAll = all.filter(anyNeg);
    const negBody = body.filter(anyNeg);
    const by = { shrink: 0, pilling: 0, neck: 0 };
    for (const r of negAll) { const f = negFlags(r); for (const k in by) if (f[k]) by[k]++; }

    const clingyHits = all.filter((r) => hitN(r.c, S.clingy.keywords, S.clingy.negations)).length;
    const thinHits = all.filter((r) => hitN(r.c, S.thin.keywords, S.thin.negations)).length;

    const neg = {
      low_star: all.filter((r) => r.g <= 3).length,
      hits: negAll.length, pct: pct(negAll.length, all.length),
      body_hits: negBody.length, body_pct: pct(negBody.length, body.length),
      by,
    };
    const clingy = { hits: clingyHits, pct: pct(clingyHits, all.length) };
    const thin = { hits: thinHits, pct: pct(thinHits, all.length) };

    // 排雷判定（只做客觀門檻；版型與美感由 Claude 判斷）
    const reasons = [];
    const warn = [];
    if (all.length >= S.negative.min_sample && neg.pct > S.negative.max_pct) reasons.push(`負評排雷：縮水/起毛球/領口 ${neg.pct}% > ${S.negative.max_pct}%`);
    if (body.length >= S.negative.body_min_sample && neg.body_pct > S.negative.max_pct) reasons.push(`體型樣本負評 ${neg.body_pct}% > ${S.negative.max_pct}%`);
    if (cat && S.clingy.applies_to.includes(cat) && clingy.pct > S.clingy.max_pct) reasons.push(`貼身顯肚評論 ${clingy.pct}% > ${S.clingy.max_pct}%`);
    if (cat && S.thin.applies_to.includes(cat)) {
      if (thin.pct > S.thin.max_pct) reasons.push(`薄透評論 ${thin.pct}% > ${S.thin.max_pct}%`);
      for (const [k, bad] of Object.entries(S.thin.material_fail)) {
        if (material[k] && bad.includes(material[k])) reasons.push(`商品標示 ${k}=${material[k]}`);
      }
    }
    const nameAll = low(`${d.goodsNm} ${d.goodsNmEng}`);
    if (/래글런|라글란|raglan/.test(nameAll)) reasons.push('連肩袖 Raglan');
    if (cat === 'pants' && /슬림|스키니|slim|skinny/.test(nameAll)) reasons.push('Slim／Skinny 褲型');
    if (cat === 'pants' && /테이퍼드|tapered/.test(nameAll)) warn.push('錐形褲：確認不是小腿收緊的 Slim Tapered');
    const HC = C.fit?.hem_cinch;
    if (HC && cat && HC.applies_to.includes(cat)) {
      for (const [sz, row] of Object.entries(chart)) {
        if (row.hem && row.chest && row.chest - row.hem > HC.max_gap_cm) { warn.push(`${sz} 號下擺 ${row.hem} < 胸 ${row.chest}−${HC.max_gap_cm}：收口下擺`); break; }
      }
    }
    if (all.length < S.negative.min_sample) warn.push(`評論只有 ${all.length} 則，耐穿度樣本不足`);
    if (body.length < 10) warn.push(`同身形（${h0}–${h1}cm／${w0}–${w1}kg）評論只有 ${body.length} 則`);

    const pickExcerpts = (arr, n) => arr.slice(0, n).map((r) => ({ g: r.g, s: r.s, h: r.h, w: r.w, t: r.raw.replace(/\s+/g, ' ').slice(0, 140) }));
    const bodyInfo = body.filter((r) => hit(r.c, [...S.size_tendency.big, ...S.size_tendency.small, ...S.size_tendency.true]));

    const price = d.goodsPrice || {};
    return {
      goodsNo: d.goodsNo,
      brand: d.brandInfo?.brandName || d.brand,
      brandId: d.brand,
      name: d.goodsNm,
      nameEn: d.goodsNmEng,
      img: d.thumbnailImageUrl ? `https://image.msscdn.net${d.thumbnailImageUrl.replace('_500.', '_big.')}` : null,
      category: d.category?.categoryDepth2Name || d.baseCategoryFullPath || null,
      season: [d.seasonYear, d.season].filter(Boolean).join(' '),
      krw: { normal: price.normalPrice, sale: price.salePrice, final: price.finalPrice ?? price.salePrice, coupon: price.couponPrice, rate: price.discountRate },
      outOfStock: !!d.isOutOfStock,
      rating: { score: d.goodsReview?.satisfactionScore ?? null, count: d.goodsReview?.totalCount ?? null },
      material,
      essentials: {
        fabric: essentials['제품 소재'] || null,
        origin: essentials['제조국'] || null,
        care: essentials['세탁방법 ∙ 취급시 주의사항'] || null,
        sizes: essentials['치수'] || null,
      },
      chart,
      reviews: {
        fetched: all.length,
        total: rv.total,
        source: rv.source,
        all: { dist: count(all, (r) => r.s), tendency: tendency(all, S.size_tendency) },
        body: { n: body.length, dist: count(body, (r) => r.s), tendency: tendency(body, S.size_tendency) },
        neg, clingy, thin,
        bodyExcerpts: pickExcerpts(bodyInfo.length ? bodyInfo : body, 8),
        negExcerpts: pickExcerpts(negAll, 5),
      },
      screen: { exclude: reasons.length > 0, reasons, warn },
      urls: { kr: `https://www.musinsa.com/products/${d.goodsNo}`, global: `https://global.musinsa.com/tw/products/${d.goodsNo}`, reviews: `https://www.musinsa.com/review/goods/${d.goodsNo}` },
    };
  };

  // 候選池快速篩選：只回傳精簡欄位，避免一次帶回大量評論摘錄
  const KEEP_SIZES = ['M', 'L', 'XL', '1', '2', '3', '95', '100', '105', '31', '32', '33', '34', '35'];
  KC.screen = async (nos, opts = {}) => {
    const rows = [];
    for (const no of nos) {
      try {
        const a = await KC.item(no, opts);
        const chart = {};
        for (const [k, v] of Object.entries(a.chart)) {
          const key = String(k).toUpperCase().replace(/\s/g, '');
          if (KEEP_SIZES.some((s) => key === s || key.startsWith(s + '(') || key.endsWith('(' + s + ')'))) chart[k] = v;
        }
        rows.push({
          src: a.reviews.source, by: a.reviews.neg.by, img: a.img,
          no: a.goodsNo, brand: a.brand, name: a.name, en: a.nameEn,
          krw: a.krw.final, normal: a.krw.normal, oos: a.outOfStock,
          rating: a.rating.score, n: a.rating.count,
          fetched: a.reviews.fetched, body: a.reviews.body.n, bodyDist: a.reviews.body.dist,
          neg: a.reviews.neg.pct, negBody: a.reviews.neg.body_pct, clingy: a.reviews.clingy.pct, thin: a.reviews.thin.pct,
          mat: a.material, fabric: (a.essentials.fabric || '').slice(0, 80), chart,
          exclude: a.screen.reasons, warn: a.screen.warn,
        });
      } catch (e) {
        rows.push({ no, error: String(e) });
      }
    }
    return rows;
  };

  KC.items = async (nos, opts = {}) => {
    const out = [];
    for (const no of nos) {
      try { out.push(await KC.item(no, opts)); } catch (e) { out.push({ goodsNo: no, error: String(e) }); }
    }
    return out;
  };

  const idsFromHtml = (html, limit) => [...new Set([...html.matchAll(/products\/(\d{5,})/g)].map((m) => m[1]))].slice(0, limit);

  KC.search = async (keyword, limit = 60) => {
    const r = await fetch(`https://www.musinsa.com/search/goods?keyword=${encodeURIComponent(keyword)}&gf=M`, { credentials: 'include' });
    return idsFromHtml(await r.text(), limit);
  };

  KC.brand = async (brandId, limit = 60) => {
    const r = await fetch(`https://www.musinsa.com/brand/${encodeURIComponent(brandId)}?gf=M`, { credentials: 'include' });
    return idsFromHtml(await r.text(), limit);
  };

  // 結構化商品列表（api.musinsa.com plp，2026-10 實測；global.musinsa.com 分頁也可跨域呼叫）
  // q: { keyword } 或 { brand }，可加 category（001 上衣、002 外套、003 褲子）
  // opts: { pages=1, size=60, minReviews=0, maxKrw=Infinity, male=true }
  KC.list = async (q, opts = {}) => {
    const o = { pages: 1, size: 60, minReviews: 0, maxKrw: Infinity, male: true, sort: 'POPULAR', ...opts };
    const out = [];
    for (let p = 1; p <= o.pages; p++) {
      const sp = new URLSearchParams({ gf: 'M', sortCode: o.sort, page: String(p), size: String(o.size), caller: q.brand ? 'BRAND' : 'SEARCH' });
      for (const k of ['keyword', 'brand', 'category']) if (q[k]) sp.set(k, q[k]);
      const j = await getJSON(`https://api.musinsa.com/api2/dp/v1/plp/goods?${sp}`);
      for (const x of j.data?.list || []) {
        if (x.isAd) continue;
        if (o.male && x.displayGenderText && !/남성|공용|남녀/.test(x.displayGenderText)) continue;
        if (x.isSoldOut || (x.reviewCount || 0) < o.minReviews || x.price > o.maxKrw) continue;
        out.push({ no: x.goodsNo, brand: x.brand, brandName: x.brandName, name: x.goodsName, krw: x.price, normal: x.normalPrice,
                   rate: x.saleRate, n: x.reviewCount, score: x.reviewScore, img: x.thumbnail });
      }
      if (!j.data?.pagination?.hasNext) break;
    }
    const seen = new Set();
    return out.filter((x) => (seen.has(x.no) ? false : seen.add(x.no)));
  };

  // 在 global.musinsa.com 分頁執行
  KC.globalPrice = async (goodsNo) => {
    const r = await fetch(`https://global.musinsa.com/tw/products/${goodsNo}`, { credentials: 'include' });
    if (!r.ok) return { goodsNo, available: false, status: r.status };
    const html = (await r.text()).replace(/\\"/g, '"').replace(/\\\//g, '/');
    const i = html.indexOf('"goodsPrice":{');
    if (i < 0) return { goodsNo, available: false, status: 'no-price' };
    const obj = JSON.parse(html.slice(i + 13, html.indexOf('}', i) + 1));
    const st = html.match(/"status":"([A-Z_]+)","tag"/);
    return {
      goodsNo, available: !st || st[1] === 'SALE',
      status: st ? st[1] : null,
      twd: obj.price, twdNormal: obj.normalPrice, saleRate: obj.saleRate, currency: obj.currencyCode,
      url: `https://global.musinsa.com/tw/products/${goodsNo}`,
    };
  };

  KC.globalPrices = async (nos) => Promise.all(nos.map((no) => KC.globalPrice(no).catch((e) => ({ goodsNo: no, error: String(e) }))));
})();
