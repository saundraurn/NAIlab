const { test, expect } = require('@playwright/test');

test('test upload file', async ({ page }) => {
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));

    await page.goto('file://' + __dirname + '/index.html');

    // We need to inject a mock Box API
    await page.evaluate(() => {
        window.fetch = async (url, options) => {
            console.log('FETCH:', url, options?.method || 'GET');
            if (url.includes('users/me')) {
                return { ok: true, json: async () => ({}) };
            }
            if (url.includes('folders/0/items')) {
                return { ok: true, json: async () => ({ entries: [] }) };
            }
            if (url.includes('folders')) {
                return { ok: true, json: async () => ({ id: 'folder_123', entries: [] }) };
            }
            if (url.includes('files/content')) {
                return { ok: true, json: async () => ({ entries: [{ id: 'file_123' }] }) };
            }
            return { ok: true, json: async () => ({}) };
        };
    });

    // Set a token
    await page.evaluate(() => {
        const store = window.useAppStore();
        store.config.value.box.accessToken = 'mock_token';
        store.config.value.box.tokenExpiresAt = Date.now() + 100000;
        store.config.value.app.model = 'nai-diffusion-3'; // trigger change
    });

    await page.waitForTimeout(4000); // wait for saveConfig timeout

    console.log('Logs:', logs);
});
