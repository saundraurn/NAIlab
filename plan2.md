Let's consider another explanation.
What if `box` is saved, but `uiConfig` is NOT saved?
Wait, looking at `saveConfig`, it uploads `configObj`.
Wait... where does `configObj` come from?
It comes from the `watch(config, (newConfig) => ...)`
```javascript
            watch(config, (newConfig) => {
                if (isHydrating.value) return;
                const boxAPI = useBoxAPI();
                if (boxAPI.isReady.value) boxAPI.saveConfig(newConfig);
            }, { deep: true });
```
What about `uiConfig`?
```javascript
            const uiConfig = useLocalStorage('nai-ui-settings', { ...
```
There is NO watch for `uiConfig`!
So `uiConfig` is NOT saved to Box!
But the user says "settings are not saved across browsers".
And the image shows "Box API Token Expired or Invalid".

Wait! The error in the image is "Box API Token Expired or Invalid".
Why is it expired or invalid?
Browser A: Enters Client ID, Secret. Logs in. Saves `config` (which includes `box: { clientId, clientSecret, accessToken... }`) to Box.
Browser B: Has NO settings.
Wait, if Browser B has no settings, it cannot access Box to load `config`!
So on Browser B, the user MUST enter `clientId` and `clientSecret`, and then click "Login with Box".
Then Browser B connects, gets a new `accessToken`, and loads `config` from Box.
`hydrateFromLoadedState` runs. It DOES NOT merge `box` from Box!
So Browser B keeps its new `accessToken`.
Wait... what if Browser A now opens?
Browser A has its old `accessToken`. It loads `config` from Box.
BUT Browser A's `accessToken` might have been invalidated by Browser B's login?
No, Box tokens are not necessarily invalidated by another login, BUT if it expired, `validateToken` is called.
If expired, `refreshAccessToken` is called.
```javascript
            const refreshAccessToken = async () => {
                const store = useAppStore();
                const { clientId, clientSecret, refreshToken } = store.config.value.box;
```
It uses the `refreshToken` from `store.config.value.box` (Browser A's localStorage).
If it successfully refreshes, it saves the NEW tokens to Box!
Wait... when Browser A saves the new tokens to Box, it overwrites the Box file!
And since it uploads the ENTIRE `config.value`, it uploads Browser A's `box` object!
But when Browser B loads, it ignores the `box` object. So that's fine.

Wait! The image shows Client ID and Client Secret ARE filled in.
And there is a red toast: "Box API Token Expired or Invalid. Please log in again."
Why does it say that?
Because `validateToken` returned false!
```javascript
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
If `res.ok` is false, it means the token is invalid.
But BEFORE that, it checks:
```javascript
                if (Date.now() >= (tokenExpiresAt - 60000)) {
                    if (!refreshPromise) refreshPromise = refreshAccessToken();
                    const refreshed = await refreshPromise;
                    refreshPromise = null;
                    if (!refreshed) return false;
                }
```
If it's expired, it tries to refresh.
If refresh FAILS, `refreshAccessToken` returns `false`.
If it returns `false`, `validateToken` returns `false`, BUT wait!
If it returns `false`, it doesn't show the toast!
Wait, if `Date.now() >= (tokenExpiresAt - 60000)`, it refreshes. If refresh fails, it returns `false`. `isReady.value` remains what it was? (Actually `refreshAccessToken` sets `isReady.value = false`).
BUT it doesn't show the error toast "Box API Token Expired or Invalid. Please log in again."!
The toast is ONLY shown if `Date.now() < (tokenExpiresAt - 60000)` BUT the token is ACTUALLY invalid!
Why would a token be invalid BEFORE it expires?
Because another login invalidated it? Or maybe the `tokenExpiresAt` is wrong?

Wait. `tokenExpiresAt = Date.now() + (data.expires_in * 1000)`.
Is it possible `tokenExpiresAt` is saved/loaded from Box incorrectly?
Wait! In `hydrateFromLoadedState`, `box: _ignoredBox` is removed from `rest` BEFORE merging!
BUT look at this!
```javascript
const hydrateFromLoadedState = (loadedState, config, largeData) => {
    const { genHistory, conversations, box: _ignoredBox, ...rest } = loadedState;
```
Wait! Is `box` correctly ignored?
If I use VueUse's `useLocalStorage`, `config` is a `ref`.
```javascript
_.mergeWith(config.value, rest, (objValue, srcValue) => _.isArray(srcValue) ? srcValue : undefined);
```
Wait... `useLocalStorage` automatically stringifies and parses JSON.
When Browser B logs in, it gets tokens and saves to `localStorage`.
When Browser B loads from Box, it ignores `box` in `loadedState`.
So Browser B's `box` is kept.

Wait. Is there ANY bug in `hydrateFromLoadedState`?
Yes! `largeData` contains `genHistory` and `conversations`.
But wait, what if `loadedState` does NOT have `box` inside it?
Wait... what if `box` is NOT ignored?
Let's see: `const { genHistory, conversations, box: _ignoredBox, ...rest } = loadedState;`
This correctly destructures `box` out of `loadedState`.
BUT `loadedState` is the JSON parsed from `appConfig.json`!
Does `appConfig.json` contain `box`?
Yes, because `saveConfig` saves `newConfig`, which is `config.value`! `config.value` contains `box`!
Wait. If Browser B loads `appConfig.json` from Box, it contains Browser A's `box` settings.
Browser B ignores Browser A's `box` settings, and merges the rest.
This means Browser B NEVER GETS Browser A's `box` settings.
BUT WHAT IF the user WANTS to share the `clientId` and `clientSecret` across browsers?
If `box` is ignored, then `clientId` and `clientSecret` are NEVER loaded from Box!
So if Browser A sets `clientId` and `clientSecret`, Browser B will NOT get them!
Is that the bug?
The prompt: "settings are not saved across browsers."
Wait! "settings are not saved across browsers" applies to the Box integration itself?
Or "settings are not saved across browsers" because the `watch` on `config` has a bug?

Look at `watch(config, (newConfig) => { ... })`:
```javascript
            watch(config, (newConfig) => {
                if (isHydrating.value) return;
                const boxAPI = useBoxAPI();
                if (boxAPI.isReady.value) boxAPI.saveConfig(newConfig);
            }, { deep: true });
```
Wait... `boxAPI.saveConfig(newConfig)` takes `newConfig`.
BUT `newConfig` is a Vue reactive Proxy!
Wait... `JSON.stringify(dataObj)` in `_uploadFile` handles Proxy correctly.
What if `isHydrating.value` is true when we change settings? No.

Wait! Look at `index.html` line 1802!
```javascript
                    box: useAppStore().config.value.box,
```
Wait... if the user edits `clientId` and `clientSecret` in the UI, they edit `box.clientId` and `box.clientSecret`.
```javascript
                            <setting-input v-model="box.clientId" label="Box Client ID" type="text" placeholder="..."></setting-input>
                            <setting-input v-model="box.clientSecret" label="Box Client Secret" type="password" placeholder="..."></setting-input>
```
Wait! These are bound to `box.clientId`!
Which is `useAppStore().config.value.box`!
If they edit it, `config` changes. `watch(config)` triggers!
BUT `isReady.value` is `false` because they haven't logged in yet!
```javascript
            watch(config, (newConfig) => {
                if (isHydrating.value) return;
                const boxAPI = useBoxAPI();
                if (boxAPI.isReady.value) boxAPI.saveConfig(newConfig); // isReady is FALSE!
            }, { deep: true });
```
So when they type `clientId` and `clientSecret`, it is NOT saved to Box because `isReady.value` is false!
Then they click "Login with Box". It connects, sets tokens, sets `isReady.value = true`.
Then `store.isHydrating.value = true`.
Then it LOADS the config from Box!
When it loads from Box, what is in the Box config?
If this is the FIRST time, Box config is empty (or default).
It loads the default config from Box!
Does it overwrite the `clientId` and `clientSecret`?
It merges `rest` into `config.value`.
Wait, `rest` comes from `loadedState`.
`loadedState` is the Box config. It has `box: _ignoredBox`.
So `rest` DOES NOT HAVE `box`.
So `config.value.box` is untouched!
BUT `config.value` gets all other settings from Box.
Wait... does it SAVE the config to Box after logging in?
Let's look at `startOAuthFlow`:
```javascript
                                store.config.value.box.accessToken = data.access_token;
                                // ...
                                const isValid = await validateToken();
                                if (isValid) {
                                    const loadedState = await loadState();
                                    if (loadedState) {
                                        hydrateFromLoadedState(loadedState, store.config, store.largeData);
                                        // ...
                                    }
                                }
```
Wait! It NEVER calls `saveConfig` after logging in!
And the `watch(config)` did NOT trigger because `isHydrating.value` is `true` when the tokens were set!
So the tokens are NEVER saved to `localStorage`?
Wait! `useLocalStorage` saves to `localStorage` automatically when `config.value` changes! So it IS saved to `localStorage`.
BUT it is NEVER saved to Box!
Wait! The next time they change a setting (e.g. `app.model`), `watch(config)` triggers.
Then `boxAPI.isReady.value` is `true`, so it calls `boxAPI.saveConfig(newConfig)`.
THEN the config is saved to Box!

Wait... if they change `app.model`, it saves to Box.
Then Browser B comes along.
On Browser B, they enter `clientId` and `clientSecret` and log in.
They get tokens, it sets `isHydrating = true`, it loads from Box!
It loads the config from Box, which has the `app.model` from Browser A.
It ignores the `box` from Box.
Then Browser B has the new `app.model`.
So settings ARE saved across browsers!

Wait, what if they REFRESH the page on Browser A?
When they refresh the page, `useLocalStorage` loads `config` from `localStorage`.
Then `onMounted` runs:
```javascript
                onMounted(async () => {
                    store.isHydrating.value = true;
                    await boxAPI.validateToken();
                    if (boxAPI.isReady.value) {
                        const loadedState = await boxAPI.loadState();
                        // ...
```
`validateToken` calls `https://api.box.com/2.0/users/me`.
If it succeeds, `isReady` is true, and it loads state from Box.

Why would the user say: "There's a bug somewhere with the Box integration, and it doesn't appear to function as intended; settings are not saved across browsers."
AND there's an image with "Box API Token Expired or Invalid. Please log in again."

Wait! Look at `saveConfig`:
```javascript
                saveConfigTimeout = setTimeout(async () => {
                    if (store.isHydrating.value) return;
                    try {
                        const folderId = await getFolderId();
```
Wait! `_uploadFile` saves the config to Box:
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
```
Wait! Does `JSON.stringify(dataObj)` stringify everything correctly?
`dataObj` is `config.value`.
Is there a problem with how `config.value` is merged or something?
Wait! Look at `_uploadFile`!
```javascript
                    formData.append('file', new Blob([dataStr], {type: 'application/json'}), fileName);
```
Wait, if `config` is a `ref` from `useLocalStorage`, is `dataObj` a Proxy? Yes.
`JSON.stringify` works fine on Proxy.
