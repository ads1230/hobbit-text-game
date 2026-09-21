// pagetest.js — drives the built page in headless Chromium on a phone-sized viewport: the front door, the
// title sequence, a game started by a tap, the touch pad, the menu's level select, saving and continuing.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const OUT = process.argv[2] || require('os').tmpdir() + '/pop-shots';
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'pop.html'));
  await sleep(500);
  await page.screenshot({ path: OUT + '/01-door.png' });
  const info = await page.evaluate(() => ({ mode: __pop.T.mode(), hasData: !!POP.data.images.ch1, levels: POP.data.levels.length }));
  console.log('front door', info);
  await page.tap('#btnStart');
  await sleep(2500);
  await page.screenshot({ path: OUT + '/02-title.png' });
  console.log('after start: mode', await page.evaluate(() => __pop.T.mode()), 'attract step', await page.evaluate(() => __pop.attract.i), 'shown', await page.evaluate(() => JSON.stringify({ kind: __pop.shown.kind, pic: !!__pop.shown.pic })));
  // let the attract sequence run to the title picture and the story
  for (let i = 0; i < 6; i++) { await sleep(4000); console.log('t+' + (i + 1) * 4 + 's', await page.evaluate(() => ({ mode: __pop.T.mode(), step: __pop.attract.i, level: __pop.S.level }))); await page.screenshot({ path: OUT + `/03-attract-${i}.png` }); }
  // a tap on the screen starts the game
  await page.tap('#stage');
  await sleep(1500);
  await page.screenshot({ path: OUT + '/04-game.png' });
  let st = await page.evaluate(() => ({ mode: __pop.T.mode(), level: __pop.S.level, kidx: __pop.ST.Kid.X, scrn: __pop.ST.Kid.Scrn, frame: __pop.S.FrameCount }));
  console.log('game', st);
  // hold the pad to the left for a second, then right: the kid should run
  const pad = await page.$('#dpad'); const box = await pad.boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.touchscreen.tap(cx - box.width * 0.4, cy); // a tap: one step
  await sleep(300);
  // a hold: use the CDP touch events via mouse emulation on pointer events
  await page.mouse.move(cx + box.width * 0.4, cy); await page.mouse.down(); await sleep(1500);
  const mid = await page.evaluate(() => ({ kidx: __pop.ST.Kid.X, scrn: __pop.ST.Kid.Scrn, action: __pop.ST.Kid.Action, frame: __pop.S.FrameCount }));
  await page.screenshot({ path: OUT + '/05-run.png' });
  await page.mouse.up(); await sleep(800);
  console.log('after running right', mid, '->', await page.evaluate(() => ({ kidx: __pop.ST.Kid.X, scrn: __pop.ST.Kid.Scrn })));
  // the menu: pause, level select
  await page.tap('#btnMenu'); await sleep(400);
  await page.screenshot({ path: OUT + '/06-menu.png' });
  await page.tap('#levels button:nth-child(3)'); await sleep(1500);
  st = await page.evaluate(() => ({ mode: __pop.T.mode(), level: __pop.S.level, scrn: __pop.ST.Kid.Scrn }));
  console.log('level 3', st);
  await page.screenshot({ path: OUT + '/07-level3.png' });
  // save (ctrl-G) and check the saved record
  await page.tap('#btnMenu'); await sleep(300); await page.tap('#mSaveGame'); await sleep(800);
  console.log('saved', await page.evaluate(() => localStorage.getItem('popn.save')));
  // keyboard: run left with the arrow key, jump with up
  await page.keyboard.down('ArrowLeft'); await sleep(1200); await page.keyboard.up('ArrowLeft'); await sleep(500);
  console.log('after key left', await page.evaluate(() => ({ kidx: __pop.ST.Kid.X, scrn: __pop.ST.Kid.Scrn })));
  await page.screenshot({ path: OUT + '/08-keys.png' });
  // landscape
  await page.setViewportSize({ width: 844, height: 390 }); await sleep(600);
  await page.screenshot({ path: OUT + '/09-landscape.png' });
  // back to the title via the menu, then continue the saved game from the door (reload)
  await page.tap('#btnMenu'); await sleep(300); await page.tap('#mTitle'); await sleep(1000);
  console.log('title again', await page.evaluate(() => ({ mode: __pop.T.mode(), step: __pop.attract.i })));
  await page.reload(); await sleep(500);
  console.log('continue button', await page.evaluate(() => ({ hidden: document.getElementById('btnContinue').hidden, info: document.getElementById('continueInfo').textContent })));
  await page.tap('#btnContinue'); await sleep(1500);
  console.log('continued', await page.evaluate(() => ({ mode: __pop.T.mode(), level: __pop.S.level, frame: __pop.S.FrameCount, str: __pop.S.MaxKidStr })));
  await page.screenshot({ path: OUT + '/10-continued.png' });
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
