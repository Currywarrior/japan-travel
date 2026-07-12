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

這個專案沒有後端資料庫、沒有 build pipeline，但用了不少小技巧把「純靜態網站」撐出接近 App 的體驗。以下是幾個值得一提的設計：

**資料與渲染完全分離**
`data.js` 是唯一的資料源（一個巨大的 `PREF` 物件，key 是都道府縣 ID），`app.js` 裡的函式全部是「吃資料吐 HTML 字串」的純渲染邏輯，例如 `cardHtml()`、`buildStay()`、`renderWeatherTool()`。改資料不用碰邏輯，改版型不用碰資料，兩邊互不干擾。

**地圖：真實地理資料，不是手畫 SVG**
用 [D3.js](https://d3js.org/) 的 `d3.geoMercator` 投影 + [TopoJSON](https://github.com/topojson/topojson) 畫出日本地圖，縣界資料是真實地理座標算出來的，不是美編手畫的形狀。這裡有個容易踩的坑：地圖上算出來的 `prefCentroids` 是投影後的**像素座標**，只能用來畫圖，不是真實經緯度——這次做天氣預報功能時就得另外做一份 47 縣真實經緯度對照表（`PREF_LATLON`），才能拿去查 Open-Meteo。

**前端路由：不用框架自己做深連結**
用瀏覽器原生的 `history.pushState` / `popstate` 做單頁應用路由（`pushNav()` / `routeTo()`），網址列會跟著畫面同步（例如 `?pref=13` 代表東京），瀏覽器上一頁/下一頁、滑鼠側鍵都能正常運作，複製網址傳給別人也能還原到同一畫面。

**季節換膚：CSS 自訂屬性，不是四套 CSS**
四季主題（春夏秋冬）靠切換 `:root` 上的 CSS Custom Properties（`--sky`、`--sky2` 等）做到全站換色，不需要為每一季寫一整份獨立樣式表，元件本身完全不用知道現在是哪一季。

**狀態持久化：一套 pattern 用到底**
收藏、打包清單、花費記帳全部用同一套模式：`localStorage` 存一個 JSON 陣列/物件，`save()` 函式寫回去，畫面重繪時直接讀最新狀態渲染。簡單、好懂、不需要狀態管理框架。

**PWA 三件套**
- `manifest.json`：App 名稱、圖示、`display: standalone`，讓瀏覽器知道這網站「可以被安裝」
- `sw.js`：Service Worker，cache-first 策略（先查快取，沒有才連網，連網結果順便存進快取），版本化快取清理（`CACHE = 'jt-cache-vNNN'`，改版本號就會自動清掉舊快取）
- 自訂安裝提示卡：監聽 `beforeinstallprompt` 事件、`preventDefault()` 擋住瀏覽器預設行為，換成自己畫的 UI，使用者按下去才呼叫 `prompt()`；iOS Safari 不支援這個事件，改顯示教學文字引導手動「加入主畫面」

**AI 助手：Cloudflare Worker 當安全代理層**
`ai-planner.html` 不會直接把 LLM API key 放在前端（那樣任何人看原始碼就能偷走），而是打自己架的 Cloudflare Worker（`worker.js`），Worker 側用密鑰呼叫 Groq，並且做了三層防護：`Origin` 白名單（只有指定網域跟 localhost 能呼叫）、模型白名單（擋住有人指定更貴的模型燒光額度）、`max_tokens` 上限。

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
