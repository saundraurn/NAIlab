const { test, expect } = require('@playwright/test');

test('test setup', async ({ page }) => {
    // Navigate to page
    await page.goto('file://' + __dirname + '/index.html');
});
