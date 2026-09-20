// One functional pass in headless Chromium: load the page, feed the test tape
// through the file input, send a few commands, take a phone-sized screenshot.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 780 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  const html = require('fs').readFileSync(path.join(__dirname, '..', 'hobbit.html'), 'utf8');
  await page.goto('http://127.0.0.1:8765/serve.html', { waitUntil: 'load' });
  await page.screenshot({ path: '/tmp/shot_loader.png' });
  await page.setInputFiles('#fileInput', process.argv[2] || '/tmp/hobbit_test.tap');
  await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'waiting', null, { timeout: 30000 });
  const t0 = Date.now();
  for (const cmd of ['look', 'wait', 'e', 'n']) {
    await page.fill('#cmdInput', cmd);
    await page.press('#cmdInput', 'Enter');
    await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'waiting', null, { timeout: 30000 });
  }
  console.log('4 commands in', Date.now() - t0, 'ms');
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/shot_game.png' });
  // scroll to top of the last reply and full-page transcript text
  const text = await page.$eval('#logInner', el => el.innerText);
  console.log(text.slice(-1200));
  // dark theme + screen panel
  await page.emulateMedia({ colorScheme: 'dark' });
  // (screen toggle removed)
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/tmp/shot_dark.png' });
  await page.click('#menuBtn');
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/shot_drawer.png' });
  // snapshot save/restore round trip
  await page.click('#slots .slot:nth-child(1) .btn:not(.quiet)');
  await page.waitForTimeout(200);
  await page.click('#slots .slot:nth-child(1) .btn.quiet');
  await page.waitForTimeout(300);
  const restored = await page.$eval('#logInner', el => el.innerText.includes('Snapshot restored'));
  console.log('snapshot restored:', restored);
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error('TEST FAILED', e); process.exit(1); });
