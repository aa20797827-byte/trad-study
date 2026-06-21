/**
 * Cloudflare Pages Advanced Mode Worker
 * /ping       → 헬스체크 (Worker 배포 확인)
 * /api/quote  → 주가 데이터 (Yahoo Finance → Stooq 폴백)
 * /api/news   → 뉴스
 * 그 외        → env.ASSETS (정적 파일)
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return cors();
    }

    if (url.pathname === '/ping') {
      return jsonResp({ status: 'ok', worker: true, ts: Date.now() });
    }

    if (url.pathname === '/api/quote') return handleQuote(url);
    if (url.pathname === '/api/news')  return handleNews(url);

    if (env && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response('Not Found', { status: 404 });
  },
};

// ── Yahoo Finance 주가 ──
async function handleQuote(url) {
  const sym = sanitize(url.searchParams.get('symbol'));
  if (!sym) return jsonResp({ error: 'symbol_missing' }, 400);

  const hdrs = yahooHdrs();

  // Yahoo Finance (query1 → query2)
  for (const host of ['query1', 'query2']) {
    try {
      const target = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=6mo&includePrePost=false`;
      const resp = await fetch(target, {
        headers: hdrs,
        signal: AbortSignal.timeout(8000),   // ← 8초 타임아웃 (Cloudflare 30초 제한 이내)
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      if (data && data.chart && data.chart.result && data.chart.result[0]) {
        return jsonResp(data);
      }
    } catch (_) { continue; }
  }

  // Stooq CSV 폴백 (Yahoo 차단 시)
  const stooqData = await fetchStooqWorker(sym);
  if (stooqData) return jsonResp(stooqData);

  return jsonResp({ error: 'all_sources_failed' }, 502);
}

// ── Stooq CSV (Yahoo Finance 차단 시 폴백) ──
async function fetchStooqWorker(sym) {
  const stooqSym = toStooqSym(sym);
  if (!stooqSym) return null;

  const currency = stooqSym.endsWith('.ko') ? 'KRW' : 'USD';
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSym)}&i=d&l=130`;

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const csv = await resp.text();
    const rows = parseCSV(csv);
    if (!rows || rows.length < 5) return null;

    // Yahoo Finance 형식으로 변환
    return {
      chart: {
        result: [{
          meta: {
            regularMarketPrice: rows[rows.length - 1].c,
            currency,
            shortName: stooqSym.toUpperCase(),
          },
          timestamp: rows.map(function(r) { return r.ts; }),
          indicators: {
            quote: [{
              open:   rows.map(function(r) { return r.o; }),
              high:   rows.map(function(r) { return r.h; }),
              low:    rows.map(function(r) { return r.l; }),
              close:  rows.map(function(r) { return r.c; }),
              volume: rows.map(function(r) { return r.v; }),
            }],
          },
        }],
        error: null,
      },
    };
  } catch (_) { return null; }
}

function toStooqSym(sym) {
  const s = sym.toUpperCase().replace(/^(KRX|KRSE):/, '').replace(/\.(KS|KQ)$/, '');
  if (/^\d{4,6}$/.test(s)) return s + '.ko';
  if (/^(BTC|ETH)/.test(s)) return null;
  return s.toLowerCase() + '.us';
}

function parseCSV(csv) {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return null;
  const h = lines[0].toLowerCase().split(',');
  const di = h.indexOf('date'), oi = h.indexOf('open'), hi = h.indexOf('high');
  const li = h.indexOf('low'),  ci = h.indexOf('close'), vi = h.indexOf('volume');
  if (ci === -1) return null;
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(',');
    const c = parseFloat(p[ci]);
    if (!c || c <= 0) continue;
    rows.push({
      ts: Math.floor(new Date(p[di]).getTime() / 1000),
      o: parseFloat(p[oi]) || c, h: parseFloat(p[hi]) || c,
      l: parseFloat(p[li]) || c, c, v: parseInt(p[vi]) || 0,
    });
  }
  // Stooq: 최신 → 첫 줄, 역순 필요
  if (rows.length > 1 && rows[0].ts > rows[rows.length - 1].ts) rows.reverse();
  return rows.length >= 5 ? rows : null;
}

// ── Yahoo Finance 뉴스 ──
async function handleNews(url) {
  const sym = sanitize(url.searchParams.get('symbol'));
  if (!sym) return jsonResp({ error: 'symbol_missing' }, 400);

  const hdrs = yahooHdrs();

  for (const host of ['query1', 'query2']) {
    try {
      const target = `https://${host}.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(sym)}&newsCount=8&quotesCount=0&enableCb=false`;
      const resp = await fetch(target, { headers: hdrs, signal: AbortSignal.timeout(8000) });
      if (!resp.ok) continue;
      const data = await resp.json();
      const news = (data.news || []).map(function(n) {
        return { title: n.title || '', publisher: n.publisher || '', link: n.link || '', publishedAt: n.providerPublishTime || 0 };
      });
      if (news.length) return jsonResp({ news });
    } catch (_) { continue; }
  }

  return jsonResp({ news: [] });
}

// ── 헬퍼 ──
function sanitize(raw) {
  return (raw || '').replace(/[^A-Z0-9.\-\^]/gi, '').slice(0, 20);
}
function yahooHdrs() {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://finance.yahoo.com/',
    'Origin': 'https://finance.yahoo.com',
  };
}
function cors() {
  return new Response(null, {
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  });
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
