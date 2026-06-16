/**
 * 참고 블로그 4개 스크래핑
 */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URLS = [
  'https://blog.naver.com/kkwrkdrk2/224286036781',
  'https://blog.naver.com/buyingnote/224292830069',
  'https://blog.naver.com/yoon8863_/224289195096',
  'https://blog.naver.com/isseykgh/224254292180',
];

async function scrapeBlog(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  // mainFrame + iframe 탐색
  const allFrames = [page.mainFrame(), ...page.frames()];

  let title = '';
  let body  = '';
  let images = [];
  let tags = [];

  for (const frame of allFrames) {
    try {
      // 제목
      if (!title) {
        const t = await frame.$('.se-title-text, .se_title, .tit_h3, h3.title, .blog_title, [class*="title"]');
        if (t) title = (await t.innerText()).trim();
      }

      // 본문 — SE ONE
      if (!body) {
        const b = await frame.$('.se-main-container, .se-viewer, .se_component_wrap, #postViewArea, .post-view');
        if (b) body = (await b.innerText()).trim();
      }

      // 이미지 URL 목록
      const imgs = await frame.$$('img[src]');
      for (const img of imgs) {
        const src = await img.getAttribute('src').catch(() => '');
        const alt = await img.getAttribute('alt').catch(() => '');
        if (src && src.includes('naver') && src.length > 30) {
          images.push({ src: src.substring(0, 200), alt });
        }
      }

      // 태그
      if (!tags.length) {
        const tagEls = await frame.$$('.se-tag, .tag, [class*="tag_item"], .post_tag a, .tag_list a');
        for (const el of tagEls) {
          const t = (await el.innerText()).trim();
          if (t && t.length < 30) tags.push(t);
        }
      }
    } catch (_) {}
  }

  return { url, title, body: body.substring(0, 8000), images: images.slice(0, 20), tags };
}

(async () => {
  const COOKIE_FILE = path.join(__dirname, 'session.json');
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36',
    locale: 'ko-KR',
    ...(fs.existsSync(COOKIE_FILE) ? { storageState: COOKIE_FILE } : {}),
  });
  const page = await context.newPage();

  const results = [];
  for (const url of URLS) {
    console.log(`\n스크래핑: ${url}`);
    try {
      const data = await scrapeBlog(page, url);
      results.push(data);
      console.log(`  제목: ${data.title.substring(0, 60)}`);
      console.log(`  본문: ${data.body.length}자`);
      console.log(`  이미지: ${data.images.length}개`);
      console.log(`  태그: ${data.tags.slice(0, 5).join(', ')}`);
    } catch (e) {
      console.log(`  오류: ${e.message}`);
      results.push({ url, error: e.message });
    }
    await page.waitForTimeout(2000);
  }

  fs.writeFileSync(path.join(__dirname, 'blog-samples.json'), JSON.stringify(results, null, 2), 'utf8');
  console.log('\n\n저장: blog-samples.json');

  await browser.close();
})();
