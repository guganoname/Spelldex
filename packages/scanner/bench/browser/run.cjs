// Headless check of the built demo page with a fake camera (see make-fixture.ts).
// Usage: node bench/browser/run.cjs http://localhost:4173/ <demo-dist>/card.y4m
const { chromium } = require('playwright');
(async () => {
  const [url, y4m] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto(url);
  await page.click('#start');
  const t0 = Date.now();
  await page.waitForFunction(() => /E2E #/.test(document.getElementById('status').textContent), null, { timeout: 60000 });
  console.log(`hit after ${Date.now() - t0} ms:`, await page.textContent('#status'));
  await browser.close();
})();
