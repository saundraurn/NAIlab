Let's consider the user's issue: "settings are not saved across browsers".
This is because when Browser B connects, it fetches `appConfig.json` from Box.
`appConfig.json` contains `tagTest`, `app`, `box`, etc.
Then `hydrateFromLoadedState` is called:
```javascript
        const hydrateFromLoadedState = (loadedState, config, largeData) => {
            const { genHistory, conversations, box: _ignoredBox, ...rest } = loadedState;
            if (genHistory) largeData.genHistory = genHistory;
            if (conversations) largeData.conversations = conversations;
            _.mergeWith(config.value, rest, (objValue, srcValue) => _.isArray(srcValue) ? srcValue : undefined);
        };
```
Is there ANY BUG here?
Wait! `_.mergeWith` modifies `config.value`!
BUT `loadedState` might have `undefined` values? No.
What if `rest` has `app.model` = `'nai-diffusion-4'` and `config.value.app.model` = `'nai-diffusion-3'`?
It merges them. `config.value.app.model` becomes `'nai-diffusion-4'`.
This WORKS!

Why are settings NOT saved across browsers?
Wait! `useLocalStorage` saves to `localStorage`.
What if `useLocalStorage` saves to a key that is DIFFERENT per browser?
`nai-app-settings` is the key.
Wait... what if `saveConfig` is NEVER CALLED because of `store.isHydrating.value`?
Look at `saveConfig` again!
```javascript
            const saveConfig = async (configObj) => {
                if (!isReady.value) return;
                const store = useAppStore();
                if (store.isHydrating.value) return;
                if (saveConfigTimeout) clearTimeout(saveConfigTimeout);

                saveConfigTimeout = setTimeout(async () => {
                    if (store.isHydrating.value) return;
                    try {
                        // ...
```
If `store.isHydrating.value` is `true` AT THE TIME OF THE TIMEOUT, it DOES NOT SAVE!
When is `store.isHydrating.value` `true`?
```javascript
                onMounted(async () => {
                    store.isHydrating.value = true;
                    // ...
                    await nextTick();
                    store.isHydrating.value = false;
                });
```
This is only true during startup or login!
When the user modifies a setting, `isHydrating.value` is `false`!
So it SHOULD save to Box!

Wait. I see something.
`watch(config, (newConfig) => { ... }, { deep: true })`
Does this watch trigger when `config.value` is updated by `useLocalStorage` from ANOTHER TAB?
Yes, `useLocalStorage` triggers the ref update.
Does it trigger when the app FIRST loads?
Yes, `watch` with `{ immediate: true }` triggers immediately.
But it DOES NOT have `{ immediate: true }`!
So it DOES NOT trigger immediately.
So it ONLY triggers when the user makes a change!
So if the user makes a change, it calls `saveConfig(newConfig)`.
This calls `_uploadFile`.
This uploads to Box.
This ALL SEEMS CORRECT.

What if the bug is that `store.isHydrating.value = false` is NEVER CALLED because `await nextTick()` fails or something throws an error?
If `hydrateFromLoadedState` throws an error, `await nextTick()` is not called in `startOAuthFlow` because it's not inside a `finally` block?
```javascript
                                const isValid = await validateToken();
                                if (isValid) {
                                    const loadedState = await loadState();
                                    if (loadedState) {
                                        hydrateFromLoadedState(loadedState, store.config, store.largeData);
                                        store.addToast({msg: 'Settings loaded from Box.', type: 'success', duration: 2000});
                                    }
                                }

                                await nextTick();
```
If `hydrateFromLoadedState` throws an error, it is caught by the `catch` block!
```javascript
                            } finally {
                                store.isHydrating.value = false;
                            }
```
Wait! `store.isHydrating.value = false` IS IN THE `finally` BLOCK!
So it IS called!

Wait... I'm missing something SO OBVIOUS!
Look at the `startOAuthFlow` again!
```javascript
                                store.config.value.box.accessToken = data.access_token;
                                store.config.value.box.refreshToken = data.refresh_token;
                                store.config.value.box.tokenExpiresAt = Date.now() + (data.expires_in * 1000);
```
Look at `isReady.value = true;`!
Wait! Is `isReady.value` set to `true`?
```javascript
                                store.config.value.box.accessToken = data.access_token;
                                // ...
                                const isValid = await validateToken();
```
`validateToken()`:
```javascript
                isValidating.value = true;
                try {
                    const res = await fetch('https://api.box.com/2.0/users/me', {
                        headers: { 'Authorization': `Bearer ${store.config.value.box.accessToken}` }
                    });
                    isReady.value = res.ok;
                    if (!res.ok) {
                        store.addToast({msg: 'Box API Token Expired or Invalid. Please log in again.', type: 'error'});
                    }
                    return res.ok;
```
If `/users/me` returns `!res.ok`, it sets `isReady.value = false`, and returns `false`.
WHY would `/users/me` return `!res.ok`?
Could it be that `fetch('https://api.box.com/2.0/users/me')` is throwing an error?
If it throws, it goes to `catch (e)`!
```javascript
                } catch (e) {
                    isReady.value = false;
                    return false;
                } finally {
```
If it throws, NO RED TOAST IS SHOWN!
So it DOES NOT throw! It returns a response where `res.ok === false`!
So Box API is EXPLICITLY REJECTING the request!
WHY would Box API reject a FRESH token?
Because it's NOT a fresh token!
WHY is it NOT a fresh token?
Is it possible that `data.access_token` from `oauth2/token` is NOT BEING SAVED?
Look at `store.config.value.box.accessToken = data.access_token;`!
It IS being saved!

Wait... Is it possible the user is NOT CALLING `startOAuthFlow`?
"settings are not saved across browsers"
Maybe the user just opened Browser B, entered Client ID and Secret, and DID NOT click "Login with Box"??
If they didn't click it, they don't have a token.
Then `validateToken` returns `false` immediately, NO RED TOAST!
So they MUST have clicked it!

Wait! Could it be that `hydrateFromLoadedState` is replacing `config.value` entirely with something else? No, `_.mergeWith` merges.

Let's look at the Box Developer Console settings!
Is there a setting for CORS? Yes.
Is there a setting for `Token Validity`?
Maybe `tokenExpiresAt` is calculated wrong because `data.expires_in` is in MILLISECONDS instead of seconds?
Box API says: `"expires_in": 3600` (Seconds).
So `Date.now() + (data.expires_in * 1000)` is correct.

What about `refreshAccessToken()`?
```javascript
                    store.config.value.box.tokenExpiresAt = Date.now() + (data.expires_in * 1000);
                    isReady.value = true;
```
This is also correct.

Wait... look at `_headers()`!
```javascript
            const _headers = () => {
                const store = useAppStore();
                const token = store.config.value.box?.accessToken;
                if (!isReady.value || !token) return { 'Content-Type': 'application/json' };
                return {'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json'};
            };
```
Is `isReady.value` initialized correctly?
`const isReady = ref(false);`
When `validateToken()` runs:
```javascript
                try {
                    const res = await fetch('https://api.box.com/2.0/users/me', {
                        headers: { 'Authorization': `Bearer ${store.config.value.box.accessToken}` }
                    });
                    isReady.value = res.ok;
```
It sets `isReady.value = res.ok`.

Wait! I see it!
In `index.html` line 1802:
```javascript
                    box: useAppStore().config.value.box,
```
If the user modifies `box.clientId`, `config.value.box` updates.
Then `watch` triggers:
```javascript
            watch(config, (newConfig) => {
                if (isHydrating.value) return;
                const boxAPI = useBoxAPI();
                if (boxAPI.isReady.value) boxAPI.saveConfig(newConfig);
            }, { deep: true });
```
When `saveConfig` is called, it waits 3000ms.
Then it saves `config.value` to Box.
BUT `config.value.box` CONTAINS `accessToken`, `refreshToken`, and `tokenExpiresAt`!
Wait! WHAT IF Browser A saves its tokens to Box.
Then Browser B connects to Box, gets ITS OWN tokens, and saves them to `localStorage`.
Then `hydrateFromLoadedState` runs!
```javascript
        const hydrateFromLoadedState = (loadedState, config, largeData) => {
            const { genHistory, conversations, box: _ignoredBox, ...rest } = loadedState;
            _.mergeWith(config.value, rest, (objValue, srcValue) => _.isArray(srcValue) ? srcValue : undefined);
        };
```
`rest` does NOT contain `box`. So `config.value.box` is NOT overwritten.
So Browser B's tokens are preserved in memory!
THEN Browser B makes a change!
`saveConfig` runs on Browser B!
It saves `config.value` to Box!
`config.value` contains Browser B's `box` object, which has Browser B's tokens!
So `appConfig.json` on Box NOW HAS Browser B's tokens!
THEN the user goes BACK to Browser A.
Browser A's `onMounted` runs.
Browser A calls `validateToken()`.
Browser A's token is STILL VALID (it's in Browser A's `localStorage`).
It calls `/users/me`. It returns 200 OK.
It calls `loadState()`.
It loads `appConfig.json` from Box.
`appConfig.json` has Browser B's tokens.
`hydrateFromLoadedState` extracts `box` from `loadedState` and DISCARDS IT!
So Browser A's tokens are PRESERVED!
Browser A's settings are UPDATED from Browser B's settings!
Everything WORKS!

WHY is there a bug?
"There's a bug somewhere with the Box integration, and it doesn't appear to function as intended; settings are not saved across browsers."
Could the bug be that `uiConfig` is NOT SAVED TO BOX?
"settings are not saved across browsers"
If I change `uiConfig` (like split sizes, or collapsible panels), it is NOT saved to Box.
Is `uiConfig` supposed to be saved to Box?
There is NO code that saves `uiConfig` to Box!
Wait! `useAppStore` returns `config` and `uiConfig`.
`uiConfig` is used for `splitSizes`, `splitSizesDanbooru`, `collapsibleStates`.
Is `uiConfig` considered "settings"?
Well, they are UI states, not usually synced across devices.
The user is complaining about the BOX integration.
Look at the image! The image shows `Box Cloud Storage` component!
Why would they show `Box Cloud Storage` if they were complaining about `uiConfig`?
They wouldn't!
They are complaining about `Box Cloud Storage` settings!
"settings are not saved across browsers."
What settings are in `Box Cloud Storage`?
`Box Client ID` and `Box Client Secret`!
Are they saved to Box?
Yes, they are saved to Box (in `appConfig.json`).
Are they LOADED from Box?
NO!
`const { genHistory, conversations, box: _ignoredBox, ...rest } = loadedState;`
They are IGNORED when loading from Box!
If they are ignored, then Browser B NEVER GETS the `Box Client ID` and `Box Client Secret` from Browser A!
But wait! If Browser B DOES NOT have `Box Client ID` and `Box Client Secret`, it CANNOT CONNECT TO BOX!
If it CANNOT CONNECT TO BOX, it CANNOT DOWNLOAD `appConfig.json`!
So EVEN IF we didn't ignore `box`, Browser B STILL COULDN'T download them!
Unless...
Unless the user copies the `appConfig.json` file manually? No.
Wait! What if the user EXPECTS the Box integration to work like a traditional OAuth flow, where they DON'T NEED a custom Client ID and Secret?
If they don't need a custom Client ID and Secret, they wouldn't have fields for them!
The fields exist because the developer built it this way.
So the user KNOWS they have to enter them.
If they KNOW they have to enter them, why do they say "settings are not saved across browsers"?

Let's look at `index.html` again.
Is it possible the user is using the same browser profile on a different machine?
If they use Chrome Sync, `localStorage` is NOT synced across machines!
So "settings are not saved across browsers" could mean "I am using Chrome on my Desktop, and Chrome on my Laptop. I set up Box on my Desktop. When I open Chrome on my Laptop, none of my settings are there! And I can't even connect to Box because it says Token Expired or Invalid!"
Wait! If they open Chrome on Laptop, `localStorage` is EMPTY.
So `validateToken()` returns FALSE. It DOES NOT show the red toast!
So WHY did they get the red toast?

What if the RED TOAST is NOT from `validateToken()`?
```javascript
            const _fetch = async (url, options = {}) => {
                let res = await fetch(url, options);
                if (res.status === 401) {
                    if (!refreshPromise) refreshPromise = refreshAccessToken();
                    const refreshed = await refreshPromise;
                    refreshPromise = null;
                    if (refreshed) {
                        options.headers = _headers();
                        res = await fetch(url, options);
                    } else {
                        isReady.value = false;
                        const store = useAppStore();
                        store.addToast({msg: 'Box API Token Expired. Please reconnect in settings.', type: 'error', duration: 5000});
                        throw new Error('Unauthorized');
                    }
                }
                return res;
            };
```
If `_fetch` throws `Unauthorized`, it shows "Box API Token Expired. Please reconnect in settings."
But the image shows "Box API Token Expired or Invalid. Please log in again."
This IS from `validateToken()`!

Wait! I see it!
When `refreshAccessToken()` is called:
```javascript
                    const res = await fetch('https://api.box.com/oauth2/token', {
                        // ...
                        body: new URLSearchParams({
                            grant_type: 'refresh_token',
                            refresh_token: refreshToken,
                            client_id: clientId,
                            client_secret: clientSecret
                        })
                    });
                    if (!res.ok) throw new Error('Failed to refresh token');
```
If `refreshAccessToken()` FAILS, it throws an error and returns `false`.
Then `validateToken()` returns `false`.
BUT `validateToken()` DOES NOT SHOW THE RED TOAST if `refreshAccessToken()` fails!
```javascript
                if (Date.now() >= (tokenExpiresAt - 60000)) {
                    if (!refreshPromise) refreshPromise = refreshAccessToken();
                    const refreshed = await refreshPromise;
                    refreshPromise = null;
                    if (!refreshed) return false;
                }
```
If `refreshed` is `false`, it returns `false`. NO RED TOAST!
So if the token is EXPIRED, and the refresh FAILS, the user gets NO ERROR MESSAGE AT ALL!
They just silently fail to load settings!
AND THEY THINK "settings are not saved across browsers" because the settings DID NOT LOAD!
Wait! But the image SHOWS the red toast!
HOW did they get the red toast?
If `tokenExpiresAt` is NOT reached yet (e.g. they opened the app 10 minutes after closing it).
Then `Date.now() >= (tokenExpiresAt - 60000)` is FALSE!
So it calls `fetch('https://api.box.com/2.0/users/me')`.
It returns 401 Unauthorized!
WHY would a 10-minute old token return 401 Unauthorized?
Because the Box API Token was REVOKED!
WHY was the Box API Token revoked?
Because they used the SAME `clientId` and `clientSecret` on Browser B, and logged in!
Does logging in on Browser B revoke the token on Browser A?
Let's check Box API documentation!
"When you request a new access token using a refresh token, the old access token is invalidated."
Wait, that's for refreshing!
What if you request a new access token using an AUTHORIZATION CODE?
"When a user grants access to an application, a new access token and refresh token pair is generated. Previous tokens for the same user and application ARE NOT invalidated."
Wait! Are they or are they not invalidated?
Box Developer Docs:
"An access token is only valid for 60 minutes. ... Box allows up to 10 active tokens per user per enterprise. ... If a user authenticates again and gets a new token, the old token remains valid until it expires."
So the old token should STILL be valid!
