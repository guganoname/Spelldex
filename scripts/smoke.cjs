// Browser smoke test of a built app (vite preview). Usage:
//   node scripts/smoke.cjs http://localhost:4173/spelldex/ <screenshot-dir>
// Opens the device, waits for the catalog install, searches, opens a card, checks the collection.
const { chromium } = require('playwright');

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
    await p.goto(base);
    await p.waitForTimeout(3000);
    await p.screenshot({ path: `${out}/${shell}-1-closed.png` });
    await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Spelldex öffnen/.test(b.textContent + (b.getAttribute('aria-label') ?? ''))).click());
    await p.waitForTimeout(2500);
    await p.screenshot({ path: `${out}/${shell}-2-open.png` });
    await p.goto(`${base}suche?q=blitz`);
    await p.waitForSelector('text=Blitzschlag', { timeout: 15000 });
    await p.screenshot({ path: `${out}/${shell}-3-search.png` });
    await p.click('text=Blitzschlag');
    await p.waitForSelector('text=Spontanzauber', { timeout: 10000 });
    await p.screenshot({ path: `${out}/${shell}-4-card.png` });
    await p.goto(`${base}sammlung`);
    await p.waitForSelector('text=Alle Karten', { timeout: 10000 });
    await p.screenshot({ path: `${out}/${shell}-5-collection.png` });
    await p.close();
  };
  try {
    await run('2d');
    await run('3d');
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
