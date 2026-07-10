/* ============================================================================
   japan-travel AI 行程助手 — Cloudflare Worker（免費後端代理，上游用 Groq）
   作用：前端呼叫這個 Worker，Worker 補上你的 Groq key 再去打 Groq。
        key 只存在 Worker 密鑰裡，訪客看不到、也不用自備任何 key。

   ── 若要重新部署 / 設定 ─────────────────────────────────────────────────
   1. 拿一把免費 Groq key：https://console.groq.com → 註冊 → 左側 API Keys
      → Create API Key → 複製（gsk_ 開頭那串）。
   2. 在專案資料夾（D:\CS_Work\japan-travel）的終端機設密鑰（貼進終端機，別貼別處）：
        npx wrangler secret put GROQ_KEY
      出現 Enter a secret value: 就貼上 gsk_... 的 key 按 Enter。
   3. 上線前把網站網址加進下面的 ALLOWED_ORIGINS（本機測試會自動放行 localhost）。
   4. 部署：npx wrangler deploy
   ============================================================================ */

// ⬇️ 上線前把你網站的網址加進來（可放多個）。空陣列＝只有本機 localhost 能呼叫。
//    注意：用 file:// 直接開 ai-planner.html 時瀏覽器送的 Origin 是 "null"，會被擋，
//    本機測試請用 python -m http.server 起 server。
const ALLOWED_ORIGINS = [
  'https://currywarrior.github.io',
];

// 只放行前端實際會用的模型與產出長度上限。沒有這道，任何繞過前端的人
// 都能指定更貴的模型、把 max_tokens 開到最大，一次燒光免費額度。
const ALLOWED_MODELS = ['llama-3.3-70b-versatile'];
const MAX_TOKENS_CAP = 2048;
// 請求 body 字元上限。輸入 token 才是 Groq 免費層 12000 TPM 的主要消耗，
// 前端最大的一份 context 約 8000 字，留兩倍餘裕。
const MAX_BODY_CHARS = 60000;

// Groq OpenAI 相容端點
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const json = (obj, status, cors) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const isAllowed = ALLOWED_ORIGINS.includes(origin) || isLocal;
    const cors = {
      // 回傳實際被允許的來源，瀏覽器才會接受回應
      'Access-Control-Allow-Origin': isAllowed ? origin : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // 只放行來自你網站或本機的請求。curl 之類的程式不會送 Origin，
    // 沒送就是不允許——瀏覽器擋得住盜用者，但盜用者不會用瀏覽器。
    if (!isAllowed) return new Response('Forbidden', { status: 403, headers: cors });

    // CORS 預檢
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST')
      return new Response('Method Not Allowed', { status: 405, headers: cors });

    const raw = await request.text();
    if (raw.length > MAX_BODY_CHARS)
      return json({ error: { message: '請求內容過長' } }, 413, cors);

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return json({ error: { message: '請求不是合法的 JSON' } }, 400, cors);
    }
    if (!ALLOWED_MODELS.includes(payload.model))
      return json({ error: { message: '不支援的模型' } }, 400, cors);
    payload.max_tokens = Math.min(Number(payload.max_tokens) || MAX_TOKENS_CAP, MAX_TOKENS_CAP);

    if (!env.GROQ_KEY)
      return json({ error: { message: '後端未設定 GROQ_KEY 密鑰' } }, 500, cors);

    const body = JSON.stringify(payload);
    let upstream;
    try {
      upstream = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.GROQ_KEY}`,
        },
        body,
      });
    } catch (e) {
      return json({ error: { message: '無法連到 Groq：' + String(e) } }, 502, cors);
    }

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  },
};
