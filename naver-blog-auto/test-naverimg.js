'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const COOKIE_FILE = path.join(__dirname, 'session.json');
const IMG_DIR = path.join(__dirname, 'tmp_images');
const sleep = ms => new Promise(r => setTimeout(r, ms));
if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR, { recursive: true });

async function downloadDirectImage(url, savePath) {
  return new Promise(resolve => {
    const file = fs.createWriteStream(savePath);
    let started = false;
    const doGet = (u, depth = 0) => {
      if (depth > 5) { file.close(); fs.unlink(savePath, () => {}); resolve(false); return; }
      const mod = u.startsWith('https') ? https : http;
      mod.get(u, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36',
          'Referer': 'https://search.naver.com/',
          'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        }, timeout: 15000,
      }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume(); doGet(res.headers.location, depth + 1); return;
        }
        if (res.statusCode !== 200) { res.resume(); file.close(); fs.unlink(savePath, () => {}); resolve(false); return; }
        started = true; res.pipe(file);
        file.on('finish', () => { file.close(); resolve(true); });
        file.on('error', () => { fs.unlink(savePath, () => {}); resolve(false); });
      }).on('error', () => { if (!started) { file.close(); fs.unlink(savePath, () => {}); } resolve(false); })
        .on('timeout', () => { if (!started) { file.close(); fs.unlink(savePath, () => {}); } resolve(false); });
    };
    doGet(url);
  });
}

async function getNaverProductImages(keyword, count = 4) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: fs.existsSync(COOKIE_FILE) ? COOKIE_FILE : undefined,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  }).catch(() => browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  }));

  const page = await ctx.newPage();

  // 네이버 이미지 검색 (상품 탭)
  const searchUrl = `https://search.naver.com/search.naver?where=image&query=${encodeURIComponent(keyword + ' 제품')}&sm=tab_jum`;
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await sleep(2000);

  // 이미지 URL 추출
  const imageUrls = await page.$$eval(
    'img[src*="pstatic.net"], img[src*="naver.net"], [class*="img"] img, .image_result img',
    (els, n) => {
      const seen = new Set();
      const results = [];
      for (const el of els) {
        const src = el.src || el.getAttribute('data-src') || '';
        if (!src || !src.startsWith('http')) continue;
        if (src.includes('profile') || src.includes('favicon') || src.includes('logo')) continue;
        const w = el.naturalWidth || el.width || 100;
        const h = el.naturalHeight || el.height || 100;
        if (w < 80 || h < 80) continue;
        if (!seen.has(src)) { seen.add(src); results.push(src); }
        if (results.length >= n) break;
      }
      return results;
    }, count
  ).catch(() => []);

  await browser.close();
  return imageUrls;
}

(async () => {
  for (const kw of ['에어프라이어', '비데', '식기건조대']) {
    console.log(`\n===== ${kw} =====`);
    const urls = await getNaverProductImages(kw, 4);
    console.log('이미지 URL:', urls.length, '개');
    urls.forEach((u, i) => console.log(`  [${i}]`, u.substring(0, 100)));

    if (urls[0]) {
      const savePath = path.join(IMG_DIR, `test_${kw}_0.jpg`);
      const ok = await downloadDirectImage(urls[0], savePath);
      if (ok && fs.existsSync(savePath)) {
        console.log(`  → 다운로드 성공: ${Math.round(fs.statSync(savePath).size / 1024)}KB`);
        fs.unlinkSync(savePath);
      } else {
        console.log('  → 다운로드 실패');
      }
    }
    await sleep(1000);
  }
})();
