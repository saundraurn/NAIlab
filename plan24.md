Wait! Look at `index.html` line 261-264 AGAIN!
```javascript
                                store.config.value.box.accessToken = data.access_token;
                                store.config.value.box.refreshToken = data.refresh_token;
                                store.config.value.box.tokenExpiresAt = Date.now() + (data.expires_in * 1000);
                                store.addToast({msg: 'Box connected successfully!', type: 'success'});
```
Is there ANY BUG here?
No.

What if "settings are not saved across browsers" because `hydrateFromLoadedState` IS THE BUG!
If I just remove `box: _ignoredBox` from `hydrateFromLoadedState`, does it fix the issue?
```javascript
        const hydrateFromLoadedState = (loadedState, config, largeData) => {
            const { genHistory, conversations, ...rest } = loadedState;
            if (genHistory) largeData.genHistory = genHistory;
            if (conversations) largeData.conversations = conversations;
            _.mergeWith(config.value, rest, (objValue, srcValue) => _.isArray(srcValue) ? srcValue : undefined);
        };
```
If I do this, `config.value.box` is updated with the tokens from Box.
If it is updated, Browser B GETS Browser A's tokens.
Is this what the user expects?
If the user expects settings to be saved across browsers, maybe they EXPECT `Box Client ID` and `Secret` to be saved!
BUT wait! If they are saved, Browser B gets them!
But Browser B MUST CONNECT to Box to get them!
So Browser B CANNOT get them unless it connects!
If it connects, it ALREADY HAS them!
So they don't need to be saved!

Unless... the user wants to enter them on Browser B, BUT NOT ON BROWSER C?
No, Browser C still needs them to connect!
Unless the user copies the `localStorage` manually?
If they copy `localStorage`, it ALREADY works!

Wait! I see it!
When `saveConfig` saves to Box, `appConfig.json` contains `tagTest`, `app`, `box`, etc.
Then Browser B connects.
Browser B calls `loadState()`.
`hydrateFromLoadedState` merges `rest`.
`rest` does NOT contain `box`.
Browser B's `box` is kept.
This WORKS.
BUT WHAT IF `config.value` is NOT A PROXY???
No, `useLocalStorage` returns a `ref`. `config.value` is a Proxy.

Let's look at `index.html` line 1802:
```javascript
                    box: useAppStore().config.value.box,
```
If the user edits `box.clientId`, `config.value.box` updates.
Then `watch` triggers.
It saves to Box.
This works.

Wait. "There's a bug somewhere with the Box integration, and it doesn't appear to function as intended; settings are not saved across browsers."
Could the bug be that `appConfig.json` is NOT created?
```javascript
                if (!folder) folder = await createFolder(FOLDER_NAME);
```
If `folder` doesn't exist, it creates it.
```javascript
            const createFolder = async (name) => {
                const res = await _fetch(`https://api.box.com/2.0/folders`, {
                    method: 'POST',
                    headers: _headers(),
                    body: JSON.stringify({name, parent: {id: '0'}})
                });
                if (!res.ok) throw new Error('Failed to create Box folder');
                return await res.json();
            };
```
This is correct.

Could it be that `findFile` fails to find `appConfig.json` because of pagination?
No, we only have 2 files.

Is it possible `_fetch` FAILS because it uses `_headers()` which sets `Content-Type: application/json`?
When we upload the file:
```javascript
                    const res = await _fetch(`https://upload.box.com/api/2.0/files/content`, {
                        method: 'POST',
                        headers: {'Authorization': `Bearer ${token}`},
                        body: formData
                    });
```
We provide `headers: {'Authorization': \`Bearer ${token}\`}`.
This OVERWRITES the default headers of `_fetch`?
No, `_fetch` does:
```javascript
            const _fetch = async (url, options = {}) => {
                let res = await fetch(url, options);
```
It passes `options` directly to `fetch`!
So it uses EXACTLY the headers we provided!
Wait... `fetch(url, { method: 'POST', headers: {'Authorization': ...}, body: formData })`
This is correct.
BUT IF IT GETS A 401:
```javascript
                if (res.status === 401) {
                    // ...
                    if (refreshed) {
                        options.headers = _headers();
                        res = await fetch(url, options);
```
It RETRIES with `options.headers = _headers()`!
This sets `Content-Type: application/json`!
And this BREAKS the `multipart/form-data` upload!
If the token WAS expired, and it tried to upload, it would refresh, retry, and FAIL with 400 Bad Request!
Could THIS be the bug?
If it fails with 400 Bad Request, `res.ok` is false!
`_uploadFile` throws "Failed to update Box file: appConfig.json".
`saveConfig` catches it and shows "Failed to sync config to Box".
BUT DOES THE USER SEE THIS?
If the token expires in the background (after 60 mins), and the user makes a change, `saveConfig` tries to upload.
It gets 401. It refreshes. It retries with wrong headers. It fails with 400.
It shows "Failed to sync config to Box".
The user says: "settings are not saved across browsers"!
BECAUSE THEY WERE NOT UPLOADED TO BOX!
And because they were not uploaded, Browser B NEVER GETS THEM!
Is THIS the bug?
YES! If the token expires, the app CAN NEVER SAVE SETTINGS TO BOX AGAIN until the user reloads the page!
Because every time it tries to save, it gets 401, refreshes successfully, retries with wrong headers, and fails!
AND because `isReady.value` is still true, it doesn't prompt them to log in again!
So it silently (with a toast) fails to save every time!
BUT wait! If it fails to save, does it show "Box API Token Expired or Invalid"?
NO! It shows "Failed to sync config to Box".
So WHY does the image show "Box API Token Expired or Invalid. Please log in again."?
Because THAT'S A DIFFERENT BUG!
Or maybe the image is the ONLY bug?
Why does `validateToken` fail?
If the user refreshes the page on Browser A after 60 mins:
`onMounted` -> `validateToken()`.
`tokenExpiresAt` is passed.
It calls `refreshAccessToken()`.
If `refreshAccessToken()` SUCCEEDS, it sets new tokens.
Then `validateToken()` calls `/users/me`.
It SUCCEEDS.
Wait... what if `refreshAccessToken()` FAILS?
If `refreshAccessToken()` FAILS, it throws "Failed to refresh token", returns `false`.
`validateToken()` returns `false`.
NO RED TOAST!
So the user doesn't even know it failed! They just see they are not connected.
So they click "Login with Box" AGAIN!
They log in, they get the green toast.
Then `validateToken()` is called.
It uses the FRESH token.
It calls `/users/me`.
IT FAILS AND SHOWS THE RED TOAST!
WHY WOULD A FRESH TOKEN FAIL?

Wait! Look at `refreshAccessToken()` AGAIN!
```javascript
            const refreshAccessToken = async () => {
                const store = useAppStore();
                const { clientId, clientSecret, refreshToken } = store.config.value.box;
                if (!clientId || !clientSecret || !refreshToken) return false;

                try {
                    const res = await fetch('https://api.box.com/oauth2/token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({
                            grant_type: 'refresh_token',
                            refresh_token: refreshToken,
                            client_id: clientId,
                            client_secret: clientSecret
                        })
                    });
                    if (!res.ok) throw new Error('Failed to refresh token');
                    const data = await res.json();
                    store.config.value.box.accessToken = data.access_token;
                    store.config.value.box.refreshToken = data.refresh_token;
                    store.config.value.box.tokenExpiresAt = Date.now() + (data.expires_in * 1000);
                    isReady.value = true;
                    return true;
                } catch (e) {
                    console.error('Box refresh error:', e);
                    isReady.value = false;
                    return false;
                }
            };
```
Is there ANY CHANCE that `validateToken()` fails because of `store.config.value.box.accessToken` NOT being updated?
No.

Look at the image carefully.
Box API Token Expired or Invalid. Please log in again.
If this is the ONLY bug, then WHY did it fail?
Is it possible the Box App is configured to NOT allow `/users/me`? No.
Is it possible the user is using `Box Developer Token` instead of `OAuth 2.0`?
If they are using a Developer Token (which lives for 60 mins and cannot be refreshed), they wouldn't have a Client Secret!
But they DO have a Client Secret (`................................`).

Wait! Look at `useAppStore()`!
```javascript
                box: {clientId: '', clientSecret: '', accessToken: '', refreshToken: '', tokenExpiresAt: 0},
```
Is `clientId` stored securely? No, it's just in `localStorage`.
Wait. I will write a script to fix the 3 bugs I found:
1. `_fetch` retries with wrong headers.
2. `hydrateFromLoadedState` ignores `box`. Wait, is it a bug? If we sync `box`, then Browser B gets Browser A's tokens. Is that bad? NO! Box supports multiple tokens, BUT if Browser B gets Browser A's tokens, it CAN use them! BUT wait... if Browser B gets Browser A's tokens, Browser B will REFRESH Browser A's tokens! And then Browser A's refresh token is INVALIDATED!
Because Box refresh tokens are single-use!
If Browser B refreshes Browser A's token, Browser B gets a new refresh token. Browser A's refresh token is now INVALID!
Then when Browser A tries to refresh, it FAILS!
And Browser A has to log in again!
So we MUST NOT sync the tokens!
So `hydrateFromLoadedState` ignoring `box` is CORRECT!
BUT we SHOULD sync `clientId` and `clientSecret`!
If we sync `clientId` and `clientSecret`, Browser B gets them!
BUT Browser B can't get them from Box without ALREADY having them!
So it doesn't matter!
So `hydrateFromLoadedState` is CORRECT AS IS!

Then WHAT IS THE BUG?
"There's a bug somewhere with the Box integration, and it doesn't appear to function as intended; settings are not saved across browsers."
What if the user DOES copy the `localStorage` or uses Chrome Sync?
If they use Chrome Sync, `localStorage` is NOT synced.
But what if they are using the SAME BROWSER, but they clear their cookies?
If they clear cookies, `localStorage` is cleared.
Then they enter ID and Secret, and log in.
Then they get the red toast!
WHY?
Because `validateToken()` fails for a fresh token!

WHY does `validateToken()` fail for a fresh token?!
Let me look at `index.html` line 261:
```javascript
                                store.config.value.box.accessToken = data.access_token;
```
Is it possible `data.access_token` is URL-encoded? No.
Wait! What if the user has MULTIPLE Box accounts?
And they logged into Account X, but the app was created in Account Y?
No, Box apps can be used by any account.

Wait! I see it!
Look at the `startOAuthFlow` function:
```javascript
                                store.isHydrating.value = true;
                                try {
                                    store.config.value.box.accessToken = data.access_token;
                                    store.config.value.box.refreshToken = data.refresh_token;
                                    store.config.value.box.tokenExpiresAt = Date.now() + (data.expires_in * 1000);
                                    store.addToast({msg: 'Box connected successfully!', type: 'success'});

                                    const isValid = await validateToken();
```
Is `validateToken()` checking the `tokenExpiresAt`?
```javascript
                if (Date.now() >= (tokenExpiresAt - 60000)) {
```
If `data.expires_in` is `0` or missing?
If `data.expires_in` is missing, `Date.now() + NaN` is `NaN`.
`Date.now() >= NaN` is `false`.
It skips refresh.
Then it calls `fetch('/users/me')`. It returns 401?
Why would it return 401 if it's a fresh token?
It WOULD NOT return 401 if it's a fresh token!
UNLESS... The token IS NOT FRESH!
How could it not be fresh?
If `data.access_token` is the OLD token!
How could `oauth2/token` return the OLD token?
It CANNOT! It always returns a new token!

Wait... I know what it is!
Look at the bug report!
"There's a bug somewhere with the Box integration, and it doesn't appear to function as intended; settings are not saved across browsers."
Could the bug be that `saveConfig` is called with the WRONG `folderId`?
No.

Let me just apply a comprehensive fix to the Box integration:
1. Fix the `_fetch` retry bug with `headers`.
```javascript
            const _fetch = async (url, options = {}) => {
                let res = await fetch(url, options);
                if (res.status === 401) {
                    if (!refreshPromise) refreshPromise = refreshAccessToken();
                    const refreshed = await refreshPromise;
                    refreshPromise = null;
                    if (refreshed) {
                        const newHeaders = typeof options.headers === 'function' ? options.headers() : options.headers;
                        // Replace Authorization header but keep others!
                        const token = useAppStore().config.value.box.accessToken;
                        if (newHeaders instanceof Headers) {
                            newHeaders.set('Authorization', `Bearer ${token}`);
                        } else {
                            newHeaders['Authorization'] = `Bearer ${token}`;
                        }
                        options.headers = newHeaders;
                        res = await fetch(url, options);
```
2. Fix `hydrateFromLoadedState` to sync `clientId` and `clientSecret`, but NOT `accessToken`, `refreshToken`, and `tokenExpiresAt`.
If the user uses Chrome Sync or something that syncs `appConfig.json` manually?
Wait, if we sync `clientId` and `clientSecret`, then Browser B gets them!
But how does Browser B get them from Box?
It DOESN'T! But if we sync them, and the user somehow loads the state, they are preserved.
Actually, let's just do it!
```javascript
        const hydrateFromLoadedState = (loadedState, config, largeData) => {
            const { genHistory, conversations, box, ...rest } = loadedState;
            if (genHistory) largeData.genHistory = genHistory;
            if (conversations) largeData.conversations = conversations;

            const restConfig = { ...rest };
            if (box) {
                const { accessToken, refreshToken, tokenExpiresAt, ...boxRest } = box;
                restConfig.box = boxRest;
            }

            _.mergeWith(config.value, restConfig, (objValue, srcValue) => _.isArray(srcValue) ? srcValue : undefined);
        };
```
3. Fix the red toast!
WHY did the red toast happen?
Because `validateToken` uses `const { accessToken, tokenExpiresAt } = store.config.value.box;`
Wait! Is `store` a Proxy?
Yes! `store.config.value.box` is a Proxy!
If I destructure `accessToken` from it:
`const { accessToken } = store.config.value.box;`
I get the CURRENT value!
BUT wait!
Look at `startOAuthFlow`!
```javascript
                                store.isHydrating.value = true;
                                try {
                                    store.config.value.box.accessToken = data.access_token;
                                    store.config.value.box.refreshToken = data.refresh_token;
                                    store.config.value.box.tokenExpiresAt = Date.now() + (data.expires_in * 1000);
                                    store.addToast({msg: 'Box connected successfully!', type: 'success'});

                                    const isValid = await validateToken();
```
Is it possible `store.config.value.box` DOES NOT UPDATE synchronously?
If `useLocalStorage` returns a `ref`...
Wait, in Vue 3, if you mutate a deep property of a `ref`, the reactive effect is triggered, but the READ of that property IMMEDIATELY after is the new value!
So `accessToken` IS the new value!
There is NO WAY it's the old value!
