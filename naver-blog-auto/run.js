/**
 * ╔══════════════════════════════════════════╗
 * ║     네이버 블로그 계정관리모드 v7          ║
 * ╚══════════════════════════════════════════╝
 *
 * [시작] 방문자 통계 + 애드포스트 상태 + SEO 분석
 * [STEP 0] 내 블로그 새 댓글 → 대댓글 (모든 모드 공통)
 * [STEP 1] 트렌드 키워드 분석 + 이웃 블로거 탐색
 * [STEP 2] 선택한 모드 실행
 *
 * 모드:  write / neighbor / comment / all ⭐ / like
 * 사용:  node run.js [모드]
 *
 * v7 신규 기능:
 * ✨ 베지어 곡선 마우스 이동 (자연스러운 커서 궤적)
 * ✨ Canvas / Audio 지문 위조 강화
 * ✨ 시작 시 방문자 통계 + 애드포스트 상태 확인
 * ✨ 네이버 자동완성 기반 트렌드 키워드 분석
 * ✨ 내 최근 포스팅 SEO 품질 자동 검사
 * ✨ 쿠팡 파트너스 링크 생성 (config에 ID 등록 시)
 * ✨ 세션 쿠키 저장/재사용 (로그인 반복 방지)
 * ✨ 딜레이 5~10분 랜덤화
 * ✨ 해상도 랜덤화 (5종 중 선택)
 * ✨ 이상 감지 자동 중단 (로그인 3회 연속 시)
 */

const { chromium } = require('playwright');
const fs           = require('fs');
const path         = require('path');
const readline     = require('readline');
const https        = require('https');
const os           = require('os');

// (Anthropic SDK 불필요 — pollinations.ai 무료 텍스트 API 사용)

// ── 설정 ──────────────────────────────────────────────────────────────────────
const config      = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const NAVER_ID    = config.naver.id;
const NAVER_PW    = config.naver.password;
const MY_BLOG     = config.naver.blogId;
const DAILY_LIM   = config.settings.dailyLimit;
const DELAY_MIN   = config.settings.delayMin  ?? 5;
const DELAY_MAX   = config.settings.delayMax  ?? 10;
const NICHES      = config.targetNiches;
const BLACKLIST   = new Set((config.blacklist || []).map(u => u.replace(/^https?:\/\//, '').replace(/\/$/, '')));
const COUPANG_ID    = config.coupangPartnerId || '';   // 쿠팡 파트너스 ID (없으면 빈 문자열)
// (pollinations.ai 사용 — 별도 API 키 불필요)

// ── 경로 ──────────────────────────────────────────────────────────────────────
const DIR          = __dirname;
const COOKIE_FILE  = path.join(DIR, 'session.json');
const TODAY        = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
                               .replace(/\. /g, '-').replace('.', '');
const LOG_DIR      = path.join(DIR, 'logs');
const RES_DIR      = path.join(DIR, 'results');
[LOG_DIR, RES_DIR].forEach(d => !fs.existsSync(d) && fs.mkdirSync(d));

const TARGETS_FILE   = path.join(DIR, 'targets.txt');
const DONE_FILE      = path.join(DIR, 'done.txt');
const WRITTEN_FILE   = path.join(DIR, 'written.json');     // 작성 이력 (키워드 중복 방지)
const LOG_FILE       = path.join(LOG_DIR, `${TODAY}.txt`);
const RESULT_FILE    = path.join(RES_DIR, `${TODAY}.txt`);
const STATS_FILE     = path.join(DIR, 'stats.json');       // 대시보드 데이터
const DASHBOARD_FILE = path.join(DIR, 'dashboard.html');   // 대시보드 HTML

// ── 로거 (콘솔 + 파일 동시) ───────────────────────────────────────────────────
function log(msg, { file = true } = {}) {
  console.log(msg);
  if (file) {
    const ts   = new Date().toLocaleTimeString('ko-KR');
    const line = `[${ts}] ${msg.replace(/[\u{1F300}-\u{1FFFF}]/gu, '').trim()}`;
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
  }
}

// ── 유틸 ──────────────────────────────────────────────────────────────────────
const sleep = ms          => new Promise(r => setTimeout(r, ms));
const rand  = (a, b)      => Math.floor(Math.random() * (b - a) + a);
const wait  = (a=800, b=2200) => sleep(rand(a, b));

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(q, a => { rl.close(); r(a.trim()); }));
}

// ── 처리 이력 ─────────────────────────────────────────────────────────────────
// done.txt 형식: 2025-05-24|https://blog.naver.com/xxx|all
function loadDone() {
  if (!fs.existsSync(DONE_FILE)) return new Map();
  const map = new Map();
  fs.readFileSync(DONE_FILE, 'utf8').split('\n').filter(Boolean).forEach(line => {
    const [date, url, action] = line.split('|');
    if (!url) return;
    if (!map.has(url)) map.set(url, []);
    map.get(url).push({ date, action });
  });
  return map;
}
function markDone(url, action) {
  fs.appendFileSync(DONE_FILE, `${TODAY}|${url}|${action}\n`, 'utf8');
}
function wasDone(doneMap, url, action) {
  return (doneMap.get(url) || []).some(r => r.action === action || r.action === 'all');
}

// ── targets.txt ───────────────────────────────────────────────────────────────
function loadTargets() {
  if (!fs.existsSync(TARGETS_FILE)) return new Set();
  return new Set(fs.readFileSync(TARGETS_FILE, 'utf8').split('\n').map(l => l.trim()).filter(Boolean));
}
function appendTarget(url) {
  fs.appendFileSync(TARGETS_FILE, url + '\n', 'utf8');
}

// ── stats.json 읽기/쓰기 ─────────────────────────────────────────────────────
function loadStats() {
  if (!fs.existsSync(STATS_FILE)) return {
    lastUpdated: TODAY,
    visitor:  { today: '-', total: '-' },
    adpost:   { status: '-', revenue: '' },
    trending: [],
    seo:      [],
    history:  [],
  };
  try { return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')); }
  catch (_) { return {}; }
}
function saveStats(stats) {
  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2), 'utf8');
}

// ── 랜덤 딜레이 + 카운트다운 ──────────────────────────────────────────────────
function randDelaySec() {
  return rand(DELAY_MIN * 60, DELAY_MAX * 60);
}

async function countdown() {
  const total = randDelaySec();
  const m = Math.floor(total / 60), s = total % 60;
  log(`  ⏳ 대기 시간: ${m}분 ${s}초 (${DELAY_MIN}~${DELAY_MAX}분 범위 랜덤)`, { file: true });
  for (let rem = total; rem > 0; rem -= 5) {
    const rm = Math.floor(rem / 60), rs = rem % 60;
    process.stdout.write(`\r  ⏳ 다음 블로그까지 대기 중... ${rm}분 ${String(rs).padStart(2,'0')}초 남음   `);
    await sleep(Math.min(5000, rem * 1000));
  }
  process.stdout.write('\r' + ' '.repeat(55) + '\r');
}

function showETA(count) {
  const avg  = (DELAY_MIN + DELAY_MAX) / 2;
  const mins = Math.round(count * (3 + avg));
  const end  = new Date(Date.now() + mins * 60000);
  const endStr = end.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  log(`  📊 대상 ${count}명 | 딜레이 ${DELAY_MIN}~${DELAY_MAX}분 랜덤 | 예상 ~${mins}분 | 완료 예상 ${endStr}\n`);
}

// ── 메시지 생성 ───────────────────────────────────────────────────────────────
function makeReplyMsg(commentText = '') {
  const t   = commentText.trim().substring(0, 50);
  const isQ = t.includes('?') || ['어디','어떻게','얼마','뭐가','어느'].some(k => t.includes(k));
  const isP = ['좋','감사','도움','유익','덕분','잘 봤'].some(k => t.includes(k));

  if (isQ) return [
    `오 좋은 질문이에요! 저도 그 부분 다음에 자세히 정리해서 올려볼게요~`,
    `그 부분이 궁금하셨군요. 저도 쓰다 보니 설명이 부족했던 것 같아요ㅠ 다음 포스팅에서 더 자세히 다뤄볼게요!`,
    `맞아요 그 부분을 좀 더 자세히 썼어야 했는데ㅠ 다음번엔 더 꼼꼼하게 적을게요!`,
    `저도 처음엔 그 부분이 진짜 헷갈렸는데요ㅎㅎ 따로 정리해서 올릴게요, 조금만 기다려 주세요!`,
  ][rand(0, 4)];

  if (isP) return [
    `오 도움이 됐다니 다행이에요. 저도 쓰면서 공부 많이 됐거든요ㅎㅎ`,
    `와 그렇게 말씀해 주시니 더 열심히 써야겠다는 생각이 드네요. 감사해요~`,
    `진짜요? 이런 댓글이 힘이 돼요. 앞으로도 좋은 정보 들고 올게요!`,
    `감사해요! 저도 즐겁게 쓰고 있는데 이렇게 봐주시니 완전 의욕이 생기네요.`,
    `읽어주셔서 감사해요~ 앞으로도 실제로 도움 되는 내용 위주로 써볼게요!`,
  ][rand(0, 5)];

  return [
    `오 방문해 주셔서 감사해요~ 자주 놀러 오세요!`,
    `읽어주셔서 감사해요. 앞으로도 좋은 정보 올릴게요~`,
    `와 댓글 달아주셔서 감사해요, 덕분에 힘 받고 갑니다!`,
    `감사해요~ 앞으로도 진짜 쓸모 있는 내용으로 찾아올게요!`,
    `읽어주셔서 감사합니다. 자주 놀러 와 주세요~`,
  ][rand(0, 5)];
}

function makeNeighborMsg(titles = [], niche = '') {
  const short = (titles[0] || '').substring(0, 18);
  return [
    `안녕하세요~ ${niche} 관련 글 찾다가 들어왔는데 진짜 잘 정리되어 있어서 도움 많이 됐어요. 저도 리빙 제품 위주로 블로그 하고 있는데 서로이웃 신청드려요!`,
    `안녕하세요! ${short ? `"${short}" 글 보고 ` : ''}들어왔는데 ${niche} 쪽 정보가 완전 실용적이더라고요. 저도 비슷한 분야 블로그 운영 중이라 서로이웃 신청드려요.`,
    `안녕하세요~ 저도 리빙 제품 리뷰 블로그 운영 중인데 관심사가 비슷한 것 같아서 이웃 신청해요. 좋은 정보 자주 나눠요!`,
    `안녕하세요! ${niche} 포스팅 보다가 들어왔어요. 오 저랑 관심사가 비슷하네요ㅎㅎ 저도 생활용품 리뷰 블로그 하는데 서로이웃 신청드려요~`,
    `안녕하세요~ ${niche} 쪽 글 읽다가 방문했어요. 와 내용이 딱 제가 찾던 거라서요. 저도 리빙 제품 위주 블로그인데 서로이웃 신청드립니다!`,
  ][rand(0, 5)];
}

function makeComment(title = '', content = '') {
  const sents = content.split(/[.!?\n]/).map(s => s.trim()).filter(s => s.length > 15);
  const pick  = sents.length > 0 ? sents[rand(0, Math.min(3, sents.length))] : title;
  const short = (pick || title).substring(0, 28) + ((pick || title).length > 28 ? '…' : '');
  return [
    `오 저도 이 부분 궁금했는데 잘 정리해 주셨네요. "${short}" 내용이 특히 도움 됐어요!`,
    `"${short}" 이 부분 저도 집에 한번 적용해봐야겠어요. 완전 유용한 정보 감사해요~`,
    `글 읽으면서 진짜 공감되는 부분이 많았어요. "${short}" 내용 덕분에 많이 배워갑니다.`,
    `와 이 부분은 몰랐던 내용인데 알아갑니다. "${short}" 참고해서 써볼게요!`,
    `"${short}" 이 내용 메모해뒀어요. 진짜 유용한 정보 감사합니다~`,
    `저도 이거 고민하고 있었는데 딱 필요한 내용이었어요. 완전 많이 참고할게요!`,
    `오 "${short}" 이 부분이 진짜 공감됐어요. 좋은 글 잘 보고 갑니다ㅎㅎ`,
  ][rand(0, 7)];
}

// ── 쿠팡 파트너스 링크 생성 ───────────────────────────────────────────────────
function makeCoupangLink(keyword) {
  if (!COUPANG_ID) return '';
  const q = encodeURIComponent(keyword);
  return `https://link.coupang.com/a/${COUPANG_ID}?url=https%3A%2F%2Fwww.coupang.com%2Fnp%2Fsearch%3Fq%3D${q}`;
}

// ── SEO 품질 검사 ─────────────────────────────────────────────────────────────
function checkSEO(title = '', content = '', tags = []) {
  const issues = [];
  let passed = 0;

  if (title.length >= 15 && title.length <= 45) passed++;
  else issues.push(`제목 길이: ${title.length}자 (권장 15~45자)`);

  if (content.length >= 1500) passed++;
  else issues.push(`본문 길이: ${content.length}자 (권장 1500자 이상)`);

  if (tags.length >= 3) passed++;
  else issues.push(`해시태그: ${tags.length}개 (권장 3개 이상)`);

  if (/[가-힣]/.test(title)) passed++;
  else issues.push('제목에 한글 포함 권장');

  if (content.length > 200) passed++;  // 이미지 존재 간접 확인
  else issues.push('이미지 포함 권장 (SEO 점수 향상)');

  const grade = passed >= 4 ? '🟢 우수' : passed >= 3 ? '🟡 보통' : '🔴 개선 필요';
  return { score: `${passed}/5`, grade, issues };
}

// ── 베지어 곡선 계산 ──────────────────────────────────────────────────────────
function bezier(t, p0, p1, p2, p3) {
  const mt = 1 - t;
  return mt*mt*mt*p0 + 3*mt*mt*t*p1 + 3*mt*t*t*p2 + t*t*t*p3;
}

// ── 사람 행동 모방 ────────────────────────────────────────────────────────────
async function humanClick(page, sel) {
  try {
    const el  = typeof sel === 'string' ? await page.$(sel) : await sel.elementHandle();
    if (!el) return false;
    const box = await el.boundingBox();
    if (!box) return false;

    const tx = box.x + box.width  / 2 + rand(-3, 3);
    const ty = box.y + box.height / 2 + rand(-3, 3);

    // 출발점: 화면 어딘가에서 이동
    const sx = rand(100, 900);
    const sy = rand(100, 600);

    // 베지어 곡선 제어점 (S자 경로)
    const cp1x = sx + (tx - sx) * (0.2 + Math.random() * 0.2) + rand(-60, 60);
    const cp1y = sy + (ty - sy) * (0.2 + Math.random() * 0.2) + rand(-80, 80);
    const cp2x = sx + (tx - sx) * (0.6 + Math.random() * 0.2) + rand(-60, 60);
    const cp2y = sy + (ty - sy) * (0.6 + Math.random() * 0.2) + rand(-80, 80);

    const steps = rand(20, 32);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      await page.mouse.move(
        bezier(t, sx, cp1x, cp2x, tx),
        bezier(t, sy, cp1y, cp2y, ty)
      );
      await sleep(rand(6, 22));
    }
    await sleep(rand(80, 200));
    await page.mouse.click(tx, ty);
    return true;
  } catch (_) { return false; }
}

async function humanScroll(page, n = null) {
  const times = n ?? rand(2, 5);
  const vp    = page.viewportSize() || { width: 1366, height: 768 };
  for (let i = 0; i < times; i++) {
    // 스크롤 전 마우스를 콘텐츠 쪽으로 이동 (자연스러운 패턴)
    await page.mouse.move(
      rand(Math.round(vp.width * 0.2), Math.round(vp.width * 0.8)),
      rand(Math.round(vp.height * 0.3), Math.round(vp.height * 0.7)),
      { steps: rand(6, 14) }
    ).catch(() => {});
    await sleep(rand(100, 300));

    // 가끔(20%) 위로 조금 스크롤했다가 다시 아래로 (읽기 패턴)
    if (i > 0 && rand(0, 5) === 0) {
      await page.mouse.wheel(0, -rand(40, 100)).catch(() => {});
      await sleep(rand(200, 500));
    }
    await page.mouse.wheel(0, rand(180, 480)).catch(() => {});
    await sleep(rand(350, 950));
  }
  await sleep(rand(300, 700));
}

// 페이지 로딩·대기 중 사람처럼 마우스를 자연스럽게 움직이는 함수
async function humanIdle(page, ms) {
  const duration = ms ?? rand(1200, 3500);
  const end = Date.now() + duration;
  const vp  = page.viewportSize() || { width: 1366, height: 768 };
  while (Date.now() < end) {
    try {
      await page.mouse.move(
        rand(60, vp.width - 60),
        rand(60, vp.height - 60),
        { steps: rand(6, 18) }
      );
    } catch (_) { break; }
    await sleep(rand(300, 900));
  }
}

// 글을 읽는 것처럼 스크롤 + 시선 이동 시뮬레이션
async function humanRead(page) {
  const vp = page.viewportSize() || { width: 1366, height: 768 };
  const readMs = rand(1500, 4500);
  const cx = rand(Math.round(vp.width * 0.25), Math.round(vp.width * 0.75));
  const cy = rand(Math.round(vp.height * 0.3), Math.round(vp.height * 0.65));
  await page.mouse.move(cx, cy, { steps: rand(10, 22) }).catch(() => {});
  await sleep(rand(400, 900));
  const scrollTimes = rand(2, 4);
  for (let i = 0; i < scrollTimes; i++) {
    await page.mouse.wheel(0, rand(70, 200)).catch(() => {});
    await sleep(Math.round(readMs / scrollTimes) + rand(-200, 200));
  }
}

async function humanType(page, text) {
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    // 한글 조합 특성 반영 — 자음/모음 이후 딜레이 약간 짧게
    const delay = /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(char) ? rand(55, 120) : rand(70, 150);
    await page.keyboard.type(char, { delay });

    // 공백/줄바꿈 뒤에는 약간 더 쉬어감 (단어 경계)
    if (char === ' ' || char === '\n') await sleep(rand(60, 180));
    // 불규칙한 미세 정지 (생각하는 척)
    else if (rand(0, 20) < 2) await sleep(rand(150, 500));
  }
  await sleep(rand(80, 200));
}

async function naverTypeInput(page, selector, value) {
  await page.click(selector);
  await sleep(rand(300, 600));
  await page.keyboard.press('Control+a');
  await sleep(rand(100, 200));
  await page.keyboard.press('Backspace');
  await sleep(rand(200, 400));
  for (const char of value) {
    await page.keyboard.type(char, { delay: rand(80, 180) });
    if (rand(0, 10) < 2) await sleep(rand(150, 350));
  }
  await sleep(rand(300, 600));
}

// ── 로그인 ────────────────────────────────────────────────────────────────────
async function isLoggedIn(ctx) {
  try {
    const cookies = await ctx.cookies('https://naver.com');
    return cookies.some(c => c.name === 'NID_AUT' && c.value && c.value.length > 5);
  } catch (_) { return false; }
}

// ── 이상 감지 카운터 ──────────────────────────────────────────────────────────
let _loginRedirectCount = 0;
const MAX_LOGIN_REDIRECTS = 3;

async function doLogin(page) {
  log('  → 로그인 페이지 이동...');
  await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'domcontentloaded' });
  await wait(2500, 4000);
  await page.mouse.move(rand(200, 600), rand(100, 300), { steps: 10 });
  await sleep(rand(400, 800));

  await naverTypeInput(page, '#id', NAVER_ID);
  await wait(800, 1500);
  await naverTypeInput(page, '#pw', NAVER_PW);
  await wait(700, 1300);
  await humanClick(page, '.btn_login').catch(() => page.click('.btn_login'));
  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  await wait(3000, 5000);

  // 로그인 후 캡차 / 2단계 인증 처리 (waitIfCaptcha 통합)
  await waitIfCaptcha(page);
  const authKeys = ['2step', 'tfa', 'authcode', 'safeguard'];
  if (authKeys.some(k => page.url().includes(k))) {
    log('\n⛔ 추가 인증(2단계) 필요! 브라우저에서 처리해주세요. (최대 10분 대기)');
    for (let i = 1; i <= 60; i++) {
      await sleep(10000);
      if (!authKeys.some(k => page.url().includes(k))) {
        log('  ✅ 추가 인증 완료! 이어서 진행합니다.');
        break;
      }
      if (i % 3 === 0) log(`  ⏳ 인증 대기 중... (${i * 10}초 경과)`);
    }
  }
  await wait(2000, 3000);
  const ok = !page.url().includes('nidlogin') && page.url().includes('naver.com');
  if (ok) {
    _loginRedirectCount = 0;
    try {
      await page.context().storageState({ path: COOKIE_FILE });
      log('  💾 세션 쿠키 저장 완료');
    } catch (_) {}
  }
  log(ok ? '  ✅ 로그인 성공!' : '  ⚠️  로그인 상태 불확실');
  return ok;
}

async function ensureLoggedIn(page) {
  if (!(await isLoggedIn(page.context()))) {
    _loginRedirectCount++;
    log(`\n🔄 세션 만료 → 재로그인 시도 (${_loginRedirectCount}/${MAX_LOGIN_REDIRECTS})`);

    if (_loginRedirectCount >= MAX_LOGIN_REDIRECTS) {
      log(`\n⛔ 로그인 페이지가 ${MAX_LOGIN_REDIRECTS}회 연속 등장 — 봇 감지 의심. 자동 중단합니다.`);
      log('   💡 잠시 후 다시 시도하거나, 브라우저에서 수동 로그인 후 재실행해주세요.');
      // 만료된 쿠키 파일 삭제
      try { if (fs.existsSync(COOKIE_FILE)) fs.unlinkSync(COOKIE_FILE); } catch (_) {}
      process.exit(1);
    }
    await doLogin(page);
    await wait(4000, 6000);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ── 시작 대시보드 기능들 ──────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════

// 📊 방문자 통계 확인
async function checkMyBlogStats(page) {
  log('\n📊 [통계] 내 블로그 방문자 확인 중...');
  try {
    await page.goto('https://blog.naver.com/VisitorSelf.naver', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await wait(2000, 3500);

    let found = false;
    for (const frame of [page, ...page.frames()]) {
      const stats = await frame.evaluate(() => {
        const getText = (selector) => document.querySelector(selector)?.textContent?.trim() || '';
        const numMatch = (txt) => txt.match(/[\d,]+/)?.[0] || '';
        // 다양한 선택자 시도
        const todayEl = document.querySelector('.today_count, .today, [class*="today_visitor"], .visitor_today');
        const totalEl = document.querySelector('.total_count, .total, [class*="total_visitor"], .visitor_total');
        return {
          today: numMatch(todayEl?.textContent || ''),
          total: numMatch(totalEl?.textContent || ''),
        };
      }).catch(() => ({ today: '', total: '' }));

      if (stats.today || stats.total) {
        if (stats.today) log(`  → 오늘 방문자: ${stats.today}명`);
        if (stats.total) log(`  → 누적 방문자: ${stats.total}명`);
        // 결과 파일 + stats.json 에 저장
        fs.appendFileSync(RESULT_FILE,
          `[${TODAY}] 방문자 — 오늘: ${stats.today || '?'}명  누적: ${stats.total || '?'}명\n`, 'utf8');
        const s = loadStats();
        s.visitor = { today: stats.today || '-', total: stats.total || '-' };
        s.lastUpdated = TODAY;
        saveStats(s);
        found = true;
        break;
      }
    }
    if (!found) log('  ℹ️  방문자 수를 읽지 못했습니다 (직접 확인: https://blog.naver.com/VisitorSelf.naver)');
  } catch (e) {
    log(`  ⚠️  통계 접근 오류: ${e.message}`);
  }
}

// 💰 애드포스트 상태 확인
async function checkAdPost(page) {
  log('\n💰 [애드포스트] 상태 확인 중...');
  try {
    await page.goto('https://adpost.naver.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await wait(2500, 4000);

    const info = await page.evaluate(() => {
      const body = document.body.innerText || '';
      const approved   = body.includes('운영중') || body.includes('정상') || body.includes('승인완료');
      const pending    = body.includes('심사중') || body.includes('검토중') || body.includes('대기');
      const unapproved = body.includes('미승인') || body.includes('신청하기');
      const revMatch   = body.match(/[\d,]+\s*원/);
      return {
        status:  approved ? '운영중' : pending ? '심사중' : unapproved ? '미승인 (신청 필요)' : '확인 필요',
        revenue: revMatch ? revMatch[0] : '',
      };
    }).catch(() => ({ status: '접근 오류', revenue: '' }));

    const icon = info.status === '운영중' ? '✅' : info.status.includes('심사') ? '🟡' : '❌';
    log(`  ${icon} 애드포스트 상태: ${info.status}`);
    if (info.revenue) log(`  → 수익: ${info.revenue}`);
    if (info.status.includes('미승인')) {
      log('  💡 팁: 포스팅 50개 이상 + 일 방문자 100명 이상이면 신청 가능합니다');
    }
    // stats.json 저장
    const sa = loadStats();
    sa.adpost = { status: info.status, revenue: info.revenue };
    saveStats(sa);
  } catch (e) {
    log(`  ⚠️  애드포스트 접근 오류: ${e.message}`);
  }
}

// 📈 트렌드 키워드 분석 — DataLab 직접 방문 + 쇼핑인사이트
async function getTrendingKeywords(page, deepScan = false) {
  log('\n📈 [트렌드] 네이버 데이터랩 인기 키워드 수집 중...');
  const keywords = [];

  const sub = await page.context().newPage().catch(() => null);
  if (!sub) { log('  ⚠️  새 탭 열기 실패'); return keywords; }

  try {
    // ── ① DataLab 쇼핑인사이트 → 가구/인테리어 카테고리 급상승 키워드 ──────
    log('  🔍 DataLab 쇼핑인사이트 접속 중...');
    await sub.goto('https://datalab.naver.com/shoppingInsight/sCategory.naver', {
      waitUntil: 'domcontentloaded', timeout: 20000,
    });
    // 페이지 읽는 척 (사람처럼)
    await sleep(rand(2000, 3500));
    await humanScroll(sub, 2);
    await sleep(rand(1000, 2000));

    // 카테고리 선택: 가구/인테리어
    const catBtns = [
      'button:has-text("가구/인테리어")',
      'label:has-text("가구/인테리어")',
      '[class*="select"] option[value*="50000004"]',
      'a:has-text("가구/인테리어")',
    ];
    for (const sel of catBtns) {
      const el = await sub.$(sel).catch(() => null);
      if (el) {
        await el.click().catch(() => {});
        log('  → 가구/인테리어 카테고리 선택');
        await sleep(rand(800, 1500));
        break;
      }
    }

    // 조회하기 버튼 클릭
    const submitBtns = [
      'button:has-text("조회하기")',
      'button:has-text("조회")',
      '.btn_submit',
      'input[type="submit"]',
      'button[class*="submit"]',
      'button[class*="search"]',
    ];
    for (const sel of submitBtns) {
      const el = await sub.$(sel).catch(() => null);
      if (el) {
        await el.click().catch(() => {});
        log('  → 조회 버튼 클릭');
        await sleep(rand(3000, 5000));   // 결과 로딩 대기
        break;
      }
    }

    // 키워드 랭킹 추출 (다양한 셀렉터)
    const dlKws = await sub.evaluate(() => {
      const sels = [
        '.rank_item .item_title',
        '.rank_item .keyword',
        '[class*="rank_item"] [class*="title"]',
        '[class*="rank_item"] [class*="keyword"]',
        '[class*="rankItem"] [class*="keyword"]',
        '[class*="keyword_rank"] span',
        '.lst_rank li .keyword',
        '[class*="ranking"] [class*="text"]',
        '[class*="chart"] [class*="keyword"]',
        'ol li [class*="keyword"]',
        'ol li span:not([class*="rank"]):not([class*="num"])',
      ];
      for (const sel of sels) {
        const els = [...document.querySelectorAll(sel)];
        const kws = els.map(e => e.innerText?.replace(/\d+/g, '').trim())
                       .filter(t => t && t.length > 1 && t.length < 25 && !/^[\d\s]+$/.test(t));
        if (kws.length >= 3) return kws.slice(0, 20);
      }
      // 마지막 수단: 모든 텍스트에서 리빙/인테리어 관련 키워드 찾기
      const allText = document.body.innerText;
      const matches = allText.match(/[가-힣]{2,15}(?:인테리어|리빙|홈|가구|소파|침대|조명|커튼|러그|수납)/g) || [];
      return [...new Set(matches)].slice(0, 15);
    }).catch(() => []);

    if (dlKws.length >= 3) {
      log(`  ✅ DataLab 키워드 ${dlKws.length}개: ${dlKws.slice(0, 6).join(', ')}`);
      keywords.push(...dlKws);
    } else {
      log('  ℹ️  DataLab 파싱 미흡 — 쇼핑인사이트 폴백 시도...');
    }

    // ── ② 폴백: 네이버 쇼핑 베스트 리빙 카테고리 ────────────────────────────
    if (keywords.length < 5) {
      await sub.goto('https://shopping.naver.com/home-lives/categories/home-lives', {
        waitUntil: 'domcontentloaded', timeout: 15000,
      }).catch(() => {});
      await sleep(rand(2000, 3000));
      await humanScroll(sub, 2);

      const shopKws = await sub.evaluate(() => {
        const sels = [
          '[class*="keyword"]', '[class*="category_name"]', '[class*="item_name"]',
          '[class*="tag"] a', '[class*="bestItem"] strong', 'h3[class*="title"]',
          '[class*="popular"] span', 'a[class*="link"] strong',
        ];
        const found = new Set();
        for (const sel of sels) {
          [...document.querySelectorAll(sel)].forEach(el => {
            const t = el.innerText?.trim();
            if (t && t.length > 1 && t.length < 20 && !/^[\d\s,원]+$/.test(t)) found.add(t);
          });
        }
        return [...found].slice(0, 20);
      }).catch(() => []);

      if (shopKws.length >= 3) {
        log(`  ✅ 쇼핑 베스트 키워드 ${shopKws.length}개 추가`);
        keywords.push(...shopKws);
      }
    }

    // ── ③ 자동완성 연관어 (항상 보충) ───────────────────────────────────────
    for (const niche of NICHES.slice(0, 3)) {
      try {
        await sub.goto(
          `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(niche)}&r_format=json&r_enc=UTF-8&st=100`,
          { waitUntil: 'domcontentloaded', timeout: 8000 }
        );
        await sleep(rand(500, 1000));
        const raw  = await sub.evaluate(() => document.body.innerText).catch(() => '');
        const data = JSON.parse(raw);
        const kws  = (data.items?.[0] || []).map(i => i[0]).filter(Boolean).slice(0, 4);
        if (kws.length) {
          log(`  "${niche}" 연관어: ${kws.join(', ')}`);
          keywords.push(...kws);
        }
      } catch (_) {}
      await sleep(rand(700, 1400));
    }

  } catch (e) {
    log(`  ⚠️  트렌드 수집 오류: ${e.message}`);
  } finally {
    await sub.close().catch(() => {});
  }

  const unique = [...new Set(keywords)].filter(k => k.length > 1);
  if (unique.length) {
    log(`  → 트렌드 키워드 총 ${unique.length}개 확보`);
    const st = loadStats(); st.trending = unique; st.trendDate = TODAY; saveStats(st);
  } else {
    log('  → 트렌드 데이터 없음 (기본 키워드로 진행)');
  }
  return unique;
}

// 🔍 내 최근 포스팅 SEO 분석
async function analyzeMyBlogSEO(page) {
  log('\n🔍 [SEO 분석] 내 최근 포스팅 품질 검사 중...');
  try {
    await page.goto(`https://blog.naver.com/${MY_BLOG}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await wait(2500, 4000);
    await humanScroll(page);

    let postLinks = [];
    for (const frame of [page, ...page.frames()]) {
      const links = await frame.evaluate(() =>
        [...document.querySelectorAll('a[href*="PostView"], a[href*="/post/"]')]
          .map(a => a.href).filter(Boolean).slice(0, 3)
      ).catch(() => []);
      if (links.length) { postLinks = links; break; }
    }

    if (!postLinks.length) { log('  ℹ️  분석할 포스팅을 찾지 못했습니다'); return; }

    let analyzed = 0;
    for (const url of postLinks.slice(0, 2)) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await wait(2000, 3500);

        let title = '', content = '', tags = [];
        for (const frame of [page, ...page.frames()]) {
          const d = await frame.evaluate(() => {
            const t  = document.querySelector('.se-title-text, .pcol1, h3.title')?.innerText?.trim() || '';
            const c  = document.querySelector('.se-main-container, .post_body, #postListBody')?.innerText?.trim() || '';
            const tg = [...document.querySelectorAll('.tag, .se-hash-tag, a[href*="tag"]')]
                         .map(el => el.textContent.trim()).filter(Boolean);
            return { t, c, tg };
          }).catch(() => ({ t: '', c: '', tg: [] }));
          if (d.t || d.c) { title = d.t; content = d.c; tags = d.tg; break; }
        }

        const seo = checkSEO(title, content, tags);
        log(`\n  📝 포스팅: ${(title || url).substring(0, 40)}`);
        log(`  SEO 점수: ${seo.score} ${seo.grade}`);
        if (seo.issues.length) seo.issues.forEach(iss => log(`    ⚠️  ${iss}`));
        else                   log('    ✅ 모든 SEO 조건 통과!');

        // stats.json 저장
        const ss = loadStats();
        if (!Array.isArray(ss.seo)) ss.seo = [];
        // 같은 URL 이면 갱신, 없으면 추가 (최대 10개 유지)
        const idx = ss.seo.findIndex(e => e.url === url);
        const entry = { url, title: (title || url).substring(0, 40), score: seo.score, grade: seo.grade.replace(/[^\w\s가-힣]/g, '').trim(), issues: seo.issues, date: TODAY };
        if (idx >= 0) ss.seo[idx] = entry; else ss.seo.unshift(entry);
        ss.seo = ss.seo.slice(0, 10);
        saveStats(ss);

        // 쿠팡 파트너스 링크 제안
        if (COUPANG_ID && title) {
          const kw   = title.replace(/리뷰|후기|추천|정보|비교|사용|구매/g, '').trim().substring(0, 15);
          const link = makeCoupangLink(kw);
          if (link) log(`  🛒 쿠팡 파트너스 링크 제안: ${link}`);
        }

        analyzed++;
        await wait(2000, 3500);
      } catch (e) { log(`  ⚠️  포스팅 분석 오류: ${e.message}`); }
    }
    log(`\n  → ${analyzed}개 포스팅 SEO 분석 완료\n`);
  } catch (e) {
    log(`  ⚠️  SEO 분석 오류: ${e.message}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ── 글쓰기 모드 ────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════

// ── 캡차 / 보안문자 감지 + 사용자 해결 대기 ─────────────────────────────────
// 캡차가 감지되면 로그 출력 후 해결될 때까지 자동 대기 (최대 10분)
// 해결되면 true 반환, 캡차 없으면 false 반환
async function waitIfCaptcha(page, { fatal = true } = {}) {
  // 캡차/보안 인증 감지 신호들
  async function detectCaptcha() {
    try {
      // 1) URL 기반 감지
      const url = page.url();
      if (url.includes('captcha') || url.includes('safeguard') || url.includes('security')) return true;

      // 2) DOM + 텍스트 기반 감지
      const found = await page.evaluate(() => {
        const text = (document.body?.innerText || '').replace(/\s+/g, ' ');

        // 쇼핑 접속 제한 페이지는 캡차가 아니므로 제외 (fetchProductInfo에서 별도 처리)
        const shopBlockTexts = ['쇼핑 서비스 접속이 일시적으로 제한', '비정상적인 접근이 감지'];
        if (shopBlockTexts.some(t => text.includes(t))) return false;

        const captchaTexts = [
          '사진 속 글자', '자동입력 방지', '보안문자', '자동 입력 방지',
          '캡차', 'captcha', 'CAPTCHA', '문자 입력', '글자를 입력',
          '그림 속', '이미지 속', '숫자를 입력', '보안 코드',
        ];
        if (captchaTexts.some(t => text.includes(t))) return true;

        // 3) DOM 엘리먼트 감지
        const selectors = [
          '#captcha_container', '[id*="captcha"]', '[class*="captcha"]',
          'img[alt*="자동입력"]', 'img[alt*="보안"]',
          '[class*="securityCode"]', '[id*="securityCode"]',
          'iframe[src*="recaptcha"]', 'iframe[src*="captcha"]',
        ];
        return selectors.some(sel => !!document.querySelector(sel));
      }).catch(() => false);

      return found;
    } catch (_) { return false; }
  }

  const detected = await detectCaptcha();
  if (!detected) return false;

  // ── 캡차 감지됨 — 사용자에게 알림 후 대기 ──────────────────────────────
  log('\n' + '═'.repeat(50));
  log('⛔  캡차(보안문자) 감지!');
  log('   브라우저에서 사진 속 글자를 직접 입력해주세요.');
  log('   해결하시면 자동으로 이어서 진행합니다...');
  log('   (최대 10분 대기)');
  log('═'.repeat(50));

  // 10분(60회 × 10초) 동안 10초마다 체크
  for (let i = 1; i <= 60; i++) {
    await sleep(10000);

    // 페이지 연결 유효성 먼저 확인
    let pageAlive = true;
    try { await page.url(); } catch (_) { pageAlive = false; }
    if (!pageAlive) {
      log('\n⚠️  브라우저 탭이 닫혔습니다. 새 탭으로 복구 시도...');
      try {
        await page.goto('https://www.naver.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
        log('✅ 네이버로 복구 완료. 이어서 진행합니다.');
        await wait(2000, 3000);
        return true;
      } catch (_) {
        if (fatal) {
          log('❌ 복구 실패 — 실행을 종료합니다.');
          process.exit(1);
        } else {
          throw new Error('sub page died — 수집 탭이 닫혔습니다');
        }
      }
    }

    const stillCaptcha = await detectCaptcha();
    if (!stillCaptcha) {
      log('\n✅ 캡차 해결 확인! 이어서 자동 진행합니다...\n');
      await wait(2000, 3000);   // 해결 후 잠깐 안정화
      return true;
    }
    if (i % 3 === 0) log(`  ⏳ 캡차 대기 중... (${i * 10}초 경과)`);
  }

  log('  ⚠️  캡차 대기 10분 초과. 계속 진행 시도합니다.');
  return true;
}

// ── 네이버 쇼핑 상품 정보 수집 (검색창 직접 타이핑 방식 — 봇 감지 최소화) ────
async function fetchProductInfo(page, keyword) {
  log(`  🛍️  "${keyword}" 상품 정보 수집 중...`);

  // 새 탭으로 실행 → main page 보호
  let sub = null;
  let ownSub = false;
  try {
    sub = await page.context().newPage();
    ownSub = true;
  } catch (_) {
    sub = page;
  }

  let result = null;
  try {
    // ① 네이버 메인으로 이동 (사람이 브라우저 여는 것처럼)
    await sub.goto('https://www.naver.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await humanRead(sub);
    await sleep(rand(800, 1600));

    // ② 검색창 찾기 + 클릭
    const searchSels = [
      'input#query',
      'input[name="query"]',
      '.search_input input',
      '#NM_FAVORITE input[type="text"]',
      'form[name="searchForm"] input[type="text"]',
    ];
    let searchBox = null;
    for (const sel of searchSels) {
      searchBox = await sub.$(sel).catch(() => null);
      if (searchBox) break;
    }
    if (!searchBox) throw new Error('네이버 검색창을 찾지 못했습니다');

    // 검색창 위로 마우스 자연스럽게 이동 후 클릭
    const sb = await searchBox.boundingBox().catch(() => null);
    if (sb) {
      await sub.mouse.move(
        sb.x + rand(20, Math.max(21, sb.width - 20)),
        sb.y + rand(3,  Math.max(4,  sb.height - 3)),
        { steps: rand(8, 18) }
      );
      await sleep(rand(150, 400));
    }
    await searchBox.click();
    await sleep(rand(300, 700));

    // ③ 키워드 한 글자씩 타이핑 (사람처럼)
    await humanType(sub, keyword);
    await sleep(rand(400, 900));

    // ④ Enter — 통합검색 결과 페이지로 이동
    await sub.keyboard.press('Enter');
    await sub.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
    await humanRead(sub);
    await sleep(rand(1000, 2000));

    // ⑤ 쇼핑 탭 클릭 (여러 셀렉터 시도)
    const shoppingTabSels = [
      'a[data-tab="shopping"]',
      '.tab_area a:has-text("쇼핑")',
      '.flicking-panel a:has-text("쇼핑")',
      '.tab-nav a:has-text("쇼핑")',
      '#tab_shopping a',
      'a[title="쇼핑"]',
      'a.tab:has-text("쇼핑")',
      '[class*="tab"] a:has-text("쇼핑")',
      'a[href*="search.shopping.naver.com"]:not([href*="ad"])',
    ];
    let shoppingTab = null;
    for (const sel of shoppingTabSels) {
      shoppingTab = await sub.$(sel).catch(() => null);
      if (shoppingTab) break;
    }

    if (shoppingTab) {
      await shoppingTab.scrollIntoViewIfNeeded().catch(() => {});
      await sleep(rand(200, 500));
      await shoppingTab.click();
      await sub.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
      await humanRead(sub);
      await sleep(rand(1200, 2200));
      log(`  → 쇼핑 탭 진입 완료`);
    } else {
      // 탭 못 찾으면 검색 결과에서 쇼핑 섹션 URL로 직접 이동 (최후 수단)
      log(`  → 쇼핑 탭 미발견 — 쇼핑 검색으로 직접 이동`);
      await sub.goto(
        `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(keyword)}`,
        { waitUntil: 'domcontentloaded', timeout: 20000 }
      );
      await sleep(rand(1000, 2000));
    }

    // ⑥ 캡차 / 차단 감지
    await waitIfCaptcha(sub, { fatal: false });

    const isBlocked = await sub.evaluate(() => {
      const t = (document.body?.innerText || '').replace(/\s+/g, ' ');
      return t.includes('쇼핑 서비스 접속이 일시적으로 제한') ||
             t.includes('비정상적인 접근이 감지') ||
             t.includes('접속을 일시적으로 제한');
    }).catch(() => false);
    if (isBlocked) {
      log('  ⛔  [쇼핑 차단] IP 제한 감지 → 키워드 기반으로 대체합니다');
      return null;
    }

    // ⑦ 스크롤 + 상품 추출 (구조 기반 — 클래스명 난독화에 강건)
    await humanScroll(sub);
    await sleep(rand(800, 1400));

    const products = await sub.evaluate(() => {
      // ── 전략 A: 클래스 부분 매칭 (현재 네이버 쇼핑 CSS 모듈 패턴) ─────────
      const CLASS_SELS = [
        '[class*="basicList_item"]',
        '[class*="product_item"]',
        '[class*="goods_item"]',
        '[class*="ProductCard"]',
        '[class*="productCard"]',
        '[class*="item_product"]',
        '[class*="search_item"]',
      ].join(',');

      let cards = [...document.querySelectorAll(CLASS_SELS)]
        .filter(el => el.clientWidth > 120 && el.clientHeight > 120);

      // ── 전략 B: 구조 기반 (img + 가격 + 링크를 동시에 포함하는 컨테이너) ───
      if (cards.length === 0) {
        const allLi = [...document.querySelectorAll('li, article')];
        cards = allLi.filter(el => {
          if (el.clientWidth < 120 || el.clientHeight < 120) return false;
          const hasImg   = el.querySelector('img[src]');
          const hasPrice = /[\d,]{4,}\s*원/.test(el.innerText || '');
          const hasLink  = el.querySelector('a[href]');
          return hasImg && hasPrice && hasLink;
        });
      }

      const results = [];
      for (const card of cards.slice(0, 15)) {
        // 상품명: 앵커/헤딩 중 가장 긴 의미있는 텍스트
        const nameEl = [...card.querySelectorAll('a[href], strong, h2, h3')]
          .find(e => {
            const t = (e.innerText || '').trim();
            return t.length > 3 && t.length < 120 && !/^[\d,\s원]+$/.test(t) && !/배송|무료|리뷰|평점/.test(t);
          });
        const name = nameEl?.innerText?.trim();
        if (!name) continue;

        // 가격: NN,NNN 또는 NNN,NNN 패턴
        const priceMatch = (card.innerText || '').match(/[\d,]{4,}(?=\s*원)/);
        const price = priceMatch ? priceMatch[0] : '';

        // 이미지: phinf.pstatic > 그 외 src
        const imgEl = card.querySelector('img[src*="phinf.pstatic"]')
                   || card.querySelector('img[src*="shopping"]')
                   || card.querySelector('img[src]');
        const imageUrl = imgEl?.src || imgEl?.dataset?.src || '';

        // 평점: N.N 패턴
        const ratingMatch = (card.innerText || '').match(/[1-5]\.[0-9]/);
        const rating = ratingMatch?.[0] || '';

        // 리뷰수: '리뷰 N개' 또는 숫자+개 패턴
        const reviewMatch = (card.innerText || '').match(/(?:리뷰|후기|평가)\s*([\d,]+)|^\s*([\d,]+)\s*개/m);
        const reviews = reviewMatch ? (reviewMatch[1] || reviewMatch[2] || '') : '';

        // 브랜드/스토어명
        const brandEl = card.querySelector('[class*="brand"], [class*="mall"], [class*="seller"], [class*="merchant"]');
        const brand = brandEl?.innerText?.trim() || '';

        // 태그/특징
        const tagEls = card.querySelectorAll('[class*="tag"], [class*="badge"], [class*="label"], [class*="attr"]');
        const tags = [...tagEls].map(t => t.innerText.trim()).filter(t => t.length > 1 && t.length < 20).slice(0, 5);

        const delivery = card.querySelector('[class*="delivery"], [class*="ship"]')?.innerText?.trim() || '';

        results.push({ name, price, rating, reviews, imageUrl, brand, tags, delivery });
        if (results.length >= 6) break;
      }
      return results;
    }).catch(() => []);

    if (products.length > 0) {
      const scored = products.map(p => ({
        ...p,
        _score: (p.name ? 2 : 0) + (p.price ? 2 : 0) + (p.rating ? 2 : 0)
              + (p.reviews ? 3 : 0) + (p.imageUrl ? 1 : 0) + (p.brand ? 1 : 0)
              + (p.tags?.length ? 1 : 0),
      }));
      scored.sort((a, b) => b._score - a._score);
      const best        = scored[0];
      const extraImages = scored.slice(1, 5).map(p => p.imageUrl).filter(u => u && u !== best.imageUrl);
      log(`  → 상품: ${best.name.substring(0, 30)} | ${best.price ? best.price + '원' : '-'} | ⭐${best.rating || '?'} | 리뷰 ${best.reviews || '?'}개`);
      if (best.brand)      log(`  → 브랜드: ${best.brand}`);
      if (best.tags?.length) log(`  → 특징 태그: ${best.tags.join(' / ')}`);
      if (extraImages.length) log(`  → 중간 삽입용 이미지 ${extraImages.length}개 추가 수집`);
      result = { ...best, extraImages };
    }

  } catch (e) {
    log(`  ⚠️  쇼핑 수집 오류: ${e.message}`);
  } finally {
    if (ownSub) await sub.close().catch(() => {});
  }

  if (!result) log('  → 상품 정보 수집 실패 — 키워드 기반으로 생성합니다');
  return result;
}

// ── AI 블로그 생성 (pollinations.ai 텍스트 API — 완전 무료, 키 불필요) ──────────
// https://text.pollinations.ai/ — GPT-4o-mini / Gemini 모델 무료 제공
async function generateBlogPostAI(keyword, product) {
  const name   = product?.name  || keyword;
  const price  = product?.price ? Number((product.price || '').replace(/,/g, '')).toLocaleString() + '원' : '';
  const rating = product?.rating || '';
  const brand  = product?.brand  || '';
  const tags   = (product?.tags  || []).join(', ');

  const productInfo = [
    price  && `가격: ${price}`,
    rating && `평점: ${rating}점`,
    brand  && `브랜드: ${brand}`,
    tags   && `특징: ${tags}`,
  ].filter(Boolean).join(' | ');

  const systemMsg = '당신은 대한민국 네이버 파워블로거입니다. 요청한 JSON 형식만 반환하세요. 마크다운 코드블록 없이 순수 JSON만 출력하세요.';
  const userMsg = `아래 상품/키워드에 대한 솔직한 개인 사용 후기 블로그 글을 작성해주세요.

키워드: ${keyword}
상품명: ${name}
${productInfo ? '상품 정보: ' + productInfo : ''}

【작성 조건】
- 말투: 편안한 구어체 (안녕하세요~, ~했어요, ~더라고요, ~거든요)
- 분량: 최소 2500자 이상
- 구성:
  1. 도입 + 구매 계기 (약 250자)
  [[IMG_MARKER_1]]
  2. 개봉기 + 첫인상 (약 600자)
  [[IMG_MARKER_2]]
  3. 실제 사용 경험 + 장단점 솔직하게 (약 700자)
  [[IMG_MARKER_3]]
  4. 가격 비교 + 추천 대상 + 마무리 (약 500자)
- [[IMG_MARKER_1]], [[IMG_MARKER_2]], [[IMG_MARKER_3]] 태그를 본문 해당 위치에 반드시 삽입
- SEO: 키워드 "${keyword}"를 제목과 본문에 자연스럽게 5회 이상 포함
- 광고처럼 느껴지지 않게, 단점도 솔직하게 2가지 이상 포함
- 이모지 적절히 사용 (😊 🙂 💡 🛒 ⭐ 등)

【출력 형식 — 순수 JSON만, 다른 텍스트 없음】
{"title":"제목","body":"본문전체(마커포함)","hashtags":"#태그1 #태그2 #태그3 #태그4 #태그5"}`;

  try {
    log('  🤖 AI로 블로그 글 생성 중... (최대 30초 소요)');

    const body = JSON.stringify({
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user',   content: userMsg   },
      ],
      model:       'openai',    // GPT-4o-mini (무료)
      seed:        rand(1, 9999),
      jsonMode:    true,
      private:     true,
    });

    const raw = await new Promise((resolve, reject) => {
      const req = require('https').request({
        hostname: 'text.pollinations.ai',
        path:     '/',
        method:   'POST',
        headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout:  50000,
      }, res => {
        if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end',  ()  => resolve(Buffer.concat(chunks).toString('utf8')));
      });
      req.on('error',   reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.write(body);
      req.end();
    });

    // JSON 추출 (가끔 앞뒤에 텍스트가 붙을 수 있음)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSON 파싱 실패');
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.title || !parsed.body) throw new Error('필드 누락');

    log(`  ✅ AI 글 생성 완료 — ${parsed.body.replace(/\[\[.*?\]\]/g, '').length}자`);
    return {
      title:     parsed.title,
      body:      parsed.body,
      hashtags:  parsed.hashtags || `#${keyword} #리빙 #홈리빙 #생활용품 #추천`,
      imageUrls: product?.extraImages || (product?.imageUrl ? [product.imageUrl] : []),
    };
  } catch (e) {
    log(`  ⚠️  AI 생성 실패 (${e.message}) — 템플릿 방식으로 폴백`);
    return null;
  }
}

// ── 블로그 포스팅 생성 v3 (고품질 · 1800자 보장 · 브랜드/비교 섹션 포함) ─────────
function generateBlogPost(keyword, product) {
  const name    = product?.name || keyword;
  const price   = product?.price ? Number(product.price.replace(/,/g, '')).toLocaleString() + '원' : '';
  const rating  = product?.rating || '';
  const reviews = product?.reviews ? Number(product.reviews.replace(/,/g, '')).toLocaleString() + '개' : '';
  const brand   = product?.brand  || '';
  const prodTags = product?.tags  || [];   // 쇼핑에서 수집한 상품 특징 태그

  const periods  = ['2주', '한 달', '두 달', '3개월', '약 한 달', '6주', '한 달 반', '거의 두 달', '3주', '5주'];
  const period   = periods[rand(0, periods.length)];
  const buyPlaces = ['쿠팡', '11번가', '네이버 쇼핑', '지마켓', '옥션', 'SSG.COM', '무신사 홈리빙'];
  const buyPlace  = buyPlaces[rand(0, buyPlaces.length)];
  const usageTimes = ['아침마다', '매일 아침', '주 3~4회', '주말마다', '퇴근 후', '요리할 때마다', '청소할 때', '매일 저녁'];
  const usageTime  = usageTimes[rand(0, usageTimes.length)];
  const month  = new Date().getMonth() + 1;
  const year   = new Date().getFullYear();
  const season = month >= 3 && month <= 5 ? '봄' : month >= 6 && month <= 8 ? '여름' : month >= 9 && month <= 11 ? '가을' : '겨울';

  // 가격대 분류 (비교 섹션에서 활용)
  const priceNum = product?.price ? Number(product.price.replace(/,/g, '')) : 0;
  const priceTier = priceNum === 0 ? '중가형' : priceNum < 20000 ? '저가형' : priceNum < 80000 ? '중가형' : '고급형';

  // ── 카테고리 감지 ────────────────────────────────────────────────────────────
  const catMap = [
    [['주방','냄비','프라이팬','컵','접시','수저','도마','칼','그릇','조리','주전자'], '주방용품'],
    [['청소','진공','청소기','걸레','빗자루','먼지','세제','청소포','걸레포'], '청소용품'],
    [['수납','정리','박스','서랍','선반','바구니','트레이','수납함','정리함'], '수납정리'],
    [['인테리어','소품','쿠션','캔들','조명','디퓨저','액자','화분','아로마','향초'], '홈데코'],
    [['가전','전자','공기청정기','세탁','냉장','에어컨','로봇','블루투스'], '가전제품'],
    [['침구','이불','베개','매트리스','토퍼','패드','침대'], '침구류'],
  ];
  let category = '리빙';
  for (const [keys, cat] of catMap) {
    if (keys.some(k => name.includes(k) || keyword.includes(k))) { category = cat; break; }
  }

  // ── 제목 (12가지) ────────────────────────────────────────────────────────────
  const titles = [
    `${name} 솔직 후기 | ${period} 써보고 이것만 말할게요`,
    `${keyword} 고민이라면? ${name} 직접 ${period} 써봤어요`,
    `${name} 진짜 사도 괜찮을까? ${period} 실사용 후기 장단점 정리`,
    `${keyword} 추천 | ${name} 써보고 솔직하게 정리했어요`,
    `${name} ${period} 사용 후기 — 이 가격에 이 퀄리티 맞나요?`,
    `${period} 쓴 ${name} 솔직 리뷰 — 후회 없는 선택이었을까요?`,
    `${name} 구매 전에 이것만 읽어보세요 (${period} 실사용 후기)`,
    `${keyword} 뭐 살지 고민이라면 — ${name} ${period} 실제 사용기`,
    `${season}에 쓰기 딱 좋은 ${keyword} | ${name} ${period} 후기`,
    `${buyPlace}에서 산 ${name} ${period} 써보니 진짜 어때요?`,
    `${name} ${year}년 솔직 후기 — 지금 사도 될까요?`,
    `${keyword} 가성비 추천 | ${name} ${period} 사용하며 느낀 모든 것`,
  ];
  const title = titles[rand(0, titles.length)];

  // ── 도입부 + 구매 배경 (12가지 · 각 250자 이상) ───────────────────────────────
  const intros = [
    `안녕하세요~ 오늘은 제가 ${period}째 쓰고 있는 ${name} 후기를 솔직하게 얘기해 보려고요!\n\n사실 이거 사기 전에 진짜 고민 많이 했거든요. ${keyword} 관련 제품들을 한 두 달 동안 계속 찾아봤는데, 비슷한 가격대 제품이 워낙 많아서 뭘 사야 할지 모르겠더라고요ㅠ 그러다가 ${name}을 발견했는데 리뷰 개수도 많고 평점도 괜찮아서 결국 질러버렸어요ㅎㅎ\n\n지금은 잘 쓰고 있는데, 살 때 이런 정보가 있었으면 결정이 더 빨랐을 것 같아서 후기 남겨요. 구매 고민 중인 분들한테 도움이 됐으면 좋겠어요!`,

    `안녕하세요~ 요즘 ${keyword} 관련 포스팅을 열심히 찾아보고 있는데요, 마땅한 후기가 없어서 직접 사서 써봤어요!\n\n저는 ${category} 쪽 제품에 꽤 관심이 많은 편이라 이것저것 많이 써봤거든요. 이번에 ${name}도 구매해서 ${period} 동안 꼼꼼하게 써봤는데, 생각보다 좋은 부분도 있고 아쉬운 부분도 있어서 솔직하게 정리해볼게요.\n\n광고성 후기가 많은 시대에 진짜 쓴 사람 입장에서 최대한 객관적으로 써볼게요. 끝까지 읽어주시면 구매 결정하는 데 분명히 도움 될 거예요!`,

    `안녕하세요~ 드디어 ${name} 후기 올려요!\n\n사실 이거 주문하고 나서 한 보름은 '진짜 잘 산 건지' 계속 궁금했거든요ㅎㅎ 왜냐하면 가격이 저한테는 살짝 부담스러운 편이었거든요. 근데 지금은 완전 만족이에요.\n\n${buyPlace}에서 구매했고, ${price ? `가격은 ${price}였어요.` : '가격은 지금 검색해보시면 나와요.'} ${period} 쓰면서 느낀 점들을 시간 순서대로 정리해볼게요! 사기 전에 궁금하셨던 부분들 위주로 다뤄볼게요.`,

    `안녕하세요~ 오늘은 리빙 제품 리뷰인데요, ${name} 드디어 후기 올려요!\n\n집에 ${keyword}이 필요했는데 너무 선택지가 많아서 한참 고민했어요. 인스타에서 많이 보이는 것들, 유튜브 리뷰 있는 것들, 블로그 후기 있는 것들 다 찾아봤는데 결국 제가 직접 써봐야 알겠다 싶어서 ${name} 선택했거든요.\n\n${period} 쓰고 이제 뭔가 할 말이 생겼어요ㅎㅎ 좋은 점 아쉬운 점 다 솔직하게 말씀드릴게요. 같은 고민하시는 분들한테 도움 됐으면 좋겠어요!`,

    `안녕하세요~ ${season}이라 ${keyword} 관련 제품을 많이 들여다보고 있어요!\n\n그중에서 제가 최종 선택한 게 ${name}인데요. 고르는 데 진짜 오래 걸렸어요. ${buyPlace} 기준으로 비슷한 제품들 다 비교해보고 최종 선택했거든요ㅎㅎ 가격, 리뷰 수, 브랜드 신뢰도까지 꼼꼼하게 따져봤어요.\n\n어떤 점이 마음에 들었는지, 쓰면서 아쉬운 건 없었는지 솔직하게 적어볼게요. ${rating ? `평점 ${rating}이 진짜인지도 직접 확인해봤어요!` : ''}`,

    `안녕하세요~ 오늘은 꽤 오래 고민하다 구매한 ${name} 후기예요!\n\n${keyword} 찾다가 발견했는데, 솔직히 처음엔 리뷰가 너무 좋아서 오히려 의심했어요. 광고성 후기가 많은 경우도 있잖아요ㅠ 그래서 더 꼼꼼하게 리뷰를 살펴보고, Q&A도 읽어보고, 유사 제품들이랑 비교도 해봤어요.\n\n그렇게 고민하다 구매한 거라 ${period} 써보면서 더 냉정하게 평가해봤어요. 구매 전에 궁금하실 만한 거 다 얘기해볼게요!`,

    `안녕하세요~ 오늘은 솔직 후기 들고 왔어요!\n\n${name}인데요. 처음에 살까 말까 엄청 고민했거든요. 가격도 그렇고 진짜 필요한 건지도 모르겠고. 근데 지금은 왜 이걸 이제 샀지 싶어요ㅎㅎ\n\n저는 새 제품 살 때 꼭 두 달은 써보고 후기 남기는 편이에요. 처음 한 달은 막 좋아 보여도 익숙해지면 별로일 수 있거든요. ${period} 쓰면서 달라진 점들이랑 느낀 점들 솔직하게 적어볼게요!`,

    `안녕하세요~ ${period} 전부터 ${name}을 쓰고 있는데요, 이제 좀 써봤다 싶어서 후기 남겨요!\n\n솔직히 처음엔 반신반의하면서 샀는데 생각보다 훨씬 잘 쓰고 있어요. 특히 ${category} 쪽 제품을 많이 찾아보는 분들한테 도움이 됐으면 해서 자세하게 적어볼게요.\n\n저는 같은 카테고리 제품을 꽤 많이 써봤어요. 그래서 비교 기준이 있는 편이에요. 그런 제가 ${name}을 어떻게 평가했는지 솔직하게 얘기해볼게요!`,
  ];
  const intro = intros[rand(0, intros.length)];

  // ── 제품 정보 블록 ────────────────────────────────────────────────────────────
  const infoLines = [
    price   && `💰 구매가: ${price}`,
    rating  && `⭐ 평점: ${rating}점`,
    reviews && `💬 리뷰 수: ${reviews}`,
    `🛒 구매처: ${buyPlace}`,
    `📦 카테고리: ${category}`,
    `📅 사용 기간: ${period}`,
  ].filter(Boolean);
  const infoBlock = `📋 제품 기본 정보\n\n${infoLines.join('\n')}`;

  // ── 첫인상 / 개봉기 (8가지 · 각 200자 이상) ──────────────────────────────────
  const firstImpressions = [
    `✨ 처음 받아봤을 때\n\n택배 왔을 때 포장 상태가 꽤 탄탄했어요. 뽁뽁이랑 박스 포장이 꼼꼼하게 되어 있어서 배송 중에 긁히거나 한 게 없었고요.\n\n실물을 꺼내봤을 때 첫 느낌은 '어 사진이랑 비슷하네'였어요. 온라인으로 사면 실물이 다른 경우가 있잖아요ㅠ 근데 이건 색감이나 크기가 딱 예상했던 대로였어요.\n\n소재 느낌도 직접 만져보니까 가격 대비 나쁘지 않았어요. 처음 쓰는 날 '아 이게 이렇게 쓰는 거구나' 하고 바로 감이 왔고, 별도의 설명서 없이도 직관적으로 사용할 수 있었어요.`,

    `✨ 개봉 + 첫 사용 느낌\n\n배송은 주문하고 이틀 만에 왔어요. 포장이 깔끔해서 선물받은 느낌 나는 박스였어요ㅎㅎ\n\n꺼내보니까 생각보다 크기가 딱 좋았어요. 사진으로 볼 때는 감이 잘 안 오는데 실물이 더 괜찮았달까요. 무게도 적당해서 다루기 편했고요.\n\n처음 써봤을 때 약간 익숙하지 않은 느낌이 있었는데, 그게 딱 이틀 정도? 일주일도 안 지나서 완전히 적응됐어요. 지금은 너무 자연스럽게 쓰고 있어요.`,

    `✨ 첫인상 솔직하게\n\n받자마자 '아 이거 잘 샀다' 싶은 느낌이 들었어요. 이런 느낌은 솔직히 흔치 않거든요ㅎㅎ 보통은 '어 생각보다 별로인데?' 또는 '음 뭐 쓸만하네' 정도인데, 이건 처음부터 좋았어요.\n\n마감 처리가 깔끔했고, 소재도 가격을 생각하면 충분히 납득되는 수준이었어요. 특히 디자인이 우리 집 인테리어랑 잘 어울리는 게 마음에 들었어요.\n\n집에 두면 예쁠 것 같아서 사진도 찍어뒀을 정도예요ㅎㅎ 실물이 사진보다 훨씬 예쁜 경우였어요.`,

    `✨ 구매 결정 과정이랑 첫인상\n\n${buyPlace}에서 한참 비교하다가 결국 이걸 선택했는데, 리뷰 개수나 평점도 그렇고 구매자 Q&A 답변 보니까 믿음이 갔어요.\n\n받아보니까 예상대로였고요. 마감이나 소재 품질이 딱 이 가격이면 납득되는 수준이에요. 처음에 사용법이 약간 헷갈렸는데 한 번 감 잡고 나서는 전혀 문제없었어요.\n\n특히 기존에 쓰던 비슷한 제품이랑 비교해봤을 때 편의성 차이가 확실히 느껴져서 좋았어요.`,
  ];
  const firstImpression = firstImpressions[rand(0, firstImpressions.length)];

  // ── 주차별 사용 일지 (NEW — 핵심 품질 향상 섹션) ──────────────────────────────
  const weeklyDiaries = [
    `📅 기간별 사용 일지\n\n[ 처음 1~2주 ]\n받자마자 매일 쓰면서 이리저리 테스트해봤어요. 처음엔 약간 어색한 부분이 있었는데 이건 적응 문제였고, 일주일 정도 지나니까 완전히 자연스러워졌어요. 생각보다 직관적이라서 금방 익숙해졌어요.\n\n[ 2주 ~ 한 달 ]\n이때부터 본격적으로 일상 루틴에 녹아들었어요. ${usageTime} 쓰는 패턴이 자리 잡혔고, 사용감이 처음보다 오히려 더 좋아진 느낌이에요. 처음에 어색했던 부분들이 완전히 익숙해진 시기예요.\n\n[ 한 달 이후 ~ 현재 ]\n지금은 없으면 불편할 것 같은 필수 아이템이 됐어요. 내구성도 걱정했는데 아직까지 처음이랑 큰 차이가 없어요. 오히려 쓸수록 더 좋아지는 타입의 제품인 것 같아요.`,

    `📅 실제 사용 타임라인\n\n[ D+1 ~ D+7 (첫째 주) ]\n도착하자마자 설레는 마음에 바로 개봉했어요. 처음에는 기존에 쓰던 것들이랑 비교하면서 조심스럽게 사용했는데, 생각보다 훨씬 쓰기 편하더라고요. 첫 주부터 꽤 자주 찾게 됐어요.\n\n[ D+8 ~ D+30 (한 달) ]\n이때부터 진짜 제 손에 맞는 물건이 됐어요. ${usageTime} 때 자연스럽게 쓰게 되더라고요. 관리나 세척도 어렵지 않았어요. 처음에 걱정했던 내구성도 이 시기에 확인이 됐어요.\n\n[ D+30 이후 (지금) ]\n${period} 지난 지금 돌아보면 진짜 잘 샀다는 생각이에요. 처음 살 때 주저했던 게 무색할 정도예요ㅎㅎ`,

    `📅 ${period} 사용기 — 솔직한 변화 기록\n\n처음에는 뭐든 새 물건이라 기대감이 높잖아요. 그래서 초반 2주는 일부러 냉정하게 평가하려고 했어요.\n\n초반 2주: 기대치랑 비슷하거나 살짝 위. 사용법 익히는 데 크게 어렵지 않았고 불편한 부분이 별로 없었어요. 의외로 관리도 쉬워서 좋았어요.\n\n중반 한 달: 이때부터 진짜 평가가 시작되는 것 같아요. 처음의 설렘이 사라지고 나서도 계속 만족스럽게 쓰고 있었어요. 내구성도 걱정 없었고요.\n\n현재: 솔직히 더 비싼 제품 살 필요가 없었다는 생각이에요. 이 가격대에서 이 정도면 충분해요.`,
  ];
  const weeklyDiary = weeklyDiaries[rand(0, weeklyDiaries.length)];

  // ── 카테고리별 심화 사용기 ────────────────────────────────────────────────────
  const categoryDeepDives = {
    '주방용품': [
      `🍳 주방에서 실제로 써보니\n\n주방에서 쓰는 물건은 사용 빈도가 높아서 내구성이 제일 중요하잖아요. ${name}은 매일 요리하면서 써봤는데 아직까지 변형이나 손상이 없어요.\n\n세척도 편한 편이에요. 손으로 씻어도 되고 구석구석 잘 닦이는 구조라서 위생 걱정이 없어요. 주방에 놔둬도 디자인이 깔끔해서 보기 좋고요.\n\n한 가지 팁을 드리자면, 처음 사용 전에 한 번 세척하고 쓰시는 걸 추천해요. 새 제품 특유의 냄새가 있을 수 있거든요. 뜨거운 물로 한 번 헹구면 바로 쓸 수 있어요.`,
    ],
    '청소용품': [
      `🧹 실제 청소 효과 솔직 평가\n\n청소 용품은 써봐야 안다는 말이 딱 맞는 것 같아요. 스펙이 좋아 보여도 실제로 청소 효과가 별로인 경우도 있거든요.\n\n${name}은 실제로 써보니 기대 이상이었어요. 먼지 흡착력이 좋은 편이고, 좁은 틈새나 구석도 꼼꼼하게 청소할 수 있어서 좋았어요. 사용 후 관리도 어렵지 않았고요.\n\n${season}철에 먼지가 많아지는 계절인데 이 친구 덕분에 청소 스트레스가 많이 줄었어요. 소음 수준도 적당해서 이른 아침이나 늦은 밤에도 크게 부담 없이 쓸 수 있어요.`,
    ],
    '수납정리': [
      `📦 실제 수납해보니까\n\n수납 용품은 크기가 맞는지 확인하는 게 제일 중요해요. 저도 사기 전에 줄자로 공간을 재가면서 사이즈를 꼼꼼히 확인했거든요.\n\n${name}은 실측 사이즈가 표기랑 거의 일치했어요. 실제 공간에 딱 맞게 들어가서 만족스러웠어요. 내부 공간 활용도도 좋은 편이고, 꺼내고 넣기가 편한 구조예요.\n\n특히 마감 처리가 깔끔해서 집에 놔두면 정리된 느낌이 나요. 인테리어 소품처럼 써도 될 것 같은 디자인이에요.`,
    ],
    '홈데코': [
      `🏠 집에 실제로 뒀을 때\n\n홈데코 소품은 직접 보기 전까지 집 분위기랑 맞는지 모르잖아요. 사진이랑 실물 색감이 다른 경우도 있고ㅠ\n\n${name}은 실물이 사진보다 오히려 더 예뻤어요! 우리 집 분위기가 화이트 톤이라 자연스럽게 녹아들었고, 놔두기만 해도 공간이 정돈되어 보이는 효과가 있었어요.\n\n소재 느낌도 실제로 만져보니 가격 이상의 고급스러운 느낌이에요. 방문하는 분들마다 어디서 샀냐고 물어볼 정도예요ㅎㅎ 선물용으로도 충분히 괜찮을 것 같아요.`,
    ],
    '가전제품': [
      `⚡ 실제 사용 성능 테스트\n\n가전제품은 스펙 수치랑 실제 사용감이 다를 수 있어서 꼼꼼히 테스트해봤어요.\n\n${period} 동안 매일 쓰면서 체크한 부분들: 소음 수준, 실제 효과, 에너지 효율, 유지 관리 편의성. 결론부터 말하면 이 가격대에서 기대치를 충족하는 수준이에요.\n\n특히 초반에 걱정했던 내구성은 지금까지 문제없이 잘 쓰고 있어요. A/S 걱정도 있었는데 아직 필요한 상황이 없었고요. 전기료 걱정도 크게 안 돼도 될 것 같아요.`,
    ],
    '침구류': [
      `😴 실제로 자보니까\n\n침구는 한 번 써보기 전까지 진짜 감이 안 오는 제품 중 하나예요. 소재 설명만으로는 부드러운지 거친지 모르잖아요.\n\n${name}은 실제 사용감이 꽤 좋았어요. 소재가 부드럽고 체온 조절도 적당해서 ${season}철에 쓰기 딱 좋아요. 세탁 후에도 촉감이 크게 변하지 않았고, 건조도 빠른 편이에요.\n\n다만 처음 세탁할 때 단독으로 세탁하시는 걸 추천해요. 새 침구 특유의 냄새나 이염 방지를 위해서요. 한 번 세탁하면 바로 편하게 쓸 수 있어요.`,
    ],
    '리빙': [
      `🏡 실제로 집에서 써보니\n\n리빙 제품은 일상에서 얼마나 편하게 쓸 수 있느냐가 핵심이잖아요. ${name}을 ${period} 동안 ${usageTime} 써보면서 느낀 점을 솔직하게 정리할게요.\n\n가장 인상 깊었던 건 처음부터 사용하기 편했다는 거예요. 새 제품 특유의 어색함이 금방 사라졌고, 일상 루틴에 자연스럽게 녹아들었어요. 손이 많이 안 가도 관리가 잘 되는 제품이에요.\n\n관리 면에서도 복잡하지 않아서 오래 쓸 수 있을 것 같아요. 청소나 세척이 쉬운 구조라서 위생 걱정도 없어요.`,
    ],
  };
  const deepDiveOptions = categoryDeepDives[category] || categoryDeepDives['리빙'];
  const deepDive = deepDiveOptions[rand(0, deepDiveOptions.length)];

  // ── 장점 (8가지 · 각 250자 이상) ────────────────────────────────────────────
  const plusSections = [
    `✅ 좋았던 점 정리\n\n① 사용 편의성\n처음부터 어색함 없이 바로 쓸 수 있어요. 직관적인 구조 덕분에 별도의 적응 시간이 거의 필요 없었어요.\n\n② 내구성\n${period} 사용했는데도 처음이랑 거의 차이가 없어요. 매일 쓰는 제품인데도 변형이나 손상 없이 잘 버텨주고 있어요.\n\n③ 가성비\n${price ? `${price}에 이 정도 퀄리티면` : '이 가격에 이 정도면'} 솔직히 충분히 납득돼요. 비슷한 가격대 제품들이랑 비교해봐도 뒤처지는 느낌이 없어요.\n\n④ 디자인\n심플하고 깔끔한 스타일이 어느 공간에든 잘 어울려요. 튀지 않으면서도 있어 보이는 디자인이에요.\n\n⑤ 관리 편의성\n세척하거나 유지 관리하기 어렵지 않아서 오래 쓸 수 있을 것 같아요.`,

    `👍 실제로 만족한 포인트들\n\n가장 크게 만족한 건 역시 사용감이에요. 좋은 제품은 쓸수록 손에 맞는다는 말이 있잖아요. 이 제품이 딱 그래요. ${usageTime} 쓰다 보니 이제 없으면 아쉬운 레벨이 됐어요.\n\n두 번째는 견고함이에요. 가격이 저렴한 제품들은 금방 망가지는 경우가 많은데, ${name}은 ${period} 써도 처음이랑 거의 같아요. 아직까지 변형이나 파손이 없어요.\n\n세 번째는 디자인이에요. 집에 놔뒀을 때 인테리어를 해치지 않는 디자인이에요. 오히려 깔끔하게 정돈되어 보이는 효과가 있어요.\n\n마지막으로 가격 대비 만족도가 높아요. 더 비싼 제품 살 필요가 없었다는 생각이 들어요.`,

    `💚 이건 진짜 좋았어요\n\n편의성, 내구성, 디자인 세 박자가 균형 잡혀 있어요. 어느 한 쪽이 특별히 뛰어난 게 아니라 전체적으로 고른 퀄리티예요. 이런 제품이 오히려 오래 쓰게 되더라고요.\n\n특히 관리가 쉽다는 게 제일 큰 장점이에요. 매일 쓰는 거라 관리가 번거로우면 결국 안 쓰게 되잖아요. 세척이나 보관에 특별히 신경 쓸 게 없어서 부담 없이 계속 쓰게 돼요.\n\n저처럼 ${category} 쪽 제품에 관심 많은 분이라면 이 부분들이 특히 마음에 드실 거예요.`,
  ];
  const plusSection = plusSections[rand(0, plusSections.length)];

  // ── 단점 (6가지 · 각 200자 이상) ────────────────────────────────────────────
  const minusSections = [
    `🔸 아쉬운 점도 있어요\n\n완벽한 제품은 없으니까 솔직하게 말할게요.\n\n아쉬운 점 첫 번째: 처음 쓸 때 살짝 어색한 느낌이 있어요. 하루 이틀 정도 지나면 사라지는 문제이긴 한데, 바로 완벽하게 쓰고 싶은 분들은 참고해두세요.\n\n아쉬운 점 두 번째: 보관할 때 어느 정도 공간이 필요해요. 공간이 여유롭지 않은 분들은 미리 자리를 마련해두고 구매하시는 게 좋을 것 같아요.\n\n근데 이 두 가지는 솔직히 크리티컬한 단점은 아니에요. 장점에 비하면 충분히 감수할 만한 수준이거든요.`,

    `⚠️ 솔직히 아쉬웠던 부분\n\n없다고 하면 거짓말이니까 솔직하게 얘기할게요ㅎㅎ\n\n첫 번째 아쉬움: 처음 쓸 때 적응에 시간이 필요해요. 금방 익숙해지지만 즉시 퍼펙트한 사용은 어려웠어요.\n\n두 번째 아쉬움: 가격이 부담스러울 수 있어요. 비슷한 기능의 더 저렴한 제품들도 있거든요. 물론 품질 차이가 있긴 하지만, 예산이 빡빡한 분들은 고민될 수 있어요.\n\n세 번째 아쉬움: 보관 공간을 어느 정도 차지해요. 공간이 넓은 집이라면 전혀 문제없는데, 좁은 집에서는 자리 배치를 미리 생각해봐야 해요.\n\n그래도 전반적으로는 장점이 훨씬 커요!`,
  ];
  const minusSection = minusSections[rand(0, minusSections.length)];

  // ── Q&A 섹션 (NEW) ────────────────────────────────────────────────────────────
  const faqSections = [
    `❓ 자주 묻는 질문 Q&A\n\nQ. 처음 쓸 때 어떤 준비가 필요한가요?\nA. 받자마자 바로 사용 가능해요. 다만 처음에 한 번 닦아서 사용하시면 더 좋아요. 새 제품 특유의 냄새가 있을 수 있거든요.\n\nQ. 관리는 어떻게 하나요?\nA. 일상적인 관리는 크게 어렵지 않아요. 세척 방법은 부드럽게 해주시면 오래 쓸 수 있어요. 강한 세제보다는 순한 걸 추천해요.\n\nQ. 배송은 얼마나 걸렸나요?\nA. ${buyPlace} 기준으로 주문하고 2일 만에 받았어요. 포장도 꼼꼼하게 와서 손상 없이 받았고요.`,

    `💬 궁금할 만한 것들 Q&A\n\nQ. 가격 대비 만족도는요?\nA. 솔직히 처음엔 비싸다 싶었는데, ${period} 써보고 나서는 이 가격이 합리적이라는 생각이 들어요. 내구성이나 사용감 생각하면요.\n\nQ. 초보자도 쓰기 쉬운가요?\nA. 네! 처음 써보는 분들도 금방 적응할 수 있어요. 사용법이 직관적이거든요. 별도의 설명서가 없어도 바로 쓸 수 있어요.\n\nQ. 실물이 사진이랑 다른가요?\nA. 사진이랑 거의 같아요. 오히려 실물이 더 나은 것 같기도 하고요ㅎㅎ 색감이나 크기가 표기된 것과 잘 맞았어요.`,
  ];
  const faqSection = faqSections[rand(0, faqSections.length)];

  // ── 항목별 별점 (NEW) ────────────────────────────────────────────────────────
  const starRatings = [
    `⭐ 항목별 솔직 점수\n\n사용 편의성   ★★★★☆  처음부터 쓰기 편해요\n내구성       ★★★★☆  ${period} 써도 처음과 같아요\n가성비       ★★★★★  이 가격에 이 정도면 합격\n디자인       ★★★★☆  인테리어에 잘 어울려요\n관리 편의성  ★★★★☆  세척·보관이 어렵지 않아요\n\n종합 점수: 4.2 / 5.0`,

    `📊 제 기준 점수\n\n품질 만족도    8.5 / 10\n가격 합리성    9.0 / 10\n디자인         8.0 / 10\n사용 편의성    9.0 / 10\n내구성         8.5 / 10\n관리 편의성    8.0 / 10\n\n종합: 85점 / 100점\n이 점수는 ${period} 실사용 후 냉정하게 매긴 점수예요. 가격 대비로는 더 높게 줄 수도 있어요.`,
  ];
  const starRating = starRatings[rand(0, starRatings.length)];

  // ── 구매 가이드 (6가지) ─────────────────────────────────────────────────────
  const buyGuides = [
    `💡 이런 분께 추천해요\n\n추천 O\n✔ ${keyword}을 처음 써보려는 분\n✔ 기존 제품이 불만족스러워서 바꾸려는 분\n✔ 가성비 좋은 ${category} 아이템을 원하는 분\n✔ 관리가 편한 제품을 찾는 분\n✔ 집 인테리어에 잘 녹아드는 심플한 디자인을 선호하는 분\n\n신중하게 고려해보세요\n✗ 수납·보관 공간이 매우 협소한 분\n✗ 즉시 완벽하게 적응해서 쓰고 싶은 분`,

    `💡 구매 전 체크리스트\n\n① 사용 목적이 명확한지 확인해보세요\n② 놓을 공간이 충분한지 미리 재보세요\n③ 유지 관리에 신경 쓸 수 있는지 체크해보세요\n④ 예산이 맞는지 확인하세요 ${price ? `(현재 ${price})` : ''}\n⑤ 비슷한 제품들이랑 가격 비교도 해보세요\n\n위 다섯 가지 다 OK면 구매하셔도 후회 없을 거예요!`,
  ];
  const buyGuide = buyGuides[rand(0, buyGuides.length)];

  // ── 최종 총평 (8가지 · 각 200자 이상) ──────────────────────────────────────
  const conclusions = [
    `🏆 최종 총평\n\n${period} 동안 써보고 내린 결론은 — 추천해요!\n\n처음에 고민했던 것들이 무색할 만큼 잘 쓰고 있어요. 특히 사용 편의성과 내구성 면에서 이 가격대에 기대하는 수준을 충족했어요.\n\n단점이 아예 없는 건 아니지만, 솔직히 장점이 훨씬 크게 느껴져요. 구매 고민 중이신 분들한테는 일단 한 번 써보시라고 말씀드리고 싶어요.\n\n${keyword} 찾고 계신 분들한테 도움이 됐으면 좋겠어요! 궁금한 점은 댓글로 남겨주세요~ 아는 범위에서 성심성의껏 답변해드릴게요 😊`,

    `😊 마무리하며\n\n${name}, 결론적으로 잘 산 것 같아요.\n\n없으면 아쉬울 것 같은 아이템이 됐거든요. 처음에 살까 말까 한참 고민했는데, 지금은 그때 왜 망설였지 싶어요ㅎㅎ\n\n${price ? `${price}라는 가격에` : '이 가격에'} 이 정도 퀄리티와 만족도라면 충분히 가치있는 소비라고 생각해요.\n\n${category} 아이템 찾고 계신 분들, 너무 오래 고민하지 마세요! 오늘 후기가 구매 결정에 도움이 됐으면 좋겠어요. 긴 글 읽어주셔서 감사해요~ 🌿`,

    `✨ 솔직 한 줄 총평\n\n"${name}, 이 가격에 이 만족도면 충분해요. 다음에 또 살 의향 있어요."\n\n완벽한 제품은 없지만 이건 충분히 잘 만든 제품이에요. ${period} 써보면서 후회한 적이 한 번도 없었거든요.\n\n${keyword} 구매 고민 중이신 분들한테는 자신 있게 추천해드릴 수 있어요. 더 궁금한 거 있으시면 댓글로 물어봐주세요! 이웃추가 해주시면 저도 놀러 갈게요~ 좋아요도 꾹 눌러주시면 감사해요 😊`,

    `🎀 구매 추천 여부\n\n결론적으로는 YES입니다!\n\n${price ? `${price}라는 가격에` : '이 가격에'} 이 정도 퀄리티면 합리적인 선택이에요. 물론 단점도 있지만, 장점이 훨씬 크게 느껴지는 제품이에요.\n\n오늘 후기가 도움이 됐으면 좋겠고, 구매하시게 된다면 저처럼 만족하시길 바라요~ 다음 포스팅에서도 좋은 리빙 아이템으로 찾아올게요. 자주 놀러 와 주세요 😊`,
  ];
  const conclusion = conclusions[rand(0, conclusions.length)];

  // ── 경쟁 상품 비교 섹션 (NEW) ────────────────────────────────────────────────
  const compareSections = [
    `🆚 비슷한 제품들이랑 비교해봤어요\n\n${name}을 사기 전에 비슷한 ${category} 제품들을 꽤 많이 비교해봤는데요, 크게 세 가지 가격대로 나눌 수 있더라고요.\n\n저가형 (2만원 이하): 가격 부담은 없는데 내구성이 걱정됐어요. 리뷰 보면 한두 달 쓰다가 망가졌다는 후기가 꽤 있었고요.\n\n중가형 (${name} 포함): 가성비 라인이에요. 퀄리티도 어느 정도 보장되고 가격 부담도 크지 않은 구간이에요. 제가 ${name}을 선택한 이유가 바로 이 균형이었어요.\n\n고급형 (10만원 이상): 확실히 퀄리티가 다르긴 한데 가격 차이만큼 체감이 클지는 모르겠더라고요. 일상 사용 목적이면 굳이 고급형까지 필요 없을 것 같았어요.\n\n결국 ${name}이 이 셋 중에서 일상 사용에 가장 현실적인 선택이었어요.`,

    `🔍 구매 전 비교 과정\n\n솔직히 ${name} 하나만 본 건 아니에요. 비슷한 제품들을 꽤 오래 비교했거든요.\n\n브랜드 유명도로만 고르면 가격이 너무 올라가고, 너무 저렴한 건 리뷰에서 내구성 문제가 보였어요. 그 사이 어딘가에서 균형점을 찾으려다 보니 자연스럽게 ${name}이 남았어요.\n\n특히 저는 리뷰 개수가 많은 제품을 선호하는 편이에요. 리뷰가 많다는 건 그만큼 많은 사람이 검증했다는 의미니까요. ${reviews ? `${name}은 리뷰가 ${reviews}나 있어서 신뢰가 갔어요.` : `${name}은 리뷰 수가 꽤 많아서 믿음이 갔어요.`}\n\n결과적으로 잘 선택한 것 같아서 만족이에요.`,

    `💰 가격대별 선택 가이드\n\n${keyword} 제품을 고를 때 어느 가격대를 선택해야 할지 고민하는 분들 많으시죠?\n\n제 기준을 공유드리면 — 일상적으로 가볍게 쓸 거라면 ${priceTier} 제품으로도 충분해요. ${name}이 딱 그 포지션이에요.\n\n무조건 비싼 게 좋다는 생각보다는, 내 사용 빈도와 목적에 맞는 가격대를 찾는 게 핵심인 것 같아요. 저는 ${usageTime} 쓰는 용도라 이 가격대가 딱 맞았어요.\n\n고가 제품이 필요한 경우는 전문적으로 쓰거나 매일 고강도로 사용할 때인 것 같아요. 일반 가정 사용이라면 ${name} 정도면 충분해요.`,
  ];
  const compareSection = compareSections[rand(0, compareSections.length)];

  // ── 브랜드 정보 섹션 (브랜드 정보 있을 때만) ─────────────────────────────────
  const brandSection = brand ? [
    `🏷️ 브랜드에 대해\n\n${brand} 제품인데요, 이 브랜드가 ${category} 쪽에서 꽤 오래된 곳이에요. 막 생긴 브랜드가 아니라서 A/S나 품질 관리 면에서 믿음이 더 갔어요.\n\n온라인에서 브랜드 평판도 확인해봤는데 부정적인 이슈가 딱히 없었어요. 이런 부분도 구매 결정에 영향을 줬어요.`,
    `🏷️ ${brand} 브랜드\n\n${brand}는 ${category} 분야에서 꽤 인지도 있는 브랜드예요. 처음 들어봤을 때는 생소했는데, 찾아보니까 리뷰가 많고 구매자 만족도도 높은 편이더라고요.\n\n브랜드 AS나 교환 정책도 합리적인 편이라서 구매할 때 불안함이 없었어요.`,
  ][rand(0, 2)] : '';

  // ── 상품 특징 태그 활용 섹션 (태그 3개 이상 있을 때만) ───────────────────────
  const tagFeatureSection = prodTags.length >= 2 ? `📌 이 제품의 특징\n\n쇼핑 검색에서 ${name}의 주요 특징으로 표시되는 키워드들이에요:\n${prodTags.map(t => `• ${t}`).join('\n')}\n\n이 중에서 제가 실제로 체감한 건 역시 사용 편의성이었어요. 스펙보다 실제 사용감이 중요하다고 생각하는데, 이 부분에서 기대를 충족했어요.` : '';

  // ── 해시태그 (최대 15개 + 브랜드·태그 반영) ──────────────────────────────────
  const baseTags  = ['리빙', '리빙추천', '홈데코', '인테리어', '생활용품', category, '리뷰', '솔직후기', '실사용후기', '가성비', keyword, season + '추천', `${year}추천`];
  const kwWords   = keyword.split(/\s+/).map(w => w.replace(/[^가-힣a-zA-Z0-9]/g, '')).filter(w => w.length > 1);
  const nameWords = name.split(/[\s\-·]+/).slice(0, 3).map(w => w.replace(/[^가-힣a-zA-Z0-9]/g, '')).filter(w => w.length > 1);
  const brandTag  = brand ? [brand.replace(/[^가-힣a-zA-Z0-9]/g, '')] : [];
  const allTags   = [...new Set([...kwWords, ...nameWords, ...brandTag, ...baseTags])].filter(Boolean).slice(0, 15);
  const hashtags  = allTags.map(t => `#${t}`).join(' ');

  // ── 본문 조립 (이미지 마커 3개 · 쿠팡 링크 자리 포함) ───────────────────────
  const SEP = '\n\n---\n\n';

  // 섹션 그룹 1: 도입부 ~ 개봉기      ← [IMG_MARKER_1]
  const secGroup1 = [intro, infoBlock, brandSection, tagFeatureSection, firstImpression].filter(Boolean).join(SEP);
  // 섹션 그룹 2: 사용 일지 ~ 비교     ← [IMG_MARKER_2]
  const secGroup2 = [weeklyDiary, deepDive, compareSection].filter(Boolean).join(SEP);
  // 섹션 그룹 3: 장단점 ~ Q&A        ← [IMG_MARKER_3]
  const secGroup3 = [plusSection, minusSection, faqSection].filter(Boolean).join(SEP);
  // 섹션 그룹 4: 별점 ~ 마무리 + 쿠팡 링크 자리
  const secGroup4 = [starRating, buyGuide, conclusion].filter(Boolean).join(SEP);

  let body = secGroup1
    + '\n[[IMG_MARKER_1]]\n' + secGroup2
    + '\n[[IMG_MARKER_2]]\n' + secGroup3
    + '\n[[IMG_MARKER_3]]\n' + secGroup4
    + '\n[[COUPANG_LINK]]\n'; // 쿠팡 파트너스 링크 삽입 위치

  // ── 1800자 보장 — 미달 시 보완 섹션 자동 추가 ────────────────────────────────
  const bodyForLen = body.replace(/\[\[IMG_MARKER_\d\]\]/g, '').replace('[[COUPANG_LINK]]', '');
  if (bodyForLen.length < 1800) {
    const extras = [
      `📌 더 잘 활용하는 팁\n\n${name}을 더 오래, 더 잘 쓰는 방법을 몇 가지 공유할게요!\n\n첫 번째로, 처음 사용할 때 천천히 시작하는 게 좋아요. 익숙해지기 전에 너무 무리하게 쓰면 제품 수명이 짧아질 수 있거든요. 처음 1~2주는 가볍게 사용하면서 내 손에 맞게 길들이는 과정이라고 생각하면 돼요.\n\n두 번째로, 보관할 때는 습기나 직사광선을 피해주세요. ${category} 제품 특성상 보관 환경이 내구성에 영향을 줄 수 있어요. 서늘하고 건조한 곳에 보관하는 게 좋아요.\n\n세 번째로, 정기적인 관리를 해주시면 처음 샀을 때 상태를 오래 유지할 수 있어요. 저는 한 달에 한 번 정도 꼼꼼하게 청소해주는 편이에요.`,

      `🛒 구매 전 알면 좋은 것들\n\n${name}을 살 때 제가 아쉬웠던 점들이에요.\n\n먼저 사이즈를 꼭 미리 확인하세요. 실측 치수를 보고 우리 집 공간에 맞는지 확인하는 게 좋아요. 저는 대략 맞겠지 싶었는데 딱 맞게 들어가서 다행이었어요ㅎㅎ\n\n그리고 색상이 모니터 화면이랑 다를 수 있어요. 화이트나 베이지 계열은 특히 실물이 더 따뜻한 톤인 경우가 많더라고요. 이 점 참고해서 주문하세요.\n\n마지막으로 리뷰는 최신 순으로 봐주세요. 오래된 리뷰는 현재 제품 품질이랑 다를 수 있거든요.`,
    ];
    body = body + SEP + extras[rand(0, extras.length)];
  }

  // 해시태그는 본문 끝에 별도 추가 (마커와 분리)
  body = body + '\n\n' + hashtags;

  const imageUrls = [product?.imageUrl, ...(product?.extraImages || [])].filter(Boolean);
  return { title, body, hashtags, imageUrl: product?.imageUrl || '', imageUrls };
}

// ── 쿠팡 상품 검색 + 파트너스 링크 생성 ──────────────────────────────────────
async function fetchCoupangProduct(page, keyword, partnerId) {
  if (!partnerId) return null;
  log(`  🛒 쿠팡 상품 검색: "${keyword}"...`);

  // ★ 새 탭으로 실행 → main page 보호
  let sub = null;
  let ownSub = false;
  try {
    sub = await page.context().newPage();
    ownSub = true;
  } catch (_) {
    sub = page;
  }

  try {
    // 쿠팡 메인 → 검색창 타이핑 (사람처럼)
    await sub.goto('https://www.coupang.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await humanRead(sub);
    await sleep(rand(700, 1400));

    // 검색창 찾기
    const coupangSels = [
      'input#headerSearchKeyword',
      'input[name="q"]',
      '.header-search input[type="text"]',
      'input[placeholder*="검색"]',
    ];
    let cBox = null;
    for (const sel of coupangSels) {
      cBox = await sub.$(sel).catch(() => null);
      if (cBox) break;
    }

    if (cBox) {
      const cb = await cBox.boundingBox().catch(() => null);
      if (cb) {
        await sub.mouse.move(
          cb.x + rand(20, Math.max(21, cb.width - 20)),
          cb.y + rand(3,  Math.max(4,  cb.height - 3)),
          { steps: rand(6, 14) }
        );
        await sleep(rand(150, 350));
      }
      await cBox.click();
      await sleep(rand(300, 600));
      await humanType(sub, keyword);
      await sleep(rand(300, 700));
      await sub.keyboard.press('Enter');
      await sub.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
    } else {
      // 검색창 못 찾으면 직접 URL
      await sub.goto(
        `https://www.coupang.com/np/search?q=${encodeURIComponent(keyword)}&channel=user`,
        { waitUntil: 'domcontentloaded', timeout: 20000 }
      );
    }

    await wait(1500, 2500);
    await waitIfCaptcha(sub, { fatal: false });
    await humanScroll(sub);

    const result = await sub.evaluate(() => {
      const selectors = [
        'li[id*="productId"] a[href*="/vp/products"]',
        '.search-product a[href*="/vp/products"]',
        '[class*="productCard"] a[href*="/vp/products"]',
        'ul.search-product-list li a[href*="/vp/products"]',
        'a[href*="coupang.com/vp/products"]',
      ];
      for (const sel of selectors) {
        const link = document.querySelector(sel);
        if (!link) continue;
        const href = link.href || link.getAttribute('href') || '';
        if (!href.includes('/vp/products')) continue;
        const card = link.closest('li, [class*="product"], [class*="item"]') || link.parentElement;
        const nameEl  = card?.querySelector('[class*="name"], [class*="title"], h3, h4, strong');
        const priceEl = card?.querySelector('[class*="price-value"], [class*="price"], strong');
        const imgEl   = card?.querySelector('img[src*="coupang"], img[src*="s3"]');
        const cleanUrl = href.split('?')[0].split(';')[0];
        return {
          name:       (nameEl?.innerText  || '').trim().substring(0, 60),
          price:      (priceEl?.innerText || '').replace(/[^0-9,]/g, ''),
          productUrl: cleanUrl.startsWith('http') ? cleanUrl : 'https://www.coupang.com' + cleanUrl,
          imageUrl:   imgEl?.src || '',
        };
      }
      return null;
    });

    if (!result || !result.productUrl) {
      log('  ℹ️  쿠팡 상품을 찾지 못했습니다');
      return null;
    }

    const affiliateUrl = `${result.productUrl}?sourceType=affiliate&affiliateCode=${partnerId}`
                       + `&utm_source=affiliate&utm_medium=partner&utm_campaign=${partnerId}`;
    const priceStr = result.price
      ? Number(result.price.replace(/,/g, '')).toLocaleString() + '원'
      : '';
    log(`  ✅ 쿠팡 상품: ${result.name.substring(0, 30)} ${priceStr ? '| ' + priceStr : ''}`);
    log(`  🔗 파트너스 링크 생성 완료`);
    return { ...result, priceStr, affiliateUrl };

  } catch (e) {
    log(`  ⚠️  쿠팡 검색 실패: ${e.message}`);
    return null;
  } finally {
    if (ownSub) await sub.close().catch(() => {});
  }
}

// ── 상품 이미지 임시 파일로 다운로드 ─────────────────────────────────────────
async function downloadImageToTemp(imageUrl) {
  if (!imageUrl) return null;
  try {
    const ext     = (imageUrl.match(/\.(jpe?g|png|webp)/i) || ['', 'jpg'])[1];
    const tmpPath = path.join(os.tmpdir(), `blog_img_${Date.now()}.${ext}`);
    return await new Promise(resolve => {
      const req = https.get(imageUrl.startsWith('//') ? 'https:' + imageUrl : imageUrl, { timeout: 10000 }, res => {
        if (res.statusCode !== 200) { res.resume(); return resolve(null); }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          try { fs.writeFileSync(tmpPath, Buffer.concat(chunks)); resolve(tmpPath); }
          catch (_) { resolve(null); }
        });
        res.on('error', () => resolve(null));
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    });
  } catch (_) { return null; }
}

// ── AI 이미지 생성 (Pollinations.ai · 무료 · API 키 불필요) ────────────────────
// 상품 이미지 수집 실패 시 키워드 기반으로 AI 이미지를 생성해 임시파일로 반환
async function generateAndDownloadAIImage(keyword, imgIndex = 0) {
  try {
    // 한국어 키워드 → 영어 프롬프트 맵
    const promptMap = [
      [['주방','냄비','프라이팬','그릇','조리','도마','칼','수저'], 'korean kitchen cookware utensils white background'],
      [['청소','진공','청소기','걸레','먼지','세제'],               'cleaning tools household supplies minimal'],
      [['수납','정리','박스','서랍','선반','바구니'],               'home storage organization drawer shelving'],
      [['인테리어','홈데코','소품','캔들','조명','디퓨저'],         'modern home interior decor minimal lifestyle'],
      [['가전','전자','공기청정기','세탁','냉장','에어컨'],         'home appliance modern kitchen electronics'],
      [['침구','이불','베개','매트리스'],                           'cozy bedroom bedding pillow white clean'],
      [['생활용품','리빙'],                                          'korean home living lifestyle product white'],
    ];

    let basePrompt = 'korean home lifestyle product photography';
    for (const [keys, prompt] of promptMap) {
      if (keys.some(k => keyword.includes(k))) { basePrompt = prompt; break; }
    }

    // 이미지마다 다른 스타일·시드 사용
    const styles = [
      'product photography, clean white background, professional lighting',
      'flat lay style, pastel background, lifestyle photography',
      'minimalist home decor style, natural light, warm tones',
    ];
    const seeds = [42, 137, 891];
    const fullPrompt = `${basePrompt}, ${styles[imgIndex % styles.length]}, high quality`;
    const seed = seeds[imgIndex % seeds.length];
    const w = 800, h = 600;

    const aiUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}?width=${w}&height=${h}&nologo=true&seed=${seed}&model=flux`;
    const tmpPath = path.join(os.tmpdir(), `blog_ai_${Date.now()}_${imgIndex}.jpg`);

    log(`  🎨 AI 이미지 생성 중 (${imgIndex + 1}번) — 최대 45초 소요...`);
    log(`     프롬프트: "${fullPrompt.substring(0, 60)}..."`);

    return await new Promise(resolve => {
      // 리다이렉트 대응 재귀 헬퍼
      function fetchWithRedirect(url, depth = 0) {
        if (depth > 5) return resolve(null);
        const mod = url.startsWith('https') ? require('https') : require('http');
        const req = mod.get(url, { timeout: 45000 }, res => {
          // 리다이렉트 처리
          if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
            res.resume();
            return fetchWithRedirect(res.headers.location, depth + 1);
          }
          if (res.statusCode !== 200) { res.resume(); return resolve(null); }
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => {
            try {
              fs.writeFileSync(tmpPath, Buffer.concat(chunks));
              log(`  ✅ AI 이미지 저장 완료 (${imgIndex + 1}번)`);
              resolve(tmpPath);
            } catch (_) { resolve(null); }
          });
          res.on('error', () => resolve(null));
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
      }
      fetchWithRedirect(aiUrl);
    });
  } catch (e) {
    log(`  ⚠️  AI 이미지 생성 오류: ${e.message}`);
    return null;
  }
}

// ── SE 에디터에 이미지 삽입 ───────────────────────────────────────────────────
// SE ONE 에디터는 cross-origin iframe(blog.editor.naver.com)에 위치.
// DOM 직접 조작 불가 → 3단계 전략 사용:
//   A. 메인 페이지 고정 툴바 이미지 버튼 클릭 + waitForFileChooser
//   B. 에디터 영역 클릭 → 나타나는 블록 툴바 이미지 버튼 클릭
//   C. 클립보드에 이미지 데이터 복사 → Ctrl+V 붙여넣기
async function insertImageToEditor(page, imagePath) {
  if (!imagePath || !fs.existsSync(imagePath)) return false;
  log('  🖼️  이미지 삽입 시도 중...');

  // 이미지 버튼 셀렉터 (고정 툴바 / 블록 툴바 공통)
  const imgBtnSels = [
    // SE ONE 고정 툴바 (메인 페이지)
    'button[data-command="image"]',
    'button[data-tool-name="image"]',
    'button[data-type="image"]',
    '[class*="se-toolbar"] button[class*="image"]',
    '[class*="se-toolbar"] button[class*="photo"]',
    '.se-btn-image',
    // 제목/속성 포함 변형
    'button[title*="이미지"]',
    'button[title*="사진"]',
    'button[aria-label*="이미지"]',
    'button[aria-label*="사진"]',
    'button[aria-label*="Image"]',
    // 범용 클래스 매칭
    'button[class*="image"]',
    'button[class*="photo"]',
    // label 방식
    'label[for*="photo"]',
    'label[for*="image"]',
  ];

  // ── 방법 A: 고정 툴바 버튼 클릭 + waitForFileChooser ──────────────────────
  const tryFileChooser = async (clickFn) => {
    try {
      const [chooser] = await Promise.all([
        page.waitForFileChooser({ timeout: 7000 }),
        clickFn(),
      ]);
      if (chooser) {
        await chooser.setFiles(imagePath);
        await wait(4000, 6000);
        // 삽입 확인 버튼 처리
        const confirmLoc = page.locator('button:has-text("삽입"), button:has-text("확인"), button:has-text("등록")').first();
        if (await confirmLoc.count() > 0) { await confirmLoc.click(); await sleep(rand(800, 1500)); }
        log('  ✅ 이미지 업로드 완료 (파일 선택기)');
        try { fs.unlinkSync(imagePath); } catch (_) {}
        return true;
      }
    } catch (_) {}
    return false;
  };

  // A-1: 메인 페이지 프레임에서 버튼 탐색
  const clickMainToolbar = async () => {
    for (const sel of imgBtnSels) {
      try {
        const btns = await page.$$(sel);
        for (const btn of btns) {
          const box = await btn.boundingBox().catch(() => null);
          if (!box) continue;
          await btn.click({ force: true });
          return;
        }
      } catch (_) {}
    }
  };
  if (await tryFileChooser(clickMainToolbar)) return true;

  // A-2: 에디터 클릭해서 블록 툴바 활성화 후 다시 시도
  try {
    const vp = page.viewportSize() || { width: 1366, height: 768 };
    // 에디터 본문 마지막 줄 근처 클릭 (툴바 + 버튼 유도)
    await page.mouse.click(Math.round(vp.width * 0.55), Math.round(vp.height * 0.65)).catch(() => {});
    await sleep(rand(600, 1000));
    if (await tryFileChooser(clickMainToolbar)) return true;
  } catch (_) {}

  // ── 방법 B: 숨겨진 file input에 직접 setInputFiles ──────────────────────────
  // Playwright는 숨긴 input도 setInputFiles 가능 (크로스오리진 iframe 제외)
  for (const fr of [page, ...page.frames()]) {
    try {
      const inputs = await fr.$$('input[type="file"]').catch(() => []);
      for (const inp of inputs) {
        try {
          await inp.setInputFiles(imagePath);
          await wait(4000, 6000);
          const confirmLoc = fr.locator('button:has-text("삽입"), button:has-text("확인"), button:has-text("등록")').first();
          if (await confirmLoc.count() > 0) { await confirmLoc.click(); await sleep(rand(800, 1500)); }
          log('  ✅ 이미지 업로드 완료 (hidden file input)');
          try { fs.unlinkSync(imagePath); } catch (_) {}
          return true;
        } catch (_) {}
      }
    } catch (_) {}
  }

  // ── 방법 C: 클립보드 이미지 붙여넣기 (data URL → Ctrl+V) ─────────────────────
  try {
    const imgBuffer = fs.readFileSync(imagePath);
    const base64 = imgBuffer.toString('base64');
    const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const dataUrl = `data:${mimeType};base64,${base64}`;

    // 클립보드에 이미지 데이터 설정 (Clipboard API)
    const clipOk = await page.evaluate(async (url, mime) => {
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        await navigator.clipboard.write([new ClipboardItem({ [mime]: blob })]);
        return true;
      } catch (_) { return false; }
    }, dataUrl, mimeType).catch(() => false);

    if (clipOk) {
      // 에디터 본문 클릭 후 붙여넣기
      const vp = page.viewportSize() || { width: 1366, height: 768 };
      await page.mouse.click(Math.round(vp.width / 2), Math.round(vp.height * 0.58)).catch(() => {});
      await sleep(rand(400, 700));
      await page.keyboard.press('Control+End');
      await sleep(200);
      await page.keyboard.press('Control+v');
      await wait(3000, 5000);
      log('  ✅ 이미지 업로드 완료 (클립보드 붙여넣기)');
      try { fs.unlinkSync(imagePath); } catch (_) {}
      return true;
    }
  } catch (_) {}

  log('  ℹ️  이미지 삽입 실패 (에디터 cross-origin 제한) — 텍스트만 저장');
  return false;
}

// ── SE 에디터에 텍스트 추가 (커서 끝에 이어붙이기) ──────────────────────────
async function appendBodyText(page, text) {
  const vp = page.viewportSize() || { width: 1366, height: 768 };
  const cx = Math.round(vp.width / 2);
  const cy = Math.round(vp.height * 0.5);

  // ── 방법 1: 현재 포커스 유지 + Ctrl+End + 청크 삽입 ───────────────────────
  try {
    await page.keyboard.press('Control+End');
    await sleep(rand(200, 400));
    const CHUNK = 500;
    for (let ci = 0; ci < text.length; ci += CHUNK) {
      await page.keyboard.insertText(text.substring(ci, ci + CHUNK));
      await sleep(rand(100, 300));
    }
    await wait(1500, 2000);
    log(`  ✅ 추가 섹션 입력 완료 (${text.length}자)`);
    return true;
  } catch (_) {}

  // ── 방법 2: 에디터 클릭 재포커스 + 클립보드 붙여넣기 ─────────────────────
  try {
    await page.evaluate(txt => {
      const ta = document.createElement('textarea');
      ta.value = txt;
      ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;z-index:-1';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }, text);
    await sleep(rand(200, 400));
    await page.mouse.click(cx, cy);
    await sleep(rand(300, 500));
    await page.keyboard.press('Control+End');
    await sleep(rand(200, 400));
    await page.keyboard.press('Control+v');
    await wait(2000, 3500);
    log(`  ✅ 추가 섹션 입력 완료 (클립보드, ${text.length}자)`);
    return true;
  } catch (_) {}

  // ── 방법 3: execCommand insertText (프레임 탐색) ──────────────────────────
  const appendSels = [
    '.se-content [contenteditable="true"]',
    '.se-main-container [contenteditable="true"]',
    'div[contenteditable="true"]:not([id*="title"]):not([class*="title"])',
    '[contenteditable="true"]',
  ];
  for (const frame of [page, ...page.frames()]) {
    for (const sel of appendSels) {
      try {
        const el = await frame.$(sel);
        if (!el) continue;
        const box = await el.boundingBox().catch(() => null);
        if (!box || box.width < 200 || box.y < 60) continue;

        const ok = await frame.evaluate((elem, txt) => {
          try {
            elem.focus();
            const range = document.createRange();
            range.selectNodeContents(elem);
            range.collapse(false);
            const s = window.getSelection();
            s.removeAllRanges();
            s.addRange(range);
            return document.execCommand('insertText', false, txt);
          } catch (_) { return false; }
        }, el, text).catch(() => false);

        if (ok) {
          log(`  ✅ 추가 섹션 입력 완료 (insertText, ${text.length}자)`);
          return true;
        }
      } catch (_) {}
    }
  }

  log('  ⚠️  추가 섹션 입력 실패');
  return false;
}

// ── SE 에디터 카테고리 자동 선택 ────────────────────────────────────────────
async function selectCategory(page, category) {
  const catMap = {
    '리빙':   ['리빙', '생활', '홈'],
    '주방용품': ['주방', '요리', '음식'],
    '청소용품': ['생활', '홈', '리빙'],
    '수납정리': ['생활', '홈', '리빙'],
    '홈데코':  ['인테리어', '홈데코', '리빙'],
    '가전제품': ['가전', '전자', 'IT'],
    '침구류':  ['리빙', '생활', '홈'],
  };
  const targets = catMap[category] || ['리빙'];
  log(`  🏷️  카테고리 선택 시도: ${category}`);
  try {
    for (const frame of [page, ...page.frames()]) {
      // select 태그 방식
      const sel = await frame.$('select[name*="category"], select[id*="category"], .se-category select');
      if (sel) {
        const opts = await sel.$$('option');
        for (const opt of opts) {
          const text = (await opt.textContent() || '').trim();
          if (targets.some(t => text.includes(t))) {
            await sel.selectOption({ label: text });
            await wait(400, 800);
            log(`  ✅ 카테고리 선택: ${text}`);
            return true;
          }
        }
      }
      // 버튼/패널 방식
      const catBtn = frame.locator('[class*="category"] button, .se-category-title, [class*="Category"] button').first();
      if (await catBtn.count() > 0) {
        await catBtn.click();
        await wait(600, 1200);
        for (const t of targets) {
          const opt = frame.locator(`li:has-text("${t}"), [class*="category"] li:has-text("${t}")`).first();
          if (await opt.count() > 0) {
            await opt.click();
            await wait(400, 800);
            log(`  ✅ 카테고리 선택: ${t}`);
            return true;
          }
        }
      }
    }
    log('  ℹ️  카테고리 선택 영역을 찾지 못했습니다');
  } catch (e) {
    log(`  ⚠️  카테고리 선택 오류: ${e.message}`);
  }
  return false;
}

// ── 에디터 태그 입력 ─────────────────────────────────────────────────────────
async function addTagsToEditor(page, hashtags) {
  const tagSelectors = [
    'input[placeholder*="태그를 입력"]',
    'input[placeholder*="태그"]',
    'input[placeholder*="태그 추가"]',
    'input[class*="tag"]',
    '.se-tag-input input',
    '[class*="TagInput"] input',
    'input[id*="tag"]',
    '.blog_tag input',
    '.tag_editor input',
    '.tags_input input',
    '.tag-input input',
    'input[name*="tag"]',
    '#tagArea input',
    '[data-tag] input',
    '.se-tag input',
  ];
  const enterTags = async (el, frame) => {
    const tags = hashtags.split(/[\s,]+/).map(t => t.replace(/^#/, '')).filter(Boolean).slice(0, 10);
    for (const tag of tags) {
      await el.click().catch(() => {});
      await sleep(rand(150, 300));
      await (frame || page).keyboard.insertText(tag);
      await sleep(rand(150, 300));
      await page.keyboard.press('Enter');
      await sleep(rand(200, 500));
    }
    log(`  🏷️  태그 입력 완료: ${tags.join(', ')} (${tags.length}개)`);
    return true;
  };

  try {
    // 태그 영역은 에디터 하단 → 하단까지 스크롤 후 탐색
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(rand(800, 1200));
    await page.mouse.wheel(0, 500);
    await sleep(rand(400, 700));

    // 1차: 셀렉터 탐색 (메인 + 프레임)
    for (const frame of [page, ...page.frames()]) {
      for (const sel of tagSelectors) {
        const el = await frame.$(sel).catch(() => null);
        if (!el) continue;
        const box = await el.boundingBox().catch(() => null);
        if (!box) continue;
        return await enterTags(el, frame);
      }
    }

    // 2차: 뷰포트 하단 INPUT 탐색 (SE 에디터 하단 태그 입력창)
    const vp = page.viewportSize() || { width: 1366, height: 768 };
    const bottomInputs = await page.$$('input[type="text"], input:not([type])').catch(() => []);
    for (const inp of bottomInputs) {
      const box = await inp.boundingBox().catch(() => null);
      if (!box || box.y < vp.height * 0.6) continue;   // 화면 하단 60% 이하만
      return await enterTags(inp);
    }

    // 3차: Tab 키로 태그 입력 필드 탐색
    log('  ⏳ Tab 탐색으로 태그 입력 시도...');
    for (let t = 0; t < 8; t++) {
      await page.keyboard.press('Tab');
      await sleep(rand(200, 400));
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return null;
        return {
          tag:         el.tagName,
          type:        el.getAttribute('type') || '',
          placeholder: el.getAttribute('placeholder') || '',
          id:          el.id || '',
          cls:         el.className || '',
        };
      }).catch(() => null);

      if (focused && focused.tag === 'INPUT' && (
        focused.placeholder.includes('태그') ||
        focused.id.toLowerCase().includes('tag') ||
        focused.cls.toLowerCase().includes('tag')
      )) {
        const tags = hashtags.split(/[\s,]+/).map(t => t.replace(/^#/, '')).filter(Boolean).slice(0, 10);
        for (const tag of tags) {
          await page.keyboard.insertText(tag);
          await sleep(rand(150, 300));
          await page.keyboard.press('Enter');
          await sleep(rand(200, 500));
        }
        log(`  🏷️  태그 입력 완료 (Tab 탐색, ${tags.length}개)`);
        return true;
      }
    }

    log('  ℹ️  태그 입력 필드를 찾지 못했어요 (수동 입력 권장)');
  } catch (e) {
    log(`  ⚠️  태그 입력 오류: ${e.message}`);
  }
  return false;
}

// ── 공개 설정 확인 + 설정 ─────────────────────────────────────────────────────
async function ensurePublicSetting(page) {
  try {
    // 공개 설정 버튼/셀렉트 찾기
    const publicSelectors = [
      'select[name*="openType"]',
      'select[class*="open"]',
      '[class*="publish"] select',
    ];
    for (const frame of [page, ...page.frames()]) {
      for (const sel of publicSelectors) {
        const el = await frame.$(sel).catch(() => null);
        if (!el) continue;
        // 현재 값 확인
        const val = await el.evaluate(e => e.value).catch(() => '');
        if (val && val !== '0' && !val.toLowerCase().includes('public')) {
          // 공개로 변경 시도
          await el.selectOption({ index: 0 }).catch(() => {});
          log('  🔓 공개 설정 확인 완료');
        } else {
          log('  🔓 공개 설정: 이미 공개 상태');
        }
        return;
      }
    }
    // 라디오 버튼 방식
    for (const frame of [page, ...page.frames()]) {
      const publicRadio = frame.locator('input[value*="public"], label:has-text("전체공개"), label:has-text("공개")').first();
      if (await publicRadio.count() > 0) {
        await publicRadio.click().catch(() => {});
        log('  🔓 전체공개로 설정 완료');
        return;
      }
    }
  } catch (e) {
    log(`  ⚠️  공개 설정 확인 오류: ${e.message}`);
  }
}

// ── 네이버 블로그 에디터 자동 입력 + 임시저장 ────────────────────────────────
async function writeNaverBlogPost(page, title, body, options = {}) {
  const {
    imageUrl = '', imageUrls = [],
    category = '리빙', hashtags = '',
    keyword = '',
    coupangLink = '', coupangName = '', coupangPrice = '',
  } = options;
  // imageUrls 우선, 없으면 단일 imageUrl 사용
  const allImages = imageUrls.length ? imageUrls : (imageUrl ? [imageUrl] : []);
  log('\n✏️  [글쓰기] 네이버 블로그 에디터 여는 중...');
  await page.goto(`https://blog.naver.com/PostWriteForm.naver?blogId=${MY_BLOG}`,
    { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(6000, 9000);  // SE 에디터 완전 로딩 대기 (JS 번들 무거움)
  await waitIfCaptcha(page);   // 에디터 진입 시 캡차 체크

  // ── 제목 입력 ────────────────────────────────────────────────────────────
  const titleSels = [
    '.se-title-text',
    '[placeholder*="제목을 입력"]',
    'input[placeholder*="제목"]',
    '#inputTitle',
    '[contenteditable="true"][class*="title"]',
    '[data-placeholder*="제목"]',
  ];
  let titleOk = false;
  for (const frame of [page, ...page.frames()]) {
    for (const sel of titleSels) {
      try {
        const el = await frame.$(sel);
        if (!el) continue;
        const box = await el.boundingBox();
        if (!box) continue;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
        await sleep(rand(300, 600));
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await sleep(rand(500, 900));
        await page.keyboard.press('Control+a');
        await sleep(150);
        await humanType(page, title);
        titleOk = true;
        log(`  ✅ 제목: "${title.substring(0, 40)}"`);
        break;
      } catch (_) {}
    }
    if (titleOk) break;
  }
  if (!titleOk) log('  ⚠️  제목 입력 실패 — 수동 입력 필요');

  await wait(1500, 2500);

  // ── 카테고리 선택 ────────────────────────────────────────────────────────
  await selectCategory(page, category);
  await wait(800, 1500);

  // ── 본문을 이미지/쿠팡 마커 기준으로 분할 ───────────────────────────────────
  // [[COUPANG_LINK]] 마커는 본문에서 제거 후 별도 삽입 처리
  const bodyClean = body.replace(/\n?\[\[COUPANG_LINK\]\]\n?/g, '');
  // [[IMG_MARKER_*]] 위치에서 분할 → 각 파트 사이에 이미지 삽입
  const bodyParts = bodyClean.split(/\n?\[\[IMG_MARKER_\d\]\]\n?/);
  // bodyParts[0]: 도입부~개봉기 | [1]: 사용일지~비교 | [2]: 장단점~Q&A | [3]: 별점~마무리
  const firstPart = bodyParts[0] || bodyClean;
  log(`  📐 본문 섹션 분할: ${bodyParts.length}파트 / 이미지 최대 ${bodyParts.length - 1}개 삽입 예정`);

  // ── 본문 1파트 입력 (개선된 다단계 전략) ─────────────────────────────────────
  // SE ONE 에디터는 iframe 내부에 위치하며 버전마다 클래스명이 다를 수 있음
  // SE 에디터 완전 로딩 대기
  await page.waitForFunction(
    () => document.querySelectorAll('[contenteditable="true"]').length > 0,
    { timeout: 20000 }
  ).catch(() => {});
  await sleep(rand(1500, 2500));

  let bodyOk = false;

  const allFrames = [page, ...page.frames()];
  log(`  🔍 에디터 탐색 중 (frame ${allFrames.length}개)...`);

  // ── 클립보드 복사 헬퍼 ─────────────────────────────────────────────────────
  async function setClipboard(text) {
    try {
      await page.evaluate(txt => {
        const ta = document.createElement('textarea');
        ta.value = txt;
        ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;z-index:-1';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }, text);
      return true;
    } catch (_) {}
    try {
      await page.evaluate(txt => navigator.clipboard.writeText(txt), text).catch(() => {});
      return true;
    } catch (_) {}
    return false;
  }

  // ── 후보 에디터 엘리먼트 수집 (크기 기준 내림차순 정렬) ──────────────────────
  const editorCandidates = [];
  for (const fr of allFrames) {
    try {
      const els = await fr.$$('[contenteditable="true"]').catch(() => []);
      for (const el of els) {
        const box = await el.boundingBox().catch(() => null);
        if (!box || box.width < 300 || box.height < 50) continue;
        if (box.y < 60) continue;   // 제목 영역 제외
        editorCandidates.push({ fr, el, box, area: box.width * box.height });
      }
    } catch (_) {}
  }
  editorCandidates.sort((a, b) => b.area - a.area);
  log(`  → contenteditable 후보 ${editorCandidates.length}개 발견`);

  for (const { fr, el, box } of editorCandidates.slice(0, 5)) {
    try {
      log(`  → 에디터 시도: ${Math.round(box.width)}×${Math.round(box.height)} @ y=${Math.round(box.y)} (${fr === page ? 'main' : 'iframe'})`);

      // 클릭으로 포커스
      const cx = box.x + box.width / 2;
      const cy = box.y + Math.min(80, box.height / 2);
      await page.mouse.move(cx, cy, { steps: 8 });
      await sleep(rand(200, 400));
      await page.mouse.click(cx, cy);
      await sleep(rand(600, 1000));
      await fr.evaluate(e => { try { e.focus(); } catch (_) {} }, el).catch(() => {});
      await sleep(200);

      // ── 전략 A: execCommand('insertText') ────────────────────────────────
      const stratA = await fr.evaluate((elem, txt) => {
        try {
          elem.focus();
          const s = window.getSelection();
          if (s) { s.selectAllChildren(elem); }
          document.execCommand('delete', false);
          document.execCommand('insertText', false, txt);
          const len = (elem.innerText || elem.textContent || '').replace(/\s+/g, '').length;
          return len > 20 ? len : 0;
        } catch (_) { return 0; }
      }, el, firstPart).catch(() => 0);

      if (stratA > 20) {
        bodyOk = true;
        log(`  ✅ 본문 입력 완료 (insertText, ${stratA}자)`);
        break;
      }

      // ── 전략 B: 클립보드 복사 → Ctrl+V ──────────────────────────────────
      await setClipboard(firstPart);
      await sleep(rand(300, 500));
      await fr.evaluate(e => { try { e.focus(); } catch (_) {} }, el).catch(() => {});
      await sleep(rand(200, 400));
      await page.keyboard.press('Control+a');
      await sleep(100);
      await page.keyboard.press('Delete');
      await sleep(rand(300, 500));
      await page.keyboard.press('Control+v');
      await wait(3000, 5000);

      const stratB = await fr.evaluate(e =>
        (e.innerText || e.textContent || '').replace(/\s+/g, '').length, el
      ).catch(() => 0);

      if (stratB > 50) {
        bodyOk = true;
        log(`  ✅ 본문 입력 완료 (클립보드 붙여넣기, ${stratB}자)`);
        break;
      }

      // ── 전략 C: keyboard.insertText (500자씩 청크) ───────────────────────
      await fr.evaluate(e => { try { e.focus(); } catch (_) {} }, el).catch(() => {});
      await sleep(rand(300, 500));
      await page.keyboard.press('Control+a');
      await sleep(100);
      await page.keyboard.press('Delete');
      await sleep(200);

      const CHUNK = 500;
      for (let ci = 0; ci < firstPart.length; ci += CHUNK) {
        await page.keyboard.insertText(firstPart.substring(ci, ci + CHUNK));
        await sleep(rand(150, 300));
      }
      await wait(2000, 3000);

      const stratC = await fr.evaluate(e =>
        (e.innerText || e.textContent || '').replace(/\s+/g, '').length, el
      ).catch(() => 0);

      if (stratC > 50) {
        bodyOk = true;
        log(`  ✅ 본문 입력 완료 (청크 입력, ${stratC}자)`);
        break;
      }
    } catch (_) {}
  }

  // ── 폴백: 뷰포트 중앙 클릭 + keyboard.insertText 청크 ──────────────────────
  // ※ SE 에디터는 cross-origin iframe(blog.editor.naver.com)에 있어
  //   DOM evaluate 접근 불가 → keyboard.insertText 가 가장 확실한 방법
  if (!bodyOk) {
    log('  ⏳ [폴백] 뷰포트 클릭 + 키보드 삽입 시도...');
    try {
      const vp = page.viewportSize() || { width: 1366, height: 768 };
      const cx = Math.round(vp.width / 2);
      // 에디터 본문 영역: 뷰포트 상단 40~55% 사이 — 제목/툴바 피하기
      const cy = Math.round(vp.height * 0.52);
      await page.mouse.move(cx, cy, { steps: 10 });
      await sleep(rand(300, 500));
      await page.mouse.click(cx, cy);
      await sleep(rand(1000, 1500));   // 에디터 포커스 충분히 대기

      // 기존 내용 선택 후 제거 (이전 입력 잔여물 방지)
      await page.keyboard.press('Control+a');
      await sleep(200);
      await page.keyboard.press('Delete');
      await sleep(300);

      // keyboard.insertText: 청크 단위 삽입 (cross-origin iframe도 통과)
      const CHUNK = 400;
      for (let ci = 0; ci < firstPart.length; ci += CHUNK) {
        await page.keyboard.insertText(firstPart.substring(ci, ci + CHUNK));
        await sleep(rand(120, 280));
      }
      await wait(2000, 3500);
      bodyOk = true;
      log(`  ✅ 본문 입력 완료 (키보드 삽입, ${firstPart.length}자)`);
    } catch (e) {
      log(`  ⚠️  본문 입력 실패 — 수동 입력 필요 (${e.message})`);
    }
  }
  if (!bodyOk) log('  ⚠️  본문 입력 실패 — 수동 입력 필요');

  // ── 본문 입력 검증 (cross-origin iframe은 DOM 접근 불가 → 건너뜀) ──────────
  if (bodyOk) {
    let inputtedLen = 0;
    for (const fr of allFrames) {
      for (const sel of ['.se-main-container', '.se-content', '[contenteditable="true"]', '[class*="se-fs"]']) {
        const len = await fr.evaluate(s => {
          const el = document.querySelector(s);
          return el ? (el.innerText || el.textContent || '').length : 0;
        }, sel).catch(() => 0);
        if (len > inputtedLen) inputtedLen = len;
      }
    }
    if (inputtedLen > 100) {
      log(`  ✅ 본문 검증: ${inputtedLen.toLocaleString()}자 감지됨`);
    } else if (inputtedLen > 0) {
      log(`  ℹ️  본문 검증: ${inputtedLen}자 감지 (에디터가 cross-origin iframe이면 정상)`);
    } else {
      log('  ℹ️  본문 검증: DOM 접근 불가 (cross-origin SE 에디터) — 입력은 정상 처리됨');
    }
  }

  // ── 이미지 중간 삽입 + 나머지 섹션 추가 입력 ─────────────────────────────
  // bodyParts[1], [2], ... 앞에 각각 이미지 삽입 후 텍스트 추가
  if (bodyOk && bodyParts.length > 1) {
    for (let i = 1; i < bodyParts.length; i++) {
      await wait(1500, 2500);
      const imgUrl = allImages[i - 1] || '';
      let imgPath = null;

      if (imgUrl) {
        log(`  🖼️  [${i}번 이미지] 쇼핑 이미지 다운로드 중...`);
        imgPath = await downloadImageToTemp(imgUrl);
      }

      // 쇼핑 이미지 없거나 실패 → AI 이미지 생성 (keyword 있을 때)
      if (!imgPath && keyword) {
        log(`  🎨 [${i}번] 쇼핑 이미지 없음 → AI 이미지 생성으로 대체...`);
        imgPath = await generateAndDownloadAIImage(keyword, i - 1);
      }

      if (imgPath) {
        await insertImageToEditor(page, imgPath);
        await wait(2000, 3500);
      } else {
        log(`  ℹ️  [${i}번 이미지] 건너뜁니다`);
      }

      if (bodyParts[i]) {
        log(`  📝 본문 ${i + 1}파트 이어서 입력 중...`);
        await appendBodyText(page, '\n\n' + bodyParts[i]);
        await wait(1000, 1800);
      }
    }
    log(`  ✅ 전체 본문 입력 완료 (${bodyParts.length}파트)`);
  } else if (bodyOk) {
    // 마커 없음 — 이미지 1개 맨 끝에 (쇼핑 → AI 폴백)
    await wait(1500, 2500);
    let imgPath = null;

    if (allImages[0]) {
      log('  🖼️  상품 이미지 다운로드 중...');
      imgPath = await downloadImageToTemp(allImages[0]);
    }

    if (!imgPath && keyword) {
      log('  🎨 상품 이미지 없음 → AI 이미지 생성으로 대체...');
      imgPath = await generateAndDownloadAIImage(keyword, 0);
    }

    if (imgPath) {
      await insertImageToEditor(page, imgPath);
      await wait(1500, 2500);
    } else {
      log('  ℹ️  이미지 없음 — 텍스트만 저장합니다');
    }
  }

  await wait(1500, 2500);

  // ── 쿠팡 파트너스 링크 삽입 ──────────────────────────────────────────────
  if (coupangLink) {
    log('  🔗 쿠팡 파트너스 링크 삽입 중...');
    const linkLabel = coupangName
      ? `🛒 "${coupangName.substring(0, 20)}..." 쿠팡에서 최저가 확인하기 →`
      : `🛒 이 제품 쿠팡에서 최저가 확인하기 →`;

    // SE 에디터에 앵커 태그 삽입 시도
    const bodySelsForLink = [
      '.se-content [contenteditable="true"]',
      '.se-main-container [contenteditable="true"]',
      '[contenteditable="true"][class*="se-fs"]',
    ];
    let linkInserted = false;
    for (const frame of [page, ...page.frames()]) {
      for (const sel of bodySelsForLink) {
        try {
          const el = await frame.$(sel);
          if (!el) continue;
          // execCommand insertHTML로 실제 하이퍼링크 삽입
          linkInserted = await frame.evaluate((elem, url, label) => {
            try {
              elem.focus();
              // 커서를 맨 끝으로
              const range = document.createRange();
              range.selectNodeContents(elem);
              range.collapse(false);
              const sel = window.getSelection();
              sel.removeAllRanges();
              sel.addRange(range);
              // 줄바꿈 + 링크 HTML 삽입
              return document.execCommand('insertHTML', false,
                `<br><br><a href="${url}" target="_blank" rel="noopener noreferrer" `
                + `style="display:inline-block;padding:8px 16px;background:#fe2020;color:#fff;`
                + `border-radius:4px;text-decoration:none;font-weight:bold;">${label}</a><br>`
              );
            } catch (_) { return false; }
          }, el, coupangLink, linkLabel).catch(() => false);

          if (!linkInserted) {
            // 폴백: 텍스트 + URL 그냥 붙이기
            await appendBodyText(page, `\n\n${linkLabel}\n${coupangLink}`);
            linkInserted = true;
          }
          if (linkInserted) {
            log(`  ✅ 쿠팡 링크 삽입 완료`);
            break;
          }
        } catch (_) {}
      }
      if (linkInserted) break;
    }
    await wait(800, 1500);
  }

  // ── 태그 입력 ─────────────────────────────────────────────────────────────
  if (hashtags) {
    await addTagsToEditor(page, hashtags);
    await wait(800, 1500);
  }

  // ── 공개 설정 확인 ────────────────────────────────────────────────────────
  await ensurePublicSetting(page);
  await wait(800, 1500);

  // ── 임시저장 (최대 3회 시도: 버튼 클릭 → Ctrl+S → 폴백) ──────────────────
  // ※ 'button:has-text("저장")' 은 발행 버튼과 혼동될 수 있어 제외
  const draftSels = [
    'button:has-text("임시저장")',
    'button[class*="draft"]',
    '.draft_save',
    '[data-action*="draft"]',
    '[aria-label*="임시저장"]',
    'button[title*="임시저장"]',
  ];
  let saved = false;

  // 시도 1 & 2: 버튼 탐색 (모든 프레임 포함)
  for (let attempt = 1; attempt <= 2 && !saved; attempt++) {
    for (const fr of [page, ...page.frames()]) {
      for (const sel of draftSels) {
        try {
          const btn = fr.locator(sel).first();
          if (await btn.count() === 0) continue;
          const bh = await btn.elementHandle();
          if (bh) { await humanClick(page, bh); } else { await btn.click(); }
          await wait(2500, 4000);
          log(`  ✅ 임시저장 완료! (${attempt}회차)`);
          saved = true;
          break;
        } catch (_) {}
      }
      if (saved) break;
    }
    if (!saved && attempt === 1) {
      log('  ⏳ 임시저장 버튼 못 찾음 — 에디터 포커스 후 재시도...');
      // 에디터 영역 클릭해서 포커스 확보 후 재시도
      const vp = page.viewportSize() || { width: 1366, height: 768 };
      await page.mouse.click(Math.round(vp.width / 2), Math.round(vp.height * 0.52)).catch(() => {});
      await sleep(rand(500, 900));
      await wait(1500, 2500);
    }
  }

  // 시도 3: Ctrl+S 단축키 (SE 에디터 임시저장 단축키)
  if (!saved) {
    try {
      log('  ⏳ Ctrl+S 단축키로 임시저장 시도...');
      await page.keyboard.press('Control+s');
      await wait(2500, 4000);
      // 저장 확인 다이얼로그가 뜰 수 있음 → 확인 버튼 클릭
      const confirmSels = [
        'button:has-text("확인")',
        'button:has-text("임시저장")',
        '.confirm_btn',
      ];
      for (const sel of confirmSels) {
        const btn = page.locator(sel).first();
        if (await btn.count() > 0) {
          await btn.click().catch(() => {});
          await wait(1500, 2500);
          break;
        }
      }
      log('  ✅ 임시저장 완료! (Ctrl+S)');
      saved = true;
    } catch (_) {}
  }

  if (!saved) log('  ⚠️  임시저장 버튼을 찾지 못했어요 — 직접 저장해주세요');

  return { titleOk, bodyOk, saved };
}

// ── 작성 이력 관리 (written.json) ────────────────────────────────────────────
function loadWrittenHistory() {
  if (!fs.existsSync(WRITTEN_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(WRITTEN_FILE, 'utf8')); }
  catch (_) { return []; }
}

function saveWrittenHistory(history) {
  fs.writeFileSync(WRITTEN_FILE, JSON.stringify(history.slice(0, 200), null, 2), 'utf8');
}

function markWritten(keyword, title) {
  const history = loadWrittenHistory();
  history.unshift({ date: TODAY, keyword, title });
  saveWrittenHistory(history);
}

// ── 스마트 키워드 선택 (중복 방지 + 트렌드 우선) ─────────────────────────────
function selectSmartKeyword(trendKws, baseKws, usedInThisRun = []) {
  const history = loadWrittenHistory();

  // 최근 7일 내 작성한 키워드 Set
  const recentKws = new Set(
    history
      .filter(h => {
        try {
          // TODAY 형식: "2026-05-25"
          const [y, m, d] = h.date.split('-').map(Number);
          const hDate = new Date(y, m - 1, d);
          const diff = (Date.now() - hDate.getTime()) / 86400000;
          return diff <= 7;
        } catch (_) { return false; }
      })
      .map(h => h.keyword)
  );

  // 이번 실행에서 이미 쓴 것도 제외
  usedInThisRun.forEach(k => recentKws.add(k));

  const candidates = [...trendKws, ...baseKws];
  // 최근 7일 내 안 쓴 것 우선
  const fresh = candidates.filter(k => !recentKws.has(k));
  if (fresh.length) {
    log(`  🎯 키워드 선택: "${fresh[0]}" (최근 미사용 · 트렌드 우선)`);
    return fresh[0];
  }
  // 모두 최근에 썼다면 가장 오래된 것
  const oldest = candidates.reduce((prev, k) => {
    const lastUsed = history.filter(h => h.keyword === k).sort((a, b) => a.date > b.date ? -1 : 1)[0];
    const prevUsed = history.filter(h => h.keyword === prev).sort((a, b) => a.date > b.date ? -1 : 1)[0];
    return (!lastUsed || (prevUsed && lastUsed.date < prevUsed.date)) ? k : prev;
  }, candidates[0]);
  log(`  🔄 키워드 선택: "${oldest}" (가장 오래 전에 작성)`);
  return oldest || baseKws[0];
}

// ── 카테고리 감지 헬퍼 ───────────────────────────────────────────────────────
function detectCategory(keyword) {
  const catMapRun = [
    [['주방','냄비','프라이팬','컵','접시','수저','도마','칼','그릇','조리'], '주방용품'],
    [['청소','진공','청소기','걸레','빗자루','먼지','세제'], '청소용품'],
    [['수납','정리','박스','서랍','선반','바구니','트레이'], '수납정리'],
    [['인테리어','소품','쿠션','캔들','조명','디퓨저','화분'], '홈데코'],
    [['가전','전자','공기청정기','세탁','냉장','에어컨'], '가전제품'],
    [['침구','이불','베개','매트리스','토퍼'], '침구류'],
  ];
  for (const [keys, cat] of catMapRun) {
    if (keys.some(k => keyword.includes(k))) return cat;
  }
  return '리빙';
}

// ── 글쓰기 모드 메인 함수 (v2: 스마트 키워드 · 재시도 · 이력 관리) ─────────────
async function runWriteMode(page, keywords) {
  const writeCount = config.settings.writeCount ?? 1;
  log(`\n✏️  [글쓰기 모드] 오늘 작성할 글: ${writeCount}개`);

  // 작성 이력 미리 로드
  const writtenHistory = loadWrittenHistory();
  const todayWritten   = writtenHistory.filter(h => h.date === TODAY).map(h => h.keyword);
  if (todayWritten.length) log(`  📋 오늘 이미 작성한 키워드: ${todayWritten.join(', ')}`);

  const results      = [];
  const usedThisRun  = [];

  for (let i = 0; i < writeCount; i++) {
    // ── 스마트 키워드 선택 ──────────────────────────────────────────────────
    const keyword = selectSmartKeyword(keywords, NICHES, [...todayWritten, ...usedThisRun]);
    usedThisRun.push(keyword);
    log(`\n[${i + 1}/${writeCount}] 키워드: "${keyword}"`);
    const r = { keyword, title: '', status: '실패', error: '' };
    const category = detectCategory(keyword);

    // ── 최대 2개 키워드까지 자동 재시도 ────────────────────────────────────
    let success = false;
    const tryKeywords = [keyword];
    // 첫 번째 키워드 실패 시 다음 후보 준비
    const backup = selectSmartKeyword(keywords, NICHES, [...todayWritten, ...usedThisRun]);
    if (backup !== keyword) tryKeywords.push(backup);

    for (const kw of tryKeywords) {
      try {
        await ensureLoggedIn(page);

        // ① 네이버 쇼핑 상품 정보 수집
        log(`  🛍️  네이버 쇼핑 상품 수집: "${kw}"`);
        const product = await fetchProductInfo(page, kw);
        await wait(1500, 2500);

        // ② 쿠팡 상품 + 파트너스 링크 수집 (파트너ID 설정 시)
        let coupangData = null;
        if (COUPANG_ID) {
          coupangData = await fetchCoupangProduct(page, kw, COUPANG_ID);
          await wait(1500, 2500);
        } else {
          log('  ℹ️  쿠팡파트너스 ID 미설정 — config.json의 coupangPartnerId를 입력하면 링크가 자동 삽입됩니다');
        }

        // ③ 글 생성 (AI 우선 → 템플릿 폴백)
        let post = await generateBlogPostAI(kw, product);
        if (!post) post = generateBlogPost(kw, product);
        r.keyword = kw;
        r.title   = post.title;
        log(`  📝 제목: "${post.title}"`);
        log(`  📏 본문: ${post.body.replace(/\[\[.*?\]\]/g, '').length}자`);

        // ④ SEO 사전 점수
        const seo = checkSEO(post.title, post.body, post.hashtags.split(' '));
        log(`  🔍 SEO 사전 점수: ${seo.score} ${seo.grade}`);
        if (seo.issues.length) seo.issues.forEach(iss => log(`     ⚠️  ${iss}`));

        // ⑤ 에디터에 입력 + 임시저장
        const result = await writeNaverBlogPost(page, post.title, post.body, {
          imageUrls:    post.imageUrls || (post.imageUrl ? [post.imageUrl] : []),
          category,
          hashtags:     post.hashtags,
          keyword:      kw,
          coupangLink:  coupangData?.affiliateUrl  || '',
          coupangName:  coupangData?.name          || '',
          coupangPrice: coupangData?.priceStr      || '',
        });
        r.status = result.saved ? '임시저장' : (result.titleOk || result.bodyOk) ? '부분완료' : '실패';

        // 성공 시 이력 저장
        if (result.saved || result.titleOk || result.bodyOk) {
          markWritten(kw, post.title);
          // stats.json에도 기록
          const st = loadStats();
          if (!Array.isArray(st.drafts)) st.drafts = [];
          st.drafts.unshift({ date: TODAY, keyword: kw, title: post.title, status: r.status, seo: seo.grade });
          st.drafts = st.drafts.slice(0, 30);
          saveStats(st);
          success = true;
          break;
        }

      } catch (e) {
        r.error  = e.message;
        r.status = '실패';
        log(`  ❌ 오류 (${kw}): ${e.message}`);
        if (tryKeywords.indexOf(kw) < tryKeywords.length - 1) {
          log(`  🔄 다음 키워드로 재시도: "${tryKeywords[tryKeywords.indexOf(kw) + 1]}"`);
          await wait(3000, 5000);
        }
      }
    }

    results.push(r);
    if (i < writeCount - 1) await countdown();
  }

  // ── 결과 보고 ────────────────────────────────────────────────────────────
  const ok   = results.filter(r => r.status === '임시저장').length;
  const part = results.filter(r => r.status === '부분완료').length;
  log(`\n✅ 글쓰기 완료: ${ok}개 임시저장 / ${part}개 부분완료 / 총 ${writeCount}개`);
  results.forEach((r, idx) => log(`  ${idx+1}. [${r.keyword}] "${r.title}" — ${r.status}`));

  // 오늘까지의 총 작성 현황
  const todayAll = loadWrittenHistory().filter(h => h.date === TODAY);
  log(`  📅 오늘 총 작성: ${todayAll.length}개 (누적 이력 기준)`);

  return results;
}

// ════════════════════════════════════════════════════════════════════════════
// ── STEP 0: 내 블로그 대댓글 ─────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
async function handleMyBlogReplies(page) {
  log('\n📬 [STEP 0] 내 블로그 새 댓글 확인 중...\n');
  let repliedCount = 0;

  try {
    await page.goto(`https://blog.naver.com/${MY_BLOG}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await wait(2500, 4000);
    await humanScroll(page);

    let postLinks = [];
    for (const frame of [page, ...page.frames()]) {
      const links = await frame.evaluate(() =>
        [...document.querySelectorAll('a[href*="PostView"], a[href*="/post/"]')]
          .map(a => a.href).filter(Boolean).slice(0, 5)
      ).catch(() => []);
      if (links.length) { postLinks = links; break; }
    }

    if (!postLinks.length) { log('  ℹ️  최근 포스팅을 찾지 못했습니다\n'); return 0; }
    log(`  → 최근 포스팅 ${postLinks.length}개 확인 중...`);

    for (const postUrl of postLinks) {
      try {
        await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await wait(2500, 4000);
        await page.mouse.wheel(0, rand(800, 1500)); await sleep(rand(800, 1400));
        await page.mouse.wheel(0, rand(400, 800));  await sleep(rand(500, 1000));

        for (const frame of [page, ...page.frames()]) {
          try {
            const unanswered = await frame.evaluate((myId) => {
              const comments = document.querySelectorAll('.u_cbox_comment, .u_cbox_list > li');
              const targets  = [];
              comments.forEach((c, idx) => {
                const author = (c.querySelector('.u_cbox_nick, .u_cbox_id') || {}).textContent?.trim() || '';
                if (author === myId) return;
                const replied = [...c.querySelectorAll('.u_cbox_reply .u_cbox_nick, .u_cbox_reply .u_cbox_id')]
                  .some(r => r.textContent.trim() === myId);
                if (replied) return;
                const text = (c.querySelector('.u_cbox_content, .u_cbox_text') || {}).textContent?.trim() || '';
                if (!text) return;
                if (c.querySelector('.u_cbox_btn_reply, button[data-action="reply"], a[class*="reply"]'))
                  targets.push({ idx, text: text.substring(0, 80) });
              });
              return targets;
            }, MY_BLOG).catch(() => []);

            if (!unanswered?.length) continue;
            log(`  💬 미답변 댓글 ${unanswered.length}개 발견`);

            for (const item of unanswered) {
              try {
                const comments = await frame.$$('.u_cbox_comment, .u_cbox_list > li');
                const replyBtn = await comments[item.idx]?.$('.u_cbox_btn_reply, button[data-action="reply"], a[class*="reply"]');
                if (!replyBtn) continue;

                const box = await replyBtn.boundingBox();
                if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
                await sleep(rand(200, 500));
                await replyBtn.click();
                await wait(1000, 2000);

                const replyInput = await frame.$('.u_cbox_write_comment textarea, .u_cbox_reply_write textarea, textarea[placeholder*="답글"]');
                if (!replyInput) continue;

                const replyText = makeReplyMsg(item.text);
                await replyInput.click();
                await wait(400, 800);
                await humanType(page, replyText);
                await wait(1000, 2000);

                const submitBtn = await frame.$('.u_cbox_btn_upload, button[data-action="write"], button:has-text("등록")');
                if (submitBtn) {
                  await submitBtn.click();
                  await wait(2000, 3000);
                  log(`  ✅ 대댓글: "${replyText.substring(0, 35)}..."`);
                  repliedCount++;
                }
                await wait(1500, 2500);
              } catch (e) { log(`  ⚠️  대댓글 오류: ${e.message}`); }
            }
          } catch (_) {}
        }
        await wait(2000, 3500);
      } catch (e) { log(`  ⚠️  포스팅 접근 오류: ${e.message}`); }
    }
  } catch (e) { log(`  ⚠️  내 블로그 확인 오류: ${e.message}`); }

  log(repliedCount > 0 ? `\n  ✅ 총 ${repliedCount}개 대댓글 완료\n` : '  ℹ️  새 댓글이 없거나 모두 답변된 상태입니다\n');
  return repliedCount;
}

// ════════════════════════════════════════════════════════════════════════════
// ── STEP 1: 블로거 탐색 ───────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
async function discoverBloggers(page, existing, trendKeywords = []) {
  log('\n🔍 [STEP 1] 블로거 탐색 중...\n');
  const collected   = [];
  const allKeywords = [...NICHES, ...trendKeywords];  // 기본 + 트렌드 키워드

  for (const keyword of allKeywords) {
    if (collected.length >= DAILY_LIM) break;
    log(`  🔎 키워드: "${keyword}"`);

    try {
      await ensureLoggedIn(page);
      const url = `https://search.naver.com/search.naver?where=post&query=${encodeURIComponent(keyword)}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await wait(2500, 4000);

      if (page.url().includes('nidlogin')) {
        await doLogin(page);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await wait(2500, 4000);
      }
      await humanScroll(page);

      const uids = await page.evaluate((myBlog) => {
        const found = new Set();
        document.querySelectorAll('a[href]').forEach(a => {
          try {
            const u = new URL(a.href);
            if (u.hostname !== 'blog.naver.com') return;
            const uid = u.pathname.split('/').filter(Boolean)[0];
            if (uid && uid !== myBlog && uid.length > 2 && /^[a-zA-Z0-9_]+$/.test(uid))
              found.add(uid);
          } catch (_) {}
        });
        return [...found];
      }, MY_BLOG);

      log(`    → 후보 ${uids.length}명`);

      for (const uid of uids) {
        if (collected.length >= DAILY_LIM) break;
        const blogUrl = `https://blog.naver.com/${uid}`;
        if (BLACKLIST.has(uid) || BLACKLIST.has(`blog.naver.com/${uid}`)) {
          log(`    🚫 블랙리스트: ${uid}`); continue;
        }
        if (existing.has(blogUrl) || collected.includes(blogUrl)) continue;
        collected.push(blogUrl);
        appendTarget(blogUrl);
        log(`    ✅ ${blogUrl}`);
      }
      await wait(3000, 7000);
    } catch (e) { log(`  ⚠️  "${keyword}" 오류: ${e.message}`); }
  }

  log(`\n📋 신규 수집 ${collected.length}개\n`);
  return collected;
}

// ── 포스팅 읽기 ───────────────────────────────────────────────────────────────
async function getRecentPosts(page, blogUrl) {
  try {
    await page.goto(blogUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await wait(2500, 4000);
    await humanScroll(page);
    let titles = [], postLinks = [];
    for (const frame of [page, ...page.frames()]) {
      if (!titles.length)    titles    = await frame.evaluate(() =>
        [...document.querySelectorAll('.itemSubject, .subject, .post_title, a[class*="title"]')]
          .map(e => e.textContent.trim()).filter(t => t.length > 3).slice(0, 3)
      ).catch(() => []);
      if (!postLinks.length) postLinks = await frame.evaluate(() =>
        [...document.querySelectorAll('a[href*="PostView"], a[href*="/post/"]')]
          .map(a => a.href).filter(Boolean).slice(0, 3)
      ).catch(() => []);
    }
    return { titles, postLinks };
  } catch (_) { return { titles: [], postLinks: [] }; }
}

async function getPostContent(page, postUrl) {
  try {
    await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await wait(2500, 4000);
    await humanScroll(page);
    for (const frame of [page, ...page.frames()]) {
      const c = await frame.evaluate(() => {
        const el = document.querySelector('.se-main-container, .post_body, #postListBody, .se_component_wrap');
        return el ? el.innerText.substring(0, 600) : '';
      }).catch(() => '');
      if (c && c.length > 30) return c;
    }
  } catch (_) {}
  return '';
}

// ── 서로이웃 헬퍼 ─────────────────────────────────────────────────────────────
async function doNeighborRequest(page, titles, niche) {
  const msg = makeNeighborMsg(titles, niche);
  for (const frame of [page, ...page.frames()]) {
    try {
      const btn = frame.locator('a:has-text("서로이웃"), a:has-text("이웃추가"), button:has-text("이웃추가")').first();
      if (await btn.count() === 0) continue;
      const box = await btn.boundingBox();
      if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
      await sleep(rand(100, 300));
      await btn.click(); await wait(2000, 3500);
      const radio = page.locator('input[value="MUTUAL"], label:has-text("서로이웃")').first();
      if (await radio.count() > 0) { await radio.click(); await wait(400, 800); }
      const ta = page.locator('textarea').first();
      if (await ta.count() > 0) { await ta.click(); await ta.fill(''); await humanType(page, msg); await wait(800, 1500); }
      const sub = page.locator('button:has-text("신청"), button:has-text("확인"), .btn_request').first();
      if (await sub.count() > 0) { await sub.click(); await wait(1500, 2500); }
      log('  ✅ 서로이웃 신청 완료');
      return { ok: true, msg };
    } catch (_) {}
  }
  log('  ℹ️  이미 이웃이거나 버튼 없음');
  return { ok: false, msg: '' };
}

// ── 댓글 헬퍼 ─────────────────────────────────────────────────────────────────
async function doComment(page, titles, content) {
  const text = makeComment(titles[0] || '', content);
  await page.mouse.wheel(0, rand(600, 1200)); await sleep(rand(700, 1300));
  await page.mouse.wheel(0, rand(300, 700));  await sleep(rand(500, 1000));
  for (const frame of [page, ...page.frames()]) {
    try {
      const ta = frame.locator('.u_cbox_input, textarea[placeholder*="댓글"], #cbox_module textarea').first();
      if (await ta.count() === 0) continue;
      const box = await ta.boundingBox();
      if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
      await sleep(rand(100, 300));
      await ta.click(); await wait(600, 1200);
      await humanType(page, text); await wait(1000, 2000);
      const sub = frame.locator('.u_cbox_btn_upload, button:has-text("등록")').first();
      if (await sub.count() > 0) {
        await sub.click(); await wait(2000, 3500);
        log(`  ✅ 댓글: "${text.substring(0, 40)}..."`);
        return { ok: true, text };
      }
    } catch (_) {}
  }
  log('  ⚠️  댓글창 못 찾음');
  return { ok: false, text: '' };
}

// ── 공감 헬퍼 ─────────────────────────────────────────────────────────────────
async function doLike(page) {
  for (const frame of [page, ...page.frames()]) {
    try {
      const btn = frame.locator('.u_likeit_txt, button[data-type="sympathy"], .btn_like, .sym_like_btn').first();
      if (await btn.count() === 0) continue;
      const box = await btn.boundingBox();
      if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
      await sleep(rand(200, 500));
      await btn.click(); await wait(1000, 2000);
      log('  ✅ 공감(♥) 클릭');
      return true;
    } catch (_) {}
  }
  log('  ℹ️  공감 버튼 없음');
  return false;
}

// ════════════════════════════════════════════════════════════════════════════
// ── 모드별 실행 ───────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
async function runMode(page, mode, targets, doneMap) {
  const LABEL = { write:'글쓰기', neighbor:'서로이웃', comment:'댓글', all:'통합(공감+이웃+댓글)', like:'공감' };
  log(`\n▶ [${LABEL[mode]}] ${targets.length}개 처리 시작`);
  showETA(targets.length);
  const results = [];

  for (let i = 0; i < targets.length; i++) {
    const blogUrl = targets[i];
    const niche   = NICHES[i % NICHES.length];
    log(`\n[${i + 1}/${targets.length}] ${blogUrl}`);
    const r = { url: blogUrl, liked: false, neighborMsg: '', comment: '', status: '실패', error: '' };

    try {
      await ensureLoggedIn(page);

      if (mode === 'neighbor') {
        const { titles } = await getRecentPosts(page, blogUrl);
        log(`  📖 제목: ${titles.slice(0,2).join(' / ') || '(읽기 실패)'}`);
        const nbr = await doNeighborRequest(page, titles, niche);
        r.neighborMsg = nbr.msg;
        r.status = nbr.ok ? '성공' : '스킵';

      } else if (mode === 'comment') {
        const { titles, postLinks } = await getRecentPosts(page, blogUrl);
        log(`  📖 제목: ${titles.slice(0,2).join(' / ') || '(읽기 실패)'}`);
        if (!postLinks.length) { log('  ⚠️  포스팅 없음'); r.status = '스킵'; }
        else {
          const content = await getPostContent(page, postLinks[0]);
          const cmt = await doComment(page, titles, content);
          r.comment = cmt.text;
          r.status  = cmt.ok ? '성공' : '스킵';
        }

      } else if (mode === 'like') {
        const { postLinks } = await getRecentPosts(page, blogUrl);
        if (!postLinks.length) { r.status = '스킵'; }
        else {
          await page.goto(postLinks[0], { waitUntil: 'domcontentloaded', timeout: 20000 });
          await wait(2500, 4000); await humanScroll(page);
          r.liked  = await doLike(page);
          r.status = r.liked ? '성공' : '스킵';
        }

      } else if (mode === 'all') {
        // ① 블로그 홈 → 포스팅 목록 + 서로이웃
        const { titles, postLinks } = await getRecentPosts(page, blogUrl);
        log(`  📖 제목: ${titles.slice(0,2).join(' / ') || '(읽기 실패)'}`);
        const nbr = await doNeighborRequest(page, titles, niche);
        r.neighborMsg = nbr.msg;

        // ② 최근 포스팅 → 공감 + 댓글
        if (postLinks.length > 0) {
          const content = await getPostContent(page, postLinks[0]);
          r.liked = await doLike(page);
          await wait(800, 1500);
          const cmt = await doComment(page, titles, content);
          r.comment = cmt.text;
        } else {
          log('  ⚠️  포스팅 없음 — 공감/댓글 스킵');
        }
        r.status = '성공';
      }

      if (r.status === '성공') markDone(blogUrl, mode);

    } catch (e) {
      r.error  = e.message;
      r.status = '실패';
      log(`  ❌ 오류: ${e.message}`);
    }

    results.push(r);
    if (i < targets.length - 1) await countdown();
  }
  return results;
}

// ── 결과 저장 ─────────────────────────────────────────────────────────────────
function saveReport(modeName, results) {
  const ok   = results.filter(r => r.status === '성공').length;
  const skip = results.filter(r => r.status === '스킵').length;
  const ng   = results.filter(r => r.status === '실패').length;
  const errs = results.filter(r => r.error).map(r => `  ${r.url}: ${r.error}`);

  let report = `\n✅ 완료 보고 [${modeName}] ${TODAY}\n`;
  report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  report += `총 처리: ${results.length}명  성공: ${ok}  스킵: ${skip}  실패: ${ng}\n\n`;
  report += '[처리 목록]\n';
  results.forEach((r, i) => {
    report += `${i + 1}. ${r.url}\n`;
    if (r.liked)       report += `   - 공감: ✅\n`;
    if (r.neighborMsg) report += `   - 서로이웃: "${r.neighborMsg.substring(0, 55)}..."\n`;
    if (r.comment)     report += `   - 댓글: "${r.comment.substring(0, 55)}..."\n`;
    report += `   - 결과: ${r.status}${r.error ? '  |  오류: ' + r.error : ''}\n\n`;
  });
  report += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  if (errs.length) report += `⚠️  오류 목록:\n${errs.join('\n')}\n`;

  log(report);
  fs.appendFileSync(RESULT_FILE, report, 'utf8');
  log(`📄 결과 저장: ${RESULT_FILE}`);

  // 히스토리를 stats.json 에 추가 (최근 14일치)
  const sh = loadStats();
  if (!Array.isArray(sh.history)) sh.history = [];
  const existing = sh.history.findIndex(h => h.date === TODAY && h.mode === modeName);
  const hEntry = { date: TODAY, mode: modeName, total: results.length, success: ok, skip, fail: ng };
  if (existing >= 0) sh.history[existing] = hEntry; else sh.history.unshift(hEntry);
  sh.history = sh.history.slice(0, 14);
  saveStats(sh);
}

// ════════════════════════════════════════════════════════════════════════════
// ── 대시보드 HTML 생성 ─────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
function generateDashboard() {
  const s = loadStats();

  const adIcon   = s.adpost?.status === '운영중' ? '✅' : s.adpost?.status?.includes('심사') ? '🟡' : '❓';
  const adColor  = s.adpost?.status === '운영중' ? '#10b981' : s.adpost?.status?.includes('심사') ? '#f59e0b' : '#6b7280';

  const histRows = (s.history || []).map(h => `
    <tr>
      <td>${h.date}</td>
      <td>${h.mode}</td>
      <td class="center">${h.total}</td>
      <td class="center ok">${h.success}</td>
      <td class="center skip">${h.skip}</td>
      <td class="center fail">${h.fail}</td>
    </tr>`).join('');

  const seoRows = (s.seo || []).map(e => {
    const gradeColor = e.grade?.includes('우수') ? '#10b981' : e.grade?.includes('보통') ? '#f59e0b' : '#ef4444';
    const issueHtml  = e.issues?.length
      ? `<ul>${e.issues.map(i => `<li>${i}</li>`).join('')}</ul>`
      : '<span class="ok">✅ 통과</span>';
    return `
    <tr>
      <td>${e.date || ''}</td>
      <td class="post-title">${e.title || ''}</td>
      <td class="center" style="color:${gradeColor};font-weight:600">${e.score}</td>
      <td>${issueHtml}</td>
    </tr>`;
  }).join('');

  const trendTags = (s.trending || []).map(kw =>
    `<span class="tag">${kw}</span>`
  ).join('');

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>네이버 블로그 대시보드</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Malgun Gothic',sans-serif;background:#f1f5f9;color:#1e293b;min-height:100vh}
  header{background:linear-gradient(135deg,#03c75a 0%,#00a040 100%);color:#fff;padding:28px 40px}
  header h1{font-size:22px;font-weight:700;letter-spacing:-0.5px}
  header p{font-size:13px;opacity:.8;margin-top:6px}
  .container{max-width:1100px;margin:0 auto;padding:32px 24px}

  /* 카드 그리드 */
  .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-bottom:28px}
  @media(max-width:768px){.cards{grid-template-columns:1fr}}
  .card{background:#fff;border-radius:16px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,.07)}
  .card .label{font-size:12px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px}
  .card .value{font-size:32px;font-weight:700;line-height:1.1}
  .card .sub{font-size:13px;color:#64748b;margin-top:6px}
  .card.green .value{color:#10b981}
  .card.blue  .value{color:#3b82f6}

  /* 섹션 */
  .section{background:#fff;border-radius:16px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,.07);margin-bottom:20px}
  .section h2{font-size:15px;font-weight:700;color:#374151;margin-bottom:16px;display:flex;align-items:center;gap:8px}

  /* 트렌드 태그 */
  .tags{display:flex;flex-wrap:wrap;gap:8px}
  .tag{background:#eff6ff;color:#3b82f6;border-radius:20px;padding:6px 14px;font-size:13px;font-weight:500}

  /* 테이블 */
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;padding:10px 12px;background:#f8fafc;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0}
  td{padding:10px 12px;border-bottom:1px solid #f1f5f9;vertical-align:top}
  tr:last-child td{border-bottom:none}
  .center{text-align:center}
  .ok{color:#10b981;font-weight:600}
  .skip{color:#f59e0b;font-weight:600}
  .fail{color:#ef4444;font-weight:600}
  .post-title{max-width:240px;word-break:break-all}
  ul{padding-left:16px;color:#64748b;font-size:12px;line-height:1.8}

  /* 업데이트 시각 */
  .updated{font-size:12px;color:#94a3b8;text-align:right;margin-top:8px}
</style>
</head>
<body>
<header>
  <h1>📊 네이버 블로그 계정관리 대시보드</h1>
  <p>블로그 ID: ${MY_BLOG} &nbsp;|&nbsp; 마지막 업데이트: ${s.lastUpdated || TODAY}</p>
</header>

<div class="container">

  <!-- 상단 카드 3개 -->
  <div class="cards">
    <div class="card blue">
      <div class="label">👥 오늘 방문자</div>
      <div class="value">${s.visitor?.today || '-'}<span style="font-size:16px;font-weight:400"> 명</span></div>
      <div class="sub">누적: ${s.visitor?.total || '-'}명</div>
    </div>
    <div class="card" style="border-top:4px solid ${adColor}">
      <div class="label">💰 애드포스트</div>
      <div class="value" style="font-size:22px;color:${adColor}">${adIcon} ${s.adpost?.status || '-'}</div>
      <div class="sub">${s.adpost?.revenue ? '오늘 수익: ' + s.adpost.revenue : '수익 정보 없음'}</div>
    </div>
    <div class="card green">
      <div class="label">📋 최근 실행</div>
      <div class="value" style="font-size:22px">${s.history?.[0] ? s.history[0].mode : '-'}</div>
      <div class="sub">${s.history?.[0] ? `성공 ${s.history[0].success} / 총 ${s.history[0].total}명` : '기록 없음'}</div>
    </div>
  </div>

  <!-- 트렌드 키워드 -->
  <div class="section">
    <h2>📈 트렌드 키워드 <span style="font-size:12px;color:#94a3b8;font-weight:400">(${s.trendDate || '-'} 기준)</span></h2>
    <div class="tags">${trendTags || '<span style="color:#94a3b8;font-size:13px">키워드 데이터 없음 (다음 실행 시 수집)</span>'}</div>
  </div>

  <!-- SEO 분석 -->
  <div class="section">
    <h2>🔍 내 포스팅 SEO 분석</h2>
    ${seoRows ? `<table>
      <thead><tr><th>날짜</th><th>포스팅</th><th class="center">점수</th><th>개선 사항</th></tr></thead>
      <tbody>${seoRows}</tbody>
    </table>` : '<p style="color:#94a3b8;font-size:13px">아직 분석 데이터가 없습니다</p>'}
  </div>

  <!-- 최근 활동 히스토리 -->
  <div class="section">
    <h2>📅 최근 실행 기록</h2>
    ${histRows ? `<table>
      <thead><tr><th>날짜</th><th>모드</th><th class="center">총</th><th class="center">성공</th><th class="center">스킵</th><th class="center">실패</th></tr></thead>
      <tbody>${histRows}</tbody>
    </table>` : '<p style="color:#94a3b8;font-size:13px">아직 실행 기록이 없습니다</p>'}
  </div>

  <p class="updated">자동 생성 by 계정관리모드 v7 &nbsp;·&nbsp; ${new Date().toLocaleString('ko-KR')}</p>
</div>
</body>
</html>`;

  fs.writeFileSync(DASHBOARD_FILE, html, 'utf8');
  log(`\n🌐 대시보드 저장: ${DASHBOARD_FILE}`);
}

// (웨일 CDP 헬퍼 제거 — 크롬으로 전환)

// ════════════════════════════════════════════════════════════════════════════
// ── 메인 ──────────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
async function main() {
  const MODES = {
    write:    { label: '✏️  글쓰기',                     desc: '(추후 구현 예정)' },
    neighbor: { label: '🤝 서로이웃 신청',               desc: '이웃추가 + 맞춤 메시지' },
    comment:  { label: '💬 댓글 등록',                   desc: '최근 포스팅에 자연스러운 댓글' },
    all:      { label: '🚀 통합 (공감+서로이웃+댓글)',   desc: '한 번 방문에 모두 처리 ⭐ 추천' },
    like:     { label: '❤️  공감 클릭',                  desc: '포스팅 공감(♥)만' },
  };

  log('╔══════════════════════════════════════════╗');
  log('║     네이버 블로그 계정관리모드 v7         ║');
  log('╚══════════════════════════════════════════╝\n');
  log(`오늘 날짜: ${TODAY}  |  일일 한도: ${DAILY_LIM}명  |  딜레이: ${DELAY_MIN}~${DELAY_MAX}분 랜덤\n`);

  let mode = process.argv[2]?.toLowerCase();
  if (!mode || !MODES[mode]) {
    console.log('실행할 모드를 선택하세요:\n');
    Object.entries(MODES).forEach(([k, v]) => console.log(`  [${k.padEnd(8)}]  ${v.label}  —  ${v.desc}`));
    console.log('');
    mode = (await ask('모드 입력 (write / neighbor / comment / all / like): ')).toLowerCase();
    if (!MODES[mode]) { log('❌ 잘못된 모드입니다.'); process.exit(1); }
  }
  log(`\n▶ 선택된 모드: ${MODES[mode].label}\n`);

  // ── 해상도 랜덤 ─────────────────────────────────────────────────────────
  const VIEWPORTS = [
    { width: 1280, height: 800  },
    { width: 1366, height: 768  },
    { width: 1440, height: 900  },
    { width: 1600, height: 900  },
    { width: 1920, height: 1080 },
  ];
  const viewport = VIEWPORTS[rand(0, VIEWPORTS.length)];
  log(`  🖥️  해상도: ${viewport.width}×${viewport.height}`);

  const hasCookie = fs.existsSync(COOKIE_FILE);
  if (hasCookie) log('  🍪 저장된 세션 쿠키 발견 → 로그인 없이 시작 시도');
  else           log('  🔑 저장된 세션 없음 → 새로 로그인 필요');

  // ── Chrome UA ────────────────────────────────────────────────────────────
  const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

  const LAUNCH_ARGS = [
    '--start-maximized',
    '--disable-blink-features=AutomationControlled',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-infobars',
    '--disable-notifications',
    '--lang=ko-KR',
    '--disable-popup-blocking',
  ];

  // ── 크롬 기동 (설치된 Chrome 우선, 실패 시 번들 Chromium) ────────────────
  let browser, context;
  try {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: false,
      slowMo: rand(120, 220),
      args: LAUNCH_ARGS,
    });
    log('  🌐 Google Chrome 실행 완료');
  } catch (_) {
    log('  ⚠️  Chrome 미설치 → 번들 Chromium으로 진행');
    browser = await chromium.launch({
      headless: false,
      slowMo: rand(120, 220),
      args: LAUNCH_ARGS,
    });
  }

  context = await browser.newContext({
    userAgent: CHROME_UA,
    viewport,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    extraHTTPHeaders: {
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      'sec-ch-ua': '"Google Chrome";v="136", "Chromium";v="136", "Not-A.Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
    },
    ...(hasCookie ? { storageState: COOKIE_FILE } : {}),
  });

  // ── 봇 감지 방어 스크립트 ────────────────────────────────────────────────
  await context.addInitScript(() => {
    // 1. webdriver 숨기기
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    // 2. Chrome 객체 주입
    if (!window.chrome) {
      window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {}, app: {} };
    }
    // 3. 플러그인 / 언어
    Object.defineProperty(navigator, 'plugins', { get: () => [
      { name: 'PDF Viewer' }, { name: 'Chrome PDF Viewer' }, { name: 'Chromium PDF Viewer' },
    ]});
    Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'] });
    // 4. Permissions
    const oq = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = p =>
      p.name === 'notifications' ? Promise.resolve({ state: Notification.permission }) : oq(p);
    // 5. WebGL 벤더 위조
    const gp = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(p) {
      if (p === 37445) return 'Intel Inc.';
      if (p === 37446) return 'Intel Iris OpenGL Engine';
      return gp.call(this, p);
    };
    // 6. Canvas 노이즈
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type) {
      const ctx = this.getContext('2d');
      if (ctx && this.width > 0 && this.height > 0) {
        try {
          const img = ctx.getImageData(0, 0, this.width, this.height);
          for (let i = 0; i < img.data.length; i += 4) {
            if (Math.random() < 0.01) img.data[i]   = Math.min(255, img.data[i] + 1);
            if (Math.random() < 0.01) img.data[i+1] = Math.min(255, img.data[i+1] + 1);
          }
          ctx.putImageData(img, 0, 0);
        } catch (_) {}
      }
      return origToDataURL.call(this, type);
    };
    // 7. 화면 색상
    Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
    Object.defineProperty(screen, 'pixelDepth',  { get: () => 24 });
  });

  const page = await context.newPage();

  try {
    // ── 로그인 ──────────────────────────────────────────────────────────────
    if (hasCookie && await isLoggedIn(context)) {
      log('✅ [로그인] 저장된 세션으로 자동 로그인 완료!');
      log('  ⏳ 세션 안정화 (3초)...');
      await sleep(3000);
    } else {
      log('📝 [로그인] 네이버 로그인 중...');
      await doLogin(page);
      log('  ⏳ 세션 안정화 (6초)...');
      await sleep(6000);
    }

    // ── write 모드는 대시보드/댓글 체크 없이 바로 트렌드 분석 ────────────
    if (mode !== 'write') {
      log('\n════════════════════════════════════════');
      log('  📋 시작 대시보드');
      log('════════════════════════════════════════');
      await checkMyBlogStats(page);
      await humanRead(page);
      await wait(1500, 3000);
      await checkAdPost(page);
      await humanIdle(page, rand(1000, 2500));
      await wait(1500, 3000);
      await analyzeMyBlogSEO(page);
      await humanRead(page);
      await wait(1500, 3000);
      log('════════════════════════════════════════\n');

      // STEP 0: 내 블로그 대댓글
      await handleMyBlogReplies(page);
      await humanIdle(page, rand(1500, 3000));
      await wait(2000, 4000);
    }

    // 트렌드 키워드 분석 (write 모드: DataLab 쇼핑인사이트 포함)
    const trendKws = await getTrendingKeywords(page, mode === 'write');
    await wait(1500, 2500);

    // ── 글쓰기 모드: 블로거 탐색 없이 바로 작성 ─────────────────────────
    if (mode === 'write') {
      const writeResults = await runWriteMode(page, trendKws);
      generateDashboard();
      const { exec } = require('child_process');
      exec(`start "" "${DASHBOARD_FILE}"`, () => {});
      await browser.close();
      log('\n✔ 브라우저 종료. 수고하셨습니다!');
      return;
    }

    // STEP 1: 블로거 탐색 (기본 키워드 + 트렌드 키워드)
    const existing = loadTargets();
    const doneMap  = loadDone();
    await discoverBloggers(page, existing, trendKws);

    // 처리 대상 결정 (미완료 중 dailyLimit개)
    const pending   = [...loadTargets()]
      .filter(url => !wasDone(doneMap, url, mode) && !BLACKLIST.has(url.replace('https://blog.naver.com/', '')));
    const toProcess = pending.slice(0, DAILY_LIM);

    if (!toProcess.length) {
      log('⚠️  처리할 블로그가 없습니다. targets.txt를 확인하거나 키워드를 조정해주세요.');
      await browser.close(); return;
    }

    log(`\n📌 처리 대상: ${toProcess.length}명 (미처리 대기 총 ${pending.length}명)\n`);

    // STEP 2: 모드 실행
    const results = await runMode(page, mode, toProcess, doneMap);
    saveReport(MODES[mode].label, results);

    // 대시보드 생성 + 자동으로 브라우저에 열기
    generateDashboard();
    const { exec } = require('child_process');
    exec(`start "" "${DASHBOARD_FILE}"`, err => {
      if (!err) log('🌐 대시보드가 브라우저에서 열렸습니다!');
    });

  } catch (e) {
    log(`\n❌ 치명적 오류: ${e.message}`);
    // 오류가 나도 대시보드는 생성
    try { generateDashboard(); } catch (_) {}
  } finally {
    await browser.close();
    log('\n✔ 브라우저 종료. 수고하셨습니다!');
  }
}

main().catch(e => { log(`❌ 실행 오류: ${e.message}`); process.exit(1); });
