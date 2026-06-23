/**
 * Cloudflare Pages Advanced Mode Worker — 레포 루트에 위치
 * Cloudflare Pages 출력 디렉토리 = 레포 루트(/)
 *
 * /ping       → 헬스체크
 * /api/quote  → Yahoo Finance → Stooq 폴백
 * /api/news   → Yahoo Finance 뉴스
 * 그 외       → env.ASSETS (정적 파일)
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    try {
      if (url.pathname === '/ping') {
        return jsonResp({ ok: true, worker: true, v: 6 });
      }
      if (url.pathname === '/api/quote')       return await handleQuote(url);
      if (url.pathname === '/api/news')        return await handleNews(url);
      if (url.pathname === '/api/fundamental') return await handleFundamental(url);
      if (url.pathname === '/api/market')      return await handleMarket();
    } catch (err) {
      return jsonResp({ error: String(err) }, 500);
    }

    if (env && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response('Not Found', { status: 404 });
  },
};

async function handleQuote(url) {
  const sym = sanitize(url.searchParams.get('symbol'));
  if (!sym) return jsonResp({ error: 'symbol_missing' }, 400);

  const yahoo = await yfetch('/v8/finance/chart/' + encodeURIComponent(sym) + '?interval=1d&range=6mo&includePrePost=false');
  if (yahoo && yahoo.chart && yahoo.chart.result && yahoo.chart.result[0]) {
    return jsonResp(yahoo);
  }

  const stooq = await fetchStooq(sym);
  if (stooq) return jsonResp(stooq);

  return jsonResp({ error: 'all_failed' }, 502);
}

async function handleNews(url) {
  const sym = sanitize(url.searchParams.get('symbol'));
  if (!sym) return jsonResp({ error: 'symbol_missing' }, 400);

  const data = await yfetch('/v1/finance/search?q=' + encodeURIComponent(sym) + '&newsCount=8&quotesCount=0&enableCb=false');
  if (data && data.news && data.news.length) {
    return jsonResp({
      news: data.news.map(function(n) {
        return { title: n.title || '', publisher: n.publisher || '', link: n.link || '', publishedAt: n.providerPublishTime || 0 };
      }),
    });
  }
  return jsonResp({ news: [] });
}

// ── 시장 현황 (주요 지수/자산 일괄 조회) ──
async function handleMarket() {
  const SYMS = [
    {sym:'^GSPC',  label:'S&P500',  cat:'index'},
    {sym:'^IXIC',  label:'NASDAQ',  cat:'index'},
    {sym:'^KS11',  label:'KOSPI',   cat:'index'},
    {sym:'^KQ11',  label:'코스닥',   cat:'index'},
    {sym:'^VIX',   label:'VIX',     cat:'fear'},
    {sym:'GLD',    label:'금',       cat:'commodity'},
    {sym:'CL=F',   label:'WTI유가', cat:'commodity'},
    {sym:'BTC-USD',label:'BTC',     cat:'crypto'},
    {sym:'DX-Y.NYB',label:'달러지수',cat:'fx'},
    {sym:'USDKRW=X',label:'원/달러',cat:'fx'},
  ];

  const results = await Promise.all(SYMS.map(async function(item) {
    try {
      const data = await yfetch('/v8/finance/chart/' + encodeURIComponent(item.sym) + '?interval=1d&range=5d&includePrePost=false');
      if (data && data.chart && data.chart.result && data.chart.result[0]) {
        const r = data.chart.result[0];
        const m = r.meta;
        const closes = r.indicators.quote[0].close.filter(v => v != null);
        const prev = closes.length >= 2 ? closes[closes.length - 2] : m.chartPreviousClose;
        const cur  = m.regularMarketPrice || closes[closes.length - 1];
        const chg  = prev && prev > 0 ? (cur - prev) / prev * 100 : 0;
        return { ...item, price: cur, chg: Math.round(chg * 100) / 100, prev, currency: m.currency };
      }
    } catch (_) {}
    return { ...item, price: null, chg: null };
  }));

  return jsonResp({ items: results, ts: Date.now() }, 200, 180); // 3분 캐시
}

async function handleFundamental(url) {
  const sym = sanitize(url.searchParams.get('symbol'));
  if (!sym) return jsonResp({ error: 'symbol_missing' }, 400);

  const modules = 'summaryDetail,defaultKeyStatistics,financialData,price,calendarEvents';
  const data = await yfetch('/v10/finance/quoteSummary/' + encodeURIComponent(sym) + '?modules=' + modules);

  if (data && data.quoteSummary && data.quoteSummary.result && data.quoteSummary.result[0]) {
    const r  = data.quoteSummary.result[0];
    const sd = r.summaryDetail        || {};
    const ks = r.defaultKeyStatistics || {};
    const fd = r.financialData        || {};
    const pr = r.price                || {};
    const ce = r.calendarEvents       || {};
    const v  = k => (k && k.raw !== undefined) ? k.raw : k;

    return jsonResp({
      shortName:       pr.shortName || pr.longName,
      currency:        pr.currency  || 'USD',
      marketCap:       v(pr.marketCap),
      per:             v(sd.trailingPE),
      forwardPer:      v(sd.forwardPE),
      pbr:             v(sd.priceToBook),
      dividendYield:   v(sd.dividendYield),
      week52High:      v(sd.fiftyTwoWeekHigh),
      week52Low:       v(sd.fiftyTwoWeekLow),
      beta:            v(sd.beta) || v(ks.beta),
      eps:             v(ks.trailingEps),
      bookValue:       v(ks.bookValue),
      profitMargins:   v(ks.profitMargins) || v(fd.profitMargins),
      roe:             v(fd.returnOnEquity),
      roa:             v(fd.returnOnAssets),
      debtToEquity:    v(fd.debtToEquity),
      revenueGrowth:   v(fd.revenueGrowth),
      grossMargins:    v(fd.grossMargins),
      operatingMargins:v(fd.operatingMargins),
      freeCashflow:    v(fd.freeCashflow),
      totalDebt:       v(fd.totalDebt),
      totalCash:       v(fd.totalCash),
      currentRatio:    v(fd.currentRatio),
      quickRatio:      v(fd.quickRatio),
      targetMeanPrice: v(fd.targetMeanPrice),
      recommendationKey: fd.recommendationKey,
      numberOfAnalystOpinions: v(fd.numberOfAnalystOpinions),
      nextEarningsDate: ce.earnings && ce.earnings.earningsDate && ce.earnings.earningsDate[0]
        ? v(ce.earnings.earningsDate[0]) : null,
    });
  }
  return jsonResp({ error: 'no_data' }, 404);
}

async function yfetch(path) {
  for (const host of ['query1', 'query2']) {
    const ctrl = new AbortController();
    const timer = setTimeout(function() { ctrl.abort(); }, 8000);
    try {
      const resp = await fetch('https://' + host + '.finance.yahoo.com' + path, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Referer': 'https://finance.yahoo.com/',
          'Origin': 'https://finance.yahoo.com',
        },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) continue;
      const data = await resp.json();
      if (data) return data;
    } catch (_) { clearTimeout(timer); continue; }
  }
  return null;
}

async function fetchStooq(sym) {
  const stooqSym = toStooqSym(sym);
  if (!stooqSym) return null;
  const currency = stooqSym.endsWith('.ko') ? 'KRW' : 'USD';
  const ctrl = new AbortController();
  const timer = setTimeout(function() { ctrl.abort(); }, 8000);
  try {
    const resp = await fetch('https://stooq.com/q/d/l/?s=' + encodeURIComponent(stooqSym) + '&i=d&l=130', { signal: ctrl.signal });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const csv = await resp.text();
    const rows = parseCSV(csv);
    if (!rows || rows.length < 5) return null;
    return {
      chart: {
        result: [{
          meta: { regularMarketPrice: rows[rows.length - 1].c, currency, shortName: stooqSym.toUpperCase() },
          timestamp: rows.map(function(r) { return r.ts; }),
          indicators: { quote: [{ open: rows.map(function(r){return r.o;}), high: rows.map(function(r){return r.h;}), low: rows.map(function(r){return r.l;}), close: rows.map(function(r){return r.c;}), volume: rows.map(function(r){return r.v;}) }] },
        }],
        error: null,
      },
    };
  } catch (_) { clearTimeout(timer); return null; }
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
  const li = h.indexOf('low'), ci = h.indexOf('close'), vi = h.indexOf('volume');
  if (ci === -1) return null;
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(',');
    const c = parseFloat(p[ci]);
    if (!c || c <= 0) continue;
    rows.push({ ts: Math.floor(new Date(p[di] || '').getTime() / 1000) || 0, o: parseFloat(p[oi]) || c, h: parseFloat(p[hi]) || c, l: parseFloat(p[li]) || c, c, v: parseInt(p[vi]) || 0 });
  }
  if (rows.length > 1 && rows[0].ts > rows[rows.length - 1].ts) rows.reverse();
  return rows.length >= 5 ? rows : null;
}

function sanitize(raw) {
  return (raw || '').replace(/[^A-Z0-9.\-\^]/gi, '').slice(0, 20);
}

function jsonResp(data, status, maxAge) {
  var age = maxAge !== undefined ? maxAge : (status && status !== 200 ? 0 : 300);
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': age ? 'public, max-age='+age : 'no-store' },
  });
}
