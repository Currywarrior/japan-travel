<div align="center">

# 日本旅遊完全攻略

### 47 都道府縣 · 984 個景點 · 710 道美食 · 一個地圖點完全日本

純手刻 Vanilla JavaScript 打造的互動式旅遊攻略網站——沒有框架、沒有建置流程，
從地圖到 AI 排行程到可安裝的離線 App，全部從零手刻。

[![Live Site](https://img.shields.io/badge/live_demo-currywarrior.github.io%2Fjapan--travel-7cccef?style=for-the-badge&logo=googlechrome&logoColor=white)](https://currywarrior.github.io/japan-travel/)

[![Vanilla JS](https://img.shields.io/badge/Vanilla-JavaScript-ffc23d?style=flat-square&logo=javascript&logoColor=white)](#技術架構與工程技巧)
[![D3.js](https://img.shields.io/badge/D3.js-geo--mapping-7cccef?style=flat-square&logo=d3dotjs&logoColor=white)](#技術架構與工程技巧)
[![PWA](https://img.shields.io/badge/PWA-installable-7fe0c4?style=flat-square&logo=pwa&logoColor=white)](#安裝成手機-app)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-ff9ec4?style=flat-square&logo=cloudflare&logoColor=white)](#部署)
[![No Build Step](https://img.shields.io/badge/build_step-none-2ecc71?style=flat-square)](#本機開發)
[![License](https://img.shields.io/badge/license-personal_project-999999?style=flat-square)](#授權)

**[線上體驗](https://currywarrior.github.io/japan-travel/)** ·
[功能總覽](#功能總覽) ·
[技術架構](#技術架構與工程技巧) ·
[本機開發](#本機開發) ·
[安裝成 App](#安裝成手機-app)

</div>

---

<div align="center">

| 47 | 984 | 710 | 147 | 6 | 0 |
|:---:|:---:|:---:|:---:|:---:|:---:|
| 都道府縣 | 景點 | 美食 | 住宿推薦 | 旅遊工具箱功能 | build step |

</div>

---

## 目錄

- [這是什麼](#這是什麼)
- [功能總覽](#功能總覽)
- [技術架構與工程技巧](#技術架構與工程技巧)
- [專案結構](#專案結構)
- [本機開發](#本機開發)
- [部署](#部署)
- [安裝成手機 App](#安裝成手機-app)
- [內容規模與資料來源](#內容規模與資料來源)
- [版本紀錄](#版本紀錄)
- [授權](#授權)

---

## 這是什麼

這是一個為日本自由行打造的攻略網站，目標是取代「開十幾個分頁到處查資料」的體驗：一個地圖、一個搜尋框，47 個縣市的景點美食住宿交通全部整理好，收藏起來就能直接變成分天行程，出發前還有匯率、打包清單、天氣、預算幾個小工具可以用。

整個網站是一個人（連同 Claude Code）從零開始，用純 HTML/CSS/JavaScript 手刻出來的，沒有 React、沒有 Vue、沒有 npm build，寫完存檔重新整理就能看到結果。這個決定是刻意的：專案不大到需要框架的複雜度，而且對想搞懂「網頁到底怎麼運作」的人來說，能直接看懂每一行程式碼在幹嘛，比套框架更有價值。

## 功能總覽

**探索與導覽**
- 互動式日本地圖（可縮放、拖曳、hover 顯示縣市預覽），依評等／預算／季節切換圖例上色
- 全站搜尋（景點、美食、縣市名，含異體字容錯）
- 8 大主題分類瀏覽（溫泉、世界遺產、自然絕景、歷史名城、神社寺廟、夜景展望、季節限定、在地美食）
- 4 季換膚：依當下月份自動套用春夏秋冬配色主題，也能手動切換
- 縣市 PK 比較：選 2–3 個縣並排比評等、預算、季節與代表特色

**行程規劃**
- 收藏景點／美食／住宿，分配到「第幾天」，自動在地圖上畫出當天路線
- 「我的行程」深連結分享：整份收藏可以還原成同一個畫面
- AI 行程規劃助手（獨立頁面 `ai-planner.html`）：輸入天數、地區、偏好，用 LLM 排出行程，一鍵存回收藏
- 旅人性格測驗：5 題選擇題算出旅人原型，動態推薦對應的縣市與主題

**旅遊工具箱**（出發前後都用得到的 6 個小工具）
- 匯率換算：開站抓即時匯率，換算失敗則用預設值兜底
- 打包清單：分類清單 + 自訂項目，勾選狀態存本機
- 季節速查：47 縣最佳旅遊季節一覽表
- 天氣預報：47 縣廳所在地經緯度對照，串 Open-Meteo 抓未來 7 天預報
- 預算估算：依天數與消費等級（背包客／標準／豪華）試算總花費
- 花費記帳：出發後實際花費記錄，跟預算估算同一套分類，超支即時看得到

**離線與安裝**
- PWA：可加到手機主畫面，開起來全螢幕、沒有網址列，像原生 App
- Service Worker 快取瀏覽過的頁面，離線也能看
- 自訂安裝提示卡：接住瀏覽器的 `beforeinstallprompt` 事件，不用使用者自己去選單裡找

## 技術架構與工程技巧

這個專案沒有後端資料庫、沒有 build pipeline，全部是瀏覽器原生能力堆出來的。以下用「如果有人問我這是怎麼做的，我會怎麼回答」的角度，把每個技巧從底層原理講起。

### 網頁的骨架：為什麼不用框架

React／Vue 這類框架解決的核心問題是「畫面狀態變了，怎麼有效率地更新 DOM」——它們會在記憶體裡維護一份虛擬 DOM，比對變化再局部更新真實 DOM，換取的代價是要學一套框架語法、要有建置流程（JSX 轉譯、打包）。這個專案的畫面複雜度沒到需要這套機制：每次切換畫面（點一個縣市、切一個工具分頁）都是直接把一大段 HTML 字串塞進 `innerHTML` 整塊重繪，例如：

```js
function showPref(pref) {
  view.innerHTML = `<div class="pv-header">...${pref.name}...</div>`;
}
```

原理上，瀏覽器拿到 `innerHTML` 賦值時，會重新跑一次 HTML parser 把字串轉成 DOM 節點樹再掛回頁面——這比框架的局部更新「粗暴」，但因為單一個縣市頁面的節點數量不大（幾十到上百個），肉眼完全感覺不到差異，卻換來零建置、開瀏覽器就能改的直接體驗。`data.js` 存所有資料（一個巨大的 `PREF` 物件），`app.js` 裡的函式都是「吃資料吐字串」的純函式（`cardHtml()`、`buildStay()`），資料跟畫面邏輯完全分開，改其中一邊不會動到另一邊。

### 地圖是怎麼畫出來的

地圖不是美編畫的 SVG 圖檔，是**真實地理座標算出來的**。日本 47 縣的邊界資料本質上是一大堆「(經度, 緯度) 點連起來的多邊形」，這種資料存成標準格式是 GeoJSON，但這個專案用的是它的壓縮版本 [TopoJSON](https://github.com/topojson/topojson)——GeoJSON 會把每個縣的邊界完整存一次，相鄰兩個縣共用的那條邊界線就會被重複存兩份；TopoJSON 改成先把所有邊界線切成一段一段的「arc」只存一份，每個縣的形狀用「哪些 arc 照什麼順序接起來」的索引來描述，共用邊界只存一次，檔案通常只有 GeoJSON 的 20% 大小。

拿到經緯度之後，下一個問題是「地球是球面，螢幕是平面，怎麼攤平」——這就是**地圖投影**要解決的事。這個專案用 [D3.js](https://d3js.org/) 的 `d3.geoMercator()`，也就是麥卡托投影：經度直接線性映射成 x 座標；緯度用 `ln(tan(π/4 + φ/2))` 這個公式映射成 y 座標，這個函式的特性是越靠近極區增長越快（南北極理論上會拉伸到無窮遠）。麥卡托投影的好處是「等角」——地圖上任何一點的角度、方向都跟現實一致（這是它被設計來給航海用的原因），代價是離赤道越遠面積被放大越多（世界地圖上格陵蘭看起來比實際大很多，就是這個原因）；日本橫跨的緯度範圍不算誇張，所以這個扭曲在這個專案的尺度上不明顯。

有個容易忽略但這次真的踩到的坑：D3 算出來給 SVG 畫圖用的座標（專案裡叫 `prefCentroids`）是**投影之後的像素座標**，跟真實經緯度是兩回事——同一個縣，像素座標可能是 `[412, 268]`，但真實經緯度是 `[35.69, 139.69]`，兩者之間隔著一層不可逆的投影運算。這次做「天氣預報」功能要拿縣市的真實座標去查氣象 API，直接用 `prefCentroids` 是錯的，只能另外手動建一份 47 縣真實經緯度對照表（`PREF_LATLON`）。

### 怎麼讓網址列跟著畫面走、還能分享連結

傳統網站每個網址對應一次完整的頁面請求；這個網站切換畫面時完全不重新整理、不發 HTTP 請求，但網址列還是會跟著變（例如點進東京會變成 `?pref=13`）。這靠的是瀏覽器的 **History API**：每個分頁本身維護一份「瀏覽紀錄堆疊」，`history.pushState(state, '', url)` 可以在不觸發真正頁面載入的情況下，往這個堆疊推一筆紀錄、同時把網址列換成指定的字串。使用者按瀏覽器上一頁/下一頁或滑鼠側鍵時，瀏覽器會觸發 `popstate` 事件並把當初存進去的 `state` 物件原封不動交還給你，程式只要監聽這個事件、依 `state` 內容重新渲染對應畫面即可（專案裡是 `pushNav()` 負責推、`routeTo()` 負責依 state 渲染）。React Router 這類框架的路由，拆開來看本質上也是包了同一組瀏覽器 API，沒有更神奇的東西。

深連結分享（複製網址傳給朋友能還原同一畫面）靠的是頁面載入時讀一次 `location.search`（`?pref=13` 這段），把它反解回對應的畫面狀態去渲染——這一步是 `applyDeepLink()` 在做的事。

### 季節換膚是怎麼做到全站秒換色的

四季主題不是切換四套 CSS 檔案，是靠 **CSS 自訂屬性（CSS Custom Properties）**。CSS 有個原生機制叫「繼承層疊」：子元素預設會沿用祖先元素的某些樣式值。自訂屬性（`--sky: #2eb4e8;` 這種語法）本質上就是一個會被繼承的普通屬性，宣告在 `:root`（也就是 `<html>` 本身）上時，全站任何地方寫 `color: var(--sky)` 都會即時去繼承鏈上找這個值——重點是「即時」：瀏覽器算樣式（computed style）是動態查找的，不是像 Sass/LESS 變數那樣在編譯階段就被替換死成固定色碼。所以只要在 `:root` 上換一組 `--sky` 等變數的值（例如春天用粉色系、冬天用冷色系），所有引用 `var(--sky)` 的地方會在下一個畫面更新時自動套用新顏色，元件本身完全不用知道現在是哪一季，也不用重新載入任何檔案。

### 資料要怎麼存住（收藏、打包清單、花費記帳這些）

這幾個功能沒有後端資料庫，全部存在瀏覽器的 `localStorage`。原理上，瀏覽器會依「origin」（協定 + 網域 + port 的組合）各自劃出一塊獨立的儲存空間，提供一組同步的 key-value API（`localStorage.setItem(key, value)` / `getItem(key)`），資料只能存字串，沒有到期時間，容量上限通常是 5–10MB，而且**不會**像 cookie 一樣隨每次 HTTP 請求自動夾帶出去（純粹是本機儲存，資料不會跑到伺服器）。因為只能存字串，物件要先 `JSON.stringify()` 轉成字串才能存，讀出來要 `JSON.parse()` 轉回物件——收藏、打包清單、花費記帳、匯率記憶全部是同一套 pattern：畫面操作 → 更新記憶體裡的變數 → `JSON.stringify` 寫回 `localStorage` → 重繪畫面時從記憶體變數讀最新狀態顯示。

### 怎麼讓網站變成手機 App 的

「變成 App」拆開來看其實是三個獨立的瀏覽器機制疊起來：

1. **`manifest.json`**：一份描述檔，告訴瀏覽器這個網站的名稱、圖示、啟動網址、以及最關鍵的 `display: standalone`——這個欄位是在跟瀏覽器說「使用者打開你的時候，不要顯示網址列跟分頁列，用一個獨立視窗全螢幕呈現」。
2. **Service Worker**：這是瀏覽器另外幫網頁跑的一條**背景執行緒**，跟頁面的主執行緒是分開的，生命週期也不一樣（`install` → `activate` 之後常駐，瀏覽器閒置時可能會把它終止、有新的網路請求或事件再喚醒它，所以裡面不能靠全域變數保存長期狀態，要存資料得用專門的 Cache API 或 IndexedDB）。它註冊之後，這個網站發出的每一個網路請求都會先被它攔截：程式碼裡的 `fetch` 事件監聽器可以決定「直接把快取裡的答案回傳（完全不連網）」還是「放行去真的連網，連網結果順便存一份進快取」（cache-first 策略）。這就是離線瀏覽的原理——資料根本沒有連網，是這條背景執行緒自己回答的。快取清理靠版本號字串（`CACHE = 'jt-cache-v224'`）：只要程式碼一改版本號，Service Worker 啟動時就會把跟這次版本號不一樣的舊快取全部刪掉，逼瀏覽器重新抓最新檔案。
3. **可安裝**：符合前兩項條件（manifest 有效、Service Worker 已註冊）又是 HTTPS 連線時，瀏覽器會判定這個網站「可以被安裝」，並在真正跳出安裝視窗之前，先發一個可以被 JS 攔截的事件 `beforeinstallprompt`。攔下來、`preventDefault()` 擋掉瀏覽器原本會自動跳出的 UI，換成自己畫的提示卡，等使用者真的按下「安裝」才呼叫存起來的事件物件的 `.prompt()` 方法，主動叫出瀏覽器原生的安裝對話框——最後真正執行安裝的還是瀏覽器本身，這裡只是換了觸發的時機跟外觀。iOS 的 Safari 完全沒有這個事件（蘋果的政策限制），所以沒辦法用程式碼觸發，只能顯示文字教使用者手動點分享鈕、選「加入主畫面」。

「可安裝」還有一個常被忽略的前提：**secure context（安全情境）**。瀏覽器只信任 HTTPS 連線，或是 `localhost`／`127.0.0.1` 這種「回到自己機器」的特例；一般的區網 HTTP 網址（例如手機連區網 IP 測試）不算安全情境，`beforeinstallprompt` 根本不會被觸發，這是規格層級的限制，不是程式碼的問題。

### AI 排行程的 API Key 藏在哪裡，不怕被偷嗎

如果直接在前端 JS 裡打 LLM 的 API（例如直接呼叫 Groq），API key 一定得寫進送出去給瀏覽器的程式碼裡，任何人按 F12 看原始碼或攔截網路請求就能把 key 複製走去盜刷額度。解法是中間加一層自己控制的伺服器當「代理」：前端只打自己的後端，後端才用密鑰去打真正的 LLM API，金鑰只存在後端環境、永遠不會下載到使用者的瀏覽器。

這個專案用 [Cloudflare Workers](https://developers.cloudflare.com/workers/) 當這層代理，屬於 **edge computing / serverless**：程式碼不是跑在你自己租的一台固定伺服器上，而是部署到 Cloudflare 全球的邊緣節點，使用者的請求會被路由到離他最近的節點執行，沒有請求進來時不占用任何運算資源，也不用自己管伺服器。

這裡還牽涉到 **CORS（跨來源資源共享）**的原理：瀏覽器基於安全考量，預設禁止一個網頁用 JS 去讀取「不同 origin」伺服器回應的內容，即使那個請求其實成功送達、伺服器也確實回應了——瀏覽器會直接不讓 JS 拿到回應內容，除非對方伺服器在回應標頭裡明確用 `Access-Control-Allow-Origin` 表態允許你的來源。這就是為什麼 `worker.js` 要自己組一段 CORS 標頭邏輯，並且檢查請求帶的 `Origin` 是不是在自己的白名單裡（只有指定網域跟 `localhost` 放行）——這一層防的是別人抄走這支 Worker 的網址、從別的網站呼叫來盜用你的免費額度。除此之外還疊了模型白名單（擋住有人把 request 改成呼叫更貴的模型）跟 `max_tokens` 上限（擋住有人故意要求超長輸出燒光額度）。

## 專案結構

```
japan-travel/
├── index.html          主站頁面（地圖、地區/縣市頁、工具箱、收藏、測驗都在這一頁動態切換）
├── app.js               全站互動邏輯（~2,100 行）：地圖渲染、路由、搜尋、工具箱、PWA 安裝提示…
├── data.js               47 縣資料庫（~8,900 行）：景點／美食／住宿／交通／tips
├── ai-planner.html      獨立的 AI 行程規劃頁，透過 worker.js 呼叫 LLM
├── worker.js             Cloudflare Worker：AI 請求的安全代理層
├── wrangler.toml         Worker 的部署設定
├── manifest.json         PWA 設定檔（名稱、圖示、顯示模式）
├── sw.js                 Service Worker：離線快取邏輯
├── icon.svg / icon-192.png / icon-512.png   App 圖示
├── check.js              開發用小工具：掃描 47 縣資料有沒有缺圖
└── hotel_img/            住宿卡片用的飯店照片
```

## 本機開發

不需要安裝任何套件、不需要跑 `npm install`。整個網站是純靜態檔案，起一個本機伺服器就能看：

```bash
git clone https://github.com/Currywarrior/japan-travel.git
cd japan-travel
python -m http.server 8765
```

打開 `http://localhost:8765/index.html` 即可。用 `python -m http.server` 而不是直接雙擊開檔案（`file://`），是因為 Service Worker、`fetch()` 抓資料這些功能在 `file://` 協定下會被瀏覽器擋掉，一定要透過 `http://` 才能正常測試。

改完 `app.js` 或 `data.js` 直接重新整理瀏覽器（`Ctrl+Shift+R` 強制重整，避開瀏覽器快取）就能看到結果，不需要重新編譯。

## 部署

**前端（GitHub Pages）**

Repo 設定 → Pages → Source 選 `master` 分支 `/ (root)`，儲存後 GitHub 會自動部署，網址是 `https://<帳號>.github.io/<repo名稱>/`。之後每次 `git push` 到 `master`，Pages 會在一兩分鐘內自動重新部署，不需要手動觸發。

**AI 後端（Cloudflare Worker）**

`ai-planner.html` 依賴的 Worker 要另外部署：

```bash
npx wrangler secret put GROQ_KEY   # 貼上從 https://console.groq.com 拿到的 key
npx wrangler deploy
```

部署前記得把正式網站網址加進 `worker.js` 的 `ALLOWED_ORIGINS` 陣列，不然上線後自己的網頁會被 Worker 的來源白名單擋下來（本機 `localhost` 測試會自動放行，不用另外加）。

**版本快取升級 SOP**

這個網站裝置上會被 Service Worker 整頁快取，所以每次改完 `index.html` / `app.js` / `data.js` 這些會被快取的檔案，發布前要記得同步做兩件事，不然已經安裝成 App 的使用者會一直卡在舊版本：

1. `index.html` 裡 `<script src="app.js?v=NNN">`、`<script src="data.js?v=NNN">` 的版本號 +1
2. `sw.js` 裡 `const CACHE = 'jt-cache-vNNN'` 的版本號同步 +1

版本號不一致會導致瀏覽器誤判「這是同一版」而繼續用舊快取。

## 安裝成手機 App

**Android（Chrome）**

開啟網站後，畫面左下角會自動跳出安裝提示卡，按「安裝」即可；若沒跳出來，改用瀏覽器右上角選單找「安裝應用程式」。裝完主畫面會出現獨立圖示，打開後全螢幕顯示、沒有網址列。

**iPhone（Safari）**

iOS 不支援網頁主動跳出安裝提示，需要手動操作：點畫面下方的「分享」圖示 → 往下滑找「加入主畫面」→ 確認名稱後按「新增」。

**注意：安裝功能只在 HTTPS 或 `localhost` 底下才會運作**，這是瀏覽器的安全機制（secure context），區網 IP（例如 `http://192.168.x.x:8765`）即使頁面能正常打開，也不會觸發安裝提示——這不是網站的 bug，是規格層級的限制。要在手機上測安裝功能，請直接用正式網址 `https://currywarrior.github.io/japan-travel/`。

## 內容規模與資料來源

- 47 都道府縣，每縣都有完整的景點／美食／住宿／交通資料
- 984 個景點、710 道美食、147 個住宿推薦（截至目前，數字會持續增加）
- 所有圖片來自 [Wikimedia Commons](https://commons.wikimedia.org/)，依各檔案標示的授權條款使用

## 版本紀錄

Service Worker 的快取版本號（`sw.js` 裡的 `jt-cache-vNNN`）從專案早期就存在，目前已經迭代到 v224，記錄了數月來持續擴充 47 縣資料、修正錯圖、優化互動體驗的過程。完整逐版細節多半在開發過程的筆記裡，沒有對應到每一次 git commit——這個 repo 是在內容已經累積一段時間後才正式導入版本控制的。

<details>
<summary><strong>展開查看有 git 記錄以來的完整版本清單</strong></summary>
<br>

| 日期 | 內容 |
|---|---|
| 2026-07-12 | 旅遊工具箱新增天氣預報、花費記帳；PWA 加裝 App 安裝提示卡（v224） |
| 2026-07-12 | PWA 離線化：manifest + service worker + app icon，可加到主畫面離線瀏覽（v223） |
| 2026-07-12 | 廣島去重：嚴島神社兩條合併升級、補吳市アレイからすこじま（v222） |
| 2026-07-12 | 多縣內容補強：神奈川／廣島景點補到 40、神奈川美食、名古屋六縣交通與建議加厚（v221） |
| 2026-07-12 | 神奈川景點補到 40：鎌倉、箱根、橫濱、三浦半島共 28 處 |
| 2026-07-10 | 修錯圖與重複條目：河口湖空拍圖、近江牛活牛圖、松葉蟹、蒜山 |
| 2026-07-10 | 中部九縣補齊 + 中國地方美食 |
| 2026-07-10 | 石川、富山、山梨景點補到 40 |
| 2026-07-10 | 石川、富山景點補到 40 |
| 2026-07-10 | 初始 commit：47 縣日本旅遊攻略網站 |

</details>

想看完整逐筆歷史可以直接跑 `git log`。

## 授權

個人非商業專案。景點與美食圖片版權屬於原拍攝者，依 Wikimedia Commons 上標示的授權條款使用；文字內容與程式碼歡迎參考學習，正式轉載請先告知。
