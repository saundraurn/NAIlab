I FOUND IT!
The bug is in `hydrateFromLoadedState`!
Look at the destructuring:
```javascript
        const hydrateFromLoadedState = (loadedState, config, largeData) => {
            const { genHistory, conversations, box: _ignoredBox, ...rest } = loadedState;
```
If `loadedState` contains `box`, `rest` DOES NOT.
Then `_.mergeWith(config.value, rest, ...)` merges `rest` into `config.value`.
BUT wait! WHAT IF the user expects `clientId` and `clientSecret` to be SYNCED ACROSS BROWSERS?
I reasoned this is impossible because they need them to connect.
BUT WHAT IF the user is using the SAME browser profile on different computers, which DOES NOT sync `localStorage`? They still have to enter them manually.
What if "settings are not saved across browsers" DOES NOT MEAN "My Client ID and Secret are empty"?
What if it means ALL settings are not saved across browsers?
Why would ALL settings not be saved across browsers?
If `hydrateFromLoadedState` merges `rest` into `config.value`.
Does `_.mergeWith` overwrite arrays completely?
Yes, `_.isArray(srcValue) ? srcValue : undefined`.

Wait... is there ANY OTHER WAY `loadState` returns `null`?
```javascript
            const loadState = async () => {
                if (!isReady.value) return null;
                try {
                    const folderId = await getFolderId();
                    const configFile = await findFile(folderId, CONFIG_FILE_NAME);
```
Wait! What if `getFolderId` FAILS because Box returns a 401 Unauthorized?
If it fails, it throws an error. It shows "Failed to load from Box".

Wait! What if the RED TOAST is from `_fetch` AFTER ALL?
```javascript
                        isReady.value = false;
                        const store = useAppStore();
                        store.addToast({msg: 'Box API Token Expired. Please reconnect in settings.', type: 'error', duration: 5000});
```
This is a DIFFERENT error string!
The image has "Box API Token Expired or Invalid. Please log in again."
This IS from `validateToken`.

Wait... what if `validateToken` is called MULTIPLE TIMES?
1. User clicks "Login with Box".
2. Popup opens, redirects, gets code.
3. `startOAuthFlow` sets `accessToken` and calls `validateToken()`.
4. `validateToken()` succeeds! NO RED TOAST!
5. `loadState()` is called!
6. `loadState()` calls `getFolderId()`.
7. `getFolderId()` calls `_fetch('https://api.box.com/2.0/folders/0/items')`.
8. `_fetch` returns 401 Unauthorized!
9. `_fetch` calls `refreshAccessToken()`.
10. `refreshAccessToken()` FAILS because the `refreshToken` is invalid?
11. If `refreshAccessToken()` fails, `_fetch` shows "Box API Token Expired. Please reconnect in settings."!
12. BUT the image DOES NOT SHOW THIS!

So `validateToken()` MUST HAVE FAILED!
Why did `validateToken()` fail for a fresh token?!

Could it be that `fetch('https://api.box.com/2.0/users/me')` failed because `options.headers` is NOT what we think it is?
```javascript
                    const res = await fetch('https://api.box.com/2.0/users/me', {
                        headers: { 'Authorization': `Bearer ${store.config.value.box.accessToken}` }
                    });
```
Wait... if `data.access_token` is undefined, `accessToken` is undefined. We already ruled this out.

What if Box API endpoint is `https://api.box.com/2.0/users/me` but it returns 404 Not Found?
If it returns 404, `res.ok` is false!
It shows "Box API Token Expired or Invalid"!
Why would it return 404?
Box API docs say `/users/me` returns the current user's profile.
It shouldn't return 404.

What if Box API endpoint is WRONG?
No, it's correct.

What if the `box` object IS NOT INITIALIZED in `useAppStore()`?
```javascript
                box: {clientId: '', clientSecret: '', accessToken: '', refreshToken: '', tokenExpiresAt: 0},
```
It IS initialized.

Wait. The problem is "settings are not saved across browsers".
If `saveConfig` is called...
```javascript
            const saveConfig = async (configObj) => {
```
`configObj` is passed from the `watch`!
```javascript
            watch(config, (newConfig) => {
                if (isHydrating.value) return;
                const boxAPI = useBoxAPI();
                if (boxAPI.isReady.value) boxAPI.saveConfig(newConfig);
            }, { deep: true });
```
Does `saveConfig` STRINGIFY the PROXY directly?
Yes! `JSON.stringify(dataObj)` stringifies the Proxy.
BUT WAIT!
If `dataObj` is a Vue 3 Proxy, `JSON.stringify` works perfectly on it!
What if `dataObj` contains DOM nodes or functions? No, it's just the state tree.

Wait! Look at `index.html` line 448:
```javascript
            const _uploadFile = async (folderId, fileId, fileName, dataObj) => {
                // ...
                const dataStr = JSON.stringify(dataObj, (k, v) => {
                    if (k === '_hydrated') return undefined;
                    if (k === 'url' && typeof v === 'string' && v.startsWith('blob:')) return undefined;
                    return v;
                });
```
Is `configObj` uploaded correctly? YES.
Wait... what if `configObj` is saved, but ONLY SOME fields are saved because of the replacer function?
The replacer only ignores `_hydrated` and `blob:` URLs.
Is `clientId` ignored? No.
Is `app.model` ignored? No.

Let's assume the user IS complaining that `clientId` and `clientSecret` are not saved across browsers!
"There's a bug somewhere with the Box integration, and it doesn't appear to function as intended; settings are not saved across browsers."
What if they EXPECT `clientId` and `clientSecret` to sync because they think they only need to enter them ONCE?
But wait, if they don't enter them on the new browser, they CANNOT connect to Box!
If they CANNOT connect to Box, they CANNOT download the settings!
So the settings are NOT saved across browsers!
So the bug IS that they cannot connect to Box automatically on a new browser!
BUT HOW COULD THEY CONNECT AUTOMATICALLY IF THE APP HAS NO BACKEND AND NO CREDENTIALS?
The app is purely client-side!
It has no backend!
So it CANNOT connect to Box without the Client ID and Secret!
So the user MUST enter them manually on every new browser!
THIS IS A FUNDAMENTAL LIMITATION OF A CLIENT-SIDE APP!
Wait! Is it?
Can the developer provide a DEFAULT Client ID and Secret in the code?
No, the code says: "Create a custom app in Box Developer Console, set redirect URI to this app's URL, and enter the ID/Secret above."
So the developer explicitly tells the user to create their own Box app!
So there is NO default Client ID and Secret!
So the user MUST enter them manually!

If they MUST enter them manually, why did they say "settings are not saved across browsers"?
Because they EXPECTED the OTHER settings (like `tagTest`, `app.model`, `danbooru`, etc.) to be saved across browsers!
If they entered the Client ID and Secret, and logged in, and the OTHER settings WERE NOT LOADED, then "settings are not saved across browsers"!
WHY were the OTHER settings not loaded?
Because `validateToken()` failed right after logging in!
WHY did `validateToken()` fail right after logging in?
Look at `startOAuthFlow` again!
```javascript
                                store.isHydrating.value = true;
                                try {
                                    store.config.value.box.accessToken = data.access_token;
                                    store.config.value.box.refreshToken = data.refresh_token;
                                    store.config.value.box.tokenExpiresAt = Date.now() + (data.expires_in * 1000);
                                    store.addToast({msg: 'Box connected successfully!', type: 'success'});

                                    const isValid = await validateToken();
```
Is there ANY BUG here?
Wait... what if `data.access_token` is valid, and `/users/me` works, and `isValid` is TRUE!
Then `loadState()` is called!
```javascript
                                        const loadedState = await loadState();
                                        if (loadedState) {
                                            hydrateFromLoadedState(loadedState, store.config, store.largeData);
                                            store.addToast({msg: 'Settings loaded from Box.', type: 'success', duration: 2000});
                                        }
```
If this works, it SHOWS "Settings loaded from Box."!
In the image, the GREEN TOAST is "Box connected successfully!".
BUT there is NO "Settings loaded from Box." toast!
WHY?
Because `loadedState` was null?
Why would `loadState()` return null?
```javascript
            const loadState = async () => {
                if (!isReady.value) return null;
                try {
                    const folderId = await getFolderId();
                    const configFile = await findFile(folderId, CONFIG_FILE_NAME);
                    const historyFile = await findFile(folderId, HISTORY_FILE_NAME);

                    let loadedConfig = {};
                    let loadedHistory = {};

                    if (configFile) {
                        cachedConfigFileId = configFile.id;
                        const configRes = await _fetch(`https://api.box.com/2.0/files/${configFile.id}/content`, {headers: _headers()});
                        if (configRes.ok) loadedConfig = await configRes.json();
                    }
```
If `loadState` succeeds but finds NO files, it returns `{}`.
If it returns `{}`, `loadedState` IS truthy (`if (loadedState)` is true).
It calls `hydrateFromLoadedState({}, ...)`.
And it SHOWS "Settings loaded from Box."!
BUT the image DOES NOT SHOW "Settings loaded from Box."!
So `loadedState` MUST BE `null`!
OR `loadState()` THREW AN ERROR!
If `loadState()` threw an error, it returns `null` AND shows "Failed to load from Box: ..."!
The image DOES NOT SHOW "Failed to load from Box"!
So `loadState()` returned `null` WITHOUT throwing an error!
WHEN DOES `loadState()` return `null` without throwing?
```javascript
                if (!isReady.value) return null;
```
ONLY IF `isReady.value` is FALSE!
WHY is `isReady.value` false?
Because `validateToken()` set it to FALSE!
```javascript
                    isReady.value = res.ok;
```
So `res.ok` from `/users/me` was FALSE!
So `validateToken()` FAILED!
AND it showed the RED TOAST!
This proves EVERYTHING!
The ONLY question is WHY `/users/me` returned 401 right after `oauth2/token` succeeded!
