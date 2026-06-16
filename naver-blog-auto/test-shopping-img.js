'use strict';
const https = require('https');

async function testShoppingSearch(keyword) {
  const searchUrl = `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(keyword)}&sort=rel`;
  console.log('검색 URL:', searchUrl);

  const html = await new Promise((resolve, reject) => {
    const req = https.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer': 'https://www.naver.com/',
      },
      timeout: 15000,
    }, res => {
      console.log('상태코드:', res.statusCode);
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });

  console.log('HTML 길이:', html.length);

  const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!nextMatch) {
    console.log('__NEXT_DATA__ 없음!');
    // 일부 HTML 덤프
    console.log('HTML 앞부분:', html.substring(0, 500));
    return;
  }

  const raw = nextMatch[1];
  const decoded = raw.replace(/\\u([\dA-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  console.log('NEXT_DATA 길이:', decoded.length);

  // 이미지 URL 찾기
  const imgRe = /"imageUrl"\s*:\s*"(https?:\/\/[^"]{20,})"/g;
  const imgs = [];
  let m;
  while ((m = imgRe.exec(decoded)) !== null && imgs.length < 8) {
    imgs.push(m[1]);
  }
  console.log('\n이미지 URLs:', imgs);

  // 상품명 찾기
  const nameM = decoded.match(/"productName"\s*:\s*"([^"]{2,80})"/);
  console.log('상품명:', nameM?.[1] || '없음');

  // 가격 찾기
  const priceM = decoded.match(/"price"\s*:\s*(\d{3,8})/);
  console.log('가격:', priceM?.[1] || '없음');

  // mallProductUrl
  const mallM = decoded.match(/"mallProductUrl"\s*:\s*"(https?:\/\/[^"]{10,})"/);
  console.log('구매링크:', mallM?.[1] || '없음');
}

(async () => {
  for (const kw of ['비데', '음식물처리기', '에어프라이어']) {
    console.log(`\n===== ${kw} =====`);
    await testShoppingSearch(kw);
    await new Promise(r => setTimeout(r, 1000));
  }
})();
