/* KCLOTH 網站：讀 data/*.json 與 config/*.json，全部在瀏覽器端產生畫面。 */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => (n == null || isNaN(n) ? '—' : Number(n).toLocaleString('zh-TW'));
  const twd = (n) => (n == null || isNaN(n) ? '—' : 'NT$' + num(Math.round(n)));
  const krw = (n) => (n == null ? '—' : '₩' + num(n));
  const safeUrl = (u) => (/^https:\/\//.test(u || '') ? u : '#');

  const REPO = (() => {
    const h = location.hostname;
    if (h.endsWith('github.io')) return { owner: h.split('.')[0], repo: location.pathname.split('/')[1] || 'Kcloth' };
    return { owner: 'jonwenjen', repo: 'Kcloth' };
  })();

  const CAT_LABEL = { tee: 'T 恤', knit: '針織衫', shirt: '襯衫', outer: '外套', pants: '褲子' };
  const ROLE_LABEL = { inner: '內搭', single: '單穿', outer: '外搭', bottom: '下身' };
  const VERDICT = {
    keep: ['符合規則', 'verdict-keep'],
    tip: ['注意穿法', 'verdict-tip'],
    watch: ['到貨確認', 'verdict-watch'],
    return: ['建議退換', 'verdict-return'],
  };
  const STATUS = { live: '進行中', upcoming: '即將開始', expected: '預估檔期', ended: '已結束' };
  const LS_KEY = 'kcloth.list.v1';
  const THICK = { '얇음': '薄', '약간|얇음': '略薄', '보통': '適中', '약간|두꺼움': '略厚', '두꺼움': '厚' };

  const S = {
    month: null, orders: null, wishRepo: null, rules: null, profile: null,
    list: [], removed: [],
    cat: 'all', sort: 'rank', onlyNew: false, clean: false, band: null, trendTab: 'now', brandTab: 'material',
  };
  const LV = { 1: ['注意', 'lv1'], 2: ['警告', 'lv2'], 3: ['嚴重', 'lv3'] };
  const AXES = [['material', '材質'], ['fit', '版型'], ['make', '車工'], ['care', '保養'], ['function', '機能']];
  const maxLv = (x) => Math.max(0, ...(x.alerts || []).map((a) => a.level));
  const axisMini = (sc) => `<div class="axmini">${AXES.map(([k, l]) => `<span title="${l} ${esc(sc?.[k] ?? '—')}"><i>${l}</i><b>${esc(sc?.[k] ?? '—')}</b></span>`).join('')}</div>`;
  const alertList = (al) => (al || []).length ? `<ul class="alerts">${al.slice().sort((a, b) => b.level - a.level).map((a) => `<li class="${LV[a.level]?.[1] || ''}"><span class="lvtag">${LV[a.level]?.[0] || ''}</span>${esc(a.text)}</li>`).join('')}</ul>` : '';

  // ---------------------------------------------------------------- utils
  const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  const parseDate = (s) => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); };
  const daysBetween = (a, b) => Math.round((b - a) / 86400000);
  const isoToday = () => { const d = today(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  async function getJSON(path) {
    const r = await fetch(`${path}?v=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`${r.status} ${path}`);
    return r.json();
  }

  const stars = (v) => { const n = Math.round(v || 0); return '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n)); };
  const hasMonth = () => !!(S.month && S.month.month);
  const items = () => (hasMonth() ? S.month.items || [] : []);

  // ---------------------------------------------------------------- list (wishlist)
  function loadList() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { saved = null; }
    S.list = (saved && Array.isArray(saved.items)) ? saved.items : [];
    S.removed = (saved && Array.isArray(saved.removed)) ? saved.removed : [];
    const ids = new Set(S.list.map((x) => x.id));
    for (const w of (S.wishRepo && S.wishRepo.items) || []) {
      if (!ids.has(w.id) && !S.removed.includes(w.id)) S.list.push({ ...w, fromRepo: true });
    }
  }
  function saveList() {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ items: S.list, removed: S.removed })); } catch (e) { /* 私密模式 */ }
    $('#list-count').textContent = S.list.length;
  }
  const inList = (id) => S.list.some((x) => x.id === id);
  function snapshot(it) {
    return {
      id: it.id, goodsNo: it.goodsNo, name: it.name, brand: it.brand, cat: it.cat, slot: it.slot,
      color: it.color, hex: it.hex, tone: it.tone, role: it.role, temps: it.temps,
      twd: it.price?.twd ?? it.price?.krw_twd ?? null, url: it.urls?.global || it.urls?.kr,
      img: it.img, size: it.size?.pick, added: isoToday(),
    };
  }
  function toggleList(id) {
    if (inList(id)) {
      S.list = S.list.filter((x) => x.id !== id);
      if (!S.removed.includes(id)) S.removed.push(id);
      toast('已從清單移除');
    } else {
      const it = items().find((x) => x.id === id);
      if (!it) return;
      S.list.push(snapshot(it));
      S.removed = S.removed.filter((x) => x !== id);
      toast('已加入清單');
    }
    saveList();
    renderPicks();
    renderWardrobe();
    renderList();
    renderOutfits();
  }

  function listPayload() {
    return {
      updated: isoToday(),
      items: S.list.map((x) => ({ id: x.id, goodsNo: x.goodsNo, name: (x.name || '').slice(0, 40), brand: x.brand, cat: x.cat, slot: x.slot, size: x.size, twd: x.twd, added: x.added })),
    };
  }
  function syncIssue() {
    if (!S.list.length) { toast('清單是空的'); return; }
    const p = listPayload();
    const body = `由 KCLOTH 網站產生。每月 15 日執行時會匯入 data/wishlist.json 並關閉這個 Issue。\n\n\`\`\`json\n${JSON.stringify(p)}\n\`\`\``;
    const url = `https://github.com/${REPO.owner}/${REPO.repo}/issues/new?title=${encodeURIComponent('清單同步 ' + p.updated)}&body=${encodeURIComponent(body)}`;
    if (url.length > 7800) { copyList(); toast('清單太長，已改為複製 JSON'); return; }
    window.open(url, '_blank', 'noopener');
  }
  async function copyList() {
    const txt = JSON.stringify(listPayload(), null, 1);
    try { await navigator.clipboard.writeText(txt); toast('已複製清單 JSON'); } catch (e) { prompt('複製這段清單 JSON：', txt); }
  }

  // ---------------------------------------------------------------- owned pool
  function ownedItems() {
    const out = [];
    for (const o of (S.orders && S.orders.orders) || []) {
      for (const it of o.items || []) {
        if (['returned', 'cancelled'].includes(it.status)) continue;
        out.push({ ...it, date: o.date, owned: true, id: it.ref });
      }
    }
    return out;
  }

  function refLookup(ref) {
    const m = items().find((x) => x.id === ref);
    if (m) return { name: m.name, color: m.color, hex: m.hex, src: '本月', href: `#item-${m.id}` };
    const o = ownedItems().find((x) => x.ref === ref);
    if (o) return { name: `${o.brand} ${o.name}`, color: o.color, hex: null, src: '已購', href: '#orders' };
    const w = S.list.find((x) => x.id === ref);
    if (w) return { name: w.name, color: w.color, hex: w.hex, src: '清單', href: '#mylist' };
    return { name: ref, src: '', href: null };
  }

  // ---------------------------------------------------------------- hero
  function renderHero() {
    const p = S.profile?.body || {};
    const m = S.month || {};
    const exN = (m.excluded || []).length;
    const flagN = items().filter((x) => x.price?.premium_flag).length;
    const fx = m.fx?.twd_per_krw;
    const title = hasMonth() ? `${m.month.replace('-', ' 年 ')} 月選物` : '每月選物準備中';
    const lead = hasMonth()
      ? `${esc(m.run?.date || '')} 分析完成${m.run?.mode === 'partial' ? '（部分更新：' + esc(m.run?.notes || '選品沿用上月') + '）' : ''}。依身形、膚色與膠囊衣櫥挑選，排除縮水、起毛球、領口鬆垮與貼身顯肚的單品。`
      : esc(m.message || '首次每月分析執行中，完成後這裡會出現本月選品。已購紀錄、清單與衣櫥分析現在就能用。');
    $('#hero').innerHTML = `
      <div class="eyebrow">KCLOTH · Robin's Korean capsule</div>
      <h1>${esc(title)}</h1>
      <p>${lead}</p>
      <div class="stats">
        <div class="stat"><b>${hasMonth() ? items().length : '—'}</b><span>本月選品</span></div>
        <div class="stat"><b>${hasMonth() ? exN : '—'}</b><span>排雷剔除</span></div>
        <div class="stat"><b>${hasMonth() ? flagN : '—'}</b><span>Global 溢價 ≥ 20%</span></div>
        <div class="stat"><b>${fx ? 'NT$' + (fx * 1000).toFixed(1) : '—'}</b><span>₩1,000 匯率</span></div>
      </div>
      <div class="body-tags">
        <span class="tag">${esc(p.height_cm)}cm／${esc(p.weight_kg)}kg</span>
        <span class="tag">肩 ${esc(p.shoulder_cm)}・胸 ${esc(p.chest_flat_cm)}・腰 ${esc(p.waist_flat_cm)}</span>
        <span class="tag sage">上衣 L（100）</span>
        <span class="tag sage">褲 33–34 Short</span>
        <span class="tag">${esc(S.profile?.skin || '')}膚色</span>
      </div>`;
  }

  // ---------------------------------------------------------------- sales
  function renderSales() {
    const el = $('#sales');
    const m = S.month || {};
    const order = { live: 0, upcoming: 1, expected: 2, ended: 3 };
    const sales = (m.sales || []).slice().sort((a, b) => (order[a.status] - order[b.status]) || String(a.start).localeCompare(String(b.start)));
    const t = today();
    const saleHtml = sales.map((s) => {
      const st = parseDate(s.start); const en = parseDate(s.end);
      let cd = '';
      if (s.status === 'live' && en) cd = `剩 ${Math.max(0, daysBetween(t, en))} 天`;
      else if ((s.status === 'upcoming' || s.status === 'expected') && st) { const d = daysBetween(t, st); cd = d > 0 ? `${d} 天後` : '即將開始'; }
      return `<article class="card sale ${esc(s.status)}">
        <div class="tags"><span class="tag ${s.status === 'live' ? 'rust' : s.status === 'upcoming' ? 'amber' : 'navy'}">${esc(STATUS[s.status] || s.status)}</span><span class="tag">${s.store === 'kr' ? '韓國站' : s.store === 'global' ? 'Global 台灣站' : esc(s.store)}</span>${cd ? `<span class="countdown">${esc(cd)}</span>` : ''}</div>
        <h3>${esc(s.name)}</h3>
        <div class="when">${esc(s.start || '?')} – ${esc(s.end || '?')}${s.detail ? '｜' + esc(s.detail) : ''}</div>
        ${s.action ? `<div class="small">${esc(s.action)}</div>` : ''}
        ${s.url ? `<a class="small muted" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">來源</a>` : ''}
      </article>`;
    }).join('');
    const coupons = (m.coupons || []).map((c) => `<span class="tag amber">${esc(c.text)}${c.until ? '（至 ' + esc(c.until) + '）' : ''}</span>`).join('');
    el.innerHTML = `<h2>折扣與折價券</h2><p class="sub">每月 15 日更新；45 天內的大檔期會加到日曆並推播提醒。</p>
      ${coupons ? `<div class="tags" style="margin-bottom:12px">${coupons}</div>` : ''}
      ${saleHtml ? `<div class="grid two">${saleHtml}</div>` : '<div class="empty">首次分析完成後會列出 MUSINSA 韓國站與 Global 台灣站的檔期（例如 6 月中、11 月中무진장、11 月底 Black Friday）。</div>'}`;
  }

  // ---------------------------------------------------------------- trends
  function renderTrends() {
    const el = $('#trends');
    const tr = S.month?.trends;
    if (!tr) { el.innerHTML = '<h2>潮流概況</h2><div class="empty">首次分析完成後顯示本季、下季與不退流行的單品。</div>'; return; }
    const tabs = [['now', `本季 ${tr.season || ''}`], ['next', `下季 ${tr.next_season || ''}`], ['timeless', '不退流行'], ['avoid', '對你不利的流行']];
    const list = tr[S.trendTab] || [];
    el.innerHTML = `<h2>潮流概況</h2><p class="sub">${esc(tr.summary || '')}</p>
      <div class="chips" role="group" aria-label="潮流分類">${tabs.map(([k, l]) => `<button class="chip" data-trend="${k}" aria-pressed="${S.trendTab === k}">${esc(l)}</button>`).join('')}</div>
      <div class="grid two">${list.map((x) => `<article class="card trend"><h3>${esc(x.title)}</h3><p>${esc(x.detail)}</p>${x.fit_for_robin ? `<div class="for">${esc(x.fit_for_robin)}</div>` : ''}</article>`).join('') || '<div class="empty">本分類沒有資料</div>'}</div>
      ${(tr.sources || []).length ? `<p class="small muted" style="margin-top:10px">參考：${tr.sources.map((s) => `<a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join('、')}</p>` : ''}`;
  }

  // ---------------------------------------------------------------- picks
  function premiumTag(p) {
    if (p?.premium_pct == null) return '';
    const v = p.premium_pct;
    if (p.premium_flag) return `<span class="tag rust">Global 貴 ${v}%</span>`;
    if (v < 0) return `<span class="tag sage">Global 便宜 ${Math.abs(v)}%</span>`;
    return `<span class="tag">Global 貴 ${v}%</span>`;
  }
  function budgetTag(it) {
    const b = it.budget;
    if (!b || b.status === 'ok') return '';
    return `<span class="tag amber">超預算 ${b.over_pct}%</span>`;
  }

  function distRows(dist, pick) {
    const entries = Object.entries(dist || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const max = Math.max(1, ...entries.map((e) => e[1]));
    const pickKey = String(pick || '').split(/[\s(]/)[0].toUpperCase();
    return entries.map(([k, v]) => `<div class="dist-row ${String(k).toUpperCase() === pickKey ? 'on' : ''}"><span>${esc(k)}</span><span class="meter"><i style="width:${(v / max) * 100}%"></i></span><span>${v} 人</span></div>`).join('');
  }

  const MEASURE_LABEL = { shoulder: '肩', chest: '胸', length: '衣長', sleeve: '袖', waist: '腰', rise: '前襠', thigh: '大腿', leg_opening: '褲腳', hem: '下擺', hip: '臀' };

  function itemCard(it) {
    const added = inList(it.id);
    const p = it.price || {};
    const sc = it.scores || {};
    const sz = it.size || {};
    const scr = it.screen || {};
    const rb = sz.reviews_body || {};
    const axes = [['material', '材質'], ['fit', '版型'], ['make', '車工'], ['care', '保養'], ['function', '機能']];
    const mainUrl = it.urls?.global && p.global_available !== false ? it.urls.global : it.urls?.kr;
    const thr = S.rules?.review_screen;
    const g = (label, v, max, sub) => `<div class="gauge ${v != null && max != null && v > max ? 'bad' : ''}"><b>${v == null ? '—' : v + '%'}</b><span>${esc(label)}${sub ? '｜' + esc(sub) : ''}</span></div>`;
    return `<article class="card item" id="item-${esc(it.id)}">
      <div class="item-head">
        ${it.img ? `<img class="thumb" src="${esc(safeUrl(it.img))}" alt="${esc(it.name)}" loading="lazy" referrerpolicy="no-referrer">` : '<div class="thumb ph">無圖</div>'}
        <div>
          <div class="brand">${esc(it.brand)} · ${esc(CAT_LABEL[it.cat] || it.cat)}</div>
          <h3>${esc(it.name)}</h3>
          <div class="small muted">${it.hex ? `<span class="swatch" style="background:${esc(it.hex)}"></span>` : ''}${esc(it.color)}${it.role ? '｜' + esc(ROLE_LABEL[it.role] || it.role) : ''}</div>
          <div class="price">
            <span class="now">${p.twd ? twd(p.twd) : '—'}</span>
            ${p.twd_normal && p.twd_normal > p.twd ? `<span class="was">${twd(p.twd_normal)}</span>` : ''}
            <span class="kr">韓國 ${krw(p.krw)}${p.krw_twd ? ' ≈ ' + twd(p.krw_twd) : ''}</span>
          </div>
          <div class="tags">
            <span class="overall"><span class="stars">${stars(sc.overall)}</span>${esc(sc.overall)}</span>
            <span class="sizebig">建議 ${esc(sz.pick || '?')}</span>
            ${premiumTag(p)}${budgetTag(it)}
            ${it.is_new ? '<span class="tag solid">本月新進</span>' : ''}
            ${p.global_available === false ? '<span class="tag navy">僅韓國站</span>' : ''}
            ${maxLv(it) ? `<span class="tag ${LV[maxLv(it)][1]}">${(it.alerts || []).length} 項提醒</span>` : ''}
          </div>
        </div>
      </div>
      ${axisMini(sc)}
      ${alertList(it.alerts)}
      <div class="item-actions">
        <button class="btn ${added ? 'added' : 'primary'}" data-add="${esc(it.id)}">${added ? '✓ 已在清單' : '＋ 加入清單'}</button>
        <a class="btn" href="${esc(safeUrl(mainUrl))}" target="_blank" rel="noopener">商品頁</a>
      </div>
      <details class="more">
        <summary>專家評分・尺寸建議・排雷數據</summary>
        <div class="more-body">
          <div class="sec"><h4>五位專家評分</h4>
            ${axes.map(([k, l]) => `<div class="axis"><span>${l}</span><span class="meter"><i style="width:${((sc[k] || 0) / 5) * 100}%"></i></span><b>${esc(sc[k] ?? '—')}</b>${it.experts?.[k] ? `<span class="axis-note">${esc(it.experts[k])}</span>` : ''}</div>`).join('')}
          </div>
          <div class="sec"><h4>綜合評語 ${esc(sc.overall)} / 5${sc.mean ? `（五項平均 ${esc(sc.mean)}）` : ''}</h4><p class="comment">${esc(it.comment)}</p></div>
          <div class="sec"><h4>尺寸建議</h4>
            <div class="size-grid">
              <div class="size-box"><h5>A．網站尺寸表</h5><div class="pick">${esc(sz.chart_pick || sz.pick || '—')}</div>
                <div class="measure">${Object.entries(sz.chart || {}).map(([k, v]) => `<span class="tag">${esc(MEASURE_LABEL[k] || k)} ${esc(v)}</span>`).join('')}</div>
                <div class="small" style="margin-top:6px">${esc(sz.chart_why || '')}</div></div>
              <div class="size-box"><h5>B．同身形評論（${thr ? `${thr.body_filter.height.join('–')}cm／${thr.body_filter.weight.join('–')}kg` : '同身形'}）</h5>
                <div class="pick">${rb.n != null ? `${esc(rb.n)} 則` : '—'}${rb.tendency ? `<span class="tag" style="margin-left:6px">${esc(rb.tendency)}</span>` : ''}</div>
                <div class="dist">${distRows(rb.dist, sz.pick)}</div>
                ${rb.note ? `<div class="small" style="margin-top:6px">${esc(rb.note)}</div>` : ''}</div>
            </div>
            <div class="final" style="margin-top:10px">推薦 <b>${esc(sz.pick || '—')}</b>｜${esc(sz.why || '')}</div>
            ${it.fit?.note ? `<p class="small muted" style="margin:8px 0 0">版型備註：${esc(it.fit.note)}</p>` : ''}
          </div>
          <div class="sec"><h4>雙重負評排雷（抓 ${esc(scr.fetched ?? '—')} 則${scr.source ? '・' + esc(scr.source === 'global-review(en)' ? 'Global 英譯評論' : '韓國站評論') : ''}）</h4>
            <div class="screen-grid">
              ${g('縮水／起毛球／領口', scr.neg_pct, thr?.negative.max_pct, '上限 5%')}
              ${g('同身形負評', scr.neg_body_pct, thr?.negative.max_pct, '上限 5%')}
              ${g('貼身顯肚', scr.clingy_pct, ['tee', 'knit', 'shirt'].includes(it.cat) ? thr?.clingy.max_pct : null, '上限 10%')}
              ${g('薄透', scr.thin_pct, ['tee', 'knit'].includes(it.cat) ? thr?.thin.max_pct : null, scr.thickness ? '厚度 ' + (THICK[scr.thickness] || scr.thickness) : '')}
            </div>
            ${scr.neg_by ? `<p class="small muted" style="margin:8px 0 0">1–3 星中：縮水 ${esc(scr.neg_by.shrink)}、起毛球 ${esc(scr.neg_by.pilling)}、領口鬆垮 ${esc(scr.neg_by.neck)} 則</p>` : ''}
            ${(scr.warn || []).map((w) => `<p class="small" style="margin:4px 0 0;color:var(--amber)">⚠ ${esc(w)}</p>`).join('')}
          </div>
          <div class="sec"><h4>價格</h4>
            <dl class="facts">
              <dt>Global</dt><dd>${p.twd ? twd(p.twd) : '—'}${p.global_available === false ? '（未在 Global 上架）' : ''}</dd>
              <dt>韓國站</dt><dd>${krw(p.krw)}${p.krw_twd ? ' ≈ ' + twd(p.krw_twd) : ''}</dd>
              <dt>價差</dt><dd>${p.premium_pct == null ? '—' : (p.premium_pct >= 0 ? 'Global 貴 ' : 'Global 便宜 ') + Math.abs(p.premium_pct) + '%'}${p.premium_flag ? '（超過 20% 警戒線，建議等折扣或改韓國站）' : ''}</dd>
              <dt>預算</dt><dd>${it.budget ? `上限 ${twd(it.budget.cap)}${it.budget.status === 'ok' ? '，在預算內' : `，超出 ${it.budget.over_pct}%：${esc(it.budget_reason || '')}`}` : '—'}</dd>
            </dl>
          </div>
          <div class="sec"><h4>材質與保養</h4>
            <dl class="facts">
              <dt>成分</dt><dd>${esc(it.fabric || '—')}</dd>
              <dt>產地</dt><dd>${esc(it.origin || '—')}</dd>
              <dt>保養</dt><dd>${esc(it.care || '—')}</dd>
              <dt>評價</dt><dd>${it.rating?.score ? `${esc(it.rating.score)}（${num(it.rating.count)} 則）` : '—'}</dd>
              <dt>溫度</dt><dd>${it.temps ? `${esc(it.temps[0])}–${esc(it.temps[1])}°C` : '—'}</dd>
            </dl>
          </div>
          <div class="sec"><h4>搭配建議</h4><p class="styling">${esc(it.styling)}</p></div>
          <div class="links">
            ${it.urls?.global ? `<a class="btn small" href="${esc(safeUrl(it.urls.global))}" target="_blank" rel="noopener">Global 台灣站</a>` : ''}
            ${it.urls?.kr ? `<a class="btn small" href="${esc(safeUrl(it.urls.kr))}" target="_blank" rel="noopener">韓國站</a>` : ''}
            ${it.urls?.reviews ? `<a class="btn small" href="${esc(safeUrl(it.urls.reviews))}" target="_blank" rel="noopener">全部評論</a>` : ''}
          </div>
        </div>
      </details>
    </article>`;
  }

  function renderPicks() {
    const el = $('#picks');
    if (!hasMonth()) { el.innerHTML = '<h2>本月選品</h2><div class="empty">首次分析完成後會出現 20–30 件選品：五位專家評分、尺寸表 × 同身形評論的尺寸建議、Global 與韓國價差，並可加入清單。</div>'; return; }
    const all = items();
    const counts = { all: all.length };
    for (const it of all) counts[it.cat] = (counts[it.cat] || 0) + 1;
    let list = all.filter((x) => (S.cat === 'all' || x.cat === S.cat) && (!S.onlyNew || x.is_new));
    const price = (x) => x.price?.twd ?? x.price?.krw_twd ?? 1e9;
    const ax = (k) => (a, b) => (b.scores?.[k] || 0) - (a.scores?.[k] || 0) || (b.scores?.overall || 0) - (a.scores?.overall || 0);
    const sorters = {
      rank: (a, b) => (b.rank ?? b.scores?.overall ?? 0) - (a.rank ?? a.scores?.overall ?? 0),
      overall: ax('overall'),
      material: ax('material'), fit: ax('fit'), make: ax('make'), care: ax('care'), function: ax('function'),
      price: (a, b) => price(a) - price(b),
      premium: (a, b) => (a.price?.premium_pct ?? 999) - (b.price?.premium_pct ?? 999),
      alerts: (a, b) => maxLv(a) - maxLv(b) || (b.rank || 0) - (a.rank || 0),
    };
    if (S.clean) list = list.filter((x) => maxLv(x) < 2);
    list = list.slice().sort(sorters[S.sort] || sorters.rank);
    const cats = ['all', 'tee', 'knit', 'shirt', 'outer', 'pants'].filter((c) => counts[c]);
    const warnN = all.filter((x) => maxLv(x) >= 2).length;
    el.innerHTML = `<h2>本月選品</h2><p class="sub">以評分排序（綜合分扣掉提醒）。條件沒全符合的也會列出，卡片上用「注意／警告」標出程度；只有嚴重問題才移到「剔除」。預算：上衣／褲 NT$3,000、外套 NT$5,000。</p>
      <div class="chips" role="group" aria-label="類別">${cats.map((c) => `<button class="chip" data-cat="${c}" aria-pressed="${S.cat === c}">${c === 'all' ? '全部' : CAT_LABEL[c]} ${counts[c]}</button>`).join('')}
        <button class="chip" data-new aria-pressed="${S.onlyNew}">只看新進</button>
        <button class="chip" data-clean aria-pressed="${!!S.clean}">隱藏有警告的 ${warnN}</button></div>
      <div class="toolbar"><label class="small muted" for="sort">排序</label>
        <select id="sort"><option value="rank">推薦順序</option><option value="overall">綜合評分</option><option value="material">材質</option><option value="fit">版型</option><option value="make">車工</option><option value="care">保養</option><option value="function">機能</option><option value="alerts">提醒少→多</option><option value="price">價格低→高</option><option value="premium">溢價低→高</option></select></div>
      <div class="grid two">${list.map(itemCard).join('') || '<div class="empty">沒有符合的單品</div>'}</div>`;
    $('#sort').value = S.sort;
  }

  // ---------------------------------------------------------------- brands
  function renderBrands() {
    const el = $('#brands');
    const lists = { material: S.month?.brands || [], premium: S.month?.brands_premium || [] };
    if (!lists.material.length) { el.innerHTML = '<h2>品牌</h2><div class="empty">分析完成後列出品牌排名。</div>'; return; }
    const tab = lists[S.brandTab]?.length ? S.brandTab : 'material';
    const bs = lists[tab];
    const desc = tab === 'material'
      ? '以材質為第一優先（材質 40%、車工 20%、保養 20%、版型 10%、機能 10%）。'
      : '高檔或以名品單品著稱的品牌（材質 30%、車工 30%、版型 15%、保養 15%、機能 10%），多數超出預算，挑一兩件長期投資。';
    el.innerHTML = `<h2>品牌排名</h2>
      <div class="chips" role="group" aria-label="品牌清單"><button class="chip" data-btab="material" aria-pressed="${tab === 'material'}">材質優先 20 大</button>${lists.premium.length ? `<button class="chip" data-btab="premium" aria-pressed="${tab === 'premium'}">高檔／名品 20 大</button>` : ''}</div>
      <p class="sub">${desc}右側為綜合分，下方五項指標供參考。</p>
      <div class="card">${bs.map((b) => `<details class="brand-row"><summary><span class="rank">${esc(b.rank)}</span><span><span class="bname">${esc(b.name)}</span><br><span class="bline">${esc(b.strengths)}</span>${b.scores ? axisMini(b.scores) : ''}</span><span class="bscore">${b.scores?.weighted != null ? `<b>${esc(b.scores.weighted)}</b><small>綜合</small>` : ''}<span class="tag">${esc(b.price_band || '')}</span></span></summary>
        <div class="brand-body">
          ${b.scores_note ? `<p><b>評分依據</b>${esc(b.scores_note)}</p>` : ''}
          ${b.signature ? `<p><b>代表單品</b>${esc(b.signature)}</p>` : ''}
          <p><b>特點</b>${esc(b.features)}</p>
          <p><b>適合你的</b>${esc(b.for_robin)}</p>
          ${b.change ? `<p><b>本月</b>${esc(b.change)}</p>` : ''}
          ${(b.picks || []).length ? `<div class="tags">${b.picks.map((id) => { const r = refLookup(id); return `<a class="tag sage" href="${esc(r.href || '#')}">${esc(r.name)}</a>`; }).join('')}</div>` : ''}
        </div></details>`).join('')}</div>`;
  }

  // ---------------------------------------------------------------- wardrobe
  function renderWardrobe() {
    const el = $('#wardrobe');
    const slots = S.rules?.capsule_slots || [];
    const owned = ownedItems().filter((x) => x.audit?.verdict !== 'return');
    const returning = ownedItems().filter((x) => x.audit?.verdict === 'return');
    const by = (arr, slot) => arr.filter((x) => x.slot === slot);
    const rows = slots.map((s) => {
      const o = by(owned, s.id).length; const w = by(S.list, s.id).length;
      const pips = [];
      for (let i = 0; i < o; i++) pips.push(`<span class="pip ${i < s.target ? 'own' : 'extra'}"></span>`);
      for (let i = 0; i < w; i++) pips.push(`<span class="pip ${o + i < s.target ? 'wish' : 'extra'}"></span>`);
      for (let i = o + w; i < s.target; i++) pips.push('<span class="pip"></span>');
      const gap = Math.max(0, s.target - o - w);
      return `<div class="slot"><span class="label">${esc(s.label)}</span><span class="count">${gap ? `缺 ${gap}` : '✓ 齊'}</span><span class="pips">${pips.join('')}</span></div>`;
    }).join('');
    const wd = S.month?.wardrobe;
    const gaps = (wd?.gaps || []).map((g) => {
      const sl = slots.find((s) => s.id === g.slot);
      return `<li><b>${esc(sl ? sl.label : g.slot)}</b>：${esc(g.need)} ${(g.suggest || []).map((id) => { const r = refLookup(id); return `<a class="tag sage" href="${esc(r.href || '#')}">${esc(r.name)}</a>`; }).join(' ')}</li>`;
    }).join('');
    el.innerHTML = `<h2>衣櫥分析：還缺什麼？</h2><p class="sub">以膠囊衣櫥為目標，已購（扣除建議退換）＋清單一起算。加入清單會即時更新。</p>
      <div class="grid two">
        <div class="card pad">
          <div class="legend"><span><span class="pip own"></span>已購</span><span><span class="pip wish"></span>清單</span><span><span class="pip"></span>缺</span><span><span class="pip extra"></span>超出</span></div>
          ${rows}
          ${returning.length ? `<p class="small muted" style="margin:10px 0 0">不計入：${returning.map((x) => esc(x.brand + ' ' + x.name)).join('、')}（建議退換）</p>` : ''}
        </div>
        <div class="card pad">
          <h3 style="margin:0 0 6px;font-size:15px">本月分析</h3>
          ${wd?.summary ? `<p style="margin:0 0 10px">${esc(wd.summary)}</p>` : '<p class="muted" style="margin:0 0 10px">首次分析完成後，會依已購與清單寫出整體評估與補缺建議。</p>'}
          ${gaps ? `<ul class="gap-list">${gaps}</ul>` : ''}
          ${(wd?.owned_review || []).length ? `<h3 style="margin:14px 0 6px;font-size:15px">已購單品怎麼用</h3><ul class="gap-list">${wd.owned_review.map((r) => `<li><b>${esc(refLookup(r.ref).name)}</b>：${esc(r.note)}</li>`).join('')}</ul>` : ''}
        </div>
      </div>`;
  }

  // ---------------------------------------------------------------- my list
  function renderList() {
    const el = $('#mylist');
    const total = S.list.reduce((a, x) => a + (Number(x.twd) || 0), 0);
    const rows = S.list.map((x) => `<div class="list-item">
        ${x.img ? `<img src="${esc(safeUrl(x.img))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="ph"></span>'}
        <div><div class="t">${x.url ? `<a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener">${esc(x.name)}</a>` : esc(x.name)}</div>
          <div class="m">${esc(x.brand || '')}｜${esc(CAT_LABEL[x.cat] || '')}${x.size ? '｜' + esc(x.size) : ''}｜${twd(x.twd)}${x.fromRepo ? '｜已同步' : ''}</div></div>
        <button class="btn small" data-remove="${esc(x.id)}" aria-label="移除 ${esc(x.name)}">移除</button>
      </div>`).join('');
    el.innerHTML = `<h2>我的清單</h2><p class="sub">清單存在這支手機的瀏覽器。按「同步到 GitHub」會開一個 Issue（在 GitHub 按 Submit），15 號的分析就會把清單納入衣櫥分析與折扣提醒。</p>
      <div class="card pad">${rows || '<p class="muted" style="margin:0">還沒有加入任何單品。在「本月選品」按「＋ 加入清單」。</p>'}
        ${S.list.length ? `<div class="list-total"><span>${S.list.length} 件</span><b>${twd(total)}</b></div>` : ''}
        <div class="list-actions"><button class="btn primary" data-sync>同步到 GitHub</button><button class="btn" data-copy>複製清單</button></div>
        ${S.wishRepo?.updated ? `<p class="small muted" style="margin:10px 0 0">上次匯入：${esc(S.wishRepo.updated)}</p>` : ''}
      </div>`;
    $('#list-count').textContent = S.list.length;
  }

  // ---------------------------------------------------------------- outfits
  function autoOutfits(band) {
    const pool = [...ownedItems().filter((x) => x.audit?.verdict !== 'return'), ...S.list].filter((x) => Array.isArray(x.temps));
    const mid = (band.range[0] + band.range[1]) / 2;
    const fits = pool.filter((x) => x.temps[0] <= mid && mid <= x.temps[1]);
    const role = (r) => fits.filter((x) => x.role === r);
    const bottoms = role('bottom');
    const inners = role('inner').sort((a, b) => (a.tone === 'dark' ? -1 : 1) - (b.tone === 'dark' ? -1 : 1));
    const singles = role('single');
    const outers = role('outer').sort((a, b) => (a.tone === 'light' ? -1 : 1) - (b.tone === 'light' ? -1 : 1));
    if (!bottoms.length) return [];
    const out = [];
    for (let i = 0; i < 3; i++) {
      const bottom = bottoms[i % bottoms.length];
      let pieces = null;
      if (['hot', 'warm'].includes(band.id) && singles.length) pieces = [singles[i % singles.length], bottom];
      else if (inners.length && outers.length) pieces = [inners[i % inners.length], outers[i % outers.length], bottom];
      else if (singles.length) pieces = [singles[i % singles.length], bottom];
      if (!pieces) break;
      const key = pieces.map((p) => p.id).join('|');
      if (!out.some((o) => o.key === key)) out.push({ key, pieces });
    }
    return out;
  }

  function renderOutfits() {
    const el = $('#outfits');
    const bands = S.rules?.temp_bands || [];
    if (!bands.length) { el.innerHTML = ''; return; }
    const planned = S.month?.outfits || [];
    if (!S.band) {
      const withPlans = bands.find((b) => planned.some((o) => o.band === b.id));
      S.band = (withPlans || bands.find((b) => b.id === 'mild') || bands[0]).id;
    }
    const band = bands.find((b) => b.id === S.band);
    const piece = (ref) => { const r = refLookup(ref); return `<a class="piece" href="${esc(r.href || '#')}">${r.hex ? `<span class="swatch" style="background:${esc(r.hex)}"></span>` : ''}${esc(r.name)}${r.src ? ` <span class="muted">${esc(r.src)}</span>` : ''}</a>`; };
    const pl = planned.filter((o) => o.band === band.id).map((o) => `<article class="card outfit"><div class="tags"><span class="tag sage">專家搭配</span></div><h3>${esc(o.title)}</h3><div class="pieces">${(o.items || []).map(piece).join('')}</div><p class="how">${esc(o.how)}</p>${o.why ? `<p class="why">${esc(o.why)}</p>` : ''}</article>`).join('');
    const au = autoOutfits(band).map((o) => `<article class="card outfit"><div class="tags"><span class="tag navy">自動配</span></div><div class="pieces">${o.pieces.map((p) => `<span class="piece">${p.hex ? `<span class="swatch" style="background:${esc(p.hex)}"></span>` : ''}${esc((p.brand ? p.brand + ' ' : '') + p.name)} <span class="muted">${p.owned ? '已購' : '清單'}・${esc(ROLE_LABEL[p.role] || '')}</span></span>`).join('')}</div></article>`).join('');
    el.innerHTML = `<h2>依溫度穿搭</h2><p class="sub">高雄的溫度帶。專家搭配來自每月分析；自動配用你的已購＋清單即時組合。</p>
      <div class="chips" role="group" aria-label="溫度">${bands.map((b) => `<button class="chip" data-band="${b.id}" aria-pressed="${S.band === b.id}">${esc(b.label)}</button>`).join('')}</div>
      <p class="small" style="margin:0 0 10px">${esc(band.layers)}</p>
      <div class="grid two">${pl}${au}${!pl && !au ? '<div class="empty">這個溫度帶還沒有搭配；加入清單或等每月分析。</div>' : ''}</div>
      <div class="card pad" style="margin-top:12px"><h3 style="margin:0 0 6px;font-size:15px">三個穿搭公式</h3><ul class="rules">${(S.rules?.color?.formulas || []).map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>`;
  }

  // ---------------------------------------------------------------- orders
  function renderOrders() {
    const el = $('#orders');
    const os = (S.orders?.orders || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const html = os.map((o) => {
      const sum = (o.items || []).reduce((a, x) => a + (x.twd || 0), 0);
      return `<div class="card pad" style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;align-items:baseline"><b>${esc(o.date)}${o.time ? ' ' + esc(o.time) : ''}</b><span class="small muted">${(o.items || []).length} 件・${twd(sum)}</span></div>
        ${(o.items || []).map((x) => { const v = VERDICT[x.audit?.verdict]; return `<div class="order-item"><div><div class="t">${esc(x.brand)} ${esc(x.name)}</div><div class="m">${esc(x.color || '')}｜${esc(x.size)}｜${twd(x.twd)}｜${esc(CAT_LABEL[x.cat] || x.cat)}${x.fabric ? '｜' + esc(x.fabric) : ''}${x.status && x.status !== 'ordered' ? '｜' + esc(x.status) : ''}</div></div>
          ${v ? `<span class="tag ${v[1]}">${v[0]}</span>` : '<span></span>'}
          ${x.audit?.note ? `<div class="note">${esc(x.audit.note)}${x.audit.checked ? ` <span class="muted">（${esc(x.audit.checked)}）</span>` : ''}</div>` : ''}</div>`; }).join('')}
      </div>`;
    }).join('');
    el.innerHTML = `<h2>購買紀錄</h2><p class="sub">${esc(S.orders?.source || '')}${S.orders?.updated ? '，更新於 ' + esc(S.orders.updated) : ''}。依新規則逐件檢查。</p>${html || '<div class="empty">還沒有購買紀錄。</div>'}`;
  }

  // ---------------------------------------------------------------- excluded & method
  function renderExcluded() {
    const el = $('#excluded');
    const ex = S.month?.excluded || [];
    el.innerHTML = `<h2>排雷剔除</h2><p class="sub">版型再好看，只要踩到負評、貼身、薄透、連肩袖或預算規則就不列入。</p>
      ${ex.length ? `<div class="card pad">${ex.map((x) => `<div class="ex"><div>${x.url ? `<a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener">${esc(x.brand)} ${esc(x.name)}</a>` : esc(x.brand + ' ' + x.name)} <span class="muted small">${esc(CAT_LABEL[x.cat] || '')}</span></div><div class="reasons">${(x.reasons || []).map(esc).join('；')}</div></div>`).join('')}</div>` : '<div class="empty">首次分析完成後列出被剔除的單品與數據。</div>'}`;
  }

  function renderMethod() {
    const el = $('#method');
    const R = S.rules; const m = S.month || {};
    if (!R) { el.innerHTML = ''; return; }
    const rs = R.review_screen; const rg = R.fit.ranges;
    const sr = m.self_review || {};
    el.innerHTML = `<h2>分析方法</h2><p class="sub">每月執行前會先用當下最新的模型重新審查方法，再跑全部分析。</p>
      <div class="grid two">
        <div class="card pad"><h3 style="margin:0 0 8px;font-size:15px">硬性條件</h3><ul class="rules">
          <li>評論體型過濾 ${rs.body_filter.height.join('–')}cm／${rs.body_filter.weight.join('–')}kg</li>
          <li>1–3 星評論中「縮水／起毛球／領口鬆垮」超過 ${rs.negative.max_pct}% 直接剔除</li>
          <li>「貼身／顯肚」評論超過 ${rs.clingy.max_pct}% 剔除；T 恤與針織要厚度適中以上</li>
          <li>上衣 L 號：肩 ${rg.tee.shoulder.join('–')}、胸 ${rg.tee.chest.join('–')}、衣長 ${rg.tee.length.join('–')}cm；禁連肩袖、羅紋收口下擺</li>
          <li>褲子：前襠 ${rg.pants.rise.join('–')}、褲腳 ${rg.pants.leg_opening.join('–')}cm，單打褶微寬直筒；禁 Slim／Skinny</li>
          <li>拉鍊外套必須雙向拉鍊</li>
          <li>預算：上衣／褲 ${twd(R.budget_twd.top)}、外套 ${twd(R.budget_twd.outer)}，值得可 +${R.budget_twd.stretch_pct}%</li>
          <li>Global 比韓國站貴 ${R.premium.warn_pct}% 以上標紅</li>
        </ul></div>
        <div class="card pad"><h3 style="margin:0 0 8px;font-size:15px">本次執行</h3>
          <dl class="facts"><dt>日期</dt><dd>${esc(m.run?.date || '—')}</dd><dt>模型</dt><dd>${esc(m.run?.model || '—')}</dd><dt>模式</dt><dd>${m.run?.mode === 'partial' ? '部分更新' : m.run ? '完整' : '—'}</dd><dt>規則版本</dt><dd>${esc(m.rules_version || R.version)}</dd></dl>
          ${(sr.changes || []).length ? `<h3 style="margin:12px 0 6px;font-size:15px">方法改進</h3><ul class="rules">${sr.changes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
          ${(sr.todo || []).length ? `<h3 style="margin:12px 0 6px;font-size:15px">下次要做</h3><ul class="rules">${sr.todo.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
        </div>
      </div>`;
    $('#foot').innerHTML = `資料：MUSINSA 韓國站與 Global 台灣站（價格以分析當日為準）｜<a href="https://github.com/${esc(REPO.owner)}/${esc(REPO.repo)}" target="_blank" rel="noopener">GitHub</a>｜<a href="https://github.com/${esc(REPO.owner)}/${esc(REPO.repo)}/blob/main/PLAYBOOK.md" target="_blank" rel="noopener">每月流程</a>`;
  }

  function renderAll() {
    renderHero(); renderSales(); renderTrends(); renderPicks(); renderBrands();
    renderWardrobe(); renderList(); renderOutfits(); renderOrders(); renderExcluded(); renderMethod();
  }

  // ---------------------------------------------------------------- events
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.add) toggleList(t.dataset.add);
    else if (t.dataset.remove) toggleList(t.dataset.remove);
    else if (t.dataset.cat) { S.cat = t.dataset.cat; renderPicks(); }
    else if ('new' in t.dataset) { S.onlyNew = !S.onlyNew; renderPicks(); }
    else if ('clean' in t.dataset) { S.clean = !S.clean; renderPicks(); }
    else if (t.dataset.btab) { S.brandTab = t.dataset.btab; renderBrands(); }
    else if (t.dataset.band) { S.band = t.dataset.band; renderOutfits(); }
    else if (t.dataset.trend) { S.trendTab = t.dataset.trend; renderTrends(); }
    else if ('sync' in t.dataset) syncIssue();
    else if ('copy' in t.dataset) copyList();
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'sort') { S.sort = e.target.value; renderPicks(); }
  });

  // ---------------------------------------------------------------- boot
  (async () => {
    const [month, orders, wish, rules, profile] = await Promise.all(
      ['data/latest.json', 'data/orders.json', 'data/wishlist.json', 'config/rules.json', 'config/profile.json']
        .map((p) => getJSON(p).catch(() => null)),
    );
    Object.assign(S, { month, orders, wishRepo: wish, rules, profile });
    loadList();
    saveList();
    try { renderAll(); } catch (err) {
      console.error(err);
      $('#hero').innerHTML = `<h1>載入失敗</h1><p>${esc(err.message)}</p>`;
    }
  })();
})();
