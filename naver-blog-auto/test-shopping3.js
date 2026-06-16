'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const COOKIE_FILE = path.join(__dirname, 'session.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: fs.existsSync(COOKIE_FILE) ? COOKIE_FILE : undefined,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 }, locale: 'ko-KR',
  }).catch(() => browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 }, locale: 'ko-KR',
  }));

  // API 응답 캡처
  const apiResponses = [];
  ctx.on('response', async resp => {
    const url = resp.url();
    if (url.includes('shopping.naver') && !url.includes('.js') && !url.includes('.css') && !url.includes('.png')) {
      const ct = resp.headers()['content-type'] || '';
      if (ct.includes('json')) {
        try {
          const body = await resp.text();
          if (body.length > 100 && body.length < 200000) {
            apiResponses.push({ url: url.substring(0, 100), status: resp.status(), body: body.substring(0, 300) });
          }
        } catch (_) {}
      }
    }
  });

  const page = await ctx.newPage();
  const keyword = '에어프라이어';
  await page.goto(`https://search.shopping.naver.com/search/all?query=${encodeURIComponent(keyword)}`, {
    waitUntil: 'networkidle', timeout: 25000
  }).catch(() => {});
  await sleep(3000);

  console.log('현재 URL:', page.url());

  // 캡처된 API 응답
  console.log('\n=== API 응답 ===');
  apiResponses.forEach(r => {
    console.log(`[${r.status}] ${r.url}`);
    console.log('  →', r.body.substring(0, 200));
    console.log();
  });

  // __NEXT_DATA__ 확인
  const html = await page.content();
  const nd = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  console.log('__NEXT_DATA__ 존재:', !!nd, '/ 길이:', nd ? nd[1].length : 0);
  if (nd) {
    const decoded = nd[1].replace(/\\u([\dA-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    const imgs = [...decoded.matchAll(/"imageUrl"\s*:\s*"(https?:\/\/[^"]{20,})"/g)].slice(0,3).map(m=>m[1]);
    console.log('이미지 샘플:', imgs);
  }

  // 이미지 태그 확인
  const imgs = await page.$$eval('img', els =>
    els.filter(e => e.src && e.src.includes('pstatic') && e.width > 50)
      .slice(0, 8)
      .map(e => ({ src: e.src.substring(0, 100), w: e.width, h: e.height, alt: e.alt?.substring(0, 30) }))
  ).catch(() => []);
  console.log('\n=== 이미지 태그 (pstatic, w>50) ===');
  imgs.forEach(i => console.log(JSON.stringify(i)));

  // 전체 DOM 구조 샘플
  const classNames = await page.$$eval('*', els =>
    [...new Set(els.map(e => e.className).filter(c => c && typeof c === 'string' && c.includes('product')).slice(0, 30))]
  ).catch(() => []);
  console.log('\n=== "product" 포함 클래스 ===');
  classNames.slice(0, 15).forEach(c => console.log(' ', c));

  await browser.close();
})();
