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

async function downloadUrl(url, savePath) {
  return new Promise(resolve => {
    const file = fs.createWriteStream(savePath);
    let started = false;
    const doGet = (u, depth = 0) => {
      if (depth > 6) { file.close(); fs.unlink(savePath, () => {}); resolve(false); return; }
      const mod = u.startsWith('https') ? https : http;
      mod.get(u, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36',
          'Referer': 'https://search.naver.com/',
          'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        }, timeout: 15000,
      }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let loc = res.headers.location;
          if (loc.startsWith('/')) { try { const p = new URL(u); loc = `${p.protocol}//${p.host}${loc}`; } catch (_) {} }
          res.resume(); doGet(loc, depth+1); return;
        }
        if (res.statusCode !== 200) {
          res.resume(); file.close(); fs.unlink(savePath, () => {}); resolve(false); return;
        }
        started = true; res.pipe(file);
        file.on('finish', () => { file.close(); resolve(true); });
        file.on('error', () => { fs.unlink(savePath, () => {}); resolve(false); });
      }).on('error', () => { if (!started) { file.close(); fs.unlink(savePath, () => {}); } resolve(false); })
        .on('timeout', () => { if (!started) { file.close(); fs.unlink(savePath, () => {}); } resolve(false); });
    };
    doGet(url);
  });
}

// pstatic 프록시 URL에서 실제 원본 URL 추출
function decodeNaverProxyUrl(proxyUrl) {
  try {
    const u = new URL(proxyUrl);
    const src = u.searchParams.get('src');
    return src ? decodeURIComponent(src) : proxyUrl;
  } catch (_) { return proxyUrl; }
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

  // 네이버 이미지 검색 — 쇼핑 탭으로 직접 이동
  await page.goto(
    `https://search.naver.com/search.naver?where=image&query=${encodeURIComponent(keyword)}&sm=tab_jum&lje=2`,
    { waitUntil: 'domcontentloaded', timeout: 20000 }
  );
  await sleep(3000);

  // 실제 렌더된 이미지 src 수집
  const rawUrls = await page.evaluate(() => {
    const seen = new Set();
    const results = [];
    // 이미지 그리드의 썸네일들
    const selectors = [
      '.image_result img', '.thumb img', '.image img',
      '[class*="thumbnail"] img', '[class*="result"] img',
      'img[src*="search.pstatic"]', 'img[src*="blogfiles"]', 'img[src*="postfiles"]',
    ];
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        const src = el.src || el.getAttribute('data-src') || '';
        if (!src || src.length < 20) continue;
        if (src.includes('.gif') || src.includes('profile') || src.includes('myInfo')) continue;
        if (seen.has(src)) continue;
        seen.add(src);
        // 크기 필터
        if (el.naturalWidth > 0 && el.naturalWidth < 50) continue;
        results.push(src);
        if (results.length >= 10) return results;
      }
    }
    return results;
  });

  await browser.close();

  // pstatic 프록시 URL 디코딩 → 원본 URL 추출
  const decoded = rawUrls.map(u => {
    if (u.includes('pstatic.net/common/') || u.includes('pstatic.net/sunny/')) {
      return decodeNaverProxyUrl(u);
    }
    return u;
  }).filter(u => u.startsWith('http'));

  return decoded.slice(0, count);
}

(async () => {
  for (const kw of ['에어프라이어', '비데', '식기건조대']) {
    console.log(`\n===== ${kw} =====`);
    const urls = await getNaverProductImages(kw, 4);
    console.log('디코딩된 이미지 URL:', urls.length, '개');
    urls.forEach((u, i) => console.log(`  [${i}]`, u.substring(0, 100)));

    // 첫 번째 이미지 다운로드 테스트
    if (urls[0]) {
      const savePath = path.join(IMG_DIR, `test_${kw}_0.jpg`);
      const ok = await downloadUrl(urls[0], savePath);
      if (ok && fs.existsSync(savePath)) {
        const size = fs.statSync(savePath).size;
        console.log(`  → 다운로드 ${size > 1000 ? '성공' : '실패(너무 작음)'}: ${Math.round(size/1024)}KB`);
        fs.unlinkSync(savePath);
      } else {
        console.log('  → 다운로드 실패');
      }
    }
    await sleep(1000);
  }
})();
