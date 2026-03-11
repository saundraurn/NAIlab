const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    // Intercept requests to Box API to mock them
    await page.route('https://api.box.com/**', async route => {
        const url = route.request().url();
        console.log('API Request:', url);
        if (url.includes('users/me')) {
            await route.fulfill({ status: 200, json: { id: '123' } });
        } else if (url.includes('folders/0/items')) {
            await route.fulfill({ status: 200, json: { entries: [{ id: 'f1', name: 'NAIlabData', type: 'folder' }] } });
        } else if (url.includes('folders/f1/items')) {
            await route.fulfill({ status: 200, json: { entries: [{ id: 'c1', name: 'appConfig.json', type: 'file' }] } });
        } else if (url.includes('files/c1/content')) {
            await route.fulfill({ status: 200, json: { app: { model: 'mocked-model' }, box: { accessToken: 'mock_token', tokenExpiresAt: Date.now() + 100000 } } });
        } else {
            await route.fulfill({ status: 200, json: {} });
        }
    });

    const fileUrl = 'file://' + path.resolve(__dirname, 'index.html');
    await page.goto(fileUrl);

    // Inject mock Box config to trigger load
    await page.evaluate(() => {
        const store = window.useAppStore();
        store.config.value.box.accessToken = 'mock_token';
        store.config.value.box.tokenExpiresAt = Date.now() + 100000;

        // Wait a bit, then check if it's loaded and triggers a save when modified
    });

    await page.waitForTimeout(2000);

    const storeState = await page.evaluate(() => {
        const store = window.useAppStore();
        return store.config.value;
    });

    console.log('Store State after load:', storeState.app.model);
    console.log('Store Box Config after load:', storeState.box);

    await browser.close();
})();
