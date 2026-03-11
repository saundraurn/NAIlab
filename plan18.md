Ah! Wait! Look at `index.html` line 261-264:
```javascript
                                store.config.value.box.accessToken = data.access_token;
                                store.config.value.box.refreshToken = data.refresh_token;
                                store.config.value.box.tokenExpiresAt = Date.now() + (data.expires_in * 1000);
                                store.addToast({msg: 'Box connected successfully!', type: 'success'});
```
Is there ANY CHANCE that `data.access_token` is undefined because `oauth2/token` returned a different format?
No, `oauth2/token` is a standard format.
But wait! What if `store.config.value.box` DOES NOT exist?
If it does not exist, assigning `accessToken` would THROW an error!
It WOULD NOT show the toast!

What if `validateToken()` is called, and `store.config.value.box.accessToken` is undefined?
```javascript
                if (!accessToken) {
                    isReady.value = false;
                    return false;
                }
```
If it's undefined, it returns `false`, NO RED TOAST IS SHOWN!

Wait! I missed something CRITICAL!
The prompt: "There's a bug somewhere with the Box integration, and it doesn't appear to function as intended; settings are not saved across browsers."
Could the bug literally just be:
`box` settings are ignored during `hydrateFromLoadedState`, BUT the user EXPECTS them to NOT be ignored, so they don't have to enter them again?
"settings are not saved across browsers"
If the user expects the Client ID and Client Secret to be saved, BUT they are ignored, then they are NOT saved across browsers!
If we change `hydrateFromLoadedState` to NOT ignore them:
```javascript
        const hydrateFromLoadedState = (loadedState, config, largeData) => {
            const { genHistory, conversations, ...rest } = loadedState;
            // ...
            _.mergeWith(config.value, rest, (objValue, srcValue) => _.isArray(srcValue) ? srcValue : undefined);
        };
```
If we do this, then when Browser B loads `appConfig.json`, it gets Browser A's `clientId` and `clientSecret` AND `accessToken` AND `refreshToken`!
But Browser B MUST ALREADY HAVE them to load `appConfig.json` in the first place!!!
Because you CANNOT call `loadState()` without `validateToken()` returning `true`!
And `validateToken()` requires `accessToken`!
And you only get `accessToken` by calling `startOAuthFlow()`!
And `startOAuthFlow()` requires `clientId`!
So Browser B MUST ALREADY HAVE `clientId` and `clientSecret` and `accessToken`!
If Browser B already has them, it doesn't matter if they are overwritten from Box.
BUT wait! What if they are overwritten with Browser A's tokens?
Then Browser B's tokens are replaced by Browser A's tokens!
Since Browser A's tokens are STILL VALID, Browser B CAN use them!
Is this good? Yes, they can share the tokens!
BUT wait! If `hydrateFromLoadedState` was ignoring `box`, WHY was it ignoring `box`?
Probably specifically to AVOID overwriting tokens!
Because if Browser B overwrites its tokens with Browser A's tokens, and then Browser A refreshes the token, Browser B's token is invalid!
So keeping them separate is BETTER!

Wait! What if there's ANOTHER WAY to load state?
No.

What if the bug is NOT in `hydrateFromLoadedState`?
Look at `appConfig.json` on Box!
When Browser A saves `config.value`, it saves the `box` object.
If Browser B connects, it ignores the `box` object.
What if Browser A makes a change, and Browser B wants to load it?
Browser B doesn't automatically poll. You have to reload Browser B.
When you reload Browser B, `onMounted` calls `validateToken()`.
If Browser B HAS a token, it loads from Box.
If it doesn't, it doesn't.

Wait! I see it!
When `saveConfig` saves to Box, it saves `appConfig.json`.
When `loadState` loads from Box, it parses `appConfig.json`.
What if `appConfig.json` contains `box` settings, but we WANT to sync `clientId` and `clientSecret` across MULTIPLE USERS? No.
What if the user is using the SAME browser, but a different profile?

Wait... "There's a bug somewhere with the Box integration, and it doesn't appear to function as intended; settings are not saved across browsers."
Could the bug be that `saveConfig` is using `setTimeout` to save the config, BUT the user makes a change and immediately closes the tab?
Yes, `setTimeout(..., 3000)`.
If they close the tab, it doesn't save!
Is there a `beforeunload` listener to save?
```javascript
        window.addEventListener('beforeunload', () => {
            if (saveConfigTimeout) {
                clearTimeout(saveConfigTimeout);
                // force save? No.
            }
        });
```
Is there a `beforeunload` listener in the code? Let's check!
