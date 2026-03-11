Wait! Look at `hydrateFromLoadedState` AGAIN!
```javascript
        const hydrateFromLoadedState = (loadedState, config, largeData) => {
            const { genHistory, conversations, box: _ignoredBox, ...rest } = loadedState;
            if (genHistory) largeData.genHistory = genHistory;
            if (conversations) largeData.conversations = conversations;
            _.mergeWith(config.value, rest, (objValue, srcValue) => _.isArray(srcValue) ? srcValue : undefined);
        };
```
What if `loadedState` IS NOT PARSED CORRECTLY?
No, we verified `json()` works.

What if the user's Client Secret is getting ERASED?
Look at `index.html` line 1802:
```javascript
                            <setting-input v-model="box.clientId" label="Box Client ID" type="text" placeholder="..."></setting-input>
                            <setting-input v-model="box.clientSecret" label="Box Client Secret" type="password" placeholder="..."></setting-input>
```
If `hydrateFromLoadedState` does `_.mergeWith`, it merges `rest`. `rest` DOES NOT contain `box`. So `box` is not overwritten.
BUT what if `loadedState` contains `box`, and `rest` does NOT, but somehow Vue reactivity causes a bug? No.

Let's look at `useBoxAPI`.
```javascript
            const refreshAccessToken = async () => { ...
                    const data = await res.json();
                    store.config.value.box.accessToken = data.access_token;
                    store.config.value.box.refreshToken = data.refresh_token;
                    store.config.value.box.tokenExpiresAt = Date.now() + (data.expires_in * 1000);
```
Wait! Could `Date.now() + (data.expires_in * 1000)` be the problem?
No, it's correct.

Wait... Look at the error message again!
"settings are not saved across browsers"
AND the red toast is "Box API Token Expired or Invalid. Please log in again."
When is this shown?
`onMounted` -> `validateToken()` -> shows toast!
If the user opens Browser B, and they NEVER log in to Box.
Then `onMounted` calls `validateToken()`.
```javascript
                onMounted(async () => {
                    store.isHydrating.value = true;
                    await boxAPI.validateToken();
```
`validateToken()`:
```javascript
            const validateToken = async () => {
                const store = useAppStore();
                const { accessToken, tokenExpiresAt } = store.config.value.box;
                if (!accessToken) {
                    isReady.value = false;
                    return false;
                }
```
If the user NEVER logged in on Browser B, `accessToken` is `''`.
So it returns `false` IMMEDIATELY.
NO TOAST is shown!
So the RED TOAST CANNOT happen on a brand new browser!
The RED TOAST ONLY happens if `accessToken` IS present!
How did Browser B get the `accessToken`?
EITHER the user logged in on Browser B...
OR the user REFRESHED THE PAGE on Browser B AFTER logging in!
If the user REFRESHED THE PAGE on Browser B after logging in, then `accessToken` IS present!
It was saved to `localStorage`.
Then `onMounted` runs, `validateToken()` runs.
It checks if `tokenExpiresAt` is passed.
If it's passed, it refreshes.
If it's NOT passed, it calls `/users/me`.
If `/users/me` returns `!res.ok`, it shows the RED TOAST!
WHY would `/users/me` return `!res.ok` for a token that is STILL in `localStorage` and NOT expired?
Because the token WAS INVALIDATED!
WHY was the token invalidated?
Because the user logged into Box on Browser A AGAIN?
Wait! Does logging into Box on Browser A invalidate Browser B's token?
Box Developer Docs:
"An access token is valid for 60 minutes. A refresh token is valid for 60 days. ... When you use a refresh token to get a new access token, the old access token and refresh token are immediately invalidated."
Wait! If Browser A REFRESHES the token, does it invalidate Browser B's token?
NO! Browser A and Browser B have DIFFERENT access tokens and DIFFERENT refresh tokens!
They are separate OAuth flows! They DO NOT invalidate each other!
Wait... "When you use a refresh token to get a new access token, the old access token and refresh token are immediately invalidated."
This applies to THAT specific refresh token chain!
Browser B has its OWN refresh token chain!

Wait! Could it be that `hydrateFromLoadedState` IS LOADING THE BOX OBJECT???
Let's check `test_merge4.js` again!
```javascript
const hydrateFromLoadedState = (loadedState, config, largeData) => {
    const { genHistory, conversations, box: _ignoredBox, ...rest } = loadedState;
    _.mergeWith(config.value, rest, (objValue, srcValue) => _.isArray(srcValue) ? srcValue : undefined);
};
```
Is it possible that `config` is a REF, but `config.value` is NOT what we expect?
`config.value` is an object.
Is it possible `loadedState` is NOT an object? No.
Is it possible `loadedState` DOES NOT HAVE a `box` key?
Wait! If `appConfig.json` is missing the `box` key, then `box: _ignoredBox` is undefined.
Then `rest` DOES NOT contain `box`.
So `_.mergeWith` still does NOT merge `box`.
BUT what if `loadedState` HAS the `box` key?
`const { genHistory, conversations, box: _ignoredBox, ...rest } = loadedState;`
Then `rest` STILL does NOT contain `box`.
So `_.mergeWith` NEVER merges `box`!
So Browser B NEVER gets Browser A's tokens.

Wait! What if the user DOES NOT LOG IN on Browser B?
What if the user COPIES their entire `localStorage` to Browser B? No, "settings are not saved across browsers".
What if the user is complaining that settings ARE NOT SAVED?
Let's assume there is a BUG in `saveConfig`.
If `saveConfig` does not save, then settings are not saved across browsers!
Let's look at `_uploadFile`:
```javascript
            const _uploadFile = async (folderId, fileId, fileName, dataObj) => {
                const store = useAppStore();
                const token = store.config.value.box.accessToken;
                // For history, remove _hydrated flag and stale blob urls before saving
                const dataStr = JSON.stringify(dataObj, (k, v) => {
                    if (k === '_hydrated') return undefined;
                    if (k === 'url' && typeof v === 'string' && v.startsWith('blob:')) return undefined;
                    return v;
                });
                const formData = new FormData();
                if (fileId) {
                    formData.append('attributes', JSON.stringify({name: fileName}));
                    formData.append('file', new Blob([dataStr], {type: 'application/json'}), fileName);
                    const res = await _fetch(`https://upload.box.com/api/2.0/files/${fileId}/content`, {
                        method: 'POST',
                        headers: {'Authorization': `Bearer ${token}`},
                        body: formData
                    });
                    if (!res.ok) throw new Error(`Failed to update Box file: ${fileName}`);
                    return fileId;
                } else {
```
Is Box API `Upload File Version` correct?
Let's check again!
`https://upload.box.com/api/2.0/files/${fileId}/content`
Is it POST? Yes.
Does it require `attributes`? No, it's optional. But we provide it.
Wait! What if we provide `attributes` with `name`, BUT we don't provide `parent`?
Box API allows renaming during update by providing `name`. This is fine.
BUT wait! Does Box API allow updating a file using `multipart/form-data` with `attributes` in `POST /files/${fileId}/content`?
YES!
Let's look closely at `_fetch`.
```javascript
            const _fetch = async (url, options = {}) => {
                let res = await fetch(url, options);
                if (res.status === 401) {
                    // refresh logic
```
Wait! The headers in `_fetch`!
```javascript
                    const res = await _fetch(`https://upload.box.com/api/2.0/files/${fileId}/content`, {
                        method: 'POST',
                        headers: {'Authorization': `Bearer ${token}`},
                        body: formData
                    });
```
Notice we DO NOT call `_headers()` here! We set `headers: {'Authorization': ... }` manually!
Why? Because `_headers()` adds `'Content-Type': 'application/json'`!
If we do `multipart/form-data`, we MUST NOT set `Content-Type` manually, so that the browser sets the boundary!
So `headers: {'Authorization': ... }` is perfectly correct!

Wait! Could the bug be `saveHistoryTimeout`?
```javascript
                saveHistoryTimeout = setTimeout(async () => {
                    if (store.isHydrating.value) return;
```
If `isHydrating.value` is true, it aborts.
But `saveHistoryTimeout` is 3000ms. By then, `isHydrating` is false!

Is there any bug in `JSON.stringify(dataObj)`?
What is `dataObj`? `config.value`.
Wait! Vue `ref` holding a proxy.
When you stringify `config.value`, does it stringify the WHOLE object correctly?
Let's test it.
