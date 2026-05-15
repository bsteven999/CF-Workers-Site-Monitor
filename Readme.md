# CF-Workers-Site-Monitor

定時瀏覽網址的 Cloudflare Worker 腳本，支援 Cron 自動觸發與手動執行。

## 功能

- 定時訪問多個網址（keep-alive / 監控）
- 支援逗號或換行分隔網址
- 訪問 `/go` 可手動觸發
- 每個網址只連接一次，並行執行

## 部署方式

### 1. 建立 Worker

1. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 進入 **Workers & Pages** → **Create** → **Hello World**
3. 貼上 `worker.js` 內容 → **Save & Deploy**

### 2. 設定環境變數

進入 Worker → **Settings** → **Variables and Secrets**，新增：

| 變數名 | 類型 | 說明 |
|---|---|---|
| `SITES` | Plain text | 要訪問的網址清單 |

`SITES` 支援逗號或換行分隔：

```
https://example.com
https://api.example.com
https://another.com
```

### 3. 設定 Cron（定時觸發）

進入 Worker → **Triggers** → **Cron Triggers** → **Add Cron Trigger**

常用表達式：

| 表達式 | 說明 | 香港時間 |
|---|---|---|
| `*/5 * * * *` | 每 5 分鐘 | — |
| `0 1 * * *` | 每天 | 09:00 AM |
| `0 16 * * *` | 每天 | 00:00 AM |

## 使用方式

| 方式 | 說明 |
|---|---|
| Cron 自動觸發 | 背景執行，走 `scheduled()` handler |
| 手動觸發 | 訪問 `https://your-worker.workers.dev/go` |
| 其他路徑 | 回傳 404 |

手動觸發回傳 JSON 結果：

```json
[
  {
    "url": "https://example.com",
    "ok": true,
    "status": 200,
    "latency": 312,
    "time": "2026-05-16T04:11:00.000Z"
  }
]
```

## 代碼

```js
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runChecks(env));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== "/go") {
      return new Response("Not Found", { status: 404 });
    }
    const results = await runChecks(env);
    return new Response(JSON.stringify(results, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  },
};

async function runChecks(env) {
  const sites = (env.SITES ?? "").split(/[\n,]/).map(s => s.trim()).filter(Boolean);
  if (sites.length === 0) {
    console.warn("[Monitor] SITES 未設定");
    return [];
  }
  const results = await Promise.all(sites.map(visitSite));
  console.log("[Monitor] Results:", JSON.stringify(results));
  return results;
}

async function visitSite(url) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "CF-Monitor/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    return {
      url,
      ok:      res.status >= 200 && res.status < 400,
      status:  res.status,
      latency: Date.now() - t0,
      time:    new Date().toISOString(),
    };
  } catch (err) {
    return {
      url,
      ok:      false,
      error:   err.message,
      latency: Date.now() - t0,
      time:    new Date().toISOString(),
    };
  }
}
```

## 注意事項

- Cloudflare Workers 免費版每天有 **100,000 次**請求限額
- Cron 觸發不計入請求限額
- 免費版 Cron 最短間隔為**每分鐘一次**
- 每次觸發，`SITES` 內每個網址只會連接**一次**
