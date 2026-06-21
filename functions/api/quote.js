// Cloudflare Pages Function — Yahoo Finance 프록시
// 브라우저 → /api/quote?symbol=AAPL → 이 Worker → Yahoo Finance
// CORS 없이 서버 측에서 직접 데이터 수집

export async function onRequest(context) {
  const { request } = context;

  // OPTIONS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const url = new URL(request.url);
  const rawSymbol = url.searchParams.get('symbol') || '';

  // 심볼 유효성 검사 (영문·숫자·.·-·^ 허용, 최대 20자)
  const symbol = rawSymbol.replace(/[^A-Z0-9.\-\^]/gi, '').slice(0, 20);
  if (!symbol) {
    return jsonResp({ error: 'symbol_missing' }, 400);
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://finance.yahoo.com/',
    'Origin': 'https://finance.yahoo.com',
  };

  // query1 → query2 순차 시도
  for (const host of ['query1', 'query2']) {
    const target = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=6mo&includePrePost=false`;
    try {
      const resp = await fetch(target, { headers });
      if (!resp.ok) continue;
      const data = await resp.json();
      if (data?.chart?.result?.[0]) {
        return jsonResp(data);
      }
      if (data?.chart?.error) continue;
    } catch (_) {
      continue;
    }
  }

  return jsonResp({ error: 'fetch_failed' }, 502);
}

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': status === 200 ? 'public, max-age=300' : 'no-store',
    },
  });
}
