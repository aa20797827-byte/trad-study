'use strict';
const https = require('https');
const http  = require('http');

const rand = (a, b) => Math.floor(Math.random() * (b - a) + a);

async function fetchGet(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/html, */*',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer': 'https://datalab.naver.com/',
      },
      timeout: 10000,
    }, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8'), url: res.headers.location || url }));
    });
    req.on('error', e => resolve({ status: 0, body: e.message, url }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout', url }); });
  });
}

const candidates = [
  // 네이버 데이터랩 신규 URL 후보
  'https://datalab.naver.com/',
  'https://datalab.naver.com/shoppingInsight/',
  'https://datalab.naver.com/shopping/trend.naver',
  'https://datalab.naver.com/shopping/trendsearch.naver',

  // 네이버 쇼핑 실시간/인기 키워드 API
  'https://shopping.naver.com/home/getRealtimeKeyword.nhn',
  'https://section.shopping.naver.com/ns/home/categoryTop10.json',
  'https://section.shopping.naver.com/ns/home/realtimeKeyword.json',
  'https://section.shopping.naver.com/ns/home/topSearchKeyword.json',
  'https://search.shopping.naver.com/home/realtimeTrend.json',
  'https://search.shopping.naver.com/home/topKeyword.json',

  // 네이버 쇼핑인사이트 (카테고리별)
  'https://datalab.naver.com/shoppingInsight/siteDataTopList.naver?cid=50000008',
  'https://datalab.naver.com/shoppingInsight/getCategoryTopList.naver',

  // 네이버 검색 트렌드 (일반)
  'https://datalab.naver.com/keyword/trendSearch.naver',
  'https://datalab.naver.com/keyword/realtimeList.naver',
];

(async () => {
  console.log('URL 탐색 시작...\n');
  for (const url of candidates) {
    const r = await fetchGet(url);
    const preview = r.body.substring(0, 150).replace(/\n/g, ' ');
    console.log(`${r.status === 200 ? '✅' : '  '} [${r.status}] ${url}`);
    if (r.status === 200 && r.body.length > 100 && !r.body.startsWith('<!')) {
      console.log(`   → ${preview}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
})();
