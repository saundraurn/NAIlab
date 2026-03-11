const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', error => console.error('BROWSER ERROR:', error.message));

  const filePath = `file://${path.resolve('index.html')}`;
  await page.goto(filePath);

  await new Promise(r => setTimeout(r, 2000));
  await browser.close();
})();
