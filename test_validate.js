const { test, expect } = require('@playwright/test');

test('test validate token', async ({ page }) => {
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));

    // Intercept requests to mock Box API
    await page.route('https://api.box.com/oauth2/token', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                access_token: 'valid_mock_token',
                refresh_token: 'mock_refresh',
                expires_in: 3600
            })
        });
    });

    await page.route('https://api.box.com/2.0/users/me', async route => {
        const auth = route.request().headers()['authorization'];
        console.log('users/me Auth Header:', auth);
        if (auth === 'Bearer valid_mock_token') {
            await route.fulfill({ status: 200, body: JSON.stringify({ id: 'me' }) });
        } else {
            await route.fulfill({ status: 401 });
        }
    });

    // Mock load state logic
    await page.route('https://api.box.com/2.0/folders/0/items', async route => {
        await route.fulfill({ status: 200, body: JSON.stringify({ entries: [] }) });
    });

    await page.goto('file://' + __dirname + '/index.html');

    // Trigger OAuth
    await page.evaluate(() => {
        const store = window.useAppStore();
        store.config.value.box.clientId = 'client_123';
        store.config.value.box.clientSecret = 'secret_123';

        // Mock window.open and message listener
        const originalOpen = window.open;
        window.open = () => {
            setTimeout(() => {
                window.postMessage({ type: 'box-oauth-code', code: 'mock_code' }, '*');
            }, 100);
            return {};
        };

        const boxAPI = window.useBoxAPI();
        boxAPI.startOAuthFlow();
    });

    await page.waitForTimeout(2000);

    const storeState = await page.evaluate(() => {
        return window.useAppStore().config.value.box;
    });

    console.log('Store Box Config after load:', storeState);
    console.log('Logs:', logs);
});
