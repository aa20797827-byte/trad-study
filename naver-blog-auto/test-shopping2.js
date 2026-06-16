'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const COOKIE_FILE = path.join(__dirname, 'session.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function searchNaverShoppingProduct(keyword) {
  const searchUrl = `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(keyword)}&sort=rel`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({
      storageState: fs.existsSync(COOKIE_FILE) ? COOKIE_FILE : undefined,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 }, locale: 'ko-KR',
    }).catch(() => browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 }, locale: 'ko-KR',
    }));

    const page = await ctx.newPage();
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(2500);

    const products = await page.$$eval(
      '[class*="product_item"], [class*="basicList_item"], [class*="item_title"], [data-naver-type="productItem"]',
      (els) => {
        const results = [];
        for (const el of els.slice(0, 6)) {
          const nameEl  = el.querySelector('[class*="name"], [class*="title"], strong');
          const priceEl = el.querySelector('[class*="price_num"], [class*="price"], em');
          const imgEl   = el.querySelector('img[src*="pstatic"], img[src*="naver"], img[src*="https"]');
          const linkEl  = el.querySelector('a[href*="product"], a[href*="shopping"]');
          if (nameEl || imgEl) {
            results.push({
              name:  nameEl?.innerText?.replace(/\n/g, ' ').trim() || '',
              price: priceEl?.innerText?.replace(/[^0-9]/g, '') || '0',
              img:   imgEl?.src || imgEl?.getAttribute('data-src') || '',
              url:   linkEl?.href || '',
            });
          }
        }
        return results;
      }
    ).catch(() => []);

    console.log('DOM 상품:', products.map(p => `${p.name.substring(0,20)} / ${p.img.substring(0,60)}`).join('\n  '));

    const htmlContent = await page.content().catch(() => '');
    const nextMatch = htmlContent.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    const imageUrls = [];
    let productName = keyword, price = 0, buyUrl = searchUrl;

    if (nextMatch) {
      const decoded = nextMatch[1].replace(/\\u([\dA-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      const nameM = decoded.match(/"productName"\s*:\s*"([^"]{2,80})"/);
      const priceM = decoded.match(/"price"\s*:\s*(\d{3,8})/);
      const mallM = decoded.match(/"mallProductUrl"\s*:\s*"(https?:\/\/[^"]{10,})"/);
      const nvMidM = decoded.match(/"nvMid"\s*:\s*"(\d{10,})"/);
      const pid = nvMidM?.[1];

      if (nameM) productName = nameM[1];
      if (priceM) price = parseInt(priceM[1]);
      buyUrl = mallM?.[1] || (pid ? `https://shopping.naver.com/ns/home/product/${pid}` : searchUrl);

      const imgRe = /"imageUrl"\s*:\s*"(https?:\/\/[^"]{20,})"/g;
      let imgM;
      while ((imgM = imgRe.exec(decoded)) !== null && imageUrls.length < 5) {
        const u = imgM[1];
        if (!imageUrls.includes(u) && !u.includes('banner') && !u.includes('icon')) imageUrls.push(u);
      }
    }

    console.log(`\n결과: "${productName.substring(0,30)}" / ${price.toLocaleString()}원`);
    console.log('이미지:', imageUrls.length, '장');
    imageUrls.forEach((u, i) => console.log(`  [${i}] ${u.substring(0,80)}`));
    console.log('구매링크:', buyUrl.substring(0, 80));
    return { productName, price, imageUrls, buyUrl };

  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

(async () => {
  for (const kw of ['비데', '에어프라이어', '식기건조대']) {
    console.log(`\n===== ${kw} =====`);
    await searchNaverShoppingProduct(kw);
    await sleep(1500);
  }
})();
