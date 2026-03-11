Let's think about `appConfig.json` being empty.
Is it possible `appConfig.json` is saved as EMPTY?
Look at `const dataStr = JSON.stringify(dataObj, ...);`
If `dataObj` is a Vue 3 proxy, does `JSON.stringify` work?
Yes, `JSON.stringify` converts the Proxy target correctly.

Wait! Could the bug be in `Box Cloud Storage` component?
```javascript
                                <button @click="startBoxOAuth" class="btn btn-primary" :class="{'btn-success': isBoxReady}">
                                    {{ isBoxReady ? 'Box Connected - Reauthenticate' : 'Login with Box' }}
                                </button>
```
If `isBoxReady` is true, the button says `Box Connected - Reauthenticate`.
If they click it, it runs `startOAuthFlow` AGAIN.

Wait! What if the user says "settings are not saved across browsers" because they log into Box on Browser B, BUT the app DOES NOT LOAD settings from Box?
Why wouldn't it load settings?
Because `loadState()` throws an error!
Let's check `loadState()`:
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
                    // ...
```
Wait!
If `configRes.ok` is true, it parses JSON.
BUT wait! Box API `files/${configFile.id}/content`!
Does this return JSON?
Yes, if we uploaded JSON, it returns the file content (JSON).
Wait! Does it redirect?
YES! Box API `/content` REDIRECTS to a download URL!
Does `fetch` follow redirects?
YES! `fetch` follows redirects by default!
So `configRes.ok` is true, and it parses JSON.
This works!

Wait... let's look at `index.html` line 399:
```javascript
            const findFile = async (folderId, name) => {
                const res = await _fetch(`https://api.box.com/2.0/folders/${folderId}/items`, {headers: _headers()});
                if (!res.ok) throw new Error('Failed to list folder items');
                const data = await res.json();
                return data.entries.find(e => e.name === name && e.type === 'file');
            };
```
This is fine.

Wait! Look at the error: "Box API Token Expired or Invalid."
If they just clicked "Login with Box", they successfully connect, the green toast shows.
Then `validateToken()` is called, and it shows the red toast.
WHY does `validateToken` fail?
Maybe the Box API token is NOT valid immediately?
No.

What if `refreshAccessToken()` is failing?
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
If `res.ok` is false, it returns `false`.
Then `validateToken` returns `false` BEFORE calling `/users/me`.
AND it DOES NOT show the toast!
So the RED TOAST CANNOT come from a failed refresh!
The RED TOAST CAN ONLY come from `fetch('https://api.box.com/2.0/users/me')` returning `!res.ok`.

Why does `/users/me` return `!res.ok`?
Because `accessToken` is invalid!
Why is it invalid?
Is it possible that `store.config.value.box.accessToken` was OVERWRITTEN right after it was set?
YES!
Let's look at `startOAuthFlow`:
```javascript
                                store.isHydrating.value = true;
                                try {
                                    store.config.value.box.accessToken = data.access_token;
                                    store.config.value.box.refreshToken = data.refresh_token;
                                    store.config.value.box.tokenExpiresAt = Date.now() + (data.expires_in * 1000);
                                    store.addToast({msg: 'Box connected successfully!', type: 'success'});

                                    const isValid = await validateToken();
                                    if (isValid) {
                                        const loadedState = await loadState();
                                        if (loadedState) {
                                            hydrateFromLoadedState(loadedState, store.config, store.largeData);
                                            // ...
```
Wait! `hydrateFromLoadedState` parses the OLD config from Box!
`hydrateFromLoadedState` does NOT overwrite `box.accessToken` because `box: _ignoredBox`!
BUT wait! What if `loadState()` throws an error? No.
What if `validateToken()` uses the OLD `accessToken`?
`validateToken` does:
```javascript
                const { accessToken, tokenExpiresAt } = store.config.value.box;
```
If `store.config.value.box.accessToken` is set just before, it should use the NEW one!

Wait. I need to look at `index.html` line 268-271:
```javascript
                            store.isHydrating.value = true;
                            try {
                                store.config.value.box.accessToken = data.access_token;
                                store.config.value.box.refreshToken = data.refresh_token;
                                store.config.value.box.tokenExpiresAt = Date.now() + (data.expires_in * 1000);
                                store.addToast({msg: 'Box connected successfully!', type: 'success'});

                                const isValid = await validateToken();
```
Is it possible that `data.access_token` is undefined because Box changed their API? No.
Is it possible `store.config.value.box` does NOT update immediately?
Vue `ref` updates synchronously.

Could it be that the user has TWO tabs open?
Tab A and Tab B.
User logs in on Tab A. Tab A saves to Box. Tab A gets tokens.
Tab A `localStorage` is updated.
Tab B `useLocalStorage` triggers an update event because of `storage` event listener!
VueUse's `useLocalStorage` listens to the `storage` event from other tabs!
When Tab A saves `nai-app-settings` to `localStorage`...
Tab B's `config.value` is UPDATED with Tab A's `nai-app-settings`!
So Tab B gets Tab A's tokens!
And Tab B's `config.value` is now identical to Tab A!
Wait, if it's identical, then Browser B gets the settings from Browser A via `localStorage`!
But the user says "settings are not saved across browsers"!
"Browsers", not "tabs".
Across DIFFERENT browsers (e.g. Chrome to Firefox, or PC to Mobile).
`localStorage` is not shared across browsers!

Wait... look at `index.html` line 560:
```javascript
            watch(config, (newConfig) => {
                if (isHydrating.value) return;
                const boxAPI = useBoxAPI();
                if (boxAPI.isReady.value) boxAPI.saveConfig(newConfig);
            }, { deep: true });
```
If the user modifies a setting, it triggers the watch, and calls `saveConfig`.
`saveConfig` waits 3000ms.
Then it uploads to Box.
THEN the user closes the browser.
Wait! What if they close the browser BEFORE 3000ms?
If they close the browser within 3 seconds, `saveConfig` is cancelled because the browser closes!
So the settings are NEVER saved to Box!
Could THIS be the bug? "settings are not saved across browsers"
If I change a setting and immediately close the browser, it won't save.
Is that the bug?
The image shows "Box API Token Expired or Invalid".
Why is the token invalid?
