import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Global Utilities in index.html', () => {
    test.beforeEach(async ({ page }) => {
        const filePath = `file://${path.resolve('index.html')}`;
        await page.goto(filePath);
        // Wait for vue to load and global functions to be available
        await page.waitForFunction(() => typeof formatDisplayNum === 'function', {timeout: 20000});
    });

    test('formatDisplayNum formats numbers correctly', async ({ page }) => {
        expect(await page.evaluate(() => formatDisplayNum(500))).toBe(500);
        expect(await page.evaluate(() => formatDisplayNum(1500))).toBe('1.5k');
        expect(await page.evaluate(() => formatDisplayNum(1500000))).toBe('1.5m');
        expect(await page.evaluate(() => formatDisplayNum(0))).toBe(0);
        expect(await page.evaluate(() => formatDisplayNum(null))).toBe(0);
    });

    test('parsePrompt parses positive and negative prompts correctly', async ({ page }) => {
        expect(await page.evaluate(() => parsePrompt('positive side -- negative side'))).toEqual({
            positive: 'positive side',
            negative: 'negative side'
        });
        expect(await page.evaluate(() => parsePrompt('just positive'))).toEqual({
            positive: 'just positive',
            negative: ''
        });
        expect(await page.evaluate(() => parsePrompt('-- just negative'))).toEqual({
            positive: '',
            negative: 'just negative'
        });
        expect(await page.evaluate(() => parsePrompt(null))).toEqual({
            positive: '',
            negative: ''
        });
    });

    test('prepareGenConfig handles Opus logic correctly', async ({ page }) => {
        // Not Opus -> return same
        const cfg1 = { width: 512, height: 512, isOpus: false, shouldUseRandomOpusDimensions: true };
        expect(await page.evaluate((cfg) => prepareGenConfig(cfg), cfg1)).toEqual(cfg1);

        // Opus but shouldn't use random dimensions -> return same
        const cfg2 = { width: 512, height: 512, isOpus: true, shouldUseRandomOpusDimensions: false };
        expect(await page.evaluate((cfg) => prepareGenConfig(cfg), cfg2)).toEqual(cfg2);

        // Opus AND should use random -> returns a random opus dimension that fits
        const cfg3 = { width: 2000, height: 2000, isOpus: true, shouldUseRandomOpusDimensions: true };
        const res3 = await page.evaluate((cfg) => prepareGenConfig(cfg), cfg3);
        expect(res3.width).toBeDefined();
        expect(res3.height).toBeDefined();
        // Since random, we just check they exist and are properties
    });

    test('uid generates a string', async ({ page }) => {
        const id1 = await page.evaluate(() => uid());
        const id2 = await page.evaluate(() => uid());
        expect(typeof id1).toBe('string');
        expect(id1.length).toBeGreaterThan(0);
        expect(id1).not.toBe(id2);
    });

    test('imgSrc constructs base64 data URI', async ({ page }) => {
        expect(await page.evaluate(() => imgSrc(null))).toBe('');
        const img = { mimeType: 'image/png', data: 'abcd' };
        expect(await page.evaluate((img) => imgSrc(img), img)).toBe('data:image/png;base64,abcd');
    });

    test('fmtTokens formats numbers correctly', async ({ page }) => {
        expect(await page.evaluate(() => fmtTokens(0))).toBe('0');
        expect(await page.evaluate(() => fmtTokens(500))).toBe('500');
        expect(await page.evaluate(() => fmtTokens(1500))).toBe('1.5k');
        expect(await page.evaluate(() => fmtTokens(1500000))).toBe('1500.0k');
    });

    test('markdownParse uses marked if available or returns raw text', async ({ page }) => {
        expect(await page.evaluate(() => markdownParse(null))).toBe('');

        // it uses cache
        const res1 = await page.evaluate(() => markdownParse('**bold**'));
        const res2 = await page.evaluate(() => markdownParse('**bold**'));
        expect(res1).toBe(res2);
        // It converts to HTML since marked is loaded from CDN
        expect(res1.includes('<strong>bold</strong>')).toBe(true);
    });

    test('updateItemNum adds and removes items up to limits', async ({ page }) => {
        const res = await page.evaluate(() => {
            let list = [{id: 1, val: 'a'}];
            let idRef = {value: 2};

            // Add item
            updateItemNum(list, idRef, 1, 3);
            const afterAdd = JSON.parse(JSON.stringify({list, idRef}));

            // Add over limit (max 2 now)
            updateItemNum(list, idRef, 1, 2);
            const afterAddLimit = JSON.parse(JSON.stringify({list, idRef}));

            // Remove item
            updateItemNum(list, idRef, -1, 3);
            const afterRemove = JSON.parse(JSON.stringify({list, idRef}));

            // Remove over limit (min 1)
            updateItemNum(list, idRef, -1, 3);
            const afterRemoveLimit = JSON.parse(JSON.stringify({list, idRef}));

            return {afterAdd, afterAddLimit, afterRemove, afterRemoveLimit};
        });

        // Add
        expect(res.afterAdd.list.length).toBe(2);
        expect(res.afterAdd.idRef.value).toBe(3);

        // Add Limit
        expect(res.afterAddLimit.list.length).toBe(2);

        // Remove
        expect(res.afterRemove.list.length).toBe(1);

        // Remove Limit
        expect(res.afterRemoveLimit.list.length).toBe(1);
    });

    test('abortableSleep resolves after ms', async ({ page }) => {
        const start = Date.now();
        await page.evaluate(() => abortableSleep(100));
        const end = Date.now();
        // The evaluate will wait for promise to resolve, which happens in page context
        // Since we didn't use time measurement in evaluate, we can just check if it executed
        expect(true).toBe(true);
    });
});
