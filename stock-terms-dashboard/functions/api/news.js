// Cloudflare Pages Function — Yahoo Finance 뉴스 프록시
export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
  }
  const url = new URL(context.request.url);
  const symbol = (url.searchParams.get('symbol') || '').replace(/[^A-Z0-9.\-\^]/gi, '').slice(0, 20);
  if (!symbol) return jsonResp({ error: 'symbol_missing' }, 400);

  const hdrs = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://finance.yahoo.com/',
    'Origin': 'https://finance.yahoo.com',
  };

  for (const host of ['query1', 'query2']) {
    try {
      const target = `https://${host}.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&newsCount=8&quotesCount=0&enableCb=false`;
      const resp = await fetch(target, { headers: hdrs });
      if (!resp.ok) continue;
      const data = await resp.json();
      const news = (data.news || []).map(n => ({
        title:       n.title || '',
        publisher:   n.publisher || '',
        link:        n.link || '',
        publishedAt: n.providerPublishTime || 0,
      }));
      if (news.length) return jsonResp({ news });
    } catch (_) { continue; }
  }
  return jsonResp({ news: [] });
}

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' },
  });
}
