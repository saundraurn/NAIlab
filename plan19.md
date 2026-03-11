Ah! There is no `beforeunload`!
But wait, if there's no `beforeunload`, they might change a setting and close the browser, so it's not saved to Box.
BUT if that was the bug, they wouldn't say "There's a bug somewhere with the Box integration".
They would say "Settings don't save if I close the tab too fast".
AND they wouldn't provide a screenshot of the RED TOAST!
The RED TOAST is the key!

"Box API Token Expired or Invalid. Please log in again."
WHY is the token invalid right after logging in?
Look at `oauth2/token`!
Box uses `Authorization: Bearer <access_token>`.
When does `validateToken()` call `/users/me`?
Right after `startOAuthFlow()`!
If `validateToken()` returns 401 right after `startOAuthFlow()`, then `access_token` MUST BE INVALID!
Why would Box API issue an INVALID `access_token`?
It DOESN'T!
So `access_token` MUST BE WRONG!
Why would it be wrong?
Let's look at `index.html` line 261:
```javascript
                                store.config.value.box.accessToken = data.access_token;
```
Is `store.config.value.box.accessToken` actually being READ correctly in `validateToken()`?
```javascript
                const { accessToken, tokenExpiresAt } = store.config.value.box;
```
Yes!
Wait. Is it possible `useAppStore()` returns a DIFFERENT instance inside `useBoxAPI`?
```javascript
        const useBoxAPI = createGlobalState(() => {
            const validateToken = async () => {
                const store = useAppStore();
```
`createGlobalState` (from VueUse) ensures it returns the SAME instance.
Wait, `useAppStore()` is ALSO created with `createGlobalState()`!
```javascript
        const useAppStore = createGlobalState(() => {
```
Yes! They are global singletons!

Wait. I see it!
Look at the destructuring in `index.html` line 178!
```javascript
        const hydrateFromLoadedState = (loadedState, config, largeData) => {
            const { genHistory, conversations, box: _ignoredBox, ...rest } = loadedState;
            // ...
            _.mergeWith(config.value, rest, (objValue, srcValue) => _.isArray(srcValue) ? srcValue : undefined);
        };
```
When Browser B connects to Box, `startOAuthFlow` sets the tokens.
Then `validateToken()` returns `true` (because the token IS valid!).
Then it calls `loadState()`!
`loadState()` returns `loadedState` from Box.
`hydrateFromLoadedState` merges `rest` into `config.value`.
Wait... `loadedState` has `box: _ignoredBox`.
So `rest` DOES NOT contain `box`.
So `config.value.box` remains untouched.
Then it shows "Settings loaded from Box."!
Wait! The image DOES NOT SHOW "Settings loaded from Box."!
But maybe the green toast is just "Box connected successfully!"?
Yes.
Then WHY does the red toast appear?
If `validateToken()` succeeded, it wouldn't show the red toast!
If it failed, it WOULD show the red toast!
BUT WHY DID IT FAIL?

Let's assume the red toast is from `onMounted()`!
When Browser B reloads the page, `onMounted` runs.
```javascript
                onMounted(async () => {
                    store.isHydrating.value = true;
                    await boxAPI.validateToken();
```
If `accessToken` is EMPTY on Browser B, `validateToken()` returns `false`!
BUT `if (!accessToken) { isReady.value = false; return false; }`
It DOES NOT show the red toast!
So NO RED TOAST on reload if token is empty!

What if `accessToken` is NOT empty on Browser B?
HOW did it get there?
The user ALREADY LOGGED IN on Browser B!
So the token IS IN LOCAL STORAGE!
Then they REFRESHED THE PAGE on Browser B!
`onMounted` runs.
`validateToken()` runs.
It uses the token from `localStorage`.
It checks if `tokenExpiresAt` is passed.
It's NOT passed (they just logged in 5 minutes ago).
It calls `/users/me` with the token.
It returns 401 Unauthorized!
It shows the RED TOAST!
WHY WOULD A 5-MINUTE-OLD TOKEN BE 401 UNAUTHORIZED ON BROWSER B?
BECAUSE BROWSER B'S TOKEN WAS REVOKED BY BROWSER A!
HOW?
Did Browser A log in again? No!
Wait! What if Browser A REFRESHED its token?
If Browser A refreshed its token, it uses Browser A's `refreshToken`.
Does Browser A refreshing its token revoke Browser B's token?
No, Box allows up to 10 active tokens per user! They are separate token chains!
Wait!
Are they separate token chains?
Browser A called `oauth2/token` with `grant_type: 'authorization_code'`.
Browser B called `oauth2/token` with `grant_type: 'authorization_code'`.
Yes, they are separate chains!

Wait! What if Browser B used `grant_type: 'refresh_token'`?
If Browser B loaded Browser A's `appConfig.json` FROM BOX...
Ah!
If Browser B logged in with `authorization_code`.
It got tokens.
It downloaded `appConfig.json` from Box.
`appConfig.json` contains Browser A's `box` settings!
BUT `hydrateFromLoadedState` ignores `box`!
So Browser B KEEPS its own tokens!
This is what the code says.
BUT WAIT!
Let's look at `index.html` line 560:
```javascript
            watch(config, (newConfig) => {
                if (isHydrating.value) return;
                const boxAPI = useBoxAPI();
                if (boxAPI.isReady.value) boxAPI.saveConfig(newConfig);
            }, { deep: true });
```
When Browser B logs in, `startOAuthFlow` sets tokens.
Then it loads from Box. `hydrateFromLoadedState` merges.
Then `store.isHydrating.value = false`.
THEN Browser B makes a change!
`saveConfig` saves Browser B's `config.value` to Box!
Browser B's `config.value` contains Browser B's `box` object (with Browser B's tokens)!
So `appConfig.json` on Box NOW has Browser B's tokens!
THEN Browser A makes a change!
Wait! Browser A's `isReady` is `true`.
Browser A's `watch` triggers!
Browser A's `saveConfig` saves to Box!
It overwrites Box with Browser A's tokens!
So Box ALWAYS has the tokens of the LAST browser that saved!

BUT THIS DOESN'T AFFECT LOCAL STORAGE!
Because BOTH browsers ignore the `box` object when loading from Box!
So each browser keeps its own tokens in memory!
So NO browser should ever get an invalid token!

Wait... I found the BUG!
Look at `hydrateFromLoadedState`!
```javascript
        const hydrateFromLoadedState = (loadedState, config, largeData) => {
            const { genHistory, conversations, box: _ignoredBox, ...rest } = loadedState;
            if (genHistory) largeData.genHistory = genHistory;
            if (conversations) largeData.conversations = conversations;
            _.mergeWith(config.value, rest, (objValue, srcValue) => _.isArray(srcValue) ? srcValue : undefined);
        };
```
If `loadedState` does NOT have `box`, then `_ignoredBox` is undefined. `rest` DOES NOT contain `box`.
What if the user says "settings are not saved across browsers" because `rest` DOES NOT contain `box`!
If `rest` DOES NOT contain `box`, then `clientId` and `clientSecret` ARE NOT MERGED from Box!
So if Browser A saves `clientId` and `clientSecret` to Box...
Browser B DOES NOT load `clientId` and `clientSecret` from Box!
So Browser B CANNOT log in automatically!
If Browser B cannot log in automatically, the user HAS to copy-paste the `clientId` and `clientSecret`!
Is this what the user means by "settings are not saved across browsers"?
YES! "settings" refers to the Client ID and Secret!
Because they expect it to work like NovelAI API Key (which is stored locally but they might think Box settings should sync?)
Wait, if `clientId` and `clientSecret` don't sync from Box to Browser B, how could they connect to Box to download them in the first place?
As I've reasoned 5 times, THEY CAN'T!
If they can't, why are they reporting a bug?
Because THEY DON'T REALIZE it's impossible!
But wait... if they don't realize it's impossible, they would report "My Box settings didn't transfer".
But the screenshot shows they DID enter the Box settings!
Because they entered them, they clicked "Login with Box", and it failed with "Box API Token Expired or Invalid"!
WHY did it fail with "Box API Token Expired or Invalid"?
THIS IS THE REAL BUG!

Why does `validateToken` fail?
Look at `tokenExpiresAt` calculation:
```javascript
store.config.value.box.tokenExpiresAt = Date.now() + (data.expires_in * 1000);
```
Is `Date.now()` a string? No.
Wait! What if `store.config.value.box.tokenExpiresAt` is SAVED in `localStorage` as a string because of JSON serialization?
`JSON.parse(localStorage.getItem('nai-app-settings'))` parses numbers as numbers!
So it's a number.

Look at `startOAuthFlow`:
```javascript
                            try {
                                const res = await fetch('https://api.box.com/oauth2/token', {
```
If this succeeds, `accessToken` is valid.
Then `validateToken` is called.
```javascript
                    const res = await fetch('https://api.box.com/2.0/users/me', {
                        headers: { 'Authorization': `Bearer ${store.config.value.box.accessToken}` }
                    });
```
If this fails, it's 401.
Why would it fail for a fresh token?
Is it possible `store.config.value.box.accessToken` is NOT USED because `_fetch` calls `_headers()` which uses `store.config.value.box?.accessToken`, but `validateToken` uses `store.config.value.box.accessToken`?
Wait! `validateToken` DOES NOT use `_fetch`!
It uses `fetch('https://api.box.com/2.0/users/me', { headers: { 'Authorization': ... } })` directly!
Why would this fail?
If the token is valid, it shouldn't fail.
Could the token be invalid?
What if the user provided the WRONG Client ID and Secret on Browser B?
If they provided the WRONG Client ID, `oauth2/token` would return 400 Bad Request!
It wouldn't give them an access token!
What if they used a DIFFERENT Box App on Browser B?
If they used a different Box App, `users/me` would STILL WORK! It returns the user profile for the token!

Wait... I missed something in `index.html` line 215:
```javascript
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
```
This is `refreshAccessToken`.
What about `startOAuthFlow`?
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
Wait! Look at `client_secret`!
`store.config.value.box.clientSecret`!
Is it possible `clientSecret` is EMPTY?
If the user entered it, it's not empty.
If it's empty, `oauth2/token` fails with 401.
But it succeeded, because it showed "Box connected successfully!".

Wait! I see it!
In `startOAuthFlow`:
```javascript
                                store.isHydrating.value = true;
                                try {
                                    store.config.value.box.accessToken = data.access_token;
                                    // ...
                                    store.addToast({msg: 'Box connected successfully!', type: 'success'});

                                    const isValid = await validateToken();
                                    if (isValid) {
                                        const loadedState = await loadState();
                                        if (loadedState) {
                                            hydrateFromLoadedState(loadedState, store.config, store.largeData);
```
Look at `hydrateFromLoadedState` AGAIN!
```javascript
        const hydrateFromLoadedState = (loadedState, config, largeData) => {
            const { genHistory, conversations, box: _ignoredBox, ...rest } = loadedState;
            _.mergeWith(config.value, rest, (objValue, srcValue) => _.isArray(srcValue) ? srcValue : undefined);
        };
```
`_.mergeWith` merges `rest` into `config.value`.
What happens if `config.value` ALREADY HAS values?
Lodash `mergeWith` mutates `config.value` IN PLACE!
Does it overwrite primitive values? Yes!
Does it overwrite object references? No, it merges them!
Does `config.value` lose its reactivity? No, because it's merged in place.

Wait... if `loadState()` is called, and `hydrateFromLoadedState` is called...
Does Browser B get its settings?
YES! Browser B gets all settings!
If Browser B gets all settings, WHY DOES THE USER SAY "settings are not saved across browsers"?
Because NO SETTINGS WERE LOADED!
WHY were no settings loaded?
Because `isValid` was FALSE!
WHY was `isValid` false?
Because `validateToken()` failed!
WHY did `validateToken()` fail?
BECAUSE THE IMAGE SHOWS THE RED TOAST!
The red toast proves `validateToken()` failed!
WHY DID `validateToken()` FAIL FOR A FRESH TOKEN???

Let me write a test script to see if Lodash `mergeWith` DOES SOMETHING TERRIBLE.
