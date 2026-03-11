Let's consider the user's issue: "settings are not saved across browsers".
This is because `hydrateFromLoadedState` deletes `box` entirely.
```javascript
            const { genHistory, conversations, box: _ignoredBox, ...rest } = loadedState;
```
If we change it to NOT delete `box.clientId` and `box.clientSecret`, it might fix what the user thinks is the bug!
But wait, how does Browser B get them if they are in Box?
Browser B doesn't.
BUT! What if the user uses Chrome Sync or something, and expects `localStorage` to be synced?
If `localStorage` is synced by Chrome, `Box Client ID` IS SYNCED!
Because `useLocalStorage` saves to `localStorage`!
Then WHY are settings NOT saved across browsers?
If `localStorage` is NOT synced, then NO settings are synced!
Unless they use Box!
But to use Box, they MUST enter `clientId` and `clientSecret` manually on Browser B!
If they DO enter them manually on Browser B, they can connect!
If they connect, they get the settings!
BUT IF THEY CAN'T GET THE SETTINGS AFTER CONNECTING...
Then THAT is the bug!
And WHY can't they get the settings after connecting?
Because `validateToken()` fails right after connecting!
And WHY does it fail?
Look at `oauth2/token` response handling:
```javascript
                                store.config.value.box.accessToken = data.access_token;
                                store.config.value.box.refreshToken = data.refresh_token;
                                store.config.value.box.tokenExpiresAt = Date.now() + (data.expires_in * 1000);
```
Look at `validateToken()`:
```javascript
            const validateToken = async () => {
                const store = useAppStore();
                const { accessToken, tokenExpiresAt } = store.config.value.box;
```
If `validateToken` runs, `accessToken` is correct.
Then it fetches `/users/me`.
If it fails, it returns 401.
Why would a newly minted Box API token return 401 for `/users/me`?

Wait!
What if Box API `/users/me` DOES NOT WORK with newly minted tokens immediately because of replication delay?
NO, Box tokens are immediately valid.

What if Box API endpoint is WRONG?
`https://api.box.com/2.0/users/me`
This is correct.

What if the `box` object IS NOT A PROXY, BUT A PLAIN OBJECT?
```javascript
                box: {clientId: '', clientSecret: '', accessToken: '', refreshToken: '', tokenExpiresAt: 0},
```
It is a nested object inside `useLocalStorage`.
VueUse `useLocalStorage` creates a `ref` of an object. The object is wrapped in a `Proxy`.
Nested objects are ALSO wrapped in a `Proxy`.
So `store.config.value.box` IS a `Proxy`.
Mutating `accessToken` triggers the proxy.

Let's assume the user is using Safari or Firefox, and `useLocalStorage` has a bug in that browser? No.

Wait. What if I just apply a targeted fix for the `_fetch` Content-Type bug?
```javascript
<<<<<<< SEARCH
                    if (refreshed) {
                        options.headers = _headers();
                        res = await fetch(url, options);
                    } else {
=======
                    if (refreshed) {
                        const token = useAppStore().config.value.box.accessToken;
                        options.headers = { ...options.headers, 'Authorization': `Bearer ${token}` };
                        res = await fetch(url, options);
                    } else {
>>>>>>> REPLACE
```
And also fix `hydrateFromLoadedState` to NOT discard the entire `box` object, but only the tokens:
```javascript
<<<<<<< SEARCH
        const hydrateFromLoadedState = (loadedState, config, largeData) => {
            const { genHistory, conversations, box: _ignoredBox, ...rest } = loadedState;
            if (genHistory) largeData.genHistory = genHistory;
            if (conversations) largeData.conversations = conversations;
            _.mergeWith(config.value, rest, (objValue, srcValue) => _.isArray(srcValue) ? srcValue : undefined);
        };
=======
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
>>>>>>> REPLACE
```
This ensures `clientId` and `clientSecret` ARE synced across browsers!
Wait... IF they are synced via Box, how does Browser B get them?
IT CAN'T!
But what if the user expects them to be preserved when loading from Box?
If they enter `clientId` and `clientSecret` on Browser B, log in, load from Box.
Then Browser A changes `clientId` and `clientSecret`.
Then Browser B loads from Box. Browser B's `clientId` and `clientSecret` are updated!
This is correct behavior!

Let's do this!
