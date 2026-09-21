// pagetest_mac.js — the built page with the Macintosh art: the title pictures, a level, a cut scene, in both
// Mac modes, in headless Chromium; screenshots and a check for page errors.
//   node tools/pagetest_mac.js [outdir]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const OUT = process.argv[2] || require('os').tmpdir() + '/pop-mac-shots';
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'pop.html'));
  await sleep(500);
  for (const gfx of ['maccolor', 'macbw']) {
    await page.evaluate(g => { __pop.settings.gfx = g; __pop.setupScreen(); }, gfx);
    const size = await page.evaluate(() => ({ w: document.getElementById('screen').width, h: document.getElementById('screen').height, stage: document.getElementById('stage').style.width }));
    console.log(gfx, 'canvas', size);
    if (gfx === 'maccolor') { await page.tap('#btnStart'); await sleep(1200); } else { await page.evaluate(() => { __pop.T.setmode('title'); }); await sleep(800); }
    await page.screenshot({ path: `${OUT}/${gfx}-1-splash.png` });
    // the title pictures: step the attract sequence by hand
    for (const name of ['title', 'prolog', 'credits']) { await page.evaluate(n => { __pop.shown.pic = true; __pop.shown.picName = n; __pop.shown.kind = 'pic'; }, name); await page.evaluate(() => { __pop.attract.tick = () => {}; }); await sleep(100); await page.evaluate(() => { const c = document.getElementById('screen'); }); await page.evaluate(n => { __pop.MAC.renderTitle(new Uint8Array(4), n); }, name); await page.evaluate(() => {}); await page.evaluate(() => { __pop.shown.kind = 'pic'; }); await page.evaluate(() => { window.__pop_repaint && window.__pop_repaint(); }); await page.screenshot({ path: `${OUT}/${gfx}-2-${name}.png` }); }
    // a level
    await page.evaluate(() => __pop.startAt(1)); await sleep(2500);
    await page.screenshot({ path: `${OUT}/${gfx}-3-level1.png` });
    const st = await page.evaluate(() => ({ mode: __pop.T.mode(), level: __pop.S.level, scrn: __pop.ST.Kid.Scrn, band: __pop.MAC.band.msg }));
    console.log(gfx, 'level', st);
    // run right for a while
    await page.keyboard.down('ArrowRight'); await sleep(2500); await page.keyboard.up('ArrowRight'); await sleep(400);
    await page.screenshot({ path: `${OUT}/${gfx}-4-run.png` });
    console.log(gfx, 'after run', await page.evaluate(() => ({ scrn: __pop.ST.Kid.Scrn, x: __pop.ST.Kid.X, frames: __pop.S.FrameCount })));
    // level 4 (the palace) and a fight on level 2
    await page.evaluate(() => __pop.startAt(4)); await sleep(2500); await page.screenshot({ path: `${OUT}/${gfx}-5-level4.png` });
    await page.evaluate(() => __pop.startAt(12)); await sleep(2500); await page.screenshot({ path: `${OUT}/${gfx}-6-level12.png` });
    // the cut scene before level 2: die of time? simpler: run cut 1 directly
    await page.evaluate(() => { __pop.T.runJumps(() => __pop.T.startCut(1, () => { __pop.T.setmode('title'); })); }); await sleep(2500);
    await page.screenshot({ path: `${OUT}/${gfx}-7-cut.png` });
    console.log(gfx, 'cut', await page.evaluate(() => ({ mode: __pop.T.mode() })));
  }
  console.log('errors', errors.length ? errors : 'none');
  await browser.close();
})();
