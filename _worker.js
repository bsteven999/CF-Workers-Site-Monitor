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
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" },
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
