/**
 * interceptor.js — 네이버 블로그 임시저장 API 형식 1회 캡처
 * 실행 후 api-capture.json 에 결과 저장
 */
const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const config      = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const COOKIE_FILE = path.join(__dirname, 'session.json');
const MY_BLOG     = config.naver.blogId;
const OUT         = path.join(__dirname, 'api-capture.json');

const LAUNCH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--no-first-run', '--no-default-browser-check',
];

(async () => {
  console.log('🔍 네이버 블로그 API 캡처 시작...');
  console.log('   에디터가 열리면 아무것도 하지 마세요 — 자동으로 진행됩니다.\n');

  const browser = await chromium.launch({ channel: 'chrome', headless: false, args: LAUNCH_ARGS });

  const hasCookie = fs.existsSync(COOKIE_FILE);
  const context   = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    viewport:  { width: 1280, height: 800 },
    locale:    'ko-KR',
    ...(hasCookie ? { storageState: COOKIE_FILE } : {}),
  });

  // ── 안티봇 스크립트
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
  });

  const captured = [];

  // ── 모든 POST 요청 가로채기
  await context.route('**/*', async (route, req) => {
    const method = req.method();
    const url    = req.url();

    if (method === 'POST' && (
      url.includes('blog.naver.com') ||
      url.includes('editor.naver.com')
    )) {
      try {
        const postData = req.postData() || '';
        const headers  = req.headers();
        captured.push({ url, headers, postData: postData.substring(0, 3000) });
        console.log(`📡 캡처: POST ${url.replace('https://','').substring(0,80)}`);
      } catch (_) {}
    }
    await route.continue();
  });

  const page = await context.newPage();

  // ── 블로그 에디터 열기
  console.log('📝 에디터 열는 중...');
  await page.goto(`https://blog.naver.com/PostWriteForm.naver?blogId=${MY_BLOG}`, {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await new Promise(r => setTimeout(r, 7000));

  // ── 제목 입력 시도
  console.log('✏️  제목 자동 입력...');
  const titleSels = ['.se-title-text', '[placeholder*="제목"]', '#inputTitle', '[contenteditable="true"][class*="title"]'];
  for (const sel of titleSels) {
    try {
      const el = await page.$(sel);
      if (!el) continue;
      const box = await el.boundingBox();
      if (!box) continue;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await new Promise(r => setTimeout(r, 500));
      await page.keyboard.insertText('API 캡처 테스트');
      console.log('   ✅ 제목 입력 완료');
      break;
    } catch (_) {}
  }
  await new Promise(r => setTimeout(r, 1000));

  // ── 본문 클릭 + 간단한 텍스트 입력
  console.log('📄 본문 자동 입력...');
  const vp = page.viewportSize() || { width: 1280, height: 800 };
  await page.mouse.click(Math.round(vp.width / 2), Math.round(vp.height * 0.52));
  await new Promise(r => setTimeout(r, 1200));
  await page.keyboard.insertText('테스트 본문입니다. API 캡처를 위한 임시 내용.');
  await new Promise(r => setTimeout(r, 1000));

  // ── 임시저장 버튼 클릭 (여러 방법 시도)
  console.log('💾 임시저장 시도...');
  let saved = false;

  // 방법 1: 버튼 찾기
  const draftSels = [
    'button:has-text("임시저장")',
    'button[class*="draft"]',
    '[data-action*="draft"]',
    '[aria-label*="임시저장"]',
  ];
  for (const sel of draftSels) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.count() > 0) {
        await btn.click();
        saved = true;
        console.log(`   ✅ 임시저장 버튼 클릭 (${sel})`);
        break;
      }
    } catch (_) {}
  }

  // 방법 2: Ctrl+S
  if (!saved) {
    await page.keyboard.press('Control+s');
    console.log('   ✅ Ctrl+S 시도');
  }

  await new Promise(r => setTimeout(r, 5000));

  // ── 결과 저장
  if (captured.length > 0) {
    fs.writeFileSync(OUT, JSON.stringify(captured, null, 2), 'utf8');
    console.log(`\n✅ ${captured.length}개 API 요청 캡처 완료!`);
    console.log(`   저장 위치: ${OUT}`);
    captured.forEach((c, i) => {
      console.log(`\n[${i+1}] ${c.url}`);
      if (c.postData) console.log('    Body 앞 200자:', c.postData.substring(0, 200));
    });
  } else {
    console.log('\n⚠️  캡처된 POST 요청 없음 — 수동으로 임시저장 버튼을 눌러주세요.');
    console.log('   30초 대기 중...');
    await new Promise(r => setTimeout(r, 30000));
    if (captured.length > 0) {
      fs.writeFileSync(OUT, JSON.stringify(captured, null, 2), 'utf8');
      console.log(`\n✅ ${captured.length}개 캡처 완료 → ${OUT}`);
    } else {
      console.log('❌ 캡처 실패');
    }
  }

  await browser.close();
  console.log('\n✔ 완료');
})();
