const { chromium } = require('playwright');
const path = require('path');

(async () => {
  let hasError = false;
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    page.on('console', msg => {
      console.log('BROWSER CONSOLE:', msg.text());
      if (msg.type() === 'error') {
        hasError = true;
      }
    });
    page.on('pageerror', error => {
      console.error('BROWSER ERROR:', error.message);
      hasError = true;
    });

    const filePath = `file://${path.resolve('index.html')}`;
    await page.goto(filePath);

    await new Promise(r => setTimeout(r, 2000));
  } catch (error) {
    console.error('SCRIPT ERROR:', error.message, error.stack);
    hasError = true;
  } finally {
    if (browser) {
      await browser.close();
    }
    if (hasError) {
      process.exitCode = 1;
    }
  }
})();
