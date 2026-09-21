// pagetest2.js — the whole attract sequence (title, story, the princess's room, the demo), then a level
// change with its cut scene, then a death and the "press button" restart, in headless Chromium.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const OUT = process.argv[2] || require('os').tmpdir() + '/pop-shots';
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') { const t = m.text(); if (!/ERR_TUNNEL/.test(t)) errors.push(m.type() + ': ' + t); } });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'pop.html'));
  await sleep(300);
  await page.tap('#btnStart');
  const t0 = Date.now(); let last = '';
  for (let i = 0; i < 200; i++) {
    await sleep(1000);
    const st = await page.evaluate(() => ({ mode: __pop.T.mode(), step: __pop.attract.i, level: __pop.S.level, kind: __pop.shown.kind, pic: !!__pop.shown.pic, running: POP.cut.running(), scrn: __pop.ST.Kid.Scrn, kidx: __pop.ST.Kid.X }));
    const s = JSON.stringify(st);
    if (s !== last) { console.log(((Date.now() - t0) / 1000).toFixed(0) + 's', s); last = s; await page.screenshot({ path: OUT + '/a-' + String(i).padStart(3, '0') + '.png' }); }
    if (st.mode === 'title' && st.step === 0 && i > 60) { console.log('attract loop restarted after the demo'); break; }
    if (errors.length) break;
  }
  console.log('errors so far:', errors);
  // start the game and go to level 2 by the exit: poke the next level as the harnesses do
  await page.tap('#stage'); await sleep(600);
  console.log('game', await page.evaluate(() => ({ mode: __pop.T.mode(), level: __pop.S.level })));
  await page.evaluate(() => { __pop.S.NextLevel = 2; });
  last = '';
  for (let i = 0; i < 90; i++) {
    await sleep(500);
    const st = await page.evaluate(() => ({ mode: __pop.T.mode(), level: __pop.S.level, running: POP.cut.running(), scrn: __pop.ST.Kid.Scrn }));
    const s = JSON.stringify(st);
    if (s !== last) { console.log('L2 ' + (i / 2).toFixed(1) + 's', s); last = s; await page.screenshot({ path: OUT + '/b-' + String(i).padStart(3, '0') + '.png' }); }
    if (st.mode === 'game' && st.level === 2 && i > 4) break;
  }
  // the kid falls to his death: level 2 starts on a ledge; a jump forward into the pit
  await page.keyboard.down('ArrowLeft'); await sleep(3000); await page.keyboard.up('ArrowLeft');
  last = '';
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    const st = await page.evaluate(() => ({ mode: __pop.T.mode(), level: __pop.S.level, scrn: __pop.ST.Kid.Scrn, x: __pop.ST.Kid.X, y: __pop.ST.Kid.Y, life: __pop.ST.Kid.Life, action: __pop.ST.Kid.Action, msg: __pop.S.message }));
    const s = JSON.stringify(st);
    if (s !== last) { console.log('run ' + (i / 2).toFixed(1) + 's', s); last = s; }
  }
  await page.screenshot({ path: OUT + '/c-end.png' });
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
