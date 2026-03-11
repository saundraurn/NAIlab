Wait! I need to double check one more thing.
Look at `hydrateFromLoadedState` AGAIN!
```javascript
        const hydrateFromLoadedState = (loadedState, config, largeData) => {
            const { genHistory, conversations, box: _ignoredBox, ...rest } = loadedState;
            // ...
```
What if `config` is a `ref`, but `config.value.box` is an object?
If `_.mergeWith` merges `rest` into `config.value`, it merges recursively.
If we include `boxRest` in `restConfig`:
```javascript
            if (box) {
                const { accessToken, refreshToken, tokenExpiresAt, ...boxRest } = box;
                restConfig.box = boxRest;
            }
```
`restConfig.box` will have `clientId` and `clientSecret`.
When `_.mergeWith` merges `restConfig` into `config.value`, it will merge `restConfig.box` into `config.value.box`.
So `config.value.box.clientId` and `config.value.box.clientSecret` will be updated!
And `accessToken`, `refreshToken`, and `tokenExpiresAt` will be LEFT ALONE!
This is EXACTLY WHAT WE WANT!

What if `config.value` does NOT have `box` initially?
It always has it because of `useLocalStorage` defaults!

So this is the first fix:
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

Second fix: The `Content-Type` overwrite in `_fetch` retry.
```javascript
            const _fetch = async (url, options = {}) => {
                let res = await fetch(url, options);
                if (res.status === 401) {
                    if (!refreshPromise) refreshPromise = refreshAccessToken();
                    const refreshed = await refreshPromise;
                    refreshPromise = null;
                    if (refreshed) {
                        const token = useAppStore().config.value.box.accessToken;
                        options.headers = { ...options.headers, 'Authorization': `Bearer ${token}` };
                        res = await fetch(url, options);
                    } else {
```
This preserves any headers that were in `options.headers` (like boundary for FormData, EXCEPT we DID NOT SET `Content-Type` for FormData! `fetch` sets it internally! So `options.headers` DOES NOT HAVE `Content-Type`!).
So spreading `options.headers` is safe!

Are there any other bugs?
"Box API Token Expired or Invalid. Please log in again."
Could it be that `validateToken()` is failing because it doesn't await the token update?
No, Vue updates synchronously.

Could it be that `validateToken()` is failing because `store.config.value.box.accessToken` is undefined?
No.

What if the image error is NOT a bug, but the RESULT of the user's action?
User logged in on Browser A.
User logged in on Browser B.
Browser B saves to Box.
User opens Browser A. Token expires.
`onMounted` -> `validateToken()` -> `refreshAccessToken()`.
Browser A tries to refresh the token!
Wait!
"A user can have multiple active access tokens and refresh tokens at any given time."
So Browser A SHOULD succeed!
But what if the developer has limited the App to 1 active token?
Box Developer Docs: "Box allows up to 10 active tokens per user per enterprise."
So it's not limited to 1.

What if Box Developer Console has a setting "Revoke active tokens on password change"? Irrelevant.
I will write the plan now!
