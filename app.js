'use strict';

// ── 狀態 ──────────────────────────────────────────────────────────────────────
let selectedId   = null;
let activeRegion = 'all';
let activeTab    = 'sights';

// 縣名 ≠ 著名城市的對照表（一般旅客熟悉的城市名）
const FAMOUS_CITY = {
  1:'札幌',  4:'仙台',  14:'横浜', 17:'金沢',
  23:'名古屋', 28:'神戸', 32:'出雲', 40:'博多', 44:'別府'
};

// hover 大字標籤（initMap 後填充）
let prefCentroids = null;
let hoverLabel    = null;
let hoverSub      = null;
let hoverLabelK   = 1;
let favLayer      = null;   // 地圖上「已收藏的縣」愛心標記層
let routeLayer    = null;   // 行程動線層（已排程的收藏縣按天順序連線）

// ── 收藏清單 (localStorage) ───────────────────────────────────────────────────
// favs 結構：{ "縣id|tab|景點名": {id, tab, name} }，key 三段唯一定位一筆條目
const FAV_STORE = 'jt_favs';
let favs = (() => {
  try { return JSON.parse(localStorage.getItem(FAV_STORE)) || {}; }
  catch { return {}; }
})();
let currentView = 'welcome';   // welcome | pref | cat | favs（給愛心移除時判斷用）

function saveFavs() { localStorage.setItem(FAV_STORE, JSON.stringify(favs)); }
function favKeyOf(id, tab, name) { return `${id}|${tab}|${name}`; }
function isFav(key)   { return Object.prototype.hasOwnProperty.call(favs, key); }
function favCount()   { return Object.keys(favs).length; }

// 卡片右上角的愛心按鈕（已收藏=❤️、未收藏=🤍），點擊由 info-panel 委派處理
function favBtnHtml(key) {
  return `<button class="fav-btn${isFav(key) ? ' on' : ''}" data-fav="${key}" aria-label="收藏" title="收藏">${isFav(key) ? '❤️' : '🤍'}</button>`;
}

function updateFavChip() {
  const n = favCount();
  const c = document.getElementById('fav-count');
  if (c) c.textContent = `(${n})`;
  const b = document.getElementById('trip-fab-badge');
  if (b) b.textContent = n;
}

// ── 日圓金額解析 + 台幣換算 ───────────────────────────────────────────────────
const JPY_TWD = 0.21;                         // 近似匯率（要精準改這行即可）
const ntd     = yen => Math.round(yen * JPY_TWD);
const numFmt  = n   => n.toLocaleString('en-US');

// 從 price 字串抽日圓金額；回傳 {low, high} 或 null（免費/無金額）
function parseYen(price) {
  if (!price) return null;
  const m = price.match(/¥\s?([\d,]+)(?:\s?[–-]\s?([\d,]+))?/);
  if (!m) return null;
  const low  = +m[1].replace(/,/g, '');
  const high = m[2] ? +m[2].replace(/,/g, '') : low;
  return { low, high };
}

// 卡片價格旁的台幣小字（區間就換算成區間）
function priceTwdHtml(price) {
  const y = parseYen(price);
  if (!y) return '';
  const t = y.low === y.high
    ? `NT$${numFmt(ntd(y.low))}`
    : `NT$${numFmt(ntd(y.low))}–${numFmt(ntd(y.high))}`;
  return `<span class="card-twd">≈ ${t}</span>`;
}

// 條目金額中位數（區間取中點），供行程預算加總
function itemYen(item) {
  const y = parseYen(item.price);
  return y ? Math.round((y.low + y.high) / 2) : 0;
}

// Google 地圖導航連結（name + where 直接帶到地圖搜尋）
function mapsHref(c) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.name} ${c.where || ''} 日本`)}`;
}

// ── 櫻花動畫 ──────────────────────────────────────────────────────────────────
function initSakura() {
  const container = document.getElementById('sakura');
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('div');
    p.className = 'petal';
    const size = 5 + Math.random() * 7;
    Object.assign(p.style, {
      left:              `${Math.random() * 100}%`,
      animationDuration: `${6 + Math.random() * 9}s`,
      animationDelay:    `${-Math.random() * 15}s`,
      width:             `${size}px`,
      height:            `${size}px`,
    });
    container.appendChild(p);
  }
}

// ── D3 地圖 ───────────────────────────────────────────────────────────────────
const svg = d3.select('#japan-svg');
const g   = svg.append('g');
let zoom;

function getPrefId(feature) {
  const p = feature.properties || {};
  return +(p.id ?? p.code ?? feature.id ?? 0);
}

async function initMap() {
  const TOPO = 'https://cdn.jsdelivr.net/gh/dataofjapan/land@master/japan.topojson';
  let topo;

  try {
    topo = await fetch(TOPO).then(r => {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
  } catch (err) {
    document.getElementById('map-loading').innerHTML =
      '<div class="load-error">地圖載入失敗<br>請確認網路連線</div>';
    return;
  }

  document.getElementById('map-loading').style.display = 'none';

  const key      = Object.keys(topo.objects)[0];
  const features = topojson.feature(topo, topo.objects[key]).features;

  const panel = document.getElementById('map-panel');
  const W = panel.clientWidth  || 640;
  const H = panel.clientHeight || 720;

  // 用固定地理邊界框而非 feature collection 邊界
  // feature collection 邊界因沖繩離島偏南，會讓主島群縮小
  const JP_BOUNDS = {
    type: 'Feature',
    geometry: {
      type: 'MultiPoint',
      coordinates: [[128.5, 25], [146.5, 25], [146.5, 45.6], [128.5, 45.6]]
    }
  };

  const projection = d3.geoMercator()
    .fitExtent([[8, 8], [W - 8, H - 8]], JP_BOUNDS);
  const path = d3.geoPath().projection(projection);

  // 手機的地圖面板矮（44vh），同樣的地方名字級數擺在小地圖上會擠成一團，
  // 所以字級／描邊粗細都跟著面板實際高度縮小，縮放時仍照這個縮小後的基準值等比例算
  const labelFontBase   = H < 400 ? 8   : 13;
  const labelStrokeBase = H < 400 ? 2.5 : 4;

  zoom = d3.zoom()
    .scaleExtent([0.5, 16])
    .on('zoom', e => {
      g.attr('transform', e.transform);
      const k = e.transform.k;
      g.selectAll('.region-label')
        .attr('font-size', String(labelFontBase / k))
        .attr('stroke-width', String(labelStrokeBase / k))
        .style('opacity', k > 3.5 ? Math.max(0, 1 - (k - 3.5) / 2) : 1);
      hoverLabelK = k;
      if (favLayer) favLayer.selectAll('.fav-heart').attr('font-size', String(15 / k));
      if (hoverLabel) {
        hoverLabel.attr('font-size', String(22 / k)).attr('stroke-width', String(5 / k));
        hoverSub.attr('font-size', String(10 / k)).attr('stroke-width', String(2.5 / k));
        const hx = +hoverLabel.attr('x'), hy = +hoverLabel.attr('y');
        if (hx) hoverSub.attr('y', hy + 16 / k);
      }
    });
  svg.call(zoom);

  g.selectAll('.pref-path')
    .data(features)
    .join('path')
    .attr('class', 'pref-path')
    .attr('d', path)
    .style('fill', d => {
      const pref   = PREF[getPrefId(d)];
      const region = pref ? REGION[pref.region] : null;
      return region ? region.color : '#444466';
    })
    .on('mousemove',  onHover)
    .on('mouseleave', () => {
      tooltip.style.opacity = '0';
      if (hoverLabel) { hoverLabel.style('opacity', 0); hoverSub.style('opacity', 0); }
      g.selectAll('.region-label').style('opacity', 1);
    })
    .on('click',      onPrefClick);

  // 地方名標籤
  const regionPts = {};
  features.forEach(d => {
    const pref = PREF[getPrefId(d)];
    if (!pref) return;
    const c = path.centroid(d);
    if (isNaN(c[0])) return;
    (regionPts[pref.region] = regionPts[pref.region] || []).push(c);
  });
  Object.entries(regionPts).forEach(([key, pts]) => {
    const r = REGION[key];
    if (!r) return;
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    g.append('text')
      .attr('class', 'region-label')
      .attr('x', cx).attr('y', cy)
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
      .attr('pointer-events', 'none')
      .attr('font-family', "'Noto Sans TC', system-ui, sans-serif")
      .attr('font-size', String(labelFontBase)).attr('font-weight', '900')
      .attr('fill', r.color)
      .attr('stroke', 'rgba(6,6,15,0.92)').attr('stroke-width', String(labelStrokeBase))
      .attr('stroke-linejoin', 'round').attr('paint-order', 'stroke fill')
      .text(r.label);
  });

  // 預計算每個縣的重心（供 hover 標籤定位）
  prefCentroids = new Map();
  features.forEach(d => {
    const c = path.centroid(d);
    if (!isNaN(c[0])) prefCentroids.set(getPrefId(d), c);
  });

  // 行程動線層先建（在愛心層下方，線不擋愛心），再建愛心層
  routeLayer = g.append('g').attr('class', 'route-layer').attr('pointer-events', 'none');
  favLayer = g.append('g').attr('class', 'fav-layer').attr('pointer-events', 'none');
  updateFavMarkers();

  // Hover 大字標籤：主文字（城市名）+ 副文字（縣名，城市名不同時才顯示）
  const hlG = g.append('g').attr('pointer-events', 'none');
  hoverSub = hlG.append('text')
    .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
    .attr('font-family', "'Noto Sans TC', system-ui, sans-serif")
    .attr('font-weight', '700')
    .attr('fill', 'rgba(255,255,255,0.65)')
    .attr('stroke', 'rgba(6,6,15,0.9)').attr('stroke-linejoin', 'round')
    .attr('paint-order', 'stroke fill')
    .style('opacity', 0);
  hoverLabel = hlG.append('text')
    .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
    .attr('font-family', "'Noto Sans TC', system-ui, sans-serif")
    .attr('font-weight', '900')
    .attr('stroke', 'rgba(6,6,15,0.92)').attr('stroke-linejoin', 'round')
    .attr('paint-order', 'stroke fill')
    .style('opacity', 0)
    .style('transition', 'opacity .12s');

  // 淡入
  g.style('opacity', 0)
    .transition().duration(500)
    .style('opacity', 1);

  buildLegend();
  applyDeepLink();
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
const tooltip = document.getElementById('map-tooltip');

function onHover(event, d) {
  const pref   = PREF[getPrefId(d)];
  if (!pref) return;
  const region = REGION[pref.region];

  const id        = getPrefId(d);
  const cityAlias = FAMOUS_CITY[id];
  const color     = region?.color || '#fff';

  // 小 tooltip（右上角）
  document.getElementById('tt-name').textContent =
    cityAlias ? `${pref.name}（${cityAlias}）` : pref.name;
  document.getElementById('tt-name').style.color = color;
  document.getElementById('tt-en').textContent   = pref.nameEn;

  // 預覽卡：評等 + 預算 + 代表景點
  const RT = { S: '#f0a500', A: '#4ecdc4', B: '#c9a36a' };
  const parts = [];
  if (pref.rating) parts.push(`<span class="tt-badge" style="color:${RT[pref.rating] || '#f0a500'}">★ ${pref.rating} 級</span>`);
  if (pref.budget) parts.push(`<span class="tt-badge tt-budget">${pref.budget}</span>`);
  document.getElementById('tt-meta').innerHTML = parts.join('');
  const topSight = pref.sights?.[0]?.name || '';
  document.getElementById('tt-sight').textContent = topSight ? `代表景點：${topSight}` : '';

  tooltip.style.opacity = '1';

  // hover 時地方名標籤退場，讓縣市大字成為唯一焦點
  g.selectAll('.region-label').style('opacity', 0.08);

  // 縣市形狀正中央大字標籤
  if (hoverLabel && prefCentroids) {
    const c = prefCentroids.get(id);
    if (c) {
      const displayName = cityAlias || pref.name;
      hoverLabel
        .attr('x', c[0]).attr('y', c[1])
        .attr('font-size', String(22 / hoverLabelK))
        .attr('stroke-width', String(5 / hoverLabelK))
        .attr('fill', color)
        .style('opacity', 1)
        .text(displayName);
      if (cityAlias) {
        hoverSub
          .attr('x', c[0]).attr('y', c[1] + 16 / hoverLabelK)
          .attr('font-size', String(10 / hoverLabelK))
          .attr('stroke-width', String(2.5 / hoverLabelK))
          .style('opacity', 0.7)
          .text(pref.name);
      } else {
        hoverSub.style('opacity', 0);
      }
    }
  }

  const rect = document.getElementById('map-panel').getBoundingClientRect();
  let x = event.clientX - rect.left + 14;
  let y = event.clientY - rect.top  - 44;
  if (x + 180 > rect.width)  x -= 195;
  if (y < 4)                  y  = event.clientY - rect.top + 16;
  tooltip.style.left = `${x}px`;
  tooltip.style.top  = `${y}px`;
}

// ── 點擊縣市 ──────────────────────────────────────────────────────────────────
function onPrefClick(_event, d) {
  const id   = getPrefId(d);
  const pref = PREF[id];
  if (!pref) return;

  g.selectAll('.pref-path').classed('selected', false);
  d3.select(this).classed('selected', true);
  selectedId = id;

  showPref(pref);
}

// ── 顯示縣市資訊 ──────────────────────────────────────────────────────────────
function showPref(pref, startTab = 'sights') {
  currentView = 'pref';
  document.getElementById('welcome').style.display = 'none';
  const view = document.getElementById('pref-view');
  view.style.display = 'flex';
  view.style.animation = 'none';
  void view.offsetWidth;
  view.style.animation = '';

  activeTab = startTab;

  const region = REGION[pref.region];
  const col    = region?.color || '#888';

  view.innerHTML = `
    <div class="pv-header">
      <div class="pv-region-badge" style="background:${col}1a;color:${col};border-color:${col}44">
        ${region?.label || pref.region}
      </div>
      <div class="pv-name">${pref.name}</div>
      <div class="pv-name-en">${pref.nameEn} Prefecture</div>
      ${prefMetaHtml(pref)}
      ${pref.desc ? `<div class="pv-desc">${pref.desc}</div>` : ''}
    </div>
    <div class="pv-tabs" id="pv-tabs"></div>
    <div class="pv-content" id="pv-content"></div>
  `;

  buildTabs(pref);
  renderContent(pref, activeTab);
  pushNav({ v: 'pref', id: selectedId, tab: activeTab });   // 推入歷史＋網址同步成此縣，複製即可分享
  showHomeFab(true);
  document.getElementById('info-panel').scrollTop = 0;
  recenterMap();                     // 選完縣市，把左側地圖拉回正中央
}

// 縣頁標題下的徽章列：⭐評等 / 💰預算 / 季節色票（把藏在資料裡的 rating/budget/seasons 秀出來）
function prefMetaHtml(pref) {
  const RT = { S: '#f0a500', A: '#4ecdc4', B: '#c9a36a' };
  const badges = [];
  if (pref.rating) {
    const c = RT[pref.rating] || '#f0a500';
    badges.push(`<span class="pv-badge" style="color:${c};border-color:${c}55">${UI_ICONS.star} ${pref.rating} 級</span>`);
  }
  if (pref.budget) badges.push(`<span class="pv-badge pv-budget">${UI_ICONS.coin} ${pref.budget}</span>`);
  (pref.seasons || []).forEach(k => {
    const s = SEASONS.find(x => x.key === k);
    if (s) badges.push(`<span class="pv-badge" style="color:${s.color};border-color:${s.color}55">${UI_ICONS[s.ic]} ${s.label}</span>`);
  });
  return badges.length ? `<div class="pv-meta">${badges.join('')}</div>` : '';
}

// ── 導覽歷史（讓瀏覽器上一頁／下一頁與滑鼠側鍵能回到上一個畫面）──────────────
// 每進一個畫面就 push 一筆歷史 state；popstate（上一頁/下一頁/側鍵）時只依 state 重繪、不再 push
let navPop = false;                        // popstate 重繪期間為 true，擋掉重繪引發的再次 push
function pushNav(state) {
  if (navPop) return;
  const url = state.v === 'pref' ? '?pref=' + state.id : location.pathname;
  history.pushState(state, '', url);
}
function routeTo(state) {
  const s = state || { v: 'welcome' };
  switch (s.v) {
    case 'pref':   PREF[s.id] ? gotoPref(s.id, s.tab || 'sights') : goHome(); break;
    case 'favs':   showFavorites(); break;
    case 'cat':    CATEGORIES[s.i] ? showCategory(CATEGORIES[s.i]) : goHome(); break;
    case 'tag':    showTag(s.tag); break;
    case 'season': { const se = SEASONS.find(x => x.key === s.key); se ? showSeason(se) : goHome(); break; }
    case 'tool':   showToolbox(s.tab || 'fx'); break;
    case 'quiz':   showQuiz(); break;
    default:       goHome();
  }
}
window.addEventListener('popstate', e => { navPop = true; routeTo(e.state); navPop = false; });

// 開站時若網址帶 ?pref=N 就直接開到該縣（initMap 末尾呼叫，地圖已就緒）；同時 seed 第一筆歷史 state
function applyDeepLink() {
  const id = +new URLSearchParams(location.search).get('pref');
  if (id && PREF[id]) {
    navPop = true; gotoPref(id); navPop = false;                       // 渲染但不 push
    history.replaceState({ v: 'pref', id, tab: 'sights' }, '', '?pref=' + id);
  } else {
    history.replaceState({ v: 'welcome' }, '', location.pathname);     // 首頁 seed，back 到底就停在首頁
  }
}

function buildTabs(pref) {
  const TABS = [
    { id: 'sights',    label: `景點${pref.sights?.length    ? ` (${pref.sights.length})`    : ''}` },
    { id: 'food',      label: `美食${pref.food?.length      ? ` (${pref.food.length})`      : ''}` },
    { id: 'stay',      label: '住宿' },
    { id: 'transport', label: '交通' },
    { id: 'tips',      label: '建議' },
  ];
  const el = document.getElementById('pv-tabs');
  el.innerHTML = TABS.map(t =>
    `<button class="pv-tab${t.id === activeTab ? ' active' : ''}" data-tab="${t.id}">${t.label}</button>`
  ).join('');
  el.querySelectorAll('.pv-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      el.querySelectorAll('.pv-tab').forEach(b => b.classList.toggle('active', b === btn));
      renderContent(PREF[selectedId], activeTab);
    });
  });
}

function renderContent(pref, tab) {
  const el = document.getElementById('pv-content');
  el.dataset.theme = tab;          // 各分頁套各自風格主題
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = 'slidein .2s ease';
  switch (tab) {
    case 'sights':    el.innerHTML = buildCards(pref?.sights,     '景點 & 體驗', selectedId, 'sights'); break;
    case 'food':      el.innerHTML = buildCards(pref?.food,       '美食 & 餐廳', selectedId, 'food');   break;
    case 'stay':      el.innerHTML = buildStay(pref);                             break;
    case 'transport': el.innerHTML = buildTransport(pref);                        break;
    case 'tips':      el.innerHTML = buildTips(pref);                             break;
  }
}

// 單張卡片 HTML（縣頁與主題探索頁共用）；extra 可塞額外尾部內容，favKey 給愛心按鈕
function cardHtml(c, extra = '', favKey = null, idx = 0) {
  return `
    <div class="card${c.wide ? ' wide' : ''}" style="--i:${Math.min(idx, 10)}">
      ${favKey ? favBtnHtml(favKey) : ''}
      ${c.img ? `<img class="card-img" src="${c.img}" alt="${c.name}" loading="lazy" onerror="this.style.display='none'">` : ''}
      <div class="card-name">${c.name}</div>
      <div class="card-desc">${c.desc}</div>
      ${c.tags?.length ? `<div class="card-tags">${c.tags.map(t => `<span class="tag" data-tag="${t}">${t}</span>`).join('')}</div>` : ''}
      <div class="card-meta">
        ${c.where ? `<span class="card-where">${UI_ICONS.pin} ${c.where}</span>` : ''}
        ${c.price ? `<span class="card-price">${c.price}</span>` : ''}
        ${priceTwdHtml(c.price)}
        ${c.time  ? `<span class="card-time">${c.time}</span>`   : ''}
      </div>
      <a class="card-map" href="${mapsHref(c)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${UI_ICONS.nav} Google 地圖導航</a>
      ${c.tip ? `<div class="card-tip">${UI_ICONS.bulb} ${c.tip}</div>` : ''}
      ${extra}
    </div>`;
}

function buildCards(items, title, prefId, tab) {
  const hdr = `<div class="sec-title">${title}</div>`;
  if (!items?.length)
    return hdr + `<div class="empty-state">資料整備中，敬請期待</div>`;
  // 有 area 欄位 → 依區域分組（保留首次出現順序）；沒有就照舊平鋪，其他 44 縣不受影響
  if (items.some(c => c.area)) {
    const order = [], groups = new Map();
    items.forEach(c => {
      const a = c.area || '其他';
      if (!groups.has(a)) { groups.set(a, []); order.push(a); }
      groups.get(a).push(c);
    });
    let idx = 0;
    return hdr + order.map(a => {
      const cards = groups.get(a).map(c =>
        cardHtml(c, '', favKeyOf(prefId, tab, c.name), idx++)).join('');
      return `<div class="area-group">
        <div class="area-title">${UI_ICONS.pin}${a}<span class="area-count">${groups.get(a).length}</span></div>
        <div class="cards">${cards}</div>
      </div>`;
    }).join('');
  }
  return hdr + `<div class="cards">${items.map((c, i) =>
    cardHtml(c, '', favKeyOf(prefId, tab, c.name), i)).join('')}</div>`;
}

function transportIcon(label, val) {
  // 標籤優先：標籤已點明類別時，不被內文的次要字眼蓋過
  if (/市內|市區/.test(label))   return UI_ICONS.subway;
  if (/機場|空港/.test(label))   return UI_ICONS.plane;
  // 其餘依內文主要交通方式判斷（由具代表性到一般）
  const s = label + val;
  if (/新幹線/.test(s))                                  return UI_ICONS.shinkansen;
  if (/渡輪|渡船|噴射船|遊覽船|觀潮船|登島/.test(s))     return UI_ICONS.ferry;
  if (/纜車|空中索道/.test(s))                           return UI_ICONS.cablecar;
  if (/航班|廉航|飛機/.test(s))                          return UI_ICONS.plane;
  if (/自行車|單車|腳踏車/.test(s))                       return UI_ICONS.bike;
  if (/單軌|地鐵|地下鐵|路面電車|市電/.test(s))          return UI_ICONS.subway;
  if (/巴士/.test(s))                                     return UI_ICONS.bus;
  return UI_ICONS.train;
}

// 把票價與車程時間自動highlight，方便一眼掃到重點
function transportHighlight(v) {
  return v
    .replace(/¥[\d,]+(?:[–-][\d,]+)?/g, m => `<b class="t-fare">${m}</b>`)
    .replace(/約?\s?\d+(?:\.\d+)?\s?小時(?:\s?\d+\s?分)?|約?\s?\d+\s?分鐘?/g,
             m => `<b class="t-time">${m}</b>`);
}

// 交通分頁只放簡短摘要＋按鈕；完整步驟/省錢/提醒點按鈕進彈窗看
function buildArrival(a) {
  if (!a?.summary) return '';
  return `<div class="arrival-guide">
    <div class="arrival-title">${UI_ICONS.nav} 抵達指南</div>
    <div class="arrival-summary arrival-summary--brief">${transportHighlight(a.summary)}</div>
    <button class="arrival-more" onclick="openArrivalGuide()">查看完整抵達指南 →</button>
  </div>`;
}

// 點進來的詳細介面（彈窗）：完整步驟＋省錢路線＋實用提醒
function openArrivalGuide() {
  const pref = PREF[selectedId];
  const a = pref?.arrival;
  if (!a) return;
  const steps = (a.steps || []).map((s, i) => `
    <li class="arrival-step">
      <span class="arrival-num">${i + 1}</span>
      <span class="arrival-text">${transportHighlight(s)}</span>
    </li>`).join('');
  const budget = a.budget ? `
    <div class="ag-section-title">${UI_ICONS.coin} 省錢／預算路線</div>
    <div class="arrival-budget">${transportHighlight(a.budget)}</div>` : '';
  const tips = a.tips?.length ? `
    <div class="ag-section-title">${UI_ICONS.warn} 實用提醒</div>
    <ul class="ag-tips">${a.tips.map(t => `<li>${transportHighlight(t)}</li>`).join('')}</ul>` : '';

  const overlay = document.createElement('div');
  overlay.className = 'ag-overlay';
  overlay.id = 'ag-overlay';
  overlay.addEventListener('click', e => { if (e.target === overlay) closeArrivalGuide(); });
  overlay.innerHTML = `
    <div class="ag-modal">
      <div class="ag-modal-head">
        <div class="ag-modal-title">${UI_ICONS.nav} ${pref.name} · 抵達指南</div>
        <button class="ag-close" onclick="closeArrivalGuide()" aria-label="關閉">✕</button>
      </div>
      <div class="ag-modal-body">
        <div class="arrival-summary">${transportHighlight(a.summary)}</div>
        <div class="ag-section-title">${UI_ICONS.pin} 抵達步驟</div>
        <ol class="arrival-steps">${steps}</ol>
        ${budget}
        ${tips}
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
}

function closeArrivalGuide() {
  document.getElementById('ag-overlay')?.remove();
  document.body.style.overflow = '';
}

// AI 行程助手：用 iframe 開在彈窗裡，不換頁也不開新分頁。
// ai-planner.html 保持獨立單檔（CSS/JS 作用域隔離，直接開網址仍可單獨使用）。
function openAiPlanner() {
  if (document.getElementById('ai-overlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'ag-overlay';
  overlay.id = 'ai-overlay';
  overlay.addEventListener('click', e => { if (e.target === overlay) closeAiPlanner(); });
  overlay.innerHTML = `
    <div class="ag-modal ai-modal">
      <div class="ag-modal-head">
        <div class="ag-modal-title">${UI_ICONS.nav} AI 行程規劃助手</div>
        <button class="ag-close" onclick="closeAiPlanner()" aria-label="關閉">✕</button>
      </div>
      <iframe class="ai-frame" src="ai-planner.html" title="AI 行程規劃助手"></iframe>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', aiPlannerEsc);
}

function aiPlannerEsc(e) { if (e.key === 'Escape') closeAiPlanner(); }

function closeAiPlanner() {
  document.getElementById('ai-overlay')?.remove();
  document.body.style.overflow = '';
  document.removeEventListener('keydown', aiPlannerEsc);
  // iframe 存進行程後，同分頁不會觸發 storage 事件，故關窗時重讀一次
  try { favs = JSON.parse(localStorage.getItem(FAV_STORE)) || {}; } catch { favs = {}; }
  updateFavChip();
  updateFavMarkers();
  if (currentView === 'favs') showFavorites();
}

// Booking.com 區域搜尋連結（帶區域+縣名直接帶到訂房網）
// Booking 區域搜尋連結；priceNflt 帶價位篩選（便宜→貴讓遊客挑），無則找全部
function bookingHref(area, prefName, priceNflt) {
  // 帶入預設日期（今天+30 天、住 1 晚、2 大人）：沒有日期 Booking 算不出每晚房價，價格區間篩選會失效顯示空
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const checkin  = new Date(); checkin.setDate(checkin.getDate() + 30);
  const checkout = new Date(checkin); checkout.setDate(checkout.getDate() + 1);
  let url = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(`${area} ${prefName}`)}`
          + `&checkin=${fmt(checkin)}&checkout=${fmt(checkout)}&group_adults=2&no_rooms=1&order=price`;
  if (priceNflt) url += `&nflt=${encodeURIComponent(priceNflt)}`;
  return url;
}

// 住宿價位分級（日圓/晚）：點各級 → Booking 帶該價位篩選的真實飯店清單
const STAY_TIERS = [
  { label: '平價',  range: '<¥1.5萬',    nflt: 'price=JPY-1-15000-1' },
  { label: '中價',  range: '¥1.5–3萬',   nflt: 'price=JPY-15000-30000-1' },
  { label: '高級',  range: '¥3萬+',      nflt: 'price=JPY-30000-100000-1' },
];

// 住宿區域指南：推薦住哪一區 + 特色 + 預算(含台幣) + Booking 搜尋連結
function buildStay(pref) {
  const items = pref?.stay;
  const hdr = `<div class="sec-title">住宿區域指南</div>`;
  if (!items?.length)
    return hdr + `<div class="empty-state">住宿指南整備中，敬請期待</div>`;
  const note = `<div class="stay-note">先挑適合你的區域，再點「Booking 找這區」比價訂房</div>`;
  return hdr + note + `<div class="stay-list">${items.map(a => {
    const pic = a.hotel || a.photo;   // hotel=飯店照、photo=該區地標/氛圍照
    return `
    <div class="stay-area${pic?.img ? ' has-photo' : ''}">
      ${pic?.img ? `<div class="stay-photo">
        <img class="stay-img" src="${pic.img}" alt="${pic.name}" loading="lazy" onerror="this.closest('.stay-area').classList.remove('has-photo');this.parentElement.remove()">
        <span class="stay-photo-cap">${pic.name}</span>
      </div>` : ''}
      <div class="stay-body">
        <div class="stay-head">
          <span class="stay-icon">${a.icon || '🏨'}</span>
          <span class="stay-name">${a.area}</span>
          ${a.budget ? `<span class="stay-budget">${a.budget}/晚 ${priceTwdHtml(a.budget)}</span>` : ''}
        </div>
        <div class="stay-vibe">${a.vibe}</div>
        ${a.tip ? `<div class="stay-tip">${UI_ICONS.bulb} ${a.tip}</div>` : ''}
        <div class="stay-book-row">
          <span class="stay-book-label">${UI_ICONS.bed} Booking 找這區</span>
          ${STAY_TIERS.map(t => `<a class="stay-tier" href="${bookingHref(a.area, pref.name, t.nflt)}" target="_blank" rel="noopener" title="${t.label} ${t.range}/晚">${t.label}<span class="stay-tier-range">${t.range}</span></a>`).join('')}
        </div>
      </div>
    </div>`;
  }).join('')}</div>`;
}

function buildTransport(pref) {
  const items = pref?.transport;
  const hdr = `<div class="sec-title">交通攻略</div>`;
  const guide = buildArrival(pref?.arrival);
  if (!items?.length)
    return hdr + guide + `<div class="empty-state">資料整備中，敬請期待</div>`;
  return hdr + guide + `<div class="transport-list">${items.map(t => `
    <div class="transport-item">
      <div class="transport-head">
        <span class="transport-icon">${transportIcon(t.label, t.val)}</span>
        <span class="transport-label">${t.label}</span>
      </div>
      <div class="transport-val">${transportHighlight(t.val)}</div>
    </div>`).join('')}</div>`;
}

function buildTips(pref) {
  const adv = pref?.advice;
  const tips = pref?.tips;
  const hdr = `<div class="sec-title">旅遊建議</div>`;
  let html = '';
  if (adv?.season)
    html += `<div class="adv-block">
      <div class="adv-title adv-title--season">${UI_ICONS.calendar} 最佳季節</div>
      <div class="season-card"><span class="season-bar"></span>
        <div class="season-text">${transportHighlight(adv.season)}</div>
      </div>
    </div>`;
  if (adv?.itinerary?.length)
    html += `<div class="adv-block">
      <div class="adv-title adv-title--itin">${UI_ICONS.map} 行程範例</div>
      <div class="itin-timeline">
        ${adv.itinerary.map(it => `<div class="itin-card">
          <span class="itin-marker"></span>
          <div class="itin-content">
            <span class="itin-title">${it.title}</span>
            <div class="itin-body">${transportHighlight(it.body)}</div>
          </div>
        </div>`).join('')}
      </div>
    </div>`;
  if (adv?.souvenirs?.length)
    html += `<div class="adv-block">
      <div class="adv-title adv-title--souv">${UI_ICONS.bag} 必買伴手禮</div>
      <div class="souv-list">${adv.souvenirs.map(s => `<div class="souv-card">
        <span class="souv-thumb">${s.img
          ? `<img class="souv-img" src="${s.img}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="souv-emoji" style="display:none">${s.icon || '🎁'}</span>`
          : `<span class="souv-emoji">${s.icon || '🎁'}</span>`}</span>
        <span class="souv-name">${s.name}</span>
      </div>`).join('')}</div>
    </div>`;
  if (tips?.length)
    html += `<div class="adv-block">
      <div class="adv-title adv-title--tips">${UI_ICONS.bulb} 實用建議</div>
      <div class="tips-list">${tips.map(t => `<div class="tip-item">${t}</div>`).join('')}</div>
    </div>`;
  if (!html) return hdr + `<div class="empty-state">資料整備中，敬請期待</div>`;
  return hdr + html;
}

// ── 圖例 ──────────────────────────────────────────────────────────────────────
function buildLegend() {
  const el = document.getElementById('legend');
  el.innerHTML = Object.entries(REGION).map(([key, r]) => `
    <div class="leg-item" data-r="${key}">
      <div class="leg-dot" style="background:${r.color};box-shadow:0 0 6px ${r.color}88"></div>
      <span style="color:${r.color}">${r.label}</span>
    </div>
  `).join('');

  el.querySelectorAll('.leg-item').forEach(item => {
    item.addEventListener('click', () => {
      const r = item.dataset.r;
      activeRegion = activeRegion === r ? 'all' : r;
      refreshOpacity();
    });
  });
}

// ── 地圖透明度（篩選用） ──────────────────────────────────────────────────────
function refreshOpacity() {
  g.selectAll('.pref-path').classed('dimmed', d => {
    if (activeRegion === 'all') return false;
    const pref = PREF[getPrefId(d)];
    return !(pref && pref.region === activeRegion);
  });

  // 圖例 active 樣式
  document.querySelectorAll('.leg-item').forEach(item => {
    item.classList.toggle('active',
      item.dataset.r === activeRegion || activeRegion === 'all');
  });
}

// ── 地方概覽 (歡迎頁) ─────────────────────────────────────────────────────────
function buildRegionOverview() {
  const el = document.getElementById('region-overview');
  if (!el) return;
  const counts = {};
  Object.values(PREF).forEach(p => { counts[p.region] = (counts[p.region] || 0) + 1; });
  const EN = {
    hokkaido:'Hokkaido', tohoku:'Tohoku', kanto:'Kanto',
    chubu:'Chubu', kansai:'Kansai', chugoku:'Chugoku',
    shikoku:'Shikoku', kyushu:'Kyushu', okinawa:'Okinawa'
  };
  el.innerHTML = Object.entries(REGION).map(([key, r]) => `
    <div class="region-card" data-r="${key}">
      <div style="position:absolute;top:0;left:0;width:3px;height:100%;background:${r.color};border-radius:0.75rem 0 0 0.75rem"></div>
      <div class="rc-name" style="color:${r.color}">${r.label}</div>
      <div class="rc-en">${EN[key] || key}</div>
      <div class="rc-cnt">${counts[key] || 0} 縣市</div>
    </div>
  `).join('');
  el.querySelectorAll('.region-card').forEach(card => {
    card.addEventListener('click', () => {
      activeRegion = activeRegion === card.dataset.r ? 'all' : card.dataset.r;
      refreshOpacity();
    });
  });
}


// ── 縮放控制 ──────────────────────────────────────────────────────────────────
document.getElementById('btn-zoom-in').addEventListener('click', () =>
  svg.transition().duration(280).call(zoom.scaleBy, 1.5));
document.getElementById('btn-zoom-out').addEventListener('click', () =>
  svg.transition().duration(280).call(zoom.scaleBy, 0.667));
document.getElementById('btn-zoom-reset').addEventListener('click', () =>
  svg.transition().duration(380).call(zoom.transform, d3.zoomIdentity));

// 讓地圖平滑回到正中央預設視角（等同「⊕」重置鈕）。已在正中央就不動，避免多餘動畫
function recenterMap() {
  if (!zoom) return;
  const t = d3.zoomTransform(svg.node());
  if (t.k === 1 && t.x === 0 && t.y === 0) return;
  svg.transition().duration(380).call(zoom.transform, d3.zoomIdentity);
}
// 在右側面板點選時，把左側地圖拉回正中央（避免瀏覽時地圖被拖曳/滾輪亂移到）
document.getElementById('info-panel').addEventListener('click', recenterMap);

// ── 搜尋功能 ──────────────────────────────────────────────────────────────────
// 繁日異體字正規化（搜尋用）：把常見日式/異體漢字統一成繁體，讓「絕景/絶景」「溫泉/温泉」繁日雙向都搜得到
const CJK_NORM = { '絶':'絕','産':'產','歴':'歷','広':'廣','国':'國','芸':'藝','桜':'櫻','県':'縣','沢':'澤','浜':'濱','滝':'瀧','峡':'峽','湾':'灣','観':'觀','専':'專','写':'寫','図':'圖','鉄':'鐵','売':'賣','円':'圓','体':'體','旧':'舊','気':'氣','楽':'樂','経':'經','緑':'綠','関':'關','温':'溫','宝':'寶','塩':'鹽','渓':'溪','灯':'燈','竜':'龍','浄':'淨' };
const CJK_RE = new RegExp('[' + Object.keys(CJK_NORM).join('') + ']', 'g');
const nrm = s => (s || '').toLowerCase().replace(CJK_RE, c => CJK_NORM[c] || c);

function initSearch() {
  const input   = document.getElementById('search-input');
  const results = document.getElementById('search-results');

  function doSearch(q) {
    q = q.trim();
    if (!q) { results.classList.remove('open'); return; }

    const nq = nrm(q);                              // 正規化查詢字（繁日異體字統一）
    const hits = [];
    Object.entries(PREF).forEach(([id, pref]) => {
      const numId = +id;
      // 縣市名稱匹配
      if (nrm(pref.name).includes(nq) || nrm(pref.nameEn).includes(nq)) {
        hits.push({ id: numId, pref, item: null, type: '縣市', tab: 'sights' });
      }
      // 條目匹配：名稱 / 描述 / 地點 / 標籤都納入比對（皆經異體字正規化）
      const matchItem = item =>
        nrm(item.name).includes(nq) || nrm(item.desc).includes(nq) ||
        nrm(item.where).includes(nq) || (item.tags || []).some(t => nrm(t).includes(nq));
      // 景點匹配
      (pref.sights || []).forEach(item => {
        if (matchItem(item)) {
          hits.push({ id: numId, pref, item, type: '景點', tab: 'sights' });
        }
      });
      // 美食匹配
      (pref.food || []).forEach(item => {
        if (matchItem(item)) {
          hits.push({ id: numId, pref, item, type: '美食', tab: 'food' });
        }
      });
    });

    if (!hits.length) {
      results.innerHTML = `<div class="sr-none">找不到「${q}」相關結果</div>`;
    } else {
      results.innerHTML = hits.slice(0, 12).map(h => `
        <div class="sr-item" data-id="${h.id}" data-tab="${h.tab}">
          <span class="sr-type">${h.type}</span>
          <div>
            <div class="sr-name">${h.item ? h.item.name : h.pref.name}</div>
            <div class="sr-pref">${h.pref.name} ${h.pref.nameEn}</div>
          </div>
        </div>`).join('');

      results.querySelectorAll('.sr-item').forEach(el => {
        el.addEventListener('click', () => {
          const id  = +el.dataset.id;
          const tab = el.dataset.tab;
          selectedId = id;
          // 地圖高亮
          g.selectAll('.pref-path').classed('selected', false);
          g.selectAll('.pref-path').filter(d => getPrefId(d) === id).classed('selected', true);
          showPref(PREF[id], tab);
          results.classList.remove('open');
          input.value = '';
        });
      });
    }
    results.classList.add('open');
  }

  input.addEventListener('input', () => doSearch(input.value));
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { results.classList.remove('open'); input.blur(); }
  });
  document.addEventListener('click', e => {
    if (!document.getElementById('search-wrap').contains(e.target))
      results.classList.remove('open');
  });
}

// ── 主題分類探索 ──────────────────────────────────────────────────────────────
// ── 賽璐璐風線條圖示（取代 emoji 功能圖示，去 AI 感）─────────────────────────
// 統一 viewBox 24、currentColor 黑線、隨字級縮放；色彩跟著 chip 文字色走
const svgIcon = (p) => `<svg class="ui-ic" viewBox="0 0 24 24" width="1.15em" height="1.15em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-.22em;margin-right:.16em">${p}</svg>`;
const UI_ICONS = {
  onsen:    svgIcon('<path d="M4 11h16v2a6 6 0 0 1-12 0z"/><path d="M8 3c-1 1.5 1 2.5 0 4M12 3c-1 1.5 1 2.5 0 4M16 3c-1 1.5 1 2.5 0 4"/>'),
  heritage: svgIcon('<path d="M3 9l9-5 9 5"/><path d="M5 9v9M10 9v9M14 9v9M19 9v9M3 20h18"/>'),
  nature:   svgIcon('<circle cx="17" cy="7" r="2.5"/><path d="M2 20l6-9 4 5 3-4 7 8z"/>'),
  castle:   svgIcon('<path d="M4 20h16M6 20v-5h12v5M3.5 15l8.5-3 8.5 3M8.5 12V9h7v3M6.5 9l5.5-2.5L17.5 9M11 6.5V4.5h2v2"/>'),
  shrine:   svgIcon('<path d="M4 6h16M5 9.5h14M7.5 6v14M16.5 6v14"/>'),
  night:    svgIcon('<path d="M18 14a6.5 6.5 0 1 1-7-9 5 5 0 0 0 7 9z"/><path d="M5 4.5v3M3.5 6h3"/>'),
  sakura:   svgIcon('<circle cx="12" cy="6.5" r="2.2"/><circle cx="17" cy="10.5" r="2.2"/><circle cx="15" cy="16.5" r="2.2"/><circle cx="9" cy="16.5" r="2.2"/><circle cx="7" cy="10.5" r="2.2"/><circle cx="12" cy="11.5" r="1.8"/>'),
  food:     svgIcon('<path d="M3 11h18M5 11v1a7 7 0 0 0 14 0v-1z"/><path d="M9 4c-.8 1.5.8 2.5 0 4M14 4c-.8 1.5.8 2.5 0 4"/>'),
  heart:    svgIcon('<path d="M12 20S4 14.5 4 9.2A3.8 3.8 0 0 1 12 7a3.8 3.8 0 0 1 8 2.2C20 14.5 12 20 12 20z"/>'),
  summer:   svgIcon('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7"/>'),
  maple:    svgIcon('<path d="M12 21v-8"/><path d="M12 13c3.5 0 6.5-2.2 6.5-6.5C14.5 6.5 12 9 12 13zM12 13c-3.5 0-6.5-2.2-6.5-6.5C9.5 6.5 12 9 12 13z"/>'),
  snow:     svgIcon('<path d="M12 2v20M3.3 7l17.4 10M20.7 7L3.3 17"/><path d="M10 4l2 2 2-2M10 20l2-2 2 2"/>'),
  pin:      svgIcon('<path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
  nav:      svgIcon('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2.2 4.8-4.8 2.2 2.2-4.8z"/>'),
  star:     svgIcon('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8-4.3-4.1 5.9-.9z"/>'),
  coin:     svgIcon('<path d="M8.5 8h7l2.2 4.3a6.2 6.2 0 0 1-11.4 0z"/><path d="M9.5 8l1.3-3.2h2.4L14.5 8"/>'),
  calendar: svgIcon('<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>'),
  map:      svgIcon('<path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4z"/><path d="M9 4v14M15 6v14"/>'),
  bag:      svgIcon('<path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8a3 3 0 0 1 6 0"/>'),
  bulb:     svgIcon('<path d="M9.5 18h5M10.5 21h3"/><path d="M12 3a6 6 0 0 0-4 10.5c.8.7 1 1.2 1 2.5h6c0-1.3.2-1.8 1-2.5A6 6 0 0 0 12 3z"/>'),
  warn:     svgIcon('<path d="M12 3 2.5 20h19L12 3z"/><path d="M12 10v4M12 17h.01"/>'),
  bed:      svgIcon('<path d="M3 18v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5M3 18v2M21 18v2M3 14h18"/><circle cx="7.5" cy="11" r="1.5"/>'),
  // 交通方式（transportIcon 用，固定幾類）
  train:     svgIcon('<rect x="6" y="3.5" width="12" height="13" rx="3"/><path d="M6 11h12M9 16.5l-2 3M15 16.5l2 3"/><circle cx="9" cy="13.5" r=".6"/><circle cx="15" cy="13.5" r=".6"/>'),
  shinkansen:svgIcon('<path d="M4 16c0-5 4-9 9-9h2a4 4 0 0 1 4 4v3a2 2 0 0 1-2 2H4z"/><path d="M4 13h7M7 19l1.5-3M15 19l1.5-3"/><circle cx="15" cy="13" r=".6"/>'),
  subway:    svgIcon('<path d="M5 18a7 7 0 0 1 14 0"/><rect x="8" y="9" width="8" height="7" rx="1.5"/><path d="M8 12.5h8M9 18.5l-1.5 2M15 18.5l1.5 2"/>'),
  bus:       svgIcon('<rect x="5" y="4" width="14" height="13" rx="2.5"/><path d="M5 11h14M8 17v2M16 17v2"/><circle cx="8.5" cy="14" r=".6"/><circle cx="15.5" cy="14" r=".6"/>'),
  ferry:     svgIcon('<path d="M4 14h16l-2 5H6l-2-5z"/><path d="M12 4v6M9 7h3M6 14V9h12v5"/>'),
  cablecar:  svgIcon('<path d="M3 5h18M12 5v3"/><rect x="7" y="8" width="10" height="7" rx="1.5"/><path d="M7 11h10"/>'),
  plane:     svgIcon('<path d="M12 3c.9 0 1.3 1 1.3 2.6v3.2l7.2 4v1.8l-7.2-2v3.1l1.9 1.4v1.3L12 21l-3.2-1.4v-1.3l1.9-1.4v-3.1l-7.2 2v-1.8l7.2-4V5.6C10.7 4 11.1 3 12 3z"/>'),
  bike:      svgIcon('<circle cx="6" cy="16" r="3"/><circle cx="18" cy="16" r="3"/><path d="M6 16l4-7h5l3 7M9 9h3"/>'),
  link:      svgIcon('<path d="M9 14a4 4 0 0 0 6 .5l2.5-2.5a4 4 0 0 0-5.7-5.7L10.5 7.6"/><path d="M15 10a4 4 0 0 0-6-.5L6.5 12a4 4 0 0 0 5.7 5.7L13.5 16.4"/>'),
  // 天氣預報 / 花費記帳用
  cloud:     svgIcon('<path d="M7 18a4 4 0 1 1 .3-7.98A5.5 5.5 0 0 1 17.9 12 4 4 0 0 1 17 18z"/>'),
  rain:      svgIcon('<path d="M7 14.5a4 4 0 1 1 .3-7.98A5.5 5.5 0 0 1 17.9 8.5 4 4 0 0 1 17 14.5z"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>'),
  wallet:    svgIcon('<path d="M4 8a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v1h-3.5a2.5 2.5 0 0 0 0 5H19v1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z"/><circle cx="16" cy="12.5" r=".6"/>'),
};

const CATEGORIES = [
  { ic: 'onsen',    icon: '♨️', label: '溫泉',     keys: ['溫泉', '温泉'] },
  { ic: 'heritage', icon: '🏛️', label: '世界遺產', keys: ['世界遺産', '世界遺產', 'UNESCO', '國寶', '国宝'] },
  { ic: 'nature',   icon: '🗻', label: '自然絕景', keys: ['絕景', '絶景', '自然', '自然奇景', '登山', '高原', '火山', '湖景', '海景', '離島', '紅葉', '瀑布', '峽谷'] },
  { ic: 'castle',   icon: '🏯', label: '歷史名城', keys: ['城', '天守', '城跡', '史跡', '歷史街道', '古都'] },
  { ic: 'shrine',   icon: '⛩️', label: '神社寺廟', keys: ['神社', '神宮', '大社', '寺', '鳥居'] },
  { ic: 'night',    icon: '🌃', label: '夜景展望', keys: ['夜景', '展望台', '展望'] },
  { ic: 'sakura',   icon: '🌸', label: '季節限定', keys: ['春季限定', '夏季限定', '秋季限定', '冬季限定', '紅葉', '賞花', '櫻'] },
  { ic: 'food',     icon: '🍜', label: '在地美食', keys: ['必吃', '名物', '海鮮', '和牛', '拉麵', '鄉土料理', '郷土料理'] },
];

function matchCat(item, keys) {
  return keys.some(k => item.tags?.some(t => t.includes(k)) || item.name.includes(k));
}

function buildCatExplore() {
  const el = document.getElementById('cat-explore');
  if (!el) return;
  el.innerHTML =
    `<div class="cat-title">主題探索 · 跨全國找你想去的</div>` +
    CATEGORIES.map((c, i) =>
      `<button class="cat-chip" data-cat="${i}">${UI_ICONS[c.ic]} ${c.label}</button>`
    ).join('');
  el.querySelectorAll('.cat-chip[data-cat]').forEach(btn => {
    btn.addEventListener('click', () => showCategory(CATEGORIES[+btn.dataset.cat]));
  });
}

// 歡迎頁季節 chip（四季，各帶專屬色）
function buildSeasonExplore() {
  const el = document.getElementById('season-explore');
  if (!el) return;
  el.innerHTML =
    `<div class="cat-title">季節探索 · 看你哪時候去</div>` +
    SEASONS.map((s, i) =>
      `<button class="cat-chip season-chip" data-s="${i}" style="--sc:${s.color}">${UI_ICONS[s.ic]} ${s.label}</button>`
    ).join('');
  el.querySelectorAll('.season-chip').forEach(btn =>
    btn.addEventListener('click', () => showSeason(SEASONS[+btn.dataset.s])));
}

// 把存的 key 反查回 PREF 條目（資料以 data.js 為單一來源，不複製內容）
function resolveFavs() {
  return Object.entries(favs).map(([key, m]) => {
    const pref = PREF[m.id];
    if (!pref) return null;
    const arr  = m.tab === 'food' ? pref.food : pref.sights;
    const item = (arr || []).find(it => it.name === m.name);
    return item ? { key, m, pref, item } : null;
  }).filter(Boolean);
}

// 卡片底部「排到第幾天」的下拉（未排程 / Day1..N / 新增一天）
function daySelectHtml(key, day, maxDay) {
  let opts = `<option value="0"${day === 0 ? ' selected' : ''}>🗂️ 未排程</option>`;
  for (let d = 1; d <= maxDay; d++)
    opts += `<option value="${d}"${day === d ? ' selected' : ''}>📅 Day ${d}</option>`;
  opts += `<option value="${maxDay + 1}">➕ 新增 Day ${maxDay + 1}</option>`;
  return `<select class="day-select" data-key="${key}" onclick="event.stopPropagation()">${opts}</select>`;
}

// 我的收藏 · 行程頁：依天分組，每天與總計都顯示日圓＋台幣預算
function showFavorites() {
  currentView = 'favs';
  document.getElementById('welcome').style.display = 'none';
  const view = document.getElementById('pref-view');
  view.style.display = 'flex';
  view.style.animation = 'none'; void view.offsetWidth; view.style.animation = '';

  const resolved = resolveFavs();
  const maxDay   = resolved.reduce((mx, r) => Math.max(mx, r.m.day || 0), 0);
  const totalYen = resolved.reduce((s, r) => s + itemYen(r.item), 0);

  // 依天分組（0 = 未排程），只渲染有條目的分組
  const buckets = [];
  for (let d = 0; d <= maxDay; d++) {
    const items = resolved.filter(r => (r.m.day || 0) === d);
    if (items.length) buckets.push({ day: d, items });
  }

  const sections = buckets.map(b => {
    const dayYen = b.items.reduce((s, r) => s + itemYen(r.item), 0);
    const tag    = b.day === 0
      ? `<span class="trip-day-tag trip-day-tag--unset">🗂️ 未排程</span>`
      : `<span class="trip-day-tag">📅 Day ${b.day}</span>`;
    const budget = dayYen
      ? `<span class="trip-day-budget">約 ¥${numFmt(dayYen)} <em>≈ NT$${numFmt(ntd(dayYen))}</em></span>`
      : '';
    const cards = b.items.map(r =>
      cardHtml(r.item,
        `<div class="trip-card-foot">
           ${daySelectHtml(r.key, r.m.day || 0, maxDay)}
           <div class="cat-from" data-id="${r.m.id}" data-tab="${r.m.tab}">📍 ${r.pref.name} →</div>
         </div>`,
        r.key)
    ).join('');
    return `<div class="trip-day">
        <div class="trip-day-head">${tag}${budget}</div>
        <div class="cards">${cards}</div>
      </div>`;
  }).join('');

  view.innerHTML = `
    <div class="pv-header">
      ${resolved.length ? `<button class="pv-share trip-clear" onclick="clearAllFavs(event)" title="清空整份行程">🗑️ 清空行程</button>` : ''}
      <div class="pv-region-badge" style="background:#e639461a;color:var(--sakura);border-color:#e6394644">行程規劃</div>
      <div class="pv-name">❤️ 我的收藏 · 行程</div>
      <div class="pv-name-en">${resolved.length} 個收藏${maxDay ? ` · 已排 ${maxDay} 天` : ''} · 用卡片下拉排進每一天</div>
    </div>
    ${resolved.length ? `<div class="trip-guide">
      <span class="trip-step"><b>1</b> 逛景點 / 美食時，點卡片右上的 🤍 加入收藏</span>
      <span class="trip-step"><b>2</b> 在收藏卡片的下拉選單，把它排進 Day 1 / 2 / 3</span>
      <span class="trip-step"><b>3</b> 左側地圖會自動把每天的縣連成旅程動線</span>
    </div>` : ''}
    ${resolved.length ? `<div class="trip-summary">
        <span class="trip-sum-label">預估總花費</span>
        <span class="trip-sum-yen">約 ¥${numFmt(totalYen)}</span>
        <span class="trip-sum-twd">≈ NT$${numFmt(ntd(totalYen))}</span>
      </div>` : ''}
    <div class="pv-content" id="pv-content">
      ${resolved.length
        ? sections
        : `<div class="empty-state">還沒有收藏。<br>逛景點或美食時，點卡片右上的 🤍 加入收藏，回到這裡就能用下拉把它們排進 Day 1／2／3，左側地圖還會把每天的縣連成旅程動線。</div>`}
    </div>`;

  const pv = document.getElementById('pv-content');
  pv.querySelectorAll('.cat-from').forEach(el => {
    el.addEventListener('click', () => gotoPref(+el.dataset.id, el.dataset.tab));
  });
  pv.querySelectorAll('.day-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const key = sel.dataset.key;
      if (favs[key]) { favs[key].day = +sel.value; saveFavs(); showFavorites(); }
    });
  });
  pushNav({ v: 'favs' });
  showHomeFab(true);
  document.getElementById('info-panel').scrollTop = 0;
}

// 清空整份行程：兩段式確認，避免誤觸。第一下武裝按鈕、3 秒未確認自動復原，第二下才真清
function clearAllFavs(ev) {
  const btn = ev.currentTarget;
  if (!btn.classList.contains('armed')) {
    btn.classList.add('armed');
    btn.textContent = '⚠️ 再按一次清空';
    btn._disarm = setTimeout(() => {
      btn.classList.remove('armed');
      btn.textContent = '🗑️ 清空行程';
    }, 3000);
    return;
  }
  clearTimeout(btn._disarm);
  favs = {};
  saveFavs();
  updateFavChip();
  updateFavMarkers();
  showFavorites();   // 重繪成空狀態
}

// 愛心點擊：用事件委派綁在 info-panel，縣頁/主題探索/收藏頁的卡片都吃得到
document.getElementById('info-panel').addEventListener('click', e => {
  const tagEl = e.target.closest('.tag');
  if (tagEl?.dataset.tag) { showTag(tagEl.dataset.tag); return; }
  const btn = e.target.closest('.fav-btn');
  if (!btn) return;
  e.stopPropagation();
  const key = btn.dataset.fav;
  // 名稱理論上不含 |，但仍以「前兩段為 id/tab、其餘併回 name」保險
  const [id, tab, ...rest] = key.split('|');
  if (isFav(key)) delete favs[key];
  else            favs[key] = { id: +id, tab, name: rest.join('|'), day: 0 };
  saveFavs();
  updateFavChip();
  updateFavMarkers();                                         // 地圖愛心標記同步
  if (currentView === 'favs') { showFavorites(); return; }   // 收藏頁移除後即時重繪
  const on = isFav(key);
  btn.classList.toggle('on', on);
  btn.textContent = on ? '❤️' : '🤍';
});

// 地圖上標出「有收藏的縣」：縣界金框高亮 + 重心脈動愛心。favs 變動時呼叫
function updateFavMarkers() {
  if (!favLayer || !prefCentroids) return;
  const counts = {};
  Object.values(favs).forEach(m => { counts[m.id] = (counts[m.id] || 0) + 1; });

  // 縣界高亮
  g.selectAll('.pref-path').classed('has-fav', d => counts[getPrefId(d)] > 0);

  // 重心愛心標記（資料綁定，加/移收藏自動進出）
  const data = Object.keys(counts)
    .map(id => ({ id: +id, c: prefCentroids.get(+id) }))
    .filter(d => d.c);
  const k = hoverLabelK || 1;
  const sel = favLayer.selectAll('.fav-heart').data(data, d => d.id);
  sel.exit().remove();
  sel.enter().append('text')
      .attr('class', 'fav-heart')
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
      .text('❤️')
    .merge(sel)
      .attr('x', d => d.c[0]).attr('y', d => d.c[1])
      .attr('font-size', String(15 / k));
  updateTripRoute();
}

// 行程動線：把已排程（day>=1）的收藏縣依「天 → 縣 id」順序串成一條折線
function updateTripRoute() {
  if (!routeLayer || !prefCentroids) return;
  const dayPrefs = {};
  Object.values(favs).forEach(m => {
    if ((m.day || 0) >= 1) (dayPrefs[m.day] ||= new Set()).add(m.id);
  });
  const seq = [];
  Object.keys(dayPrefs).map(Number).sort((a, b) => a - b).forEach(day => {
    [...dayPrefs[day]].sort((a, b) => a - b).forEach(id => {
      if (!seq.includes(id)) seq.push(id);
    });
  });
  const pts = seq.map(id => prefCentroids.get(id)).filter(Boolean);

  const line = routeLayer.selectAll('.trip-route').data(pts.length >= 2 ? [pts] : []);
  line.exit().remove();
  line.enter().append('path').attr('class', 'trip-route')
    .merge(line)
      .attr('d', p => 'M' + p.map(c => `${c[0]},${c[1]}`).join('L'));
}

// 跳到指定縣市（地圖高亮 + 顯示詳情），主題探索與搜尋共用
function gotoPref(id, tab = 'sights') {
  selectedId = id;
  g.selectAll('.pref-path').classed('selected', false);
  g.selectAll('.pref-path').filter(d => getPrefId(d) === id).classed('selected', true);
  showPref(PREF[id], tab);
}

// 浮動回主頁鳥居鈕的顯隱（非主畫面才出現）
function showHomeFab(on) {
  document.getElementById('home-fab').classList.toggle('show', on);
}

// 回到歡迎主畫面：收掉詳情頁、清地圖選取與網址
function goHome() {
  currentView = 'welcome';
  document.getElementById('pref-view').style.display = 'none';
  document.getElementById('welcome').style.display = '';
  g.selectAll('.pref-path').classed('selected', false);
  selectedId = null;
  showHomeFab(false);
  pushNav({ v: 'welcome' });
  document.getElementById('info-panel').scrollTop = 0;
}

// 跨全國條目集合：對每縣 sights+food 套 match(item) 收集命中
function collectHits(match) {
  const hits = [];
  Object.entries(PREF).forEach(([id, pref]) => {
    [['sights', pref.sights], ['food', pref.food]].forEach(([tab, arr]) => {
      (arr || []).forEach(item => {
        if (match(item)) hits.push({ id: +id, pref, item, tab });
      });
    });
  });
  return hits;
}

// 探索結果頁的共用渲染（主題探索 chip 與 tag 點擊共用）
function renderExploreView(badge, titleHtml, subText, hits) {
  currentView = 'cat';
  document.getElementById('welcome').style.display = 'none';
  const view = document.getElementById('pref-view');
  view.style.display = 'flex';
  view.style.animation = 'none'; void view.offsetWidth; view.style.animation = '';

  view.innerHTML = `
    <div class="pv-header">
      <div class="pv-region-badge" style="background:#f0a5001a;color:var(--gold);border-color:#f0a50044">${badge}</div>
      <div class="pv-name">${titleHtml}</div>
      <div class="pv-name-en">${subText}</div>
    </div>
    <div class="pv-content" id="pv-content">
      ${hits.length
        ? `<div class="cards">${hits.map(h =>
            cardHtml(h.item, `<div class="cat-from" data-id="${h.id}" data-tab="${h.tab}">📍 ${h.pref.name} · 前往該縣 →</div>`,
              favKeyOf(h.id, h.tab, h.item.name))).join('')}</div>`
        : `<div class="empty-state">目前沒有符合的條目</div>`}
    </div>`;

  document.getElementById('pv-content').querySelectorAll('.cat-from').forEach(el => {
    el.addEventListener('click', () => gotoPref(+el.dataset.id, el.dataset.tab));
  });
  showHomeFab(true);                          // 歷史 push 交給呼叫端（showCategory／showTag）依探索類型帶 key
  document.getElementById('info-panel').scrollTop = 0;
}

function showCategory(cat) {
  const hits = collectHits(item => matchCat(item, cat.keys));
  renderExploreView('主題探索', `${cat.icon} ${cat.label}`,
    `全國 ${hits.length} 處 · 點卡片下方「前往該縣」看完整攻略`, hits);
  pushNav({ v: 'cat', i: CATEGORIES.indexOf(cat) });
}

// 點卡片上的 tag → 跨全國列出所有同樣標記的條目（繁日異體字視為同一標籤）
function showTag(tag) {
  const ntag = nrm(tag);
  const hits = collectHits(item => (item.tags || []).some(t => nrm(t) === ntag));
  renderExploreView('標籤探索', `🏷️ ${tag}`,
    `全國 ${hits.length} 處標記「${tag}」`, hits);
  pushNav({ v: 'tag', tag });
}

// ── 季節探索（用每縣 seasons 欄位 + 季節限定 tag） ────────────────────────────
const SEASONS = [
  { key: 'spring', ic: 'sakura', icon: '🌸', label: '春', color: '#ffb7c5', sub: '3–5 月 · 櫻花與新綠', tagKeys: ['春季限定', '櫻', '賞花', '新綠', '花見'] },
  { key: 'summer', ic: 'summer', icon: '☀️', label: '夏', color: '#4ecdc4', sub: '6–8 月 · 花火與祭典', tagKeys: ['夏季限定', '花火', '海水浴', '薰衣草', '祭'] },
  { key: 'autumn', ic: 'maple',  icon: '🍁', label: '秋', color: '#f4845f', sub: '9–11 月 · 紅葉狩',     tagKeys: ['秋季限定', '紅葉', '楓', '銀杏'] },
  { key: 'winter', ic: 'snow',   icon: '❄️', label: '冬', color: '#8ec5ff', sub: '12–2 月 · 雪景與燈飾', tagKeys: ['冬季限定', '雪', '粉雪', '流冰', '燈飾'] },
];

// ── 季節換膚 ──────────────────────────────────────────────────────────────────
// header 右側 4 顆季節鈕，套整站配色＋背景＋飄落物。預設依當前月份自動選，可手動切換並記住
function buildSeasonSwitch() {
  const el = document.getElementById('season-switch');
  el.innerHTML = SEASONS.map(s =>
    `<button class="season-btn" data-season="${s.key}" title="${s.label}・${s.sub}" style="--sc:${s.color}">${UI_ICONS[s.ic]}</button>`
  ).join('');
  el.querySelectorAll('.season-btn').forEach(b =>
    b.addEventListener('click', () => applySeason(b.dataset.season, true)));
}

function applySeason(key, save) {
  document.documentElement.dataset.season = key;
  document.querySelectorAll('.season-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.season === key));
  if (save) sessionStorage.setItem('jt_season', key);   // 只當次分頁有效，關掉重開就回到跟月份自動
}

function initSeason() {
  buildSeasonSwitch();
  localStorage.removeItem('jt_season');    // 清掉舊版永久鎖定的殘留（改用 sessionStorage 後不再讀它）
  let key = sessionStorage.getItem('jt_season');
  if (!key) {                              // 沒手動設過 → 依當月自動：12–2冬/3–5春/6–8夏/9–11秋
    const m = new Date().getMonth() + 1;
    key = (m === 12 || m <= 2) ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn';
  }
  applySeason(key, false);
}

function showSeason(s) {
  currentView = 'cat';
  document.getElementById('welcome').style.display = 'none';
  const view = document.getElementById('pref-view');
  view.style.display = 'flex';
  view.style.animation = 'none'; void view.offsetWidth; view.style.animation = '';

  const prefs = Object.entries(PREF).filter(([, p]) => p.seasons?.includes(s.key));
  const items = collectHits(it =>
    s.tagKeys.some(k => it.tags?.some(t => t.includes(k)) || it.name.includes(k)));

  view.innerHTML = `
    <div class="pv-header">
      <div class="pv-region-badge" style="background:${s.color}1a;color:${s.color};border-color:${s.color}55">季節探索</div>
      <div class="pv-name">${s.icon} ${s.label}季の日本</div>
      <div class="pv-name-en">${s.sub} · 推薦 ${prefs.length} 縣 · ${items.length} 個當季亮點</div>
    </div>
    <div class="pv-content" id="pv-content">
      <div class="sec-title" style="color:${s.color}">適合造訪的縣市</div>
      <div class="season-prefs">${prefs.map(([id, p]) =>
        `<button class="season-pref-chip" data-id="${id}" style="--sc:${s.color}">${p.name}</button>`).join('')}</div>
      <div class="sec-title" style="color:${s.color};margin-top:1.3rem">當季亮點</div>
      ${items.length
        ? `<div class="cards">${items.map(h =>
            cardHtml(h.item, `<div class="cat-from" data-id="${h.id}" data-tab="${h.tab}">📍 ${h.pref.name} · 前往該縣 →</div>`,
              favKeyOf(h.id, h.tab, h.item.name))).join('')}</div>`
        : `<div class="empty-state">這個季節沒有特別標記的亮點，先看上面推薦的縣市吧</div>`}
    </div>`;

  const pv = document.getElementById('pv-content');
  pv.querySelectorAll('.season-pref-chip').forEach(el =>
    el.addEventListener('click', () => gotoPref(+el.dataset.id)));
  pv.querySelectorAll('.cat-from').forEach(el =>
    el.addEventListener('click', () => gotoPref(+el.dataset.id, el.dataset.tab)));
  pushNav({ v: 'season', key: s.key });
  showHomeFab(true);
  document.getElementById('info-panel').scrollTop = 0;
}

// ── 縣市比較模式 ───────────────────────────────────────────────────────────
let compareSlots = [];  // 三個下拉目前選的 PREF index（-1 = 不比）

function buildCompare() {
  const zone = document.getElementById('compare-zone');
  if (!zone) return;
  const ids = Object.keys(PREF).map(Number);  // [1..47]，key 即 gotoPref 用的 id
  const findId = en => ids.find(i => PREF[i].nameEn === en) ?? ids[0];
  const defs = [findId('Tokyo'), findId('Kyoto'), -1];

  // 依地方區域分組成 optgroup
  const groups = {};
  ids.forEach(i => { (groups[PREF[i].region] ||= []).push(i); });
  const optsFor = (sel, allowEmpty) => {
    let html = allowEmpty ? `<option value="-1"${sel === -1 ? ' selected' : ''}>— 不比 —</option>` : '';
    for (const key in REGION) {
      if (!groups[key]) continue;
      html += `<optgroup label="${REGION[key].label}">`;
      groups[key].forEach(i => {
        html += `<option value="${i}"${i === sel ? ' selected' : ''}>${PREF[i].name}</option>`;
      });
      html += `</optgroup>`;
    }
    return html;
  };

  zone.innerHTML = `
    <div class="cz-head">縣市 PK・誰更適合你</div>
    <div class="cz-sub">選 2–3 個縣，並排比評等、預算、季節與代表特色</div>
    <div class="cz-controls">
      <select class="cz-sel" data-slot="0">${optsFor(defs[0], false)}</select>
      <span class="cz-vs">VS</span>
      <select class="cz-sel" data-slot="1">${optsFor(defs[1], false)}</select>
      <span class="cz-vs">VS</span>
      <select class="cz-sel" data-slot="2">${optsFor(defs[2], true)}</select>
    </div>
    <div class="cz-grid" id="cz-grid"></div>`;
  compareSlots = defs.slice();
  zone.querySelectorAll('.cz-sel').forEach(sel => {
    sel.addEventListener('change', e => {
      compareSlots[+e.target.dataset.slot] = +e.target.value;
      renderCompare();
    });
  });
  renderCompare();
}

function renderCompare() {
  const grid = document.getElementById('cz-grid');
  if (!grid) return;
  const ids = compareSlots.filter(i => i >= 0);
  grid.style.setProperty('--cz-cols', ids.length || 1);
  grid.innerHTML = ids.map(i => {
    const p = PREF[i];
    const col = REGION[p.region]?.color || '#888';
    const s0 = p.sights?.[0];
    const f0 = p.food?.[0];
    const desc = (p.desc || '').slice(0, 46);
    return `
      <div class="cz-card" style="--cz:${col}">
        <div class="cz-card-top">
          <div class="cz-name">${p.name}</div>
          <div class="cz-en">${p.nameEn}</div>
        </div>
        ${prefMetaHtml(p)}
        ${s0 ? `<div class="cz-row"><span class="cz-row-k">代表景點</span><span class="cz-row-v">${s0.icon || ''} ${s0.name}</span></div>` : ''}
        ${f0 ? `<div class="cz-row"><span class="cz-row-k">必吃美食</span><span class="cz-row-v">${f0.icon || ''} ${f0.name}</span></div>` : ''}
        <div class="cz-desc">${desc}…</div>
        <button class="cz-go" onclick="gotoPref(${i})">前往 ${p.name} →</button>
      </div>`;
  }).join('');
}

// ── 旅遊工具箱 ────────────────────────────────────────────────────────────────
// 六個出發前後實用的小工具：匯率換算 / 打包清單 / 季節速查 / 天氣預報 / 預算估算 / 花費記帳
const TOOL_TABS = [
  { key: 'fx',      ic: 'coin',     label: '匯率換算' },
  { key: 'pack',    ic: 'bag',      label: '打包清單' },
  { key: 'season',  ic: 'sakura',   label: '季節速查' },
  { key: 'weather', ic: 'cloud',    label: '天氣預報' },
  { key: 'budget',  ic: 'calendar', label: '預算估算' },
  { key: 'expense', ic: 'wallet',   label: '花費記帳' },
];
let toolTab = 'fx';

// 匯率：站內近似值當預設，開站時抓即時匯率覆蓋；fx 與預算工具共用同一個 fxRate
let fxRate     = JPY_TWD;
let fxRateMode = 'default';   // default | live | manual

function fetchFxRate() {
  fetch('https://open.er-api.com/v6/latest/JPY')
    .then(r => r.json())
    .then(d => {
      const r = d?.rates?.TWD;
      if (r > 0) {
        fxRate = r; fxRateMode = 'live';
        if (currentView === 'tool' && (toolTab === 'fx' || toolTab === 'budget')) renderToolTab();
      }
    })
    .catch(() => {});           // 抓不到就維持預設值
}

// 打包清單（分類），勾選狀態以項目文字當 key 存 localStorage
const PACKING = [
  { cat: '證件・票券', items: ['護照（效期 6 個月以上）', '機票 / 電子登機證', '日幣現金', '信用卡 / 金融卡', '旅遊保險文件', '飯店訂房確認信', 'JR Pass / 交通票券'] },
  { cat: '電子用品',   items: ['手機 + 充電線', '行動電源', '網卡 / Wi-Fi 分享器', '相機 + 記憶卡', '轉接頭（日本與台灣同 A 型，多數免轉）'] },
  { cat: '衣物',       items: ['依季節衣物', '外套 / 防風防雨', '好走的鞋', '換洗衣物', '泡湯換洗衣物'] },
  { cat: '盥洗・藥品', items: ['常備藥 / 處方藥', '個人盥洗用品', '保養品 / 防曬', '口罩', '生理用品'] },
  { cat: '其他',       items: ['折疊購物袋', '輕便雨衣 / 雨傘', '小包面紙', '行李秤', '水壺 / 零食'] },
];
const PACK_STORE = 'jt_packing';
let packState = (() => { try { return JSON.parse(localStorage.getItem(PACK_STORE)) || {}; } catch { return {}; } })();
function savePack() { localStorage.setItem(PACK_STORE, JSON.stringify(packState)); }

// 使用者自訂的打包項目（存成陣列，勾選狀態一樣進 packState）
const PACK_CUSTOM_STORE = 'jt_packing_custom';
let packCustom = (() => { try { return JSON.parse(localStorage.getItem(PACK_CUSTOM_STORE)) || []; } catch { return []; } })();
function saveCustom() { localStorage.setItem(PACK_CUSTOM_STORE, JSON.stringify(packCustom)); }
// 使用者輸入會塞進 HTML，跳脫特殊字元避免破版（讀 dataset 時瀏覽器會自動還原原字串）
function escAttr(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// 預算等級（每人每日，日圓）：住宿 / 餐飲 / 交通 / 景點雜支
const BUDGET_TIERS = [
  { key: 'backpack', label: '背包客', sub: '青旅・平價美食',   stay: 4000,  food: 3000,  transit: 1500, misc: 1500 },
  { key: 'standard', label: '標準',   sub: '商務飯店・餐廳',   stay: 10000, food: 6000,  transit: 2500, misc: 3000 },
  { key: 'luxury',   label: '豪華',   sub: '溫泉旅館・高級',   stay: 25000, food: 12000, transit: 4000, misc: 6000 },
];
let budgetDays = 5, budgetTier = 'standard';

// 歡迎頁工具箱入口（四顆 chip，各自開到對應分頁）
function buildToolboxEntry() {
  const el = document.getElementById('toolbox-entry');
  if (!el) return;
  el.innerHTML =
    `<div class="cat-title">旅遊工具箱 · 出發前後都好用</div>` +
    TOOL_TABS.map(t => `<button class="cat-chip tool-chip" data-tool="${t.key}">${UI_ICONS[t.ic]} ${t.label}</button>`).join('');
  el.querySelectorAll('.tool-chip').forEach(b =>
    b.addEventListener('click', () => showToolbox(b.dataset.tool)));
}

function showToolbox(tab = 'fx') {
  toolTab = tab;
  currentView = 'tool';
  document.getElementById('welcome').style.display = 'none';
  const view = document.getElementById('pref-view');
  view.style.display = 'flex';
  view.style.animation = 'none'; void view.offsetWidth; view.style.animation = '';

  view.innerHTML = `
    <div class="pv-header">
      <div class="pv-region-badge" style="background:#7cccef1a;color:var(--sky);border-color:#7cccef55">旅遊工具箱</div>
      <div class="pv-name">旅遊工具箱</div>
      <div class="pv-name-en">匯率換算 · 打包清單 · 季節速查 · 天氣預報 · 預算估算 · 花費記帳，出發前後一次備齊</div>
    </div>
    <div class="pv-content" id="pv-content">
      <div class="tool-tabs">
        ${TOOL_TABS.map(t => `<button class="tool-tab${t.key === tab ? ' active' : ''}" data-tool="${t.key}">${UI_ICONS[t.ic]} ${t.label}</button>`).join('')}
      </div>
      <div id="tool-body"></div>
    </div>`;

  view.querySelectorAll('.tool-tab').forEach(b =>
    b.addEventListener('click', () => {
      toolTab = b.dataset.tool;
      view.querySelectorAll('.tool-tab').forEach(x => x.classList.toggle('active', x === b));
      renderToolTab();
    }));

  renderToolTab();
  pushNav({ v: 'tool', tab: toolTab });
  showHomeFab(true);
  document.getElementById('info-panel').scrollTop = 0;
}

function renderToolTab() {
  const body = document.getElementById('tool-body');
  if (!body) return;
  if      (toolTab === 'fx')      renderFxTool(body);
  else if (toolTab === 'pack')    renderPackTool(body);
  else if (toolTab === 'season')  renderSeasonTable(body);
  else if (toolTab === 'weather') renderWeatherTool(body);
  else if (toolTab === 'budget')  renderBudgetTool(body);
  else if (toolTab === 'expense') renderExpenseTool(body);
}

const FX_TAG = { default: '預設值', live: '即時匯率', manual: '手動' };

function renderFxTool(body) {
  body.innerHTML = `
    <div class="tool-card">
      <div class="tool-card-head">日圓 ⇄ 台幣 換算</div>
      <div class="fx-rate-line">目前匯率　¥1 = NT$
        <input type="number" id="fx-rate" step="0.0001" value="${fxRate.toFixed(4)}">
        <span class="fx-rate-tag" id="fx-rate-tag">${FX_TAG[fxRateMode]}</span>
      </div>
      <div class="fx-row"><label>¥ 日圓</label><input type="number" id="fx-jpy" inputmode="numeric" placeholder="0" value="10000"></div>
      <div class="fx-swap">≈</div>
      <div class="fx-row"><label>NT$ 台幣</label><input type="number" id="fx-twd" inputmode="numeric" placeholder="0"></div>
      <div class="fx-quick">
        ${[1000, 3000, 5000, 10000, 30000].map(v => `<button class="fx-qbtn" data-yen="${v}">¥${numFmt(v)}</button>`).join('')}
      </div>
    </div>`;

  const jpy  = body.querySelector('#fx-jpy');
  const twd  = body.querySelector('#fx-twd');
  const rate = body.querySelector('#fx-rate');
  const fromJpy = () => { twd.value = jpy.value ? Math.round(jpy.value * fxRate) : ''; };
  const fromTwd = () => { jpy.value = twd.value ? Math.round(twd.value / fxRate) : ''; };
  jpy.addEventListener('input', fromJpy);
  twd.addEventListener('input', fromTwd);
  rate.addEventListener('input', () => {
    const r = parseFloat(rate.value);
    if (r > 0) {
      fxRate = r; fxRateMode = 'manual';
      body.querySelector('#fx-rate-tag').textContent = FX_TAG.manual;
      fromJpy();
    }
  });
  body.querySelectorAll('.fx-qbtn').forEach(b =>
    b.addEventListener('click', () => { jpy.value = b.dataset.yen; fromJpy(); }));
  fromJpy();   // 初始化台幣欄
}

function renderPackTool(body) {
  const all  = PACKING.flatMap(g => g.items).concat(packCustom);
  const done = all.filter(it => packState[it]).length;
  body.innerHTML = `
    <div class="tool-card">
      <div class="tool-card-head">出國打包清單<button class="pack-reset" id="pack-reset">清空勾選</button></div>
      <div class="pack-progress">
        <div class="pack-bar"><div class="pack-bar-fill" style="width:${all.length ? done / all.length * 100 : 0}%"></div></div>
        <span class="pack-count">${done} / ${all.length}</span>
      </div>
      ${PACKING.map(g => `
        <div class="pack-group">
          <div class="pack-group-name">${g.cat}</div>
          ${g.items.map(it => `
            <label class="pack-item${packState[it] ? ' done' : ''}">
              <input type="checkbox" data-item="${it}"${packState[it] ? ' checked' : ''}>
              <span class="pack-tick"></span><span class="pack-text">${it}</span>
            </label>`).join('')}
        </div>`).join('')}
      <div class="pack-group">
        <div class="pack-group-name">自訂項目</div>
        ${packCustom.map(it => `
          <label class="pack-item${packState[it] ? ' done' : ''}">
            <input type="checkbox" data-item="${escAttr(it)}"${packState[it] ? ' checked' : ''}>
            <span class="pack-tick"></span><span class="pack-text">${escAttr(it)}</span>
            <span class="pack-del" data-del="${escAttr(it)}" title="刪除">×</span>
          </label>`).join('')}
        <div class="pack-add">
          <input type="text" id="pack-add-input" placeholder="輸入要帶的東西…" maxlength="30">
          <button type="button" id="pack-add-btn">新增</button>
        </div>
      </div>
    </div>`;

  body.querySelectorAll('.pack-item input').forEach(cb =>
    cb.addEventListener('change', () => {
      if (cb.checked) packState[cb.dataset.item] = true; else delete packState[cb.dataset.item];
      savePack();
      renderPackTool(body);            // 重繪更新進度條與刪除線
    }));
  body.querySelector('#pack-reset').addEventListener('click', () => {
    packState = {}; savePack(); renderPackTool(body);
  });

  // 刪除自訂項目（× 在 label 內，阻止冒泡以免同時觸發勾選）
  body.querySelectorAll('.pack-del').forEach(btn =>
    btn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const it = btn.dataset.del;
      packCustom = packCustom.filter(x => x !== it);
      delete packState[it];
      saveCustom(); savePack();
      renderPackTool(body);
    }));

  // 新增自訂項目（去空白、忽略空字串與重複）
  const addInput = body.querySelector('#pack-add-input');
  const addItem = () => {
    const v = addInput.value.trim();
    if (!v) return;
    if (!PACKING.some(g => g.items.includes(v)) && !packCustom.includes(v)) packCustom.push(v);
    saveCustom();
    renderPackTool(body);
    body.querySelector('#pack-add-input').focus();   // 重繪後把游標放回輸入框，方便連續新增
  };
  body.querySelector('#pack-add-btn').addEventListener('click', addItem);
  addInput.addEventListener('keydown', e => { if (e.key === 'Enter') addItem(); });
}

function renderSeasonTable(body) {
  const groups = {};
  Object.entries(PREF).forEach(([id, p]) => { (groups[p.region] ||= []).push([id, p]); });
  const legend = SEASONS.map(s =>
    `<span class="st-leg"><span class="st-dot on" style="background:${s.color}"></span>${s.label}</span>`).join('');

  let html = `<div class="tool-card">
    <div class="tool-card-head">各縣最佳季節速查</div>
    <div class="st-legend">${legend}<span class="st-leg-note">亮色＝該季推薦</span></div>`;
  for (const key in REGION) {
    if (!groups[key]) continue;
    html += `<div class="st-region" style="--rc:${REGION[key].color}"><div class="st-region-name">${REGION[key].label}</div>`;
    groups[key].forEach(([id, p]) => {
      const dots = SEASONS.map(s => {
        const on = (p.seasons || []).includes(s.key);
        return `<span class="st-dot${on ? ' on' : ''}"${on ? ` style="background:${s.color}"` : ''} title="${s.label}"></span>`;
      }).join('');
      html += `<button class="st-row" data-id="${id}"><span class="st-pref">${p.name}</span><span class="st-dots">${dots}</span></button>`;
    });
    html += `</div>`;
  }
  html += `</div>`;
  body.innerHTML = html;
  body.querySelectorAll('.st-row').forEach(b =>
    b.addEventListener('click', () => gotoPref(+b.dataset.id)));
}

// ── 天氣預報 ──────────────────────────────────────────────────────────────
// 地圖上的 prefCentroids 是投影過的像素座標，查天氣要用真實經緯度，所以另外存一份
// 47 都道府県廳所在地座標（Open-Meteo 免金鑰、支援瀏覽器端直接 fetch）
const PREF_LATLON = {
  Hokkaido:[43.06,141.35],  Aomori:[40.82,140.74],  Iwate:[39.70,141.15],   Miyagi:[38.27,140.87],
  Akita:[39.72,140.10],     Yamagata:[38.24,140.36],Fukushima:[37.75,140.47],Ibaraki:[36.34,140.45],
  Tochigi:[36.57,139.88],   Gunma:[36.39,139.06],   Saitama:[35.86,139.65], Chiba:[35.61,140.12],
  Tokyo:[35.69,139.69],     Kanagawa:[35.44,139.64],Niigata:[37.90,139.02], Toyama:[36.70,137.21],
  Ishikawa:[36.59,136.63],  Fukui:[36.07,136.22],   Yamanashi:[35.66,138.57],Nagano:[36.65,138.18],
  Gifu:[35.39,136.72],      Shizuoka:[34.98,138.38],Aichi:[35.18,136.91],   Mie:[34.73,136.51],
  Shiga:[35.00,135.87],     Kyoto:[35.02,135.76],   Osaka:[34.69,135.50],   Hyogo:[34.69,135.18],
  Nara:[34.69,135.83],      Wakayama:[34.23,135.17],Tottori:[35.50,134.24], Shimane:[35.47,133.05],
  Okayama:[34.66,133.93],   Hiroshima:[34.40,132.46],Yamaguchi:[34.19,131.47],Tokushima:[34.07,134.56],
  Kagawa:[34.34,134.05],    Ehime:[33.84,132.77],   Kochi:[33.56,133.53],   Fukuoka:[33.59,130.40],
  Saga:[33.25,130.30],      Nagasaki:[32.75,129.87],Kumamoto:[32.79,130.74],Oita:[33.24,131.61],
  Miyazaki:[31.91,131.42],  Kagoshima:[31.56,130.56],Okinawa:[26.21,127.68],
};

// WMO 天氣代碼（Open-Meteo daily.weathercode）簡化成幾種好懂的分類
function weatherCodeInfo(code) {
  if (code === 0) return { label: '晴朗', ic: 'summer' };
  if ([1, 2, 3].includes(code)) return { label: '多雲', ic: 'cloud' };
  if ([45, 48].includes(code)) return { label: '起霧', ic: 'cloud' };
  if ([95, 96, 99].includes(code)) return { label: '雷雨', ic: 'rain' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: '下雪', ic: 'snow' };
  return { label: '有雨', ic: 'rain' };   // 51/53/55 毛毛雨、61/63/65 雨、80/81/82 陣雨等剩下的都算有雨
}

let weatherPrefId = 13;             // 預設東京
const weatherCache = new Map();     // prefId -> { time, daily }：30 分鐘內切回同縣不用重打 API

function renderWeatherTool(body) {
  const ids = Object.keys(PREF).map(Number);
  const groups = {};
  ids.forEach(i => { (groups[PREF[i].region] ||= []).push(i); });
  let optHtml = '';
  for (const key in REGION) {
    if (!groups[key]) continue;
    optHtml += `<optgroup label="${REGION[key].label}">`;
    groups[key].forEach(i => {
      optHtml += `<option value="${i}"${i === weatherPrefId ? ' selected' : ''}>${PREF[i].name}</option>`;
    });
    optHtml += `</optgroup>`;
  }

  body.innerHTML = `
    <div class="tool-card">
      <div class="tool-card-head">未來天氣預報<select class="wt-sel" id="wt-sel">${optHtml}</select></div>
      <div id="wt-body">載入中…</div>
      <div class="wt-note">資料來源 Open-Meteo，僅供行程參考，出發前請再次確認。</div>
    </div>`;

  body.querySelector('#wt-sel').addEventListener('change', e => {
    weatherPrefId = +e.target.value;
    renderWeatherTool(body);
  });

  loadWeather(weatherPrefId, body);
}

function loadWeather(prefId, body) {
  const cached = weatherCache.get(prefId);
  if (cached && Date.now() - cached.time < 30 * 60 * 1000) { paintWeather(cached.daily, body); return; }

  const ll = PREF_LATLON[PREF[prefId].nameEn];
  if (!ll) return;

  fetch(`https://api.open-meteo.com/v1/forecast?latitude=${ll[0]}&longitude=${ll[1]}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTokyo&forecast_days=7`)
    .then(r => r.json())
    .then(d => {
      if (!d?.daily?.time) throw new Error('bad weather data');
      weatherCache.set(prefId, { time: Date.now(), daily: d.daily });
      if (weatherPrefId === prefId) paintWeather(d.daily, body);
    })
    .catch(() => {
      const el = body.querySelector('#wt-body');
      if (el) el.innerHTML = `<div class="wt-error">天氣資料暫時抓不到，晚點再試一次。</div>`;
    });
}

const WT_WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];
function paintWeather(daily, body) {
  const el = body.querySelector('#wt-body');
  if (!el) return;
  const html = daily.time.map((t, i) => {
    const d = new Date(t + 'T00:00:00+09:00');
    const info = weatherCodeInfo(daily.weathercode[i]);
    const hi = Math.round(daily.temperature_2m_max[i]);
    const lo = Math.round(daily.temperature_2m_min[i]);
    return `
      <div class="wt-day${i === 0 ? ' wt-day--today' : ''}">
        <div class="wt-wd">${i === 0 ? '今天' : WT_WEEKDAY[d.getDay()]}</div>
        <div class="wt-md">${d.getMonth() + 1}/${d.getDate()}</div>
        <div class="wt-ic">${UI_ICONS[info.ic]}</div>
        <div class="wt-label">${info.label}</div>
        <div class="wt-temp">${hi}°<span class="wt-lo">${lo}°</span></div>
        <div class="wt-pop">${daily.precipitation_probability_max[i]}% 降雨</div>
      </div>`;
  }).join('');
  el.innerHTML = `<div class="wt-grid">${html}</div>`;
}

function renderBudgetTool(body) {
  const tier   = BUDGET_TIERS.find(t => t.key === budgetTier) || BUDGET_TIERS[1];
  const perDay = tier.stay + tier.food + tier.transit + tier.misc;
  const total  = perDay * budgetDays;
  const rows = [['住宿', tier.stay], ['餐飲', tier.food], ['交通', tier.transit], ['景點・雜支', tier.misc]];

  body.innerHTML = `
    <div class="tool-card">
      <div class="tool-card-head">旅遊預算估算</div>
      <div class="bg-days">
        <span>天數</span>
        <button class="bg-step" id="bg-minus">−</button>
        <span class="bg-days-n">${budgetDays}</span>
        <button class="bg-step" id="bg-plus">＋</button>
        <span class="bg-days-unit">天</span>
      </div>
      <div class="bg-tiers">
        ${BUDGET_TIERS.map(t => `<button class="bg-tier${t.key === budgetTier ? ' active' : ''}" data-tier="${t.key}">
          <span class="bg-tier-name">${t.label}</span><span class="bg-tier-sub">${t.sub}</span></button>`).join('')}
      </div>
      <div class="bg-break">
        ${rows.map(([k, v]) => `<div class="bg-line"><span>${k}</span><span>¥${numFmt(v)} <em>/天</em></span></div>`).join('')}
        <div class="bg-line bg-line--day"><span>每日小計</span><span>¥${numFmt(perDay)}</span></div>
      </div>
      <div class="bg-total">
        <div class="bg-total-label">${budgetDays} 天總估</div>
        <div class="bg-total-yen">約 ¥${numFmt(total)}</div>
        <div class="bg-total-twd">≈ NT$${numFmt(Math.round(total * fxRate))}</div>
      </div>
      <div class="bg-note">每人估算、不含機票。實際依季節、訂房時間與消費習慣浮動。</div>
    </div>`;

  body.querySelector('#bg-minus').addEventListener('click', () => { if (budgetDays > 1)  { budgetDays--; renderBudgetTool(body); } });
  body.querySelector('#bg-plus').addEventListener('click',  () => { if (budgetDays < 30) { budgetDays++; renderBudgetTool(body); } });
  body.querySelectorAll('.bg-tier').forEach(b =>
    b.addEventListener('click', () => { budgetTier = b.dataset.tier; renderBudgetTool(body); }));
}

// ── 花費記帳 ──────────────────────────────────────────────────────────────
// 分類跟「預算估算」共用 stay/food/transit/misc 四類，方便直接對照「抓的預算 vs 實際花了多少」
const EXPENSE_CATS = [
  { key: 'stay',    label: '住宿' },
  { key: 'food',    label: '餐飲' },
  { key: 'transit', label: '交通' },
  { key: 'misc',    label: '景點・雜支' },
];
const EXPENSE_STORE = 'jt_expenses';
let expenses = (() => { try { return JSON.parse(localStorage.getItem(EXPENSE_STORE)) || []; } catch { return []; } })();
function saveExpenses() { localStorage.setItem(EXPENSE_STORE, JSON.stringify(expenses)); }
let lastExpenseDay = 1;   // 記住上次記錄的天數，方便同一天連續記好幾筆

function renderExpenseTool(body) {
  const byDay = {};
  expenses.forEach(e => (byDay[e.day] ||= []).push(e));
  const days = Object.keys(byDay).map(Number).sort((a, b) => a - b);
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const catTotal = {};
  expenses.forEach(e => { catTotal[e.cat] = (catTotal[e.cat] || 0) + e.amount; });

  const tier = BUDGET_TIERS.find(t => t.key === budgetTier) || BUDGET_TIERS[1];
  const budgetTotal = (tier.stay + tier.food + tier.transit + tier.misc) * budgetDays;
  const pct = budgetTotal ? Math.min(999, Math.round(total / budgetTotal * 100)) : 0;

  body.innerHTML = `
    <div class="tool-card">
      <div class="tool-card-head">花費記帳</div>
      <div class="ex-add">
        <input type="number" id="ex-day" min="1" max="30" value="${lastExpenseDay}" title="第幾天"><span class="ex-add-unit">天</span>
        <select id="ex-cat">${EXPENSE_CATS.map(c => `<option value="${c.key}">${c.label}</option>`).join('')}</select>
        <input type="number" id="ex-amt" inputmode="numeric" placeholder="¥ 金額" min="0">
        <input type="text" id="ex-note" placeholder="備註（選填）" maxlength="20">
        <button type="button" id="ex-add-btn">記一筆</button>
      </div>
      ${expenses.length ? days.map(d => `
        <div class="ex-day">
          <div class="ex-day-head">Day ${d}</div>
          ${byDay[d].map(e => `
            <div class="ex-row">
              <span class="ex-row-cat">${EXPENSE_CATS.find(c => c.key === e.cat)?.label || e.cat}</span>
              <span class="ex-row-note">${escAttr(e.note || '')}</span>
              <span class="ex-row-amt">¥${numFmt(e.amount)}</span>
              <span class="ex-row-del" data-id="${e.id}" title="刪除">×</span>
            </div>`).join('')}
        </div>`).join('') : `<div class="ex-empty">還沒有記錄，出發後花一筆就記一筆。</div>`}
      ${expenses.length ? `
        <div class="ex-summary">
          <div class="ex-sum-cats">
            ${EXPENSE_CATS.map(c => `<div class="ex-sum-line"><span>${c.label}</span><span>¥${numFmt(catTotal[c.key] || 0)}</span></div>`).join('')}
          </div>
          <div class="ex-sum-total">
            <span>總支出</span>
            <span class="ex-sum-yen">¥${numFmt(total)}</span>
            <span class="ex-sum-twd">≈ NT$${numFmt(Math.round(total * fxRate))}</span>
          </div>
          <div class="ex-budget-line">對比「預算估算」：${tier.label}・${budgetDays} 天　¥${numFmt(budgetTotal)}
            <div class="pack-bar"><div class="pack-bar-fill" style="width:${Math.min(100, pct)}%;background:${pct > 100 ? 'var(--red)' : 'var(--mint)'}"></div></div>
            已花 ${pct}%
          </div>
        </div>` : ''}
    </div>`;

  body.querySelector('#ex-add-btn').addEventListener('click', () => {
    const day = Math.max(1, +body.querySelector('#ex-day').value || 1);
    const cat = body.querySelector('#ex-cat').value;
    const amount = +body.querySelector('#ex-amt').value;
    const note = body.querySelector('#ex-note').value.trim();
    if (!amount || amount <= 0) return;
    lastExpenseDay = day;
    expenses.push({ id: Date.now() + '_' + Math.floor(Math.random() * 1000), day, cat, amount, note });
    saveExpenses();
    renderExpenseTool(body);
  });

  body.querySelectorAll('.ex-row-del').forEach(el =>
    el.addEventListener('click', () => {
      expenses = expenses.filter(e => String(e.id) !== el.dataset.id);
      saveExpenses();
      renderExpenseTool(body);
    }));
}

// ── 旅人性格測驗 ──────────────────────────────────────────────────────────────
// 5 題選擇題，每選項給某個旅人原型加分，最後算出主導原型 + 從 47 縣資料動態推薦縣市/主題
const QUIZ_TYPES = {
  scenery:  { label: '山海絕景控', ic: 'nature', color: '#4ecdc4',
    desc: '你追的是那種讓人倒抽一口氣的天地大景——雪山、海岸線、滿天星。比起人潮，你更想站在曠野裡發呆。',
    cats: ['nature', 'night'] },
  onsen:    { label: '溫泉療癒家', ic: 'onsen', color: '#ff9ec4',
    desc: '旅行對你是充電不是打卡。泡進熱湯、聽風看雪，把行程留白才是真正的奢侈。',
    cats: ['onsen'] },
  history:  { label: '歷史文化迷', ic: 'shrine', color: '#c9a36a',
    desc: '鳥居、城跡的石垣、老街的木造町家，你走得慢，因為每一塊磚都有故事。',
    cats: ['heritage', 'castle', 'shrine'] },
  foodie:   { label: '都會美食派', ic: 'food', color: '#ff6b9d',
    desc: '城市的霓虹、巷弄的居酒屋、排隊的拉麵店，你的旅遊地圖是用胃畫出來的。',
    cats: ['food'] },
  festival: { label: '季節獵人', ic: 'sakura', color: '#f4845f',
    desc: '你看的是時間限定的風景——櫻吹雪、夏夜花火、滿山紅葉與雪燈。對的季節，去對的地方。',
    cats: ['sakura'] },
};

const QUIZ_QUESTIONS = [
  { q: '難得放長假，你心中的理想早晨是？', opts: [
    { t: '溫泉旅館睡到自然醒，先泡個晨湯', k: 'onsen' },
    { t: '摸黑出發，趕在日出前抵達展望台', k: 'scenery' },
    { t: '鑽進在地早市，邊走邊吃當早餐', k: 'foodie' },
    { t: '趁開門前到古寺神社，獨享清晨的靜', k: 'history' },
  ]},
  { q: '行程表你會怎麼排？', opts: [
    { t: '一天頂多兩個點，剩下時間放空', k: 'onsen' },
    { t: '跟著季節跑，哪裡正美就衝哪裡', k: 'festival' },
    { t: '景點排好排滿，能多看一個是一個', k: 'history' },
    { t: '重點是吃，景點順路就好', k: 'foodie' },
  ]},
  { q: '這趟旅行，你最想帶回哪張照片？', opts: [
    { t: '雪山、海岸或星空的壯闊大景', k: 'scenery' },
    { t: '鳥居、城跡與老街木屋', k: 'history' },
    { t: '一桌剛上桌、熱氣騰騰的在地料理', k: 'foodie' },
    { t: '櫻吹雪、滿山紅葉或冬夜雪燈', k: 'festival' },
  ]},
  { q: '預算多一點的話，你會把錢花在？', opts: [
    { t: '一晚難忘的溫泉旅館', k: 'onsen' },
    { t: '米其林或非排不可的名店', k: 'foodie' },
    { t: '包車前往大眾交通到不了的秘境', k: 'scenery' },
    { t: '跨季節多飛幾趟日本', k: 'festival' },
  ]},
  { q: '朋友問你「日本最愛哪裡」，你會說？', opts: [
    { t: '那種能泡著湯看雪的地方', k: 'onsen' },
    { t: '看得到富士山、被大自然包圍的地方', k: 'scenery' },
    { t: '京都奈良那種有歷史厚度的古都', k: 'history' },
    { t: '大阪東京那種好吃又好逛的城市', k: 'foodie' },
  ]},
];

let quizStep = 0, quizScores = {};

// 依原型的主題關鍵字，從 47 縣統計命中條目數，取前 4 縣當推薦
function quizPickPrefs(type) {
  const keys = type.cats.flatMap(ic => (CATEGORIES.find(c => c.ic === ic) || {}).keys || []);
  const score = {};
  Object.entries(PREF).forEach(([id, p]) => {
    let n = 0;
    [...(p.sights || []), ...(p.food || [])].forEach(it => {
      if (keys.some(k => it.tags?.some(t => t.includes(k)) || it.name.includes(k))) n++;
    });
    if (n) score[id] = n;
  });
  return Object.entries(score).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id]) => +id);
}

function buildQuizEntry() {
  const el = document.getElementById('quiz-entry');
  if (!el) return;
  el.innerHTML =
    `<div class="cat-title">旅人性格測驗 · 找出最適合你的日本</div>` +
    `<button class="cat-chip quiz-start-chip" id="quiz-start">${UI_ICONS.nav} 開始測驗（5 題）</button>`;
  document.getElementById('quiz-start').addEventListener('click', () => showQuiz());
}

function showQuiz() {
  quizStep = 0; quizScores = {};
  currentView = 'quiz';
  document.getElementById('welcome').style.display = 'none';
  const view = document.getElementById('pref-view');
  view.style.display = 'flex';
  view.style.animation = 'none'; void view.offsetWidth; view.style.animation = '';

  view.innerHTML = `
    <div class="pv-header">
      <div class="pv-region-badge" style="background:#f4845f1a;color:#f4845f;border-color:#f4845f55">旅人性格測驗</div>
      <div class="pv-name">你是哪種旅人？</div>
      <div class="pv-name-en">5 道題，找出最適合你的日本旅遊風格與縣市</div>
    </div>
    <div class="pv-content" id="pv-content"><div id="quiz-body"></div></div>`;

  renderQuiz();
  pushNav({ v: 'quiz' });
  showHomeFab(true);
  document.getElementById('info-panel').scrollTop = 0;
}

function renderQuiz() {
  const body = document.getElementById('quiz-body');
  if (!body) return;
  if (quizStep < QUIZ_QUESTIONS.length) {
    const Q = QUIZ_QUESTIONS[quizStep];
    body.innerHTML = `
      <div class="quiz-progress">
        <div class="quiz-bar"><div class="quiz-bar-fill" style="width:${quizStep / QUIZ_QUESTIONS.length * 100}%"></div></div>
        <span class="quiz-step-n">${quizStep + 1} / ${QUIZ_QUESTIONS.length}</span>
      </div>
      <div class="quiz-q">${Q.q}</div>
      <div class="quiz-opts">
        ${Q.opts.map((o, i) => `<button class="quiz-opt" data-k="${o.k}">${o.t}</button>`).join('')}
      </div>`;
    body.querySelectorAll('.quiz-opt').forEach(b =>
      b.addEventListener('click', () => {
        quizScores[b.dataset.k] = (quizScores[b.dataset.k] || 0) + 1;
        quizStep++;
        renderQuiz();
        document.getElementById('info-panel').scrollTop = 0;
      }));
  } else {
    renderQuizResult(body);
  }
}

function renderQuizResult(body) {
  // 取最高分原型（平手取題目順序較前者，依 QUIZ_TYPES 宣告順序）
  const winner = Object.keys(QUIZ_TYPES).reduce((best, k) =>
    (quizScores[k] || 0) > (quizScores[best] || 0) ? k : best, Object.keys(QUIZ_TYPES)[0]);
  const t = QUIZ_TYPES[winner];
  const picks = quizPickPrefs(t);

  body.innerHTML = `
    <div class="quiz-result" style="--qc:${t.color}">
      <div class="quiz-res-badge">你的旅人類型</div>
      <div class="quiz-res-icon">${UI_ICONS[t.ic]}</div>
      <div class="quiz-res-name">${t.label}</div>
      <div class="quiz-res-desc">${t.desc}</div>
    </div>
    <div class="quiz-sec-title">為你精選的縣市</div>
    <div class="quiz-picks">
      ${picks.map(id => {
        const p = PREF[id];
        const col = REGION[p.region]?.color || '#888';
        const s0 = p.sights?.[0];
        return `<button class="quiz-pick" data-id="${id}" style="--rc:${col}">
          <div class="quiz-pick-top"><span class="quiz-pick-name">${p.name}</span><span class="quiz-pick-en">${p.nameEn}</span></div>
          ${prefMetaHtml(p)}
          ${s0 ? `<div class="quiz-pick-sight">${s0.icon || ''} ${s0.name}</div>` : ''}
        </button>`;
      }).join('')}
    </div>
    <div class="quiz-sec-title">延伸探索</div>
    <div class="quiz-cats">
      ${t.cats.map(ic => { const c = CATEGORIES.find(x => x.ic === ic); return c
        ? `<button class="cat-chip quiz-cat" data-ic="${ic}">${UI_ICONS[c.ic]} ${c.label}</button>` : ''; }).join('')}
    </div>
    <div class="quiz-retry-wrap"><button class="quiz-retry" id="quiz-retry">再測一次</button></div>`;

  body.querySelectorAll('.quiz-pick').forEach(b =>
    b.addEventListener('click', () => gotoPref(+b.dataset.id)));
  body.querySelectorAll('.quiz-cat').forEach(b =>
    b.addEventListener('click', () => showCategory(CATEGORIES.find(c => c.ic === b.dataset.ic))));
  body.querySelector('#quiz-retry').addEventListener('click', () => showQuiz());
}

// ── PWA 安裝提示 ──────────────────────────────────────────────────────────────
// Android/桌機 Chrome 會發 beforeinstallprompt，接住它才能自己觸發安裝對話框；
// iOS Safari 完全沒有這個事件、也不能用程式碼裝，只能教學提示手動「加入主畫面」。
const INSTALL_DISMISS_KEY = 'jt_install_dismissed';
let deferredInstallPrompt = null;

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function showInstallBar(mode) {
  if (isStandaloneMode() || localStorage.getItem(INSTALL_DISMISS_KEY)) return;
  const bar = document.getElementById('install-bar');
  if (!bar) return;
  document.getElementById('install-bar-text').textContent = mode === 'ios'
    ? '輕點下方的分享鈕，選「加入主畫面」，像 App 一樣使用'
    : '把攻略加到主畫面，離線也能開、像 App 一樣用';
  document.getElementById('install-bar-btn').style.display = mode === 'ios' ? 'none' : '';
  bar.classList.add('show');
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  showInstallBar('android');
});

window.addEventListener('appinstalled', () => {
  document.getElementById('install-bar')?.classList.remove('show');
});

document.getElementById('install-bar-btn').addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.getElementById('install-bar').classList.remove('show');
});

document.getElementById('install-bar-close').addEventListener('click', () => {
  localStorage.setItem(INSTALL_DISMISS_KEY, '1');
  document.getElementById('install-bar').classList.remove('show');
});

if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !isStandaloneMode()) showInstallBar('ios');

// ── 啟動 ──────────────────────────────────────────────────────────────────────
initSakura();
initSeason();
buildRegionOverview();
initSearch();
buildCatExplore();
buildSeasonExplore();
buildCompare();
buildToolboxEntry();
buildQuizEntry();
fetchFxRate();     // 抓即時匯率（失敗則用預設值）
updateFavChip();   // 初始化行程 FAB 徽章數
// setTimeout 確保 CSS grid layout 算完再取 clientHeight
setTimeout(initMap, 50);
