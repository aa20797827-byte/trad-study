/**
 * 네이버 블로그 AI 작성봇 v3
 * - 자연스러운 사람 말투 (이모지 없음)
 * - 본문 2500자 이상
 * - 블로그용 사진 자동 삽입 (pollinations.ai 무료)
 *
 * 사용법:
 *   node blog-writer.js              키워드 자동 선택
 *   node blog-writer.js "키워드"     키워드 직접 지정
 *   node blog-writer.js --count 3    3개 연속 작성
 */

'use strict';
const https        = require('https');
const http         = require('http');
const fs           = require('fs');
const path         = require('path');
const os           = require('os');
const { chromium } = require('playwright');

// ── 설정 ────────────────────────────────────────────────────────────────
const config       = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const MY_BLOG      = config.naver.blogId;
const NAVER_ID     = config.naver.id;
const NAVER_PW     = config.naver.password;
const NICHES       = config.targetNiches;
const COOKIE_FILE  = path.join(__dirname, 'session.json');
const WRITTEN_FILE = path.join(__dirname, 'written.json');
const IMG_DIR      = path.join(__dirname, 'tmp_images');
const TODAY        = new Date().toLocaleDateString('ko-KR', {
  year: 'numeric', month: '2-digit', day: '2-digit',
}).replace(/\. /g, '-').replace('.', '');

if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR, { recursive: true });

const LAUNCH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-features=IsolateOrigins',
];

// ── 유틸 ────────────────────────────────────────────────────────────────
const sleep = ms    => new Promise(r => setTimeout(r, ms));
const rand  = (a, b) => Math.floor(Math.random() * (b - a) + a);
const log   = msg  => console.log(msg);

// ── 네이버 로그인 (자동 시도 → 실패 시 수동 대기) ───────────────────
async function doLogin(page) {
  log('  → 네이버 로그인 페이지 이동 중...');
  await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await sleep(rand(1500, 2500));

  // ── 자동 로그인 시도 (클립보드 붙여넣기 방식 — 키보드 차단 우회) ────
  let autoOk = false;
  try {
    // ID 필드: evaluate로 직접 값 설정 후 input 이벤트 발생
    const idFilled = await page.evaluate((id) => {
      const el = document.querySelector('#id') || document.querySelector('input[name="id"]');
      if (!el) return false;
      el.focus();
      el.value = id;
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, NAVER_ID).catch(() => false);

    const pwFilled = await page.evaluate((pw) => {
      const el = document.querySelector('#pw') || document.querySelector('input[name="pw"]') || document.querySelector('input[type="password"]');
      if (!el) return false;
      el.focus();
      el.value = pw;
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, NAVER_PW).catch(() => false);

    if (idFilled && pwFilled) {
      await sleep(rand(800, 1400));
      // 로그인 버튼 클릭
      const loginBtn = await page.$('.btn_login, #log\\.login, button[type="submit"]').catch(() => null);
      if (loginBtn) {
        await loginBtn.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      await sleep(rand(2000, 3500));

      const loginKeys = ['nidlogin', 'nid.naver.com/nidlogin'];
      autoOk = !loginKeys.some(k => page.url().includes(k)) && page.url().includes('naver.com');
      if (autoOk) log('  ✅ 자동 로그인 성공!');
      else        log('  ℹ 자동 로그인 안 됨 (Naver 보안 감지) — 수동 로그인 대기...');
    }
  } catch (e) {
    log(`  ℹ 자동 로그인 오류 (${e.message}) — 수동 로그인 대기...`);
  }

  // ── 자동 실패 시: 수동 로그인 대기 (최대 5분) ─────────────────────
  if (!autoOk) {
    // 로그인 페이지로 다시 이동 (이미 거기 있을 수 있지만 명시)
    const nowUrl = page.url();
    if (!nowUrl.includes('nidlogin') && !nowUrl.includes('nid.naver.com')) {
      await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
      await sleep(1000);
    }
    log('\n' + '='.repeat(50));
    log('📋 브라우저에서 네이버 로그인을 직접 해주세요.');
    log('   로그인 완료 후 자동으로 이어서 글 작성합니다.');
    log('   (최대 5분 대기)');
    log('='.repeat(50));

    // 5분(30회×10초) 동안 로그인 완료 감지
    for (let i = 1; i <= 30; i++) {
      await sleep(10000);
      try {
        const url = page.url();
        const cookies = await page.context().cookies('https://naver.com');
        const loggedIn = cookies.some(c => c.name === 'NID_AUT' && c.value && c.value.length > 5);
        if (loggedIn || (!url.includes('nidlogin') && url.includes('naver.com') && !url.includes('nid.naver'))) {
          autoOk = true;
          log('\n  ✅ 로그인 확인! 이어서 글 작성 시작합니다...\n');
          break;
        }
      } catch (_) {}
      if (i % 3 === 0) log(`  ⏳ 로그인 대기 중... (${i * 10}초 경과)`);
    }
  }

  // ── 2단계 인증 대기 ──────────────────────────────────────────────
  const authKeys = ['2step', 'tfa', 'authcode', 'safeguard'];
  if (autoOk && authKeys.some(k => page.url().includes(k))) {
    log('\n⛔ 2단계 인증 필요! 브라우저에서 처리해주세요. (최대 3분 대기)');
    for (let i = 1; i <= 18; i++) {
      await sleep(10000);
      if (!authKeys.some(k => page.url().includes(k))) {
        log('  ✅ 인증 완료!');
        break;
      }
    }
  }

  // ── 세션 저장 ────────────────────────────────────────────────────
  if (autoOk) {
    try {
      await page.context().storageState({ path: COOKIE_FILE });
      log('  💾 세션 저장 완료');
    } catch (_) {}
  } else {
    log('  ⚠ 로그인 대기 시간 초과');
  }
  return autoOk;
}

// ── 이력 관리 ─────────────────────────────────────────────────────────
function loadHistory() {
  if (!fs.existsSync(WRITTEN_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(WRITTEN_FILE, 'utf8')); } catch (_) { return []; }
}
function saveHistory(kw, title) {
  const h = loadHistory();
  h.unshift({ date: TODAY, keyword: kw, title });
  fs.writeFileSync(WRITTEN_FILE, JSON.stringify(h.slice(0, 300), null, 2), 'utf8');
}

// ── 키워드 선택 ───────────────────────────────────────────────────────
function pickKeyword(trendKws, excludes = []) {
  const recent = new Set([
    ...loadHistory()
      .filter(h => {
        try {
          const [y, m, d] = h.date.split('-').map(Number);
          return (Date.now() - new Date(y, m - 1, d).getTime()) / 86400000 <= 7;
        } catch (_) { return false; }
      })
      .map(h => h.keyword),
    ...excludes,
  ]);
  const all   = [...trendKws, ...NICHES];
  const fresh = all.filter(k => !recent.has(k));
  return fresh[0] || all[rand(0, all.length)] || NICHES[0];
}

// ── 트렌드 키워드 (네이버 자동완성 기반 폴백) ──────────────────────────
async function getTrendKeywords() {
  const kws = [];
  log('트렌드 키워드 수집 중...');
  for (const niche of NICHES.slice(0, 4)) {
    try {
      const raw = await new Promise((resolve, reject) => {
        const req = https.get(
          `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(niche)}&r_format=json&r_enc=UTF-8&st=100`,
          { timeout: 8000, headers: { 'user-agent': 'Mozilla/5.0' } },
          res => {
            const c = [];
            res.on('data', d => c.push(d));
            res.on('end', () => resolve(Buffer.concat(c).toString('utf8')));
          }
        );
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      });
      const items = (JSON.parse(raw).items?.[0] || []).map(i => i[0]).filter(Boolean).slice(0, 4);
      if (items.length) { log(`  "${niche}" 연관어: ${items.join(', ')}`); kws.push(...items); }
    } catch (_) {}
    await sleep(rand(300, 600));
  }
  return [...new Set(kws)];
}

// ── 네이버 데이터랩 쇼핑인사이트 키워드 ────────────────────────────────
// 디지털/가전(CID 50000003), 가구/인테리어(50000004), 생활/건강(50000008)
// 분야별 인기 검색어 OR 인기분야 중 랜덤 선택
async function getDataLabKeywords() {
  const CATS = [
    { name: '디지털/가전',   cid: '50000003' },
    { name: '가구/인테리어', cid: '50000004' },
    { name: '생활/건강',     cid: '50000008' },
  ];
  const TYPES = ['분야별 인기 검색어', '인기분야'];

  const cat     = CATS[rand(0, CATS.length)];
  const useType = TYPES[rand(0, TYPES.length)];
  log(`  DataLab: [${cat.name}] / ${useType}`);

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({
      storageState: fs.existsSync(COOKIE_FILE) ? COOKIE_FILE : undefined,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    }).catch(() => browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    }));

    const page = await ctx.newPage();

    // 직접 CID URL로 이동 (클릭 불필요, 서버에서 카테고리 필터 적용)
    await page.goto(
      `https://datalab.naver.com/shoppingInsight/sCategory.naver?cid=${cat.cid}`,
      { waitUntil: 'domcontentloaded', timeout: 20000 }
    );
    await sleep(3000);  // AJAX 렌더링 대기

    // 인기분야 탭 전환 시도 (실패 시 분야별 인기 검색어 사용)
    if (useType === '인기분야') {
      const switched = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('a, button, li, span'));
        for (const el of els) {
          const txt = el.innerText?.trim();
          if (txt === '인기분야' || (txt?.includes('인기분야') && !txt?.includes('분야별'))) {
            el.click();
            return true;
          }
        }
        return false;
      });
      if (switched) {
        log(`  인기분야 탭 전환 완료`);
        await sleep(2000);
      } else {
        log(`  인기분야 탭 미발견 → 분야별 인기 검색어 사용`);
      }
    }

    // 랭킹 키워드 추출: "[class*="rank"] li" → "1 텀블러" 형태에서 숫자 제거
    const rawItems = await page.$$eval('[class*="rank"] li', els =>
      els.map(e => {
        const text = e.innerText?.replace(/\s+/g, ' ').trim();
        const m = text?.match(/^\d+\s+(.+)$/);
        return m ? m[1].trim() : null;
      }).filter(Boolean).slice(0, 10)
    ).catch(() => []);

    if (!rawItems.length) {
      log(`  DataLab: 키워드 추출 실패`);
      return null;
    }

    log(`  DataLab ${cat.name} Top${rawItems.length}: ${rawItems.join(', ')}`);
    const chosen = rawItems[rand(0, rawItems.length)];
    log(`  선택 키워드: "${chosen}"`);
    return chosen;

  } catch (e) {
    log(`  DataLab 실패: ${e.message}`);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ── 이미지 다운로드 (pollinations.ai 무료 이미지 생성) ──────────────────
async function downloadImage(prompt, savePath) {
  const encodedPrompt = encodeURIComponent(prompt);
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=800&height=600&model=flux&nologo=true&seed=${rand(1, 99999)}`;

  return new Promise((resolve) => {
    const file = fs.createWriteStream(savePath);
    const get  = url.startsWith('https') ? https : http;

    const doGet = (targetUrl, depth = 0) => {
      if (depth > 5) { file.close(); fs.unlink(savePath, () => {}); resolve(false); return; }
      get.get(targetUrl, { timeout: 40000 }, res => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          doGet(res.headers.location, depth + 1);
          return;
        }
        if (res.statusCode !== 200) { file.close(); fs.unlink(savePath, () => {}); resolve(false); return; }
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(true); });
        file.on('error', () => { fs.unlink(savePath, () => {}); resolve(false); });
      }).on('error', () => { fs.unlink(savePath, () => {}); resolve(false); })
        .on('timeout', () => { fs.unlink(savePath, () => {}); resolve(false); });
    };

    doGet(url);
  });
}

// 키워드 → LoremFlickr 영어 카테고리 변환
function toLoremCategory(keyword, idx) {
  // 키워드 카테고리 분류
  const isKitchen  = /에어프라이어|블렌더|믹서|프라이팬|도마|조리|주방|냄비|전자레인지|식기/.test(keyword);
  const isCleaning = /청소기|청소|제습기|공기청정|세탁|건조/.test(keyword);
  const isStorage  = /수납|정리|바구니|선반|수납함|보관/.test(keyword);
  const isBedroom  = /이불|베개|침대|협탁|매트/.test(keyword);
  const isDecor    = /조명|무드등|캔들|디퓨저|인테리어|홈데코|러그|커튼|화분/.test(keyword);
  const isChair    = /소파|의자|테이블|가구/.test(keyword);

  const sets = {
    kitchen:  ['kitchen,cooking,modern', 'kitchen,appliance,home', 'cooking,food,interior', 'kitchen,clean,white'],
    cleaning: ['cleaning,home,modern', 'vacuum,clean,interior', 'home,fresh,clean', 'hygiene,home,clean'],
    storage:  ['storage,home,organized', 'organization,interior,clean', 'shelf,home,modern', 'basket,room,cozy'],
    bedroom:  ['bedroom,cozy,interior', 'bed,sleep,modern', 'pillow,bedroom,soft', 'bedroom,home,minimal'],
    decor:    ['interior,decoration,home', 'living,cozy,aesthetic', 'candle,home,ambiance', 'lamp,room,cozy'],
    chair:    ['sofa,living,interior', 'furniture,modern,home', 'living room,cozy', 'chair,interior,minimal'],
    default:  ['home,living,interior', 'korean,home,lifestyle', 'room,modern,clean', 'house,cozy,interior'],
  };
  const cat = isKitchen ? sets.kitchen : isCleaning ? sets.cleaning : isStorage ? sets.storage
            : isBedroom ? sets.bedroom : isDecor    ? sets.decor    : isChair   ? sets.chair
            : sets.default;
  return cat[idx % cat.length];
}

// LoremFlickr에서 이미지 다운로드 (무료, 키 불필요)
async function downloadLoremFlickr(keyword, idx, savePath) {
  const category = toLoremCategory(keyword, idx);
  const startUrl = `https://loremflickr.com/800/600/${encodeURIComponent(category)}/all?lock=${rand(1, 999999)}`;

  return new Promise(resolve => {
    const file = fs.createWriteStream(savePath);
    let fileStarted = false;

    const doGet = (targetUrl, depth = 0) => {
      if (depth > 6) { if (!fileStarted) { file.close(); fs.unlink(savePath, () => {}); } resolve(false); return; }
      const mod = targetUrl.startsWith('https') ? https : http;
      mod.get(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let loc = res.headers.location;
          // 상대 URL → 절대 URL 변환
          if (loc.startsWith('/')) {
            const parsed = new URL(targetUrl);
            loc = `${parsed.protocol}//${parsed.host}${loc}`;
          }
          res.resume(); // 본문 버림
          doGet(loc, depth + 1);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          file.close();
          fs.unlink(savePath, () => {});
          resolve(false);
          return;
        }
        fileStarted = true;
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(true); });
        file.on('error',  () => { fs.unlink(savePath, () => {}); resolve(false); });
      }).on('error',   () => { if (!fileStarted) { file.close(); fs.unlink(savePath, () => {}); } resolve(false); })
        .on('timeout', () => { if (!fileStarted) { file.close(); fs.unlink(savePath, () => {}); } resolve(false); });
    };
    doGet(startUrl);
  });
}

// pstatic 이미지 프록시 URL → 원본 URL 디코딩
function decodeNaverProxyUrl(proxyUrl) {
  try {
    const u = new URL(proxyUrl);
    const src = u.searchParams.get('src');
    return src ? decodeURIComponent(src) : proxyUrl;
  } catch (_) { return proxyUrl; }
}

// 네이버 이미지 검색으로 상품 이미지 수집 (Playwright 기반, 418 봇차단 우회)
// count보다 더 많은 URL을 가져와 크기 필터링 시 여유분 확보
async function searchNaverProductImages(keyword, count = 12) {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({
      storageState: fs.existsSync(COOKIE_FILE) ? COOKIE_FILE : undefined,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
    }).catch(() => browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
    }));
    const page = await ctx.newPage();

    // 네이버 이미지 검색 (상품 키워드로)
    await page.goto(
      `https://search.naver.com/search.naver?where=image&query=${encodeURIComponent(keyword)}&sm=tab_jum`,
      { waitUntil: 'domcontentloaded', timeout: 20000 }
    );
    await sleep(2500);

    // 이미지 그리드에서 src 수집
    const rawUrls = await page.evaluate(() => {
      const seen = new Set();
      const results = [];
      const sels = [
        '.image_result img', '.thumb img', '[class*="thumbnail"] img',
        '[class*="result"] img', 'img[src*="search.pstatic"]',
        'img[src*="blogfiles"]', 'img[src*="postfiles"]', 'img[src*="shop"]',
      ];
      for (const sel of sels) {
        for (const el of document.querySelectorAll(sel)) {
          const src = el.src || el.getAttribute('data-src') || '';
          if (!src || src.length < 20) continue;
          if (src.includes('.gif') || src.includes('profile') ||
              src.includes('myInfo') || src.includes('favicon')) continue;
          if (seen.has(src)) continue;
          if (el.naturalWidth > 0 && el.naturalWidth < 50) continue;
          seen.add(src);
          results.push(src);
          if (results.length >= 12) return results;
        }
      }
      return results;
    });

    // 프록시 URL 디코딩 → 원본 URL 추출
    const imageUrls = rawUrls
      .map(u => (u.includes('pstatic.net/common/') || u.includes('pstatic.net/sunny/'))
        ? decodeNaverProxyUrl(u) : u)
      .filter(u => u.startsWith('http') && !u.includes('.gif'))
      .slice(0, count);

    return imageUrls;
  } catch (e) {
    log(`  이미지 검색 실패: ${e.message}`);
    return [];
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// 상품 정보 조회 (구매링크 + 이미지)
async function searchNaverShoppingProduct(keyword) {
  const searchUrl = `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(keyword)}&sort=rel`;

  // 이미지 검색으로 상품 이미지 수집 (여유분 포함 12개)
  const imageUrls = await searchNaverProductImages(keyword, 12);

  if (imageUrls.length > 0) {
    log(`  이미지 ${imageUrls.length}장 확보 (네이버 이미지 검색)`);
  }

  return {
    name:      keyword,
    price:     0,
    imageUrl:  imageUrls[0] || null,
    imageUrls,
    buyUrl:    searchUrl,
    searchUrl,
  };
}

// 직접 URL에서 이미지 다운로드 (네이버 쇼핑 상품 이미지 등)
async function downloadDirectImage(url, savePath) {
  return new Promise(resolve => {
    const file = fs.createWriteStream(savePath);
    let fileStarted = false;

    const doGet = (targetUrl, depth = 0) => {
      if (depth > 6) { if (!fileStarted) { file.close(); fs.unlink(savePath, () => {}); } resolve(false); return; }
      const mod = targetUrl.startsWith('https') ? https : http;
      mod.get(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
          'Referer': 'https://shopping.naver.com/',
          'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
        timeout: 20000,
      }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let loc = res.headers.location;
          if (loc.startsWith('/')) {
            try { const p = new URL(targetUrl); loc = `${p.protocol}//${p.host}${loc}`; } catch (_) {}
          }
          res.resume();
          doGet(loc, depth + 1);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          file.close();
          fs.unlink(savePath, () => {});
          resolve(false);
          return;
        }
        fileStarted = true;
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(true); });
        file.on('error',  () => { fs.unlink(savePath, () => {}); resolve(false); });
      }).on('error',   () => { if (!fileStarted) { file.close(); fs.unlink(savePath, () => {}); } resolve(false); })
        .on('timeout', () => { if (!fileStarted) { file.close(); fs.unlink(savePath, () => {}); } resolve(false); });
    };
    doGet(url);
  });
}

// productInfo = { name, price, imageUrl, imageUrls, buyUrl, searchUrl }
async function prepareImages(keyword, productInfo) {
  const paths = [];
  log('  사진 준비 중 (4장)...');

  // LoremFlickr 폴백 헬퍼 (상품 이미지 없을 때만 사용)
  const getLifestyleImg = async (savePath, label, idx) => {
    const ok = await downloadLoremFlickr(keyword, idx, savePath);
    if (ok && fs.existsSync(savePath) && fs.statSync(savePath).size > 5000) {
      log(`  ${label} 완료 (${Math.round(fs.statSync(savePath).size / 1024)}KB)`);
      return true;
    }
    log(`  ${label} 실패`);
    return false;
  };

  // ── 네이버 쇼핑 상품 이미지 최대 4장 다운로드 ──────────────────────
  // imageUrls 배열에서 순서대로 사용 (없으면 LoremFlickr 폴백)
  const productImgUrls = productInfo?.imageUrls?.length ? productInfo.imageUrls
                       : productInfo?.imageUrl          ? [productInfo.imageUrl]
                       : [];

  for (let i = 0; i < 4; i++) {
    const savePath = path.join(IMG_DIR, `img_${Date.now()}_${i}.jpg`);
    const srcUrl   = productImgUrls[i] || null;

    if (srcUrl) {
      const ok = await downloadDirectImage(srcUrl, savePath);
      if (ok && fs.existsSync(savePath)) {
        const sz = fs.statSync(savePath).size;
        if (sz > 5000 && sz < 3 * 1024 * 1024) {  // 5KB ~ 3MB
          paths.push(savePath);
          log(`  사진 ${i + 1} (상품) 완료 (${Math.round(sz / 1024)}KB)`);
          await sleep(300);
          continue;
        } else {
          // 너무 작거나 너무 큰 이미지 → 삭제 후 다음 URL 시도
          fs.unlinkSync(savePath);
          // 다음 URL 시도 (i+4 인덱스까지)
          let nextOk = false;
          for (let ni = i + 4; ni < productImgUrls.length && ni < i + 8; ni++) {
            const nextUrl = productImgUrls[ni];
            if (!nextUrl) break;
            const ok2 = await downloadDirectImage(nextUrl, savePath);
            if (ok2 && fs.existsSync(savePath)) {
              const sz2 = fs.statSync(savePath).size;
              if (sz2 > 5000 && sz2 < 3 * 1024 * 1024) {
                paths.push(savePath);
                log(`  사진 ${i + 1} (상품) 완료 (${Math.round(sz2 / 1024)}KB)`);
                nextOk = true;
                break;
              }
              fs.unlinkSync(savePath);
            }
          }
          if (nextOk) { await sleep(300); continue; }
        }
      }
    }
    // 폴백: LoremFlickr
    await getLifestyleImg(savePath, `사진 ${i + 1} (폴백)`, i) && paths.push(savePath);
    await sleep(400);
  }
  return paths;
}

// ── 파워블로거 스타일 글 생성 v2 (참고 블로그 4개 학습 반영) ───────────
// 짧은 줄 바꿈 / 소제목 구조 / 단점 먼저 / 구매 체크리스트 / 쿠팡 고지
// shopInfo = { name, price, imageUrl, buyUrl, searchUrl }
function generateTemplate(keyword, shopInfo) {
  const year   = new Date().getFullYear();
  const month  = new Date().getMonth() + 1;
  const season = month >= 3 && month <= 5 ? '봄'
               : month >= 6 && month <= 8 ? '여름'
               : month >= 9 && month <= 11 ? '가을' : '겨울';
  const r = arr => arr[rand(0, arr.length)];

  // 실제 상품명 / 가격
  const realName  = shopInfo?.name && shopInfo.name !== keyword ? shopInfo.name : null;
  const prodName  = realName || keyword;
  const priceNum  = shopInfo?.price || 0;
  const priceText = priceNum > 0 ? `${priceNum.toLocaleString()}원대` : '합리적인 가격대의';
  const buyUrl    = shopInfo?.buyUrl || '';

  // 쿠팡 파트너스 고지 (buyUrl에 coupang 포함 시)
  const coupangNotice = buyUrl.includes('coupang')
    ? `이 글은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.\n\n`
    : '';

  // ── 키워드에서 소제목용 짧은 명칭 추출
  const baseKw = keyword.replace(/\s*(추천|후기|리뷰|순위|비교|구매)\s*$/g, '').trim() || keyword;

  // ── 소제목 포인트 (파워블로거는 소제목 자체가 핵심 메시지)
  const subTitles = [
    [`${baseKw}, 사기 전에 정말 많이 고민했어요`,
     `가성비로 골랐는데 생각보다 괜찮았던 이유`,
     `실제로 써보니 이런 점이 좋았어요`,
     `솔직히 말하면 이건 아쉬웠어요`,
     `이런 분께는 추천, 이런 분께는 비추`],
    [`${baseKw} 구매 결정까지 고민했던 것들`,
     `처음 받아보고 느낀 첫인상`,
     `한 달 써보니 이게 달랐어요`,
     `단점도 숨기지 않고 솔직하게`,
     `${year}년 ${season} 기준 총정리`],
    [`왜 ${baseKw}를 샀는지부터 말씀드릴게요`,
     `개봉 후 첫인상 — 사진이랑 얼마나 다를까요`,
     `매일 쓰면서 느낀 진짜 장점 3가지`,
     `좋은 점만 말하면 광고 같으니까요`,
     `구매를 고민하는 분들을 위한 체크리스트`],
  ];
  const st = r(subTitles);

  // ── 1. 도입부 (공감형 질문으로 시작 — blog1, blog4 패턴)
  const intro = r([
    `${baseKw} 고민하다가\n지쳐본 적 있으신가요.\n\n저도 그랬어요.\n\n검색하면 제품이 너무 많이 뜨고,\n후기마다 의견이 달라서\n결국 그냥 질러버렸거든요.\n\n그리고 한 달 넘게 써봤습니다.\n\n광고 아니에요.\n진짜 쓰고 느낀 그대로\n적어볼게요.`,

    `${baseKw} 사기 전에\n얼마나 찾아보셨나요.\n\n저는 일주일 넘게 찾아봤어요.\n\n블로그, 유튜브, 커뮤니티까지.\n그런데도 확신이 안 서서\n결국 후기 수 제일 많은 걸로\n골랐거든요.\n\n결론부터 말씀드리면\n잘 산 것 같아요.\n\n${year}년 ${season}에 구매해서\n지금도 잘 쓰고 있는 제품\n솔직하게 정리해볼게요.`,

    `집에 ${baseKw} 들이고 싶은데\n어떤 걸 사야 할지 막막하셨나요.\n\n저도 딱 그 상황이었어요.\n\n종류는 많은데 가격대도 천차만별이고,\n뭐가 다른 건지 잘 모르겠더라고요.\n\n그래서 직접 사서 써봤습니다.\n\n장점이랑 단점,\n어떤 분께 맞고 어떤 분께 안 맞는지\n솔직하게 정리해드릴게요.`,
  ]);

  // ── 2. 목차 (blog1 패턴)
  const toc = `목차\n\n${st[0]}\n${st[1]}\n${st[2]}\n${st[3]}\n${st[4]}`;

  // ── 3. 구매 결정 (blog2 패턴: 단점 먼저 + 그럼에도)
  // ※ "첫째/둘째/셋째" 패턴은 SE ONE 에디터 자동서식 충돌 → 번호+점 방식으로 교체
  const buySection = r([
    `${st[0]}\n\n솔직히 말하면\n처음엔 망설였어요.\n\n${baseKw} 관련 제품이 너무 많아서\n어디서부터 봐야 할지\n감이 안 잡혔거든요.\n\n예산도 고민됐고요.\n비슷한 제품인데 가격이 두세 배씩\n차이 나는 경우도 있더라고요.\n\n그래서 일단 기준을 정했어요.\n\n리뷰 수가 많을 것.\n별점 4.5 이상일 것.\n나쁜 후기 비율이 낮을 것.\n\n이 기준으로 좁히다 보니까\n결국 ${prodName}로 결정이 났어요.\n\n${priceText} 제품이라\n큰 부담 없이 시도해볼 수 있는\n가격대였던 것도 컸고요.`,

    `${st[0]}\n\n이사 끝나고\n짐을 풀다 보면\n항상 같은 문제가 생기잖아요.\n\n넣을 데가 없는 거예요.\n\n${baseKw}가 딱 그 역할을 해줄 것 같았어요.\n\n쿠팡이랑 네이버 쇼핑\n둘 다 비교해봤는데,\n가격 차이가 좀 있더라고요.\n\n결국 ${prodName}로 골랐어요.\n${priceText} 선에서\n리뷰 수 제일 많은 제품이었거든요.\n\n후기를 한참 읽었는데\n구체적인 사용 사례가 많아서\n신뢰가 갔어요.\n\n${year}년 ${season}, 바로 주문했습니다.`,
  ]);

  // ── 4. 개봉 & 첫인상 (짧은 줄 — blog3 패턴)
  const unboxing = r([
    `${st[1]}\n\n배송은 생각보다 빨랐어요.\n\n박스 상태도 멀쩡했고,\n포장도 꼼꼼하게 돼 있었어요.\n\n실물을 처음 봤을 때\n'오, 생각보다 좋은데' 싶었어요.\n\n온라인으로 사면\n사진이랑 실물이 다를 때가 많은데,\n${baseKw}는 오히려 더 나았어요.\n\n색감도 그렇고,\n소재 질감도 직접 만져보니\n이 가격에 이 정도면 충분하다 싶었어요.\n\n크기도 딱 맞았어요.\n미리 치수 확인하고 산 게 도움이 됐죠.`,

    `${st[1]}\n\n뜯을 때 설레는 그 느낌,\n다들 아시잖아요.\n\n박스를 열었을 때\n첫인상이 꽤 좋았어요.\n\n묵직하고 탄탄한 느낌.\n플라스틱이 많이 쓰인 제품들이랑\n확실히 달랐어요.\n\n색상도\n주문한 색이랑 거의 동일했고,\n마감 처리도 깔끔했어요.\n\n잔흠집이나 불량은 없었고,\n전체적으로 만족스러운 첫인상이었어요.\n\n이때까지만 해도\n'잘 샀다'는 느낌이 강했어요.`,
  ]);

  // ── 5. 장점 3가지 (blog1 패턴: 항목형 소제목)
  // ※ "첫 번째/두 번째/세 번째" → 소제목 분리로 교체
  const goodParts = r([
    `${st[2]}\n\n한 달 넘게 쓰다 보니까\n좋은 점들이 보이더라고요.\n\n쓰기 편해요\n\n처음 쓸 때 어렵거나 헷갈리는 게\n거의 없었어요.\n설명서 안 읽고 직관적으로 써봤는데\n문제없이 됐거든요.\n\n가성비가 좋아요\n\n이 가격에 이 정도 퀄리티면\n솔직히 잘 만든 편이에요.\n비슷한 가격대 제품들이랑 비교해봐도\n크게 밀리지 않아요.\n\n디자인이 무난해요\n\n군더더기 없이 심플해서\n어디에 둬도 자연스럽게 어울려요.\n인테리어 신경 쓰시는 분들한테도\n딱 맞을 것 같아요.`,

    `${st[2]}\n\n실제로 쓰다 보니\n기대 이상인 부분들이 있었어요.\n\n실용성이 뛰어나요\n\n사기 전에는 '굳이 필요한가' 싶었는데,\n막상 있으니까\n없었을 때랑 차이가 꽤 나더라고요.\n\n내구성이 괜찮아요\n\n매일 쓰는 물건이라 걱정이었는데,\n한 달이 지난 지금도\n처음이랑 크게 달라진 게 없어요.\n\n관리하기 편해요\n\n특별히 어려운 방법 없이\n쓰고 나서 간단히 닦아주면 충분해요.\n이게 매일 쓰게 만드는 이유인 것 같아요.`,
  ]);

  // ── 6. 단점 (blog2 패턴: 단점 먼저 + "그럼에도")
  const badParts = r([
    `${st[3]}\n\n좋은 것만 말하면 광고 같으니까\n아쉬운 점도 솔직하게 말씀드릴게요.\n\n색상 옵션이 좀 적어요.\n제가 원했던 색상이 없어서\n차선책으로 골랐거든요.\n\n설명서가 좀 불친절해요.\n처음에 몇 가지 기능을\n어떻게 쓰는 건지 헤맸어요.\n\n처음에 새 제품 특유의 냄새가 좀 났어요.\n며칠 지나니까 사라졌는데,\n처음엔 좀 신경 쓰이더라고요.\n\n그럼에도 이 가격대에서\n이만한 제품 찾기가\n쉽지 않다는 건 인정해요.\n\n단점을 알고 사면\n실망할 일이 없으니까요.`,

    `${st[3]}\n\n솔직히 말씀드릴게요.\n\n가장 아쉬운 건\n장기 내구성이 얼마나 될지\n아직 모른다는 거예요.\n\n아직 몇 달 안 됐으니까\n판단하기 이른 건 맞는데,\n장기 후기를 보면\n아쉬운 게 생기는 경우도 있더라고요.\n\n가격이 조금만 더 저렴했으면\n더 많은 분들께 추천할 수 있을 텐데\n그 부분은 아쉬워요.\n\n다만 가격 대비 퀄리티는\n충분히 납득되는 수준이에요.\n\n약점을 알고 사면\n훨씬 현명한 구매가 됩니다.`,
  ]);

  // ── 7. 구매 체크리스트 (blog2 패턴: ✅ 형식)
  const checklist = r([
    `구매 전 꼭 확인하세요\n\n${baseKw}를 고르기 전에\n이것만 체크하면 실패 확률이 줄어요.\n\n사이즈를 먼저 재세요.\n특히 설치 공간 깊이를 놓치는 경우가 많아요.\n문 앞에 걸리면 낭패거든요.\n\n조립형인지 무설치인지 확인하세요.\n같은 제품처럼 보여도\n일부 조립이 필요한 경우가 있어요.\n\n리뷰를 읽을 때\n좋은 후기보다 나쁜 후기를 먼저 보세요.\n어떤 이유로 별점을 낮게 줬는지가\n더 중요한 정보예요.\n\n가격 비교는 꼭 하세요.\n같은 제품도 쿠팡이랑 네이버 쇼핑\n가격이 다를 수 있어요.\n할인 행사 타이밍도 노려볼 만해요.\n\n반품 조건도 미리 확인하세요.\n부피가 큰 제품은\n반품 시 추가 비용이 생길 수 있어요.`,

    `이런 분께 추천드려요\n\n${baseKw}를 처음 써보시는 분.\n가성비 위주로 고르시는 분.\n디자인이 심플한 걸 좋아하는 분.\n\n이 세 가지에 해당된다면\n충분히 만족하실 것 같아요.\n\n반면 이런 분께는 맞지 않을 수 있어요.\n\n이미 프리미엄 제품 쓰고 계신 분.\n특정 기능이 반드시 필요한 분.\n\n집에서 일상적으로 쓸 목적이라면\n충분히 좋은 선택이에요.\n저도 그 용도로 사서\n지금 잘 쓰고 있거든요.\n\n상황별 정리:\n\n당장 필요하고 예산이 적다\n→ 가성비 모델 먼저 보기\n\n오래 쓸 거고 품질이 중요하다\n→ 조금 더 투자하는 게 나아요\n\n인테리어도 신경 쓰인다\n→ 색상과 디자인 함께 확인하세요`,
  ]);

  // ── 8. 총평 + 스펙 정리 (blog1 패턴: 표 형식 + 별점)
  const rating = r([
    `${st[4]}\n\n한 줄 총평:\n가성비 합격, 디자인 합격,\n내구성은 아직 지켜보는 중.\n\n별점: 5점 만점에 4점.\n\n아쉬운 점이 없는 건 아니지만,\n가격 대비 만족도는 충분히 높아요.\n\n제품 정보 정리\n\n제품명: ${prodName}\n가격: ${priceText}\n구매처: 네이버 쇼핑, 쿠팡\n특징: 가성비, 심플 디자인, 실용성\n추천 대상: 처음 구매하는 분, 가격 중시\n\n${year}년 ${season} 기준으로\n이 가격대에서 이 정도 퀄리티면\n충분히 합격이에요.`,

    `${st[4]}\n\n총평을 내리자면:\n재구매 의향 있음, 주변 추천 의향 있음.\n\n사실 처음에 기대한 것보다\n만족스러운 부분이 더 많았어요.\n\n특별히 화려한 기능은 없는데,\n필요한 걸 충실히 해주는 제품이에요.\n그게 오히려 오래 쓰게 만드는 이유인 것 같고요.\n\n별점은 4점에서 4.5점 사이.\n\n제품 요약\n\n· 제품: ${prodName}\n· 가격: ${priceText}\n· 장점: 편의성, 가성비, 디자인\n· 단점: 색상 옵션, 설명서\n· 총평: 입문용으로 충분히 좋음\n\n가격 부담 없이 한번 써보고 싶은 분들께\n추천드려요.`,
  ]);

  // ── 9. 마무리 (질문형 — blog1 패턴)
  const ending = r([
    `지금까지\n${baseKw} 사용 후기를 정리해봤어요.\n\n쓰다 보니 생각보다 길어졌는데,\n그만큼 할 말이 많았다는 거겠죠.\n\n구매를 고민 중이신 분들께\n조금이나마 도움이 됐으면 해요.\n\n혹시 여러분 집에도\n${baseKw}가 필요한 공간이 있으신가요?\n이번 기회에 하나 들여보시는 건 어떨까요.\n\n궁금한 점은 댓글에 남겨주세요.\n아는 범위에서 최대한 답변할게요.\n\n긴 글 읽어주셔서 감사합니다.`,

    `이렇게 ${baseKw} 후기를 마무리할게요.\n\n저처럼 오래 고민하신 분들께\n이 글이 기준이 됐으면 해요.\n\n결국 좋은 ${baseKw}는\n예쁜 사진보다\n실제로 매일 손이 가는 제품이더라고요.\n\n이 글이 그 기준을 잡는 데\n조금이나마 도움이 됐으면 합니다.\n\n다음에도 좋은 제품 쓰게 되면\n또 후기 남기러 올게요.\n감사합니다.`,
  ]);

  // ── 구매 링크 섹션
  const purchaseSection = buyUrl
    ? `\n\n구매 링크\n\n${baseKw} 구매를 고민 중이신 분들은\n아래 링크에서 현재 가격과\n할인 혜택을 확인해보실 수 있어요.\n\n[[BUY_LINK:네이버 쇼핑에서 직접 확인하기|${buyUrl}]]`
    : '';

  const body = [
    coupangNotice,
    intro,
    '\n\n',
    toc,
    '\n\n',
    buySection,
    '\n\n',
    unboxing,
    '\n\n',
    goodParts,
    '\n\n',
    badParts,
    '\n\n',
    checklist,
    '\n\n',
    rating,
    '\n\n',
    ending,
    purchaseSection,
  ].join('');

  // 부족하면 보충
  let finalBody = body;
  const extras = [
    `\n\n자주 묻는 질문 (FAQ)\n\n${baseKw} 구매 전에 자주 물어보시는 것들을 정리해봤어요.\n\n"초보자도 쓸 수 있나요?"\n\n충분히 가능해요.\n처음 쓰는 분들도 금방 익숙해지실 거예요.\n저도 처음엔 좀 어색했는데\n일주일 지나니까 자연스러워졌어요.\n\n"어디서 사는 게 제일 저렴한가요?"\n\n쿠팡이랑 네이버 쇼핑\n가격이 비슷한 편이에요.\n쿠폰이나 할인 행사 타이밍 잘 맞추면\n더 저렴하게 살 수 있어요.\n\n"얼마나 오래 쓸 수 있나요?"\n\n관리만 잘 해주면 오래 써요.\n기본적인 관리 습관이 가장 중요한 것 같아요.\n\n"색상/사이즈 선택이 고민이에요"\n\n처음이라면 가장 무난한 걸 고르세요.\n후회할 확률이 낮아요.`,
    `\n\n가격 비교 팁\n\n${baseKw}는 시즌이나 행사에 따라\n가격 변동이 꽤 있는 편이에요.\n\n급하지 않다면\n쿠폰 행사 기간을 기다리는 것도 좋아요.\n\n구매 시 체크포인트:\n\n리뷰 수가 많은 제품부터 보기.\n나쁜 후기 이유를 꼼꼼히 읽기.\n배송비와 반품 조건도 확인하기.\n\n저는 이렇게 골랐고\n결과적으로 만족해요.\n\n여러분도 좋은 선택 하시길 바라요.`,
  ];
  let bodyLen = finalBody.replace(/\n/g, '').length;
  if (bodyLen < 2800) {
    for (const ex of extras) {
      finalBody += ex;
      bodyLen = finalBody.replace(/\n/g, '').length;
      if (bodyLen >= 2800) break;
    }
  }

  // ── 제목 (검색 최적화 + 자연스러운 표현)
  const titles = [
    `${baseKw} 한 달 실사용 후기 — 솔직하게 다 말할게요`,
    `${year}년 ${season} ${baseKw} 구매 후기, 장단점 포함 정리`,
    `${baseKw} 써봤는데 이렇더라고요 — 진짜 사용자 후기`,
    `직접 써본 사람이 말하는 ${baseKw} 솔직 정리`,
    `${baseKw} 구매 전에 이 후기 꼭 읽어보세요 — ${year}년 기준`,
    `${baseKw} 가성비 어때요? 한 달 써보고 느낀 점 전부`,
    `${baseKw}의 완성 — ${season} 인테리어 도전기`,
    `${baseKw} 고민된다면 이 글 하나면 충분해요`,
  ];

  // ── 해시태그 (15개, 키워드 + 관련 검색어 풍부하게)
  const baseHashtags = `${keyword} ${baseKw} ${baseKw}추천 ${baseKw}후기 ${baseKw}구매`;
  const commonHashtags = `리빙 홈리빙 인테리어 생활용품 홈인테리어 가성비 추천템 구매후기 솔직후기 실사용후기 ${year}트렌드 집꾸미기`;

  return {
    title:    titles[rand(0, titles.length)],
    body:     finalBody,
    hashtags: `${baseHashtags} ${commonHashtags}`,
  };
}

// ── AI 글 생성 (pollinations.ai) ─────────────────────────────────────
async function generateContent(keyword) {
  const year  = new Date().getFullYear();
  const month = new Date().getMonth() + 1;
  const season = month >= 3 && month <= 5 ? '봄' : month >= 6 && month <= 8 ? '여름'
               : month >= 9 && month <= 11 ? '가을' : '겨울';

  const userMsg = `"${keyword}" 블로그 후기 (2500자+, 이모지 절대 금지, 이모티콘 없이, 자연스러운 한국인 구어체).
구어체 말투: ~했어요, ~더라고요, ~거든요, ~것 같아요. 문장 짧게. 단락 자주 나누기.
구성: 도입(200자)→구매계기(400자)→개봉첫인상(300자)→장점(500자)→단점(300자)→팁(200자)→추천대상(200자)→마무리(200자).
"${keyword}" 키워드 자연스럽게 7회 이상. 이모지 없음. 이모티콘 없음.
시즌: ${year}년 ${season}.

JSON: {"title":"제목50자이내이모지없음","body":"본문전체\\n단락구분","hashtags":"${keyword} 리빙 홈리빙 생활용품 인테리어 후기 추천 리뷰 솔직후기 실사용"}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      if (attempt > 1) { await sleep(45000); }
      const reqBody = JSON.stringify({
        model:    'openai',
        messages: [
          { role: 'system', content: '순수 JSON만 출력. 마크다운 코드블록 금지. 이모지 사용 금지.' },
          { role: 'user',   content: userMsg },
        ],
        seed:    rand(1, 99999),
        private: true,
      });
      const buf = Buffer.from(reqBody, 'utf8');
      const raw = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'text.pollinations.ai',
          path: '/openai/chat/completions',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': buf.length },
          timeout: 55000,
        }, res => {
          const c = [];
          res.on('data', d => c.push(d));
          res.on('end',  () => resolve(Buffer.concat(c).toString('utf8')));
        });
        req.on('error',   e => reject(e));
        req.on('timeout', () => { req.destroy(); reject(new Error('타임아웃')); });
        req.write(buf);
        req.end();
      });

      let contentStr = raw;
      try {
        const outer = JSON.parse(raw);
        if (outer.error) throw new Error(String(outer.error).substring(0, 80));
        contentStr = outer?.choices?.[0]?.message?.content || raw;
      } catch (e) { if (!e.message.includes('JSON')) throw e; }

      const match = contentStr.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('JSON 없음');
      const p = JSON.parse(match[0]);
      const title    = p.title || p['제목'] || '';
      const body     = p.body  || p['본문'] || p.content || '';
      const hashtags = p.hashtags || `${keyword} 리빙 홈리빙 생활용품 후기`;
      if (!title || !body || body.replace(/\n/g, '').length < 2000) throw new Error('내용 부족');
      log(`  AI 생성 완료: 본문 ${body.replace(/\n/g,'').length}자`);
      return { title: title.substring(0, 100), body, hashtags: String(hashtags) };
    } catch (e) {
      log(`  AI 실패 (${e.message})`);
    }
  }
  return null;
}

// ── 에디터에 이미지 삽입 ─────────────────────────────────────────────
async function insertImageToEditor(page, imgPath) {
  if (!fs.existsSync(imgPath)) return false;

  const imgBtnSels = [
    'button[data-name="image"]',
    'button[data-command="image"]',
    '[class*="se-toolbar"][data-name="image"]',
    'button[title*="사진"]',
    'button[title*="이미지"]',
    'button[aria-label*="사진"]',
    'button[aria-label*="이미지"]',
    '[class*="se-popup-button-image"]',
    '[class*="toolbar-image"]',
    'button[class*="image"]',
    '.se-toolbar button',
    'button.se-btn-toolbar',
  ];

  // 모든 프레임에서 이미지 버튼 탐색 (SE ONE 에디터는 iframe 내에 있을 수 있음)
  const allFrames = [page.mainFrame(), ...page.frames()];

  for (const frame of allFrames) {
    for (const sel of imgBtnSels) {
      try {
        const el = frame.locator(sel).first();
        if (await el.count().catch(() => 0) === 0) continue;

        // 방법 1: 버튼 클릭 → 직접 파일 선택창 열림
        try {
          const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 4000 }),
            el.click({ timeout: 3000 }),
          ]);
          await fileChooser.setFiles(imgPath);
          await sleep(3000);
          log(`  사진 삽입 완료 (직접, ${sel})`);
          return true;
        } catch (_) {}

        // 방법 2: 버튼 클릭 → 팝업 뜸 → "내 PC에서" 클릭 → 파일 선택창
        try {
          await el.click({ timeout: 3000 }).catch(() => {});
          await sleep(1200);

          const pcSelectors = [
            'button:has-text("내 PC")',
            'button:has-text("PC에서")',
            'button:has-text("파일 선택")',
            'button:has-text("내 컴퓨터")',
            '[class*="se-popup-button"]:has-text("PC")',
            '[data-type="local"]',
            'li:has-text("내 PC")',
          ];

          for (const pcSel of pcSelectors) {
            for (const f2 of allFrames) {
              try {
                const pcBtn = f2.locator(pcSel).first();
                if (await pcBtn.count().catch(() => 0) === 0) continue;
                const [fileChooser] = await Promise.all([
                  page.waitForEvent('filechooser', { timeout: 4000 }),
                  pcBtn.click({ timeout: 3000 }),
                ]);
                await fileChooser.setFiles(imgPath);
                await sleep(3000);
                log(`  사진 삽입 완료 (팝업 경유)`);
                return true;
              } catch (_) {}
            }
          }
          // 팝업이 떴다면 Escape로 닫기
          await page.keyboard.press('Escape').catch(() => {});
          await sleep(500);
        } catch (_) {}
      } catch (_) {}
    }
  }

  // 폴백: 모든 프레임에서 file input 직접 탐색
  for (const frame of allFrames) {
    try {
      const inputs = await frame.$$('input[type="file"]');
      for (const inp of inputs) {
        const accept = await inp.getAttribute('accept').catch(() => '');
        if (accept && accept.includes('image')) {
          await inp.setInputFiles(imgPath);
          await sleep(3000);
          log('  사진 삽입 완료 (file input 직접)');
          return true;
        }
      }
    } catch (_) {}
  }

  log('  사진 삽입 실패 (버튼/입력창 미발견)');
  return false;
}

// ── 에디터에서 클릭 가능한 링크 삽입 ─────────────────────────────────
// SE ONE 에디터: 툴바 "링크" 버튼 클릭 → URL + 표시텍스트 입력
// ※ Ctrl+K 완전 제거 (SE ONE에서 다른 서식으로 작동할 수 있음)
async function insertLinkAtCursor(page, displayText, url) {
  try {
    const allFrames = [page.mainFrame(), ...page.frames()];

    // ── 방법 1: 상단 툴바 "링크" 버튼 클릭 (제일 안정적)
    // 스크린샷 확인: 툴바에 "링크" 텍스트 버튼 있음
    const toolbarLinkSels = [
      // SE ONE 에디터 툴바 링크 버튼 (data-name, title, aria-label 다양)
      '[class*="se-toolbar"] button[data-name="link"]',
      '[class*="se-toolbar"] button[title="링크"]',
      '[class*="se-toolbar"] button[aria-label="링크"]',
      // 범용 툴바 링크
      'button[data-name="link"]',
      'button[title="링크"]',
      'button[aria-label="링크"]',
      // 텍스트로 찾기
      'button:has-text("링크")',
      '[class*="toolbar"] button:has-text("링크")',
    ];

    // 다이얼로그 입력 헬퍼
    const fillLinkDialog = async () => {
      await sleep(1500);
      // URL 입력란 찾기
      const urlSels = [
        'input[placeholder*="URL"]', 'input[placeholder*="url"]',
        'input[placeholder*="링크"]', 'input[placeholder*="주소"]',
        'input[placeholder*="https"]', 'input[type="url"]',
        '.se-link-input input', '[class*="se-popup"] input[type="text"]',
        '[class*="se-dialog"] input', '[class*="modal"] input',
      ];
      let urlFilled = false;
      for (const frm of allFrames) {
        if (urlFilled) break;
        for (const sel of urlSels) {
          try {
            const el = frm.locator(sel).first();
            if (await el.count() === 0) continue;
            if (!await el.isVisible({ timeout: 1000 }).catch(() => false)) continue;
            await el.click({ timeout: 2000 });
            await sleep(150);
            await page.keyboard.press('Control+a');
            await sleep(80);
            await page.keyboard.insertText(url);
            await sleep(200);
            urlFilled = true;
            break;
          } catch (_) {}
        }
      }
      if (!urlFilled) return false;

      // 표시 텍스트 입력란 찾기 (두 번째 input)
      await sleep(300);
      const textSels = [
        'input[placeholder*="표시"]', 'input[placeholder*="텍스트"]',
        'input[placeholder*="text"]', 'input[placeholder*="내용"]',
      ];
      for (const frm of allFrames) {
        for (const sel of textSels) {
          try {
            const el = frm.locator(sel).first();
            if (await el.count() === 0) continue;
            if (!await el.isVisible({ timeout: 800 }).catch(() => false)) continue;
            await el.click({ timeout: 2000 });
            await sleep(100);
            await page.keyboard.insertText(displayText);
            break;
          } catch (_) {}
        }
      }

      // 확인 버튼 클릭
      const confirmSels = [
        'button:has-text("확인")', 'button:has-text("저장")', 'button:has-text("적용")',
        'button[type="submit"]', '.se-popup-button-confirm', '[class*="confirm"]',
      ];
      for (const frm of allFrames) {
        for (const sel of confirmSels) {
          try {
            const btn = frm.locator(sel).first();
            if (await btn.count() > 0 && await btn.isVisible({ timeout: 800 }).catch(() => false)) {
              await btn.click({ timeout: 2000 });
              await sleep(800);
              log(`  구매링크 삽입 완료 (툴바 링크 다이얼로그)`);
              return true;
            }
          } catch (_) {}
        }
      }
      // Enter로 확인
      await page.keyboard.press('Enter');
      await sleep(600);
      log(`  구매링크 삽입 완료 (Enter 확인)`);
      return true;
    };

    // 툴바 링크 버튼 클릭 시도
    let dialogOpened = false;
    for (const frame of allFrames) {
      if (dialogOpened) break;
      for (const sel of toolbarLinkSels) {
        try {
          const btn = frame.locator(sel).first();
          if (await btn.count() === 0) continue;
          if (!await btn.isVisible({ timeout: 1000 }).catch(() => false)) continue;
          await btn.click({ timeout: 3000 });
          const filled = await fillLinkDialog();
          if (filled) { dialogOpened = true; break; }
        } catch (_) {}
      }
    }
    if (dialogOpened) return true;

    // ── 방법 2: 서식 툴바의 인라인 링크 버튼 (두 번째 줄 툴바)
    const formattingLinkSels = [
      '[class*="se-toolbar-format"] button[data-name="link"]',
      '[class*="format"] button[title*="링크"]',
      'button[class*="link-insert"]',
    ];
    for (const frame of allFrames) {
      if (dialogOpened) break;
      for (const sel of formattingLinkSels) {
        try {
          const btn = frame.locator(sel).first();
          if (await btn.count() === 0) continue;
          if (!await btn.isVisible({ timeout: 1000 }).catch(() => false)) continue;
          await btn.click({ timeout: 3000 });
          const filled = await fillLinkDialog();
          if (filled) { dialogOpened = true; break; }
        } catch (_) {}
      }
    }
    if (dialogOpened) return true;

    // ── 방법 3: 모두 실패 → 표시텍스트 + URL 별도 줄 입력 (Naver 자동 링크 카드)
    // Ctrl+K 완전 미사용 (SE ONE에서 다른 서식이 적용될 수 있음)
    await page.keyboard.insertText(displayText);
    await sleep(150);
    await page.keyboard.press('Enter');
    await sleep(100);
    await page.keyboard.insertText(url);
    await sleep(300);
    log(`  구매링크 — URL 텍스트로 삽입 (자동 링크카드 예정)`);
    return false;
  } catch (e) {
    log(`  구매링크 삽입 오류: ${e.message}`);
    return false;
  }
}

// ── 에디터에 글 작성 ─────────────────────────────────────────────────
async function writeToEditor(content, imagePaths) {
  const { title, body, hashtags } = content;

  log('  Chrome 실행 중...');
  const browser = await chromium.launch({ channel: 'chrome', headless: false, args: LAUNCH_ARGS });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    viewport:  { width: 1280, height: 800 },
    locale:    'ko-KR',
    ...(fs.existsSync(COOKIE_FILE) ? { storageState: COOKIE_FILE } : {}),
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
  });

  let saveConfirmed = false;
  context.on('response', async resp => {
    if (!resp.url().includes('RabbitAutoSave') && !resp.url().includes('AutoSave')) return;
    try {
      const json = await resp.json().catch(() => null);
      if (json && (json.isSuccess === true || json?.result?.documentId)) {
        saveConfirmed = true;
        log('  서버 임시저장 확인!');
      }
    } catch (_) {}
  });

  const page = await context.newPage();

  try {
    // 에디터 열기
    log('  블로그 에디터 여는 중...');
    await page.goto(`https://blog.naver.com/PostWriteForm.naver?blogId=${MY_BLOG}`, {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await sleep(4000);

    // ── 세션 만료 감지 → 자동 로그인 후 에디터 재진입 ──────────────────
    const curUrl = page.url();
    if (curUrl.includes('nidlogin') || curUrl.includes('login.naver') || curUrl.includes('nid.naver')) {
      log('  ⚠ 로그인 페이지 감지 — 자동 로그인 시도...');
      const loginOk = await doLogin(page);
      if (!loginOk) throw new Error('로그인 실패 — 수동 로그인 후 다시 실행해주세요');
      log('  블로그 에디터 재진입 중...');
      await page.goto(`https://blog.naver.com/PostWriteForm.naver?blogId=${MY_BLOG}`, {
        waitUntil: 'domcontentloaded', timeout: 30000,
      });
      await sleep(5000);
    }

    // ── 임시저장 팝업 처리 (기존 임시저장 글 있을 때 취소 클릭) ───────────
    log('  팝업 확인 중...');
    const popupCancelSels = [
      'button:has-text("취소")',
      'button:has-text("닫기")',
      '.se-popup-button-cancel',
      '[class*="btn-cancel"]',
      '[class*="cancel"]:not(input)',
      'button.btn_cancel',
      '.layer_btn button:last-child',
    ];
    for (const sel of popupCancelSels) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.count() > 0 && await btn.isVisible({ timeout: 1500 })) {
          await btn.click({ timeout: 2000 });
          log('  임시저장 팝업 취소 완료');
          await sleep(800);
          break;
        }
      } catch (_) {}
    }

    const vp = page.viewportSize() || { width: 1280, height: 800 };
    await sleep(1500);

    // ── 제목 입력 (모든 프레임 탐색) ────────────────────────────────────
    log('  제목 입력 중...');
    const titleSels = [
      '.se-title-text',
      '.se-title-input',
      '.se-section-title [contenteditable]',
      '[contenteditable][data-placeholder*="제목"]',
      '[placeholder*="제목"]',
      '#inputTitle',
      'input[name="title"]',
    ];
    let titleOk = false;
    for (const frame of [page.mainFrame(), ...page.frames()]) {
      if (titleOk) break;
      for (const sel of titleSels) {
        try {
          const el = frame.locator(sel).first();
          if (await el.count() === 0) continue;
          const box = await el.boundingBox().catch(() => null);
          if (!box || box.height < 5) continue;
          await el.click({ timeout: 2000 });
          await sleep(400);
          // 기존 내용 제거 후 입력
          await page.keyboard.press('Control+a');
          await sleep(100);
          await page.keyboard.insertText(title);
          await sleep(300);
          log(`  제목 입력 완료 (${sel})`);
          titleOk = true;
          break;
        } catch (_) {}
      }
    }
    if (!titleOk) log('  ⚠ 제목 입력창 미발견');
    await sleep(rand(600, 1000));

    // ── 본문을 5구간으로 나눠 입력 + 4장 이미지 삽입 ────────────────────
    // [파트0] → [사진0-대표] → [파트1] → [사진1-라이프] → [파트2] → [사진2-디테일] → [파트3] → [사진3-플랫레이] → [파트4]
    const paragraphs = body.split('\n');
    const total      = paragraphs.length;
    const cuts       = [
      Math.floor(total * 0.20),
      Math.floor(total * 0.40),
      Math.floor(total * 0.60),
      Math.floor(total * 0.80),
    ];
    const parts = [
      paragraphs.slice(0, cuts[0]),
      paragraphs.slice(cuts[0], cuts[1]),
      paragraphs.slice(cuts[1], cuts[2]),
      paragraphs.slice(cuts[2], cuts[3]),
      paragraphs.slice(cuts[3]),
    ];

    log('  본문 입력 중...');
    await page.mouse.click(Math.round(vp.width / 2), Math.round(vp.height * 0.55));
    await sleep(rand(1000, 1500));

    for (let pi = 0; pi < parts.length; pi++) {
      // 해당 파트 텍스트 입력
      for (const line of parts[pi]) {
        if (line.trim() === '') {
          await page.keyboard.press('Enter');
          await sleep(rand(50, 100));
          continue;
        }

        // 구매 링크 마커 처리: [[BUY_LINK:표시텍스트|URL]]
        const linkMatch = line.match(/^\[\[BUY_LINK:(.+?)\|(.+?)\]\]$/);
        if (linkMatch) {
          await insertLinkAtCursor(page, linkMatch[1], linkMatch[2]);
          await page.keyboard.press('Enter');
          await sleep(rand(200, 400));
          continue;
        }

        const CHUNK = 300;
        for (let ci = 0; ci < line.length; ci += CHUNK) {
          await page.keyboard.insertText(line.substring(ci, ci + CHUNK));
          await sleep(rand(50, 110));
        }
        await page.keyboard.press('Enter');
        await sleep(rand(60, 130));
      }

      // 파트 사이에 이미지 삽입 (파트 0~3 뒤에 각각 1장씩)
      if (pi < parts.length - 1 && imagePaths[pi]) {
        await sleep(400);
        log(`  파트 ${pi + 1} 후 사진 삽입 시도 (${path.basename(imagePaths[pi])})...`);
        await insertImageToEditor(page, imagePaths[pi]);
        // 이미지 삽입 후 본문 영역 재포커스
        await sleep(500);
        await page.mouse.click(Math.round(vp.width / 2), Math.round(vp.height * 0.55));
        await sleep(rand(500, 900));
      }
    }

    const typedLen = body.replace(/\n/g, '').length;
    log(`  본문 입력 완료 (${typedLen}자)`);
    await sleep(rand(800, 1200));

    // 태그 입력
    log('  태그 입력 중...');
    const tags = hashtags.split(/[\s,]+/).map(t => t.replace(/^#/, '')).filter(Boolean).slice(0, 10);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    await sleep(800);
    const tagSels = ['.se-tag-input', '[placeholder*="태그"]', 'input[class*="tag"]', '#tagInput'];
    let tagOk = false;
    for (const frm of [page, ...page.frames()]) {
      if (tagOk) break;
      for (const sel of tagSels) {
        try {
          const el = frm.locator(sel).first();
          if (await el.count() === 0) continue;
          const box = await el.boundingBox().catch(() => null);
          if (!box || box.width < 50) continue;
          await el.click({ timeout: 3000 });
          await sleep(400);
          for (const tag of tags) {
            await page.keyboard.insertText(tag);
            await sleep(180);
            await page.keyboard.press('Enter');
            await sleep(rand(150, 280));
          }
          tagOk = true;
          log(`  태그 입력 완료 (${tags.length}개)`);
          break;
        } catch (_) {}
      }
    }

    // 임시저장 (Ctrl+S)
    log('  임시저장 중...');
    await page.mouse.click(Math.round(vp.width / 2), Math.round(vp.height * 0.52));
    await sleep(500);
    await page.keyboard.press('Control+s');

    for (let w = 0; w < 20; w++) {
      if (saveConfirmed) break;
      await sleep(500);
    }
    if (!saveConfirmed) {
      await page.mouse.click(Math.round(vp.width / 2), Math.round(vp.height * 0.52));
      await sleep(300);
      await page.keyboard.press('Control+s');
      for (let w = 0; w < 14; w++) {
        if (saveConfirmed) break;
        await sleep(500);
      }
    }

    if (saveConfirmed) {
      log('  임시저장 완료 (서버 확인)');
    } else {
      log('  저장 전송 완료 (에디터 자동저장 병행)');
      await sleep(3000);
    }

  } finally {
    await browser.close();
    // 임시 이미지 삭제
    for (const p of imagePaths) {
      try { fs.unlinkSync(p); } catch (_) {}
    }
  }

  return saveConfirmed;
}

// ── 글 1개 작성 ──────────────────────────────────────────────────────
async function writeOne(keyword, idx, total) {
  log(`\n[${idx}/${total}] 키워드: "${keyword}"`);

  // 네이버 쇼핑 실제 상품 정보 가져오기
  log('  상품 정보 수집 중...');
  const shopInfo = await searchNaverShoppingProduct(keyword);

  // 콘텐츠 생성
  log('  AI 콘텐츠 생성 중...');
  let content = await generateContent(keyword);
  if (!content) {
    log('  AI 실패 → 템플릿 방식');
    content = generateTemplate(keyword, shopInfo);
  } else {
    // AI 생성 성공해도 구매 링크는 별도 추가
    if (shopInfo?.buyUrl) {
      content.body += `\n\n구매 정보\n\n[[BUY_LINK:네이버 쇼핑에서 직접 확인하기|${shopInfo.buyUrl}]]\n\n(현재 가격 및 할인 혜택은 위 링크에서 확인하실 수 있어요.)`;
    }
  }

  const bodyLen = content.body.replace(/\n/g, '').length;
  log(`  제목: "${content.title}"`);
  log(`  본문: ${bodyLen}자`);

  // 이미지 준비 (네이버 쇼핑 상품 이미지 포함)
  const imagePaths = await prepareImages(keyword, shopInfo);
  log(`  이미지: ${imagePaths.length}장 준비됨`);

  // 에디터 작성
  let ok = false;
  try {
    ok = await writeToEditor(content, imagePaths);
  } catch (e) {
    log(`  오류: ${e.message}`);
    return { keyword, title: content.title, status: '실패' };
  }

  log(`  완료!`);
  saveHistory(keyword, content.title);
  return { keyword, title: content.title, status: ok ? '임시저장' : '저장전송' };
}

// ── 메인 ─────────────────────────────────────────────────────────────
async function main() {
  console.clear();
  log('========================================');
  log('  네이버 블로그 AI 작성봇 v3');
  log('  자연스러운 글체 | 2500자+ | 사진 삽입');
  log('========================================');
  log(`  날짜: ${TODAY}\n`);

  if (!fs.existsSync(COOKIE_FILE)) {
    log('세션 없음 → run.js write 모드로 1회 로그인하세요');
    process.exit(1);
  }

  const countIdx   = process.argv.indexOf('--count');
  const writeCount = countIdx !== -1 ? (parseInt(process.argv[countIdx + 1]) || 1) : 1;

  // 커맨드라인 키워드 직접 지정 여부 확인
  const argKw = process.argv.find((a, ai) => ai >= 2 && !a.startsWith('-') && process.argv[ai - 1] !== '--count');

  // DataLab에서 트렌드 키워드 수집 (실패 시 기존 자동완성 방식으로 폴백)
  let trendKws = [];
  if (!argKw) {
    log('데이터랩 트렌드 키워드 수집 중...');
    const datalabKw = await getDataLabKeywords();
    if (datalabKw) {
      trendKws = [datalabKw];
      log(`  키워드 1개 확보 (DataLab)\n`);
    } else {
      log('  DataLab 실패 → 네이버 자동완성 방식으로 전환\n');
      trendKws = await getTrendKeywords();
      log(`  키워드 ${trendKws.length}개 확보\n`);
    }
  }

  const todayCount = loadHistory().filter(h => h.date === TODAY).length;
  if (todayCount > 0) log(`  오늘 이미 작성: ${todayCount}개\n`);

  const results     = [];
  const usedThisRun = [];

  for (let i = 1; i <= writeCount; i++) {
    // i > 1 이면 DataLab에서 새 키워드 다시 수집
    let keyword;
    if (argKw && i === 1) {
      keyword = argKw;
    } else if (i > 1) {
      // 연속 작성 시 DataLab에서 새 키워드 재수집
      const freshKw = await getDataLabKeywords();
      keyword = (freshKw && !usedThisRun.includes(freshKw))
        ? freshKw
        : pickKeyword(trendKws, usedThisRun);
    } else {
      keyword = pickKeyword(trendKws, usedThisRun);
    }
    usedThisRun.push(keyword);

    const result = await writeOne(keyword, i, writeCount);
    results.push(result);

    if (i < writeCount) {
      const delay = rand(90, 150);
      log(`\n  다음 글까지 ${delay}초 대기...\n`);
      await sleep(delay * 1000);
    }
  }

  log('\n' + '='.repeat(44));
  const ok   = results.filter(r => r.status !== '실패').length;
  const fail = results.filter(r => r.status === '실패').length;
  log(`완료: ${ok}개 저장 / ${fail}개 실패 / 총 ${writeCount}개`);
  results.forEach((r, i) => log(`  ${i + 1}. [${r.keyword}] "${r.title}" — ${r.status}`));
  log(`\n  오늘 총 작성: ${loadHistory().filter(h => h.date === TODAY).length}개`);
  log('  네이버 블로그 → 글 관리 → 임시저장에서 확인하세요');
  log('='.repeat(44));
}

main().catch(e => {
  console.error('\n오류:', e.message);
  process.exit(1);
});
