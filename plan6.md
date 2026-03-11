Wait, what if the `box` object IS overwritten during load, because of the `uiConfig`?
The issue is "settings are not saved across browsers".
The image shows "Box API Token Expired or Invalid".
What if the user entered Client ID and Client Secret on Browser A, and they EXPECT it to be saved across browsers?
Why wouldn't they expect that?
Because the placeholder says "Stored locally in your browser" for NOVELAI API KEY, but NOT for BOX CLIENT ID!
Look at the image!
For `NOVELAI API KEY`, it explicitly says "Stored locally in your browser." underneath it.
For `Box Cloud Storage`, it DOES NOT SAY "Stored locally in your browser."!
So the user might think the Box settings are synced across browsers!
If they think that, then they expect `box.clientId` and `box.clientSecret` to be synced across browsers!
BUT if they are synced across browsers, how could they possibly connect to Box to download them?!
Ah. Maybe they don't sync via Box... Wait, what if they ARE synced via Box?
If they enter ID and Secret on Browser A, and log in, it saves to Box.
Then on Browser B, they enter ID and Secret? NO, they wouldn't enter them if they think it's synced!
But if they don't enter them, they can't connect to Box to get them!
Wait, if they enter them on Browser B, log in, it connects.
Then what is NOT saved across browsers?
Maybe "Application Settings" (which is `app.model` in the image)?
Look at the image!
The "Application Settings" section is expanded, and it shows `NOVELAI MODEL` = `v4.5 Full`.
Is it possible that `app.model` is NOT saved across browsers because of the `hydrateFromLoadedState` bug?
No, we verified `hydrateFromLoadedState` successfully merges `rest`. `app.model` is in `rest`.
So `app.model` IS saved across browsers!

Wait. Look at `watch`!
```javascript
            watch(config, (newConfig) => {
                if (isHydrating.value) return;
                const boxAPI = useBoxAPI();
                if (boxAPI.isReady.value) boxAPI.saveConfig(newConfig);
            }, { deep: true });
```
What if `isHydrating.value` is NOT the issue?
What if `boxAPI.isReady.value` is FALSE?
When they load the page on Browser A, `onMounted` runs.
It calls `validateToken()`.
If `tokenExpiresAt` is passed, it refreshes.
BUT what if it FAILS to refresh?
If it fails to refresh, `isReady.value` is false!
Then they change a setting.
`watch(config)` runs. `isReady` is FALSE!
So `saveConfig` is NEVER called!
So their new settings are NEVER saved to Box!
WHY would it fail to refresh?
Because `refresh_token` in Box is SINGLE USE!
When Browser A uses the `refresh_token`, it gets a NEW `refresh_token`.
But wait, what if Browser B connects to Box?
Browser B does a FULL OAuth login.
It gets its OWN `access_token` and `refresh_token`.
These tokens are COMPLETELY SEPARATE from Browser A's tokens!
Box supports multiple concurrent tokens for the same user if they are from separate OAuth flows!
So Browser A and Browser B shouldn't invalidate each other... UNLESS...
UNLESS Box developer accounts only allow 1 active token? No.

Wait. What if `_uploadFile` saves the tokens, and `hydrateFromLoadedState` DOES NOT IGNORE THEM?
Wait! `hydrateFromLoadedState`:
```javascript
const hydrateFromLoadedState = (loadedState, config, largeData) => {
    const { genHistory, conversations, box: _ignoredBox, ...rest } = loadedState;
```
It destructures `box` from `loadedState`.
BUT look at the `index.html` file!
```javascript
            const config = useLocalStorage('nai-app-settings', {
                // ...
                box: {clientId: '', clientSecret: '', accessToken: '', refreshToken: '', tokenExpiresAt: 0},
```
So `config.value.box` exists.
When `saveConfig` saves to Box, it saves `config.value`, which INCLUDES `box`.
When `loadState` loads from Box, it parses `appConfig.json`, which INCLUDES `box`.
When `hydrateFromLoadedState` merges, it ignores `box`!
So `config.value.box` is NEVER OVERWRITTEN from Box!
This means Browser B NEVER GETS Browser A's tokens.
This is CORRECT!

BUT wait! Is `_ignoredBox` really ignored?
If I use lodash `mergeWith`:
```javascript
_.mergeWith(config.value, rest, (objValue, srcValue) => _.isArray(srcValue) ? srcValue : undefined);
```
`rest` does NOT contain `box`.
So `config.value.box` is NOT modified.
This is correct.

Wait... if `rest` does not contain `box`, what if `loadedState` has OTHER things missing?
What if the bug is something incredibly stupid?
"settings are not saved across browsers."
Look at `useLocalStorage('nai-app-settings', ...)`
Wait! Is it possible that `config` is NOT reactive across files or something? No, it's inside `createGlobalState`.

Let's look at the image again.
The toast says: "Box API Token Expired or Invalid. Please log in again."
When is this toast shown?
ONLY when `validateToken()` returns `res.ok === false`.
Why would `fetch('https://api.box.com/2.0/users/me')` return 401?
If the token is invalid.
Why would the token be invalid?
Because Browser B loaded Browser A's tokens!
Wait... but we just proved `hydrateFromLoadedState` ignores `box`!
Is there ANY OTHER PLACE that modifies `store.config.value.box`?
Let's search for `box.accessToken`!
