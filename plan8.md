Wait, if the user doesn't know they have to enter them manually, they might try to click "Login with Box" and fail.
But the screenshot shows they DID enter them!
The screenshot shows `Box Client ID` has `ycrdkwilzcotgunudrjhw8auafoaz7sy`.
And `Box Client Secret` has dots `................................`.
So they DID enter them manually.
AND they got the error "Box API Token Expired or Invalid."
If they entered them manually, AND they clicked "Login with Box", AND they got "Box connected successfully!"...
THEN they got "Box API Token Expired or Invalid. Please log in again."
WHY?
Because `validateToken()` was called, and it sent a request to `https://api.box.com/2.0/users/me`.
AND it returned `401 Unauthorized`.
WHY would a freshly minted token from `startOAuthFlow` return 401 Unauthorized?
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
Is there ANY BUG in this code?
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
Wait! `const { accessToken, tokenExpiresAt } = store.config.value.box;`
If `validateToken()` uses `store.config.value.box.accessToken`, it will be the newly assigned `data.access_token`!
AND `fetch` will use `headers: { 'Authorization': \`Bearer ${store.config.value.box.accessToken}\` }`.
So it uses the newly assigned `data.access_token`!
So it SHOULD succeed!
WHY DOES IT FAIL?
Because `validateToken` is defined INSIDE `useBoxAPI`.
```javascript
        const useBoxAPI = createGlobalState(() => {
            const validateToken = async () => { ... }
            return { validateToken, ... }
        });
```
It is a closure. `useAppStore()` gets the store. `store.config.value.box` is the proxy object.
Wait. Is it possible `data.access_token` is INCORRECT?
No, the OAuth spec uses `access_token`.
Is it possible the Box API endpoint `users/me` is wrong? No, it's correct.

Wait... Look at `hydrateFromLoadedState`:
```javascript
        const hydrateFromLoadedState = (loadedState, config, largeData) => {
            const { genHistory, conversations, box: _ignoredBox, ...rest } = loadedState;
            if (genHistory) largeData.genHistory = genHistory;
            if (conversations) largeData.conversations = conversations;
            _.mergeWith(config.value, rest, (objValue, srcValue) => _.isArray(srcValue) ? srcValue : undefined);
        };
```
Is it possible `loadedState` contains arrays that `_.mergeWith` overwrites completely?
Yes, `_.isArray(srcValue) ? srcValue : undefined`.
Is it possible that `config.value` is being replaced entirely?
No, `_.mergeWith` merges `rest` into `config.value`.

Let's think about "settings are not saved across browsers."
Could it be that Box OAuth token expires and is NOT refreshed because the refresh token is also invalid?
If the user logs in on Browser A. Saves settings.
Closes Browser A.
Opens Browser B. Logs in. Saves settings.
Now Browser B has valid tokens.
Opens Browser A.
`onMounted` runs `validateToken()`.
Browser A uses ITS OWN `accessToken` and `refreshToken`.
If the token is expired, it refreshes it using Browser A's `refreshToken`.
Since Browser A's `refreshToken` is still valid for Box (Box supports multiple refresh tokens), it SHOULD work!
BUT what if Box DOES NOT support multiple refresh tokens for the same user and app?
Actually, Box Developer Docs state:
"A user can have multiple active access tokens and refresh tokens at any given time."
So Browser A and Browser B tokens do NOT invalidate each other.

Wait! What if the user changed the Client Secret on Browser B?
Then Browser A's tokens are STILL VALID, but when Browser A tries to refresh, it uses the OLD Client Secret? No, the Client Secret doesn't change unless they change the app in Box Developer Console.

Wait! Could it be that the user is trying to log in, but `validateToken()` fails AFTER hydration?
Look at `startOAuthFlow`:
```javascript
                                    const isValid = await validateToken();
                                    if (isValid) {
                                        const loadedState = await loadState();
                                        if (loadedState) {
                                            hydrateFromLoadedState(loadedState, store.config, store.largeData);
                                            store.addToast({msg: 'Settings loaded from Box.', type: 'success', duration: 2000});
                                        }
                                    }
```
If `isValid` is true, it loads the state, and calls `hydrateFromLoadedState`.
```javascript
        const hydrateFromLoadedState = (loadedState, config, largeData) => {
            const { genHistory, conversations, box: _ignoredBox, ...rest } = loadedState;
            if (genHistory) largeData.genHistory = genHistory;
            if (conversations) largeData.conversations = conversations;
            _.mergeWith(config.value, rest, (objValue, srcValue) => _.isArray(srcValue) ? srcValue : undefined);
        };
```
If `loadedState` HAS `box` settings, they are ignored.
Wait. Is it possible `loadedState` has settings that are objects with arrays inside? Yes.
Wait! What if `loadedState` DOES NOT HAVE `box` settings?
Then `_ignoredBox` is undefined. `rest` DOES contain `box`?
NO! `const { box: _ignoredBox, ...rest } = loadedState;`
If `loadedState` is `{ app: {} }`, `rest` is `{ app: {} }`. `box` is NOT in `rest`.

Wait! Look at `index.html` line 1802:
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
When it saves to Box:
```javascript
            const _uploadFile = async (folderId, fileId, fileName, dataObj) => {
```
`dataObj` is `config.value`.
So `appConfig.json` on Box contains `box: { clientId, clientSecret, accessToken, refreshToken, tokenExpiresAt }`.
Then on Browser B, it loads `appConfig.json` from Box.
`hydrateFromLoadedState` destructures `box: _ignoredBox` and discards it!
BUT what if the user expects `clientId` and `clientSecret` to be synced so they don't have to enter it again?
We ALREADY determined this is impossible because they need them to connect in the first place!

BUT wait! Is it possible the user means the OTHER settings?
If the user means the OTHER settings, then WHY are they not saved?
Wait... could `configObj` inside `saveConfig` be WRONG?
Let's see: `watch(config, (newConfig) => { ... })`
`newConfig` is passed to `saveConfig`.
Wait! Is it possible `saveConfig` is debounced by 3000ms, BUT if multiple changes happen within 3000ms, it only saves the FIRST ONE?
No!
```javascript
            const saveConfig = async (configObj) => {
                // ...
                if (saveConfigTimeout) clearTimeout(saveConfigTimeout);

                saveConfigTimeout = setTimeout(async () => {
                    // ...
                    cachedConfigFileId = await _uploadFile(folderId, cachedConfigFileId, CONFIG_FILE_NAME, configObj);
```
It clears the timeout, but `configObj` is the OLD reference!
Wait! Vue's `watch` with `{ deep: true }` passes the SAME PROXY REFERENCE every time!
Because it's deep, `newConfig` IS `config.value`. It's not a copy!
So when `_uploadFile` is called 3000ms later, it stringifies `configObj`, which is the CURRENT state of `config.value`!
So it saves the LATEST state! This is CORRECT!

Wait. Is it possible that `config` is NOT loaded correctly on Browser B because `isHydrating.value` prevents it?
When Browser B opens, `onMounted` runs:
```javascript
                onMounted(async () => {
                    store.isHydrating.value = true;
                    await boxAPI.validateToken();
                    if (boxAPI.isReady.value) {
                        const loadedState = await boxAPI.loadState();
```
On Browser B, it DOES NOT HAVE a token. So `validateToken` returns `false`. `isReady.value` is `false`.
So it DOES NOT call `loadState()`.
Then the user enters Client ID and Client Secret, and clicks "Login with Box".
`startOAuthFlow` runs:
```javascript
                                store.isHydrating.value = true;
                                try {
                                    // ...
                                    const isValid = await validateToken();
                                    if (isValid) {
                                        const loadedState = await loadState();
                                        if (loadedState) {
                                            hydrateFromLoadedState(loadedState, store.config, store.largeData);
```
It DOES load the state!
AND it merges it into `store.config`!
So the settings ARE loaded!
WHY does the user say "settings are not saved across browsers"?

Let's look at the Box API integration again.
Does Box API return the `entries` array correctly in `findFolder`?
```javascript
            const findFolder = async (name) => {
                const res = await _fetch(`https://api.box.com/2.0/search?query=${name}&type=folder`, {headers: _headers()});
                if (!res.ok) throw new Error('Failed to search Box folders');
                const data = await res.json();
                return data.entries?.[0] || null;
            };
```
Is `getFolderId()` correct?
```javascript
            const getFolderId = async () => {
                if (cachedFolderId) return cachedFolderId;
                let folder = null;

                // First try to find it in root
                const res = await _fetch(`https://api.box.com/2.0/folders/0/items`, {headers: _headers()});
                if (res.ok) {
                    const data = await res.json();
                    folder = data.entries.find(e => e.name === FOLDER_NAME && e.type === 'folder');
                }

                // Fallback to Search API
                if (!folder) {
                    try { folder = await findFolder(FOLDER_NAME); } catch (e) {}
                }

                if (!folder) folder = await createFolder(FOLDER_NAME);
                cachedFolderId = folder.id;
                return cachedFolderId;
            };
```
This is correct.

What about `findFile`?
```javascript
            const findFile = async (folderId, name) => {
                const res = await _fetch(`https://api.box.com/2.0/folders/${folderId}/items`, {headers: _headers()});
                if (!res.ok) throw new Error('Failed to list folder items');
                const data = await res.json();
                return data.entries.find(e => e.name === name && e.type === 'file');
            };
```
If the folder has > 100 items, Box paginates! But we only have 2 files (`appConfig.json`, `appHistory.json`). So no pagination needed. This is correct.

What about `_uploadFile`?
```javascript
            const _uploadFile = async (folderId, fileId, fileName, dataObj) => {
                // ...
                if (fileId) {
                    formData.append('attributes', JSON.stringify({name: fileName}));
                    formData.append('file', new Blob([dataStr], {type: 'application/json'}), fileName);
                    const res = await _fetch(`https://upload.box.com/api/2.0/files/${fileId}/content`, {
                        method: 'POST',
```
Wait! Box API for UPDATING a file uses `POST /files/${fileId}/content`!
Let's check Box API docs for `Upload File Version`.
"To upload a new version of a file to Box via direct upload, make an API call to the POST /files/:file_id/content API with the content of the file..."
Yes, `POST` is correct!

Wait! Does Box require the `attributes` field in the multipart form data for uploading a new version?
Let's search for Box API update file version multipart.
Box Developer Docs:
"Upload File Version"
`curl -i -X POST "https://upload.box.com/api/2.0/files/12345/content" \`
`-H "authorization: Bearer <ACCESS_TOKEN>" \`
`-H "content-type: multipart/form-data" \`
`-F attributes='{"name":"new_name.jpg"}' \`
`-F file=@<FILE_NAME>`
Wait! `attributes` is OPTIONAL. If you want to rename the file, you pass `attributes`.
Wait! Is it possible Box API doesn't support updating a file if the file is locked, etc.? Yes, but not relevant here.
Is there any bug in `_uploadFile`?
Yes! `new Blob([dataStr], {type: 'application/json'})`.
The `file` part contains the Blob.
This is correct!

Wait! Look at `saveConfig` AGAIN!
```javascript
            const saveConfig = async (configObj) => {
                // ...
                saveConfigTimeout = setTimeout(async () => {
                    // ...
                    try {
                        const folderId = await getFolderId();
                        if (!cachedConfigFileId) {
                            const file = await findFile(folderId, CONFIG_FILE_NAME);
                            if (file) cachedConfigFileId = file.id;
                        }
                        cachedConfigFileId = await _uploadFile(folderId, cachedConfigFileId, CONFIG_FILE_NAME, configObj);
```
Wait! What if `saveConfig` is called multiple times, and the FIRST time it creates the file.
`_uploadFile` for create:
```javascript
                    formData.append('attributes', JSON.stringify({name: fileName, parent: {id: folderId}}));
                    formData.append('file', new Blob([dataStr], {type: 'application/json'}), fileName);
                    const res = await _fetch(`https://upload.box.com/api/2.0/files/content`, {
                        method: 'POST',
                        headers: {'Authorization': `Bearer ${token}`},
                        body: formData
                    });
                    if (!res.ok) throw new Error(`Failed to upload Box file: ${fileName}`);
                    const responseData = await res.json();
                    if (responseData.entries && responseData.entries.length > 0) {
                        return responseData.entries[0].id;
                    }
```
If it creates the file, it returns the `id`. `cachedConfigFileId` is updated.
The NEXT time `saveConfig` is called, it uses `cachedConfigFileId`.
It calls `_uploadFile(folderId, cachedConfigFileId, CONFIG_FILE_NAME, configObj)`.
It updates the file.
This all seems perfectly fine!

WHY are settings not saved across browsers?
Wait! `hydrateFromLoadedState`:
```javascript
        const hydrateFromLoadedState = (loadedState, config, largeData) => {
            const { genHistory, conversations, box: _ignoredBox, ...rest } = loadedState;
            // ...
            _.mergeWith(config.value, rest, (objValue, srcValue) => _.isArray(srcValue) ? srcValue : undefined);
        };
```
What if `loadedState` is `{ tagTest: { prompts: [...] }, ... }`?
If `config.value.tagTest.prompts` ALREADY HAS prompts (from default), `_.mergeWith` merges the arrays?
NO!
`_.isArray(srcValue) ? srcValue : undefined`
This means if `srcValue` is an array, it OVERWRITES the array in `objValue`!
Wait! Does it overwrite it completely?
Yes, lodash `mergeWith` replaces the destination array with the source array if the customizer returns a value!
So arrays are overwritten correctly.
