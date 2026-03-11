const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

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

    await page.route('https://api.box.com/2.0/folders/0/items', async route => {
        await route.fulfill({ status: 200, body: JSON.stringify({ entries: [] }) });
    });

    await page.route('https://api.box.com/2.0/folders', async route => {
        await route.fulfill({ status: 201, body: JSON.stringify({ id: 'f_1' }) });
    });

    await page.route('https://api.box.com/2.0/folders/f_1/items', async route => {
        await route.fulfill({ status: 200, body: JSON.stringify({ entries: [] }) });
    });

    const fileUrl = 'file://' + path.resolve(__dirname, 'index.html');
    await page.goto(fileUrl);

    // Set mock data and trigger
    await page.evaluate(() => {
        window.postMessage({ type: 'box-oauth-code', code: 'mock_code' }, '*');

        // The store is bound to globals
        setTimeout(() => {
            const store = window.useAppStore();
            store.config.value.box.clientId = 'client_123';
            store.config.value.box.clientSecret = 'secret_123';
            const boxAPI = window.useBoxAPI();
            boxAPI.startOAuthFlow();

            // simulate popup sending message
            setTimeout(() => {
                window.postMessage({ type: 'box-oauth-code', code: 'mock_code' }, '*');
            }, 100);
        }, 500);
    });

    await page.waitForTimeout(3000);

    const storeState = await page.evaluate(() => {
        return window.useAppStore().config.value.box;
    });
    const toasts = await page.evaluate(() => {
        return window.useAppStore().toasts;
    });

    console.log('Store Box Config:', storeState);
    console.log('Toasts:', toasts);

    await browser.close();
})();
