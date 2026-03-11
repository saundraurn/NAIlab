I just realized something!
"settings are not saved across browsers"
Could it be that Box Client ID and Secret ARE NOT SAVED TO LOCAL STORAGE AT ALL??
Wait, `useLocalStorage('nai-app-settings', ...)` is called ONCE.
It creates a ref.
Then we do `<setting-input v-model="box.clientId">`
Does `v-model` trigger `useLocalStorage` to save to `localStorage`?
Yes, it does! `useLocalStorage` deep watches the object.
BUT wait!
Look at the `index.html` line 1802:
```javascript
                    box: useAppStore().config.value.box,
```
If we do `v-model="box.clientId"`, it mutates `useAppStore().config.value.box.clientId`.
This mutates the deep property of `config.value`.
Does VueUse's `useLocalStorage` deep watch `config`?
YES, by default `useLocalStorage` uses deep watch on objects!
So `localStorage` IS UPDATED!

Is it possible that `configObj` inside `saveConfig` has the old values?
No, it's a Proxy.

Wait! Could `_uploadFile` be using `dataStr` incorrectly?
```javascript
                    formData.append('attributes', JSON.stringify({name: fileName}));
                    formData.append('file', new Blob([dataStr], {type: 'application/json'}), fileName);
```
Look at Box API documentation for uploading file versions!
Box API states: "Upload File Version"
"Use the POST /files/:id/content endpoint to upload a new version of an existing file."
Does it require `multipart/form-data`? YES.
Wait... what if `attributes` is specified?
Box Developer Docs say:
"attributes (object): A JSON object containing the name of the file."
BUT wait... if you upload a new version, `attributes` should have `name: fileName`.
Is `parent` needed? No, updating a file version doesn't change its folder unless you specify it!
Wait! Does Box API require `file` to be the LAST parameter?
YES! Multipart form-data parser in Box REQUIRES `file` to be the LAST part in the request!
We put `attributes` first, then `file`. This is correct.

What if Box is complaining about the Blob content type?
`new Blob([dataStr], {type: 'application/json'})`
This is correct.

Wait... if `saveConfig` saves to Box properly, why does `validateToken` return 401 right after connecting?
Wait, if it connects and returns 401, then `loadState` IS NOT CALLED!
Because `if (isValid)` is false!
So if `validateToken` returns 401, NO SETTINGS ARE LOADED FROM BOX!
So "settings are not saved across browsers" happens because NO SETTINGS ARE LOADED!
WHY does `validateToken` return 401?
Look at `startOAuthFlow` again!
```javascript
                            try {
                                store.config.value.box.accessToken = data.access_token;
                                store.config.value.box.refreshToken = data.refresh_token;
                                store.config.value.box.tokenExpiresAt = Date.now() + (data.expires_in * 1000);
                                store.addToast({msg: 'Box connected successfully!', type: 'success'});

                                const isValid = await validateToken();
```
Why would `validateToken()` return 401?
Wait! Look at `index.html` line 299:
```javascript
            const validateToken = async () => {
                const store = useAppStore();
                const { accessToken, tokenExpiresAt } = store.config.value.box;
                if (!accessToken) { ... return false; }

                if (Date.now() >= (tokenExpiresAt - 60000)) { ... }

                isValidating.value = true;
                try {
                    const res = await fetch('https://api.box.com/2.0/users/me', {
                        headers: { 'Authorization': `Bearer ${store.config.value.box.accessToken}` }
                    });
```
Wait! Is it possible that `store.config.value.box.accessToken` is NOT set correctly?
`store.config.value.box.accessToken = data.access_token;`
If `data.access_token` is undefined, `accessToken` becomes `undefined`!
If `accessToken` is `undefined`, `if (!accessToken)` returns `false`!
So it wouldn't even call `/users/me`!
So `accessToken` MUST BE TRUTHY!

Is it possible that Box API requires `Bearer` token? Yes.
Is it possible that `validateToken` uses a STALE `accessToken` because `store.config` is a Proxy but it hasn't flushed its changes?
No, Proxy mutations are synchronous.
Is there any other `validateToken` call?
Look at `_fetch`!
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
If `validateToken` uses `fetch` DIRECTLY (not `_fetch`), it DOES NOT refresh the token if it's 401. It just returns `res.ok` (`false`) and shows the RED toast!
WHY would `/users/me` return 401?
Could it be that the Box App token is NOT an access token, but a different type? No.
Could it be that Box OAuth API `oauth2/token` does NOT return `data.access_token`?
Wait! What if Box API OAuth 2.0 Token Endpoint Returns JSON, BUT...
Wait! The Box API returns CORS errors for `oauth2/token` if called from a browser?
NO! Box API SUPPORTS CORS for `oauth2/token`!
If it returned a CORS error, `fetch('https://api.box.com/oauth2/token')` would THROW!
If it threw, it would catch and show "Failed to authenticate with Box."
BUT it shows "Box connected successfully!"
So it DID NOT throw, it got a valid JSON response!

Wait... If `data.access_token` is valid, WHY does `/users/me` return 401?
Is it possible the Box App is a "Client Credentials" app and not an "OAuth 2.0" app?
If it's a Client Credentials app, `/users/me` might fail if there is no user?
No, Box returns the Service Account user for `/users/me` for Client Credentials.
But the user created a "custom app in Box Developer Console, set redirect URI...".
This implies OAuth 2.0!

Wait, is it possible the issue is NOT that `/users/me` returns 401 right after connecting?
What if the user connects successfully. Settings are loaded.
Then they make a change.
`saveConfig` runs.
Then they go to Browser B.
They enter ID, Secret.
They connect successfully. Settings are loaded.
Then they make a change.
Then they go back to Browser A!
Browser A still has its OLD `accessToken`.
`onMounted` runs. `validateToken()` runs.
Browser A calls `/users/me` with its OLD `accessToken`.
It succeeds! (Because tokens live for 60 mins).
Then it calls `loadState()`.
It loads Browser B's settings from Box.
Then `hydrateFromLoadedState` merges them.
BUT WAIT!
If `hydrateFromLoadedState` is called, it triggers `watch(config)`!
```javascript
        const hydrateFromLoadedState = (loadedState, config, largeData) => {
            // ...
            _.mergeWith(config.value, rest, (objValue, srcValue) => _.isArray(srcValue) ? srcValue : undefined);
        };
```
This modifies `config.value`.
This triggers `watch`!
```javascript
            watch(config, (newConfig) => {
                if (isHydrating.value) return;
                const boxAPI = useBoxAPI();
                if (boxAPI.isReady.value) boxAPI.saveConfig(newConfig);
            }, { deep: true });
```
Wait! `isHydrating.value` IS `true` when `onMounted` calls `hydrateFromLoadedState`!
```javascript
                onMounted(async () => {
                    store.isHydrating.value = true;
                    // ...
                    await nextTick();
                    store.isHydrating.value = false;
                });
```
So it DOES NOT call `saveConfig`! This is fine.
So settings ARE saved across browsers!

Why did the user say "settings are not saved across browsers"?
And why is there a red toast "Box API Token Expired or Invalid"?
What if the `accessToken` EXPIRES after 60 minutes.
User opens Browser A 61 minutes later.
`onMounted` runs.
`store.isHydrating.value = true`.
`validateToken()` runs.
`Date.now() >= (tokenExpiresAt - 60000)` is TRUE.
It calls `refreshAccessToken()`.
`refreshAccessToken()` sends `refresh_token` to `oauth2/token`.
If it succeeds, it sets new tokens, returns `true`.
If it FAILS, it returns `false`.
If it returns `false`, `validateToken` returns `false`.
NO RED TOAST IS SHOWN in `validateToken` if `refreshAccessToken` fails!
```javascript
                if (Date.now() >= (tokenExpiresAt - 60000)) {
                    if (!refreshPromise) refreshPromise = refreshAccessToken();
                    const refreshed = await refreshPromise;
                    refreshPromise = null;
                    if (!refreshed) return false;
                }
```
If `refreshed` is false, it returns `false`. It DOES NOT REACH `fetch('/users/me')`!
So NO RED TOAST IS SHOWN!
BUT the image shows a RED TOAST!
How is it possible to show the red toast if the token is expired?
Wait! What if `tokenExpiresAt` is NOT preserved correctly, so it's 0 or undefined, and `Date.now() >= (tokenExpiresAt - 60000)` evaluates differently?
If `tokenExpiresAt` is 0, `Date.now() >= (0 - 60000)` is TRUE.
It calls `refreshAccessToken()`.
If `refreshAccessToken` fails, it returns `false`. No red toast.

What if the token is INVALIDATED by Box, BUT it HAS NOT EXPIRED yet according to `tokenExpiresAt`?
If Browser A token is 30 minutes old.
User opens Browser A.
`Date.now() >= (tokenExpiresAt - 60000)` is FALSE.
It calls `fetch('/users/me')`.
Box API returns 401 Unauthorized!
WHY would Box API return 401 for a 30-minute old token?
Because it was REVOKED!
WHY was it revoked?
Because Browser B used the `refresh_token`?
Wait! Browser B has its OWN `refresh_token`!
Unless Browser B somehow USED Browser A's `refresh_token`!
Did Browser B get Browser A's `refresh_token`?
`hydrateFromLoadedState` IGNORES the `box` object. So Browser B DID NOT get Browser A's `refresh_token` from Box!
So Browser B CANNOT use Browser A's `refresh_token`!

Wait... Is it possible that `config.value` is shared across tabs, and Browser B is just another TAB?
If Browser B is just another TAB, then they SHARE `localStorage`!
If they share `localStorage`, then Browser B HAS Browser A's `refreshToken`!
But if they share `localStorage`, settings ARE ALREADY SAVED across tabs! So Box sync is not even needed!
So "settings are not saved across browsers" MUST mean DIFFERENT browsers (Chrome vs Firefox).

If they are DIFFERENT browsers, they DO NOT share `localStorage`.
They DO NOT share `refreshToken`.
So Browser B CANNOT revoke Browser A's token.

Is there ANY WAY the RED TOAST is shown because the NEW token from `oauth2/token` is REJECTED by `/users/me`?
No, Box tokens are immediately valid.

Wait. Is it possible the RED TOAST is NOT from `/users/me`?
```javascript
                    if (!res.ok) {
                        store.addToast({msg: 'Box API Token Expired or Invalid. Please log in again.', type: 'error'});
                    }
```
This is the ONLY place this specific string exists.
So it IS from `/users/me`!

What if the user CLICKED "Login with Box", but the popup was BLOCKED?
If the popup was blocked, `window.open` returns `null`.
Then the user closes the popup manually.
Does it show "Box API Token Expired or Invalid"? No.

Let's rethink: "settings are not saved across browsers"
Could it be that the user DOES NOT KNOW they have to enter Client ID and Secret on Browser B?
If the user opens Browser B, and they DO NOT enter Client ID and Secret.
They look at the page. They see NO settings.
They say: "There's a bug! Settings are not saved across browsers!"
BUT the image shows they DID enter Client ID and Secret!
Wait. Why did they enter it?
Because they realized they needed to log in.
They entered it. They logged in.
AND THEN they STILL didn't get their settings!
WHY wouldn't they get their settings after logging in?
Because `validateToken()` failed, so `loadState()` was NEVER CALLED!
WHY did `validateToken()` fail after logging in?
Let's trace:
1. They enter Client ID and Secret on Browser B.
2. They click "Login with Box".
3. Popup opens, they log in, it redirects, code is passed.
4. `oauth2/token` is called. It returns `access_token` and `refresh_token`.
5. `validateToken()` is called.
6. `validateToken()` calls `/users/me`.
7. `/users/me` returns 401 Unauthorized!
8. Red toast is shown. `loadState()` is NOT called. Settings are NOT saved across browsers!
YES! This matches EVERYTHING!
But WHY does `/users/me` return 401 Unauthorized for a freshly minted token on Browser B?
Is there something wrong with Browser B's token request?
Wait... Look at `startOAuthFlow`:
```javascript
                            const res = await fetch('https://api.box.com/oauth2/token', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                                body: new URLSearchParams({
                                    grant_type: 'authorization_code',
                                    code,
                                    client_id: clientId,
                                    client_secret: store.config.value.box.clientSecret,
                                    redirect_uri: redirectUri
                                })
                            });
```
This is the SAME code that ran on Browser A! If it worked on Browser A, it should work on Browser B.
Is there a difference?
Maybe `redirectUri` is different?
If `redirectUri` was different, `oauth2/token` would return 400 Bad Request, NOT 401 Unauthorized! And it would throw!
Maybe `client_id` or `client_secret` is different?
If they are wrong, `oauth2/token` would return 400, not 401!
So it MUST BE returning a VALID token!
Then `/users/me` returns 401. WHY?
Because `headers: { 'Authorization': \`Bearer ${store.config.value.box.accessToken}\` }` is using the WRONG token!
WHY WOULD IT BE THE WRONG TOKEN?
Look at `store.config.value.box.accessToken`!
When is it updated?
```javascript
                                store.config.value.box.accessToken = data.access_token;
```
Is it possible that `data.access_token` is undefined?
NO!
Is it possible that `store.config.value.box.accessToken` does NOT update synchronously?
Vue 3 reactivity updates synchronous!
BUT wait!
Look at `useLocalStorage`!
VueUse's `useLocalStorage` debounces or throttles the writes to `localStorage`... but the in-memory Proxy is updated synchronously!
Wait... what if `box` is NOT reactive?
```javascript
                box: {clientId: '', clientSecret: '', accessToken: '', refreshToken: '', tokenExpiresAt: 0},
```
It is a nested object inside `config`. `useLocalStorage` creates a `ref` of an object, which makes the whole object deeply reactive.
So `store.config.value.box` is a Proxy!
If you do `store.config.value.box.accessToken = ...`, it mutates the Proxy.

Wait! Could it be that `validateToken()` reads from `store.config.value.box` inside `useBoxAPI` and it captures the OLD value due to a closure?
No, `validateToken` has:
```javascript
            const validateToken = async () => {
                const store = useAppStore();
                const { accessToken, tokenExpiresAt } = store.config.value.box;
```
This reads from `store.config.value.box` dynamically on every call!

Wait. I MUST be missing something OBVIOUS!
Look at the image AGAIN.
The red toast: "Box API Token Expired or Invalid. Please log in again."
There's a GREEN toast: "Box connected successfully!"
Wait! In the image, there is NO GREEN TOAST.
I LOOKED AT THE GREEN BUTTON!
"Box connected successfully!" is NOT a toast in the image!
The green box is `Box connected successfully!` and it is a TOAST!
Wait! The green toast is NOT above the red toast. The green toast is to the RIGHT?
No, the image has a green box with white text: "Box connected successfully!".
It is floating on the right side.
AND below it is a red box with white text: "Box API Token Expired or Invalid. Please log in again.".
They are BOTH toasts!
So `startOAuthFlow` DEFINITELY ran and showed the green toast!
And then `validateToken()` ran and showed the red toast!
Why did `validateToken()` fail?
