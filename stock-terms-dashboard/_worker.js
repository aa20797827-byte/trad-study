/**
 * Cloudflare Pages Advanced Mode Worker
 * /api/quote, /api/news → Yahoo Finance 서버 측 직접 호출 (CORS 없음)
 * 그 외 모든 요청 → env.ASSETS (정적 파일 서빙)
 *
 * ※ _worker.js 파일이 존재하면 Cloudflare Pages가 자동으로 Advanced Mode로 전환됩니다.
 *   functions/ 디렉토리는 이 파일이 있으면 무시됩니다.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // API 라우팅
    if (url.pathname === '/api/quote') return handleQuote(url);
    if (url.pathname === '/api/news')  return handleNews(url);

    // 정적 파일 서빙 (env.ASSETS = Cloudflare Pages 정적 에셋)
    if (env && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};

// ── Yahoo Finance 주가 데이터 ──
async function handleQuote(url) {
  const symbol = sanitize(url.searchParams.get('symbol'));
  if (!symbol) return jsonResp({ error: 'symbol_missing' }, 400);

  const hdrs = yahooHeaders();

  for (const host of ['query1', 'query2']) {
    try {
      const target = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=6mo&includePrePost=false`;
      const resp = await fetch(target, { headers: hdrs });
      if (!resp.ok) continue;
      const data = await resp.json();
      if (data && data.chart && data.chart.result && data.chart.result[0]) {
        return jsonResp(data);
      }
    } catch (_) { continue; }
  }

  return jsonResp({ error: 'fetch_failed' }, 502);
}

// ── Yahoo Finance 뉴스 ──
async function handleNews(url) {
  const symbol = sanitize(url.searchParams.get('symbol'));
  if (!symbol) return jsonResp({ error: 'symbol_missing' }, 400);

  const hdrs = yahooHeaders();

  for (const host of ['query1', 'query2']) {
    try {
      const target = `https://${host}.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&newsCount=8&quotesCount=0&enableCb=false`;
      const resp = await fetch(target, { headers: hdrs });
      if (!resp.ok) continue;
      const data = await resp.json();
      const news = (data.news || []).map(function(n) {
        return {
          title: n.title || '',
          publisher: n.publisher || '',
          link: n.link || '',
          publishedAt: n.providerPublishTime || 0,
        };
      });
      if (news.length) return jsonResp({ news });
    } catch (_) { continue; }
  }

  return jsonResp({ news: [] });
}

// ── 공통 헬퍼 ──
function sanitize(raw) {
  return (raw || '').replace(/[^A-Z0-9.\-\^]/gi, '').slice(0, 20);
}

function yahooHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://finance.yahoo.com/',
    'Origin': 'https://finance.yahoo.com',
  };
}

function jsonResp(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': (status && status !== 200) ? 'no-store' : 'public, max-age=300',
    },
  });
}
