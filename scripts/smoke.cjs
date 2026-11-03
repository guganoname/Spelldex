// Browser smoke test of a built app (vite preview). Usage:
//   node scripts/smoke.cjs http://localhost:4173/spelldex/ <screenshot-dir>
// Opens the device, waits for the catalog install, searches, opens a card, checks the collection.
const { chromium, devices } = require('playwright');

const base = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? '.';

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  const run = async (shell) => {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    p.on('pageerror', (e) => errors.push(`${shell}: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error' && !/scryfall|Failed to load resource/.test(m.text())) errors.push(`${shell}: ${m.text()}`); });
    await p.addInitScript((s) => localStorage.getItem('spelldex-device') || localStorage.setItem('spelldex-device', JSON.stringify({
      state: { open: false, prefs: { sound: false, haptics: false, volume: 0.8, reducedMotion: null, shell: s, cardLanguage: 'de' } }, version: 0,
    })), shell === '3d' ? null : '2d');
    // Every start begins closed; the boot splash covers the page until the shell has drawn its
    // first frame. Open with a real click: the hint for 3D, the seal for 2D (forced: Playwright's
    // hit test misreads the folded, 3D-transformed 2D lid, a real click at the seal works).
    const boot = async (url) => {
      await p.goto(url);
      await p.waitForSelector('#boot', { state: 'detached', timeout: 20000 });
      if (shell === '3d') await p.click('[data-open-hint]', { timeout: 15000, noWaitAfter: true });
      else await p.click('button[aria-label="Spelldex öffnen"]', { force: true, noWaitAfter: true });
      await p.waitForTimeout(1500);
    };
    await p.goto(base);
    await p.waitForSelector('#boot', { state: 'detached', timeout: 20000 });
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${out}/${shell}-1-closed.png` });
    const closed = await p.evaluate(() => !!document.querySelector('[data-open-hint]') || !document.querySelector('[data-open]') && !document.querySelector('canvas'));
    if (!closed) errors.push(`${shell}: device did not start closed`);
    await boot(base);
    await p.screenshot({ path: `${out}/${shell}-2-open.png` });
    await boot(`${base}suche?q=blitz`);
    await p.waitForSelector('text=Blitzschlag', { timeout: 15000 });
    await p.screenshot({ path: `${out}/${shell}-3-search.png` });
    await p.click('text=Blitzschlag');
    await p.waitForSelector('text=Spontanzauber', { timeout: 10000 });
    await p.screenshot({ path: `${out}/${shell}-4-card.png` });
    await boot(`${base}sammlung`);
    await p.waitForSelector('text=Alle Karten', { timeout: 10000 });
    await p.screenshot({ path: `${out}/${shell}-5-collection.png` });
    // Language switch on the start screen: interface and card texts change together.
    await boot(base);
    await p.click('[data-screen=bottom] >> role=radio[name="EN"]', { timeout: 10000 });
    await p.waitForSelector('[data-screen=bottom] >> text=Settings', { timeout: 5000 });
    if ((await p.getAttribute('html', 'lang')) !== 'en') errors.push(`${shell}: html lang not switched`);
    await p.screenshot({ path: `${out}/${shell}-6-english.png` });
    await p.click('[data-screen=bottom] >> role=radio[name="DE"]');
    await p.close();
  };
  // iPhone: real taps (not programmatic clicks) on the screens, reading mode and scrolling. Catches
  // anything stacked above the screens, such as the iOS haptics switch, which only exists here.
  const runIos = async () => {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`ios: ${e.message}`));
    await p.addInitScript(() => localStorage.getItem('spelldex-device') || localStorage.setItem('spelldex-device', JSON.stringify({
      state: { open: true, prefs: { sound: false, haptics: true, volume: 0.8, reducedMotion: null, shell: null, cardLanguage: 'de' } }, version: 0,
    })));
    await p.goto(base);
    await p.waitForSelector('#boot', { state: 'detached', timeout: 20000 });
    await p.tap('[data-open-hint]', { timeout: 15000, noWaitAfter: true });
    await p.waitForTimeout(1500);
    await p.tap('[data-screen=bottom] >> text=Suchen', { timeout: 15000 });
    await p.waitForURL(/suche/, { timeout: 5000 });
    await p.fill('input[type=search]', 'blitz');
    await p.tap('[data-screen=grip]');
    await p.tap('[data-screen=bottom] >> text=Blitzschlag', { timeout: 10000 });
    await p.waitForSelector('text=Spontanzauber', { timeout: 10000 });
    await p.screenshot({ path: `${out}/ios-card-reading.png` });
    const scrolled = await p.$eval('[data-screen=bottom] > div:last-child', (el) => { el.scrollTop = 200; return el.scrollTop; });
    if (!(scrolled > 0)) errors.push('ios: info screen does not scroll');
    await ctx.close();
  };
  try {
    await run('2d');
    await run('3d');
    await runIos();
  } catch (e) {
    errors.push(String(e));
  }
  await browser.close();
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log('smoke ok');
})();
