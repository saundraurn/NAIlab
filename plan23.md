Let's consider that `validateToken()` IS NOT FAILING.
"Wait, what?"
If `validateToken()` IS NOT FAILING, then WHY is the RED TOAST in the image?
Maybe the RED TOAST is NOT from `validateToken()`!
Where ELSE is the RED TOAST?
I searched `index.html` for "Box API Token Expired or Invalid".
It is ONLY in `validateToken()`.
```javascript
                    if (!res.ok) {
                        store.addToast({msg: 'Box API Token Expired or Invalid. Please log in again.', type: 'error'});
                    }
```
There is NO OTHER PLACE!
So `validateToken()` IS FAILING.
And it IS returning `!res.ok`.

Could `https://api.box.com/2.0/users/me` return 400 Bad Request because of a MISSING HEADER?
No, `Authorization: Bearer <token>` is all it needs.

Wait! What if `store.config.value.box.accessToken` is WRONG?
What if `data.access_token` is undefined because `fetch('https://api.box.com/oauth2/token')` DOES NOT RETURN JSON?
If it does not return JSON, `await res.json()` THROWS!
Then it goes to `catch (e)`, NO RED TOAST!
So it DOES return JSON!
What if it returns JSON, but `data.access_token` is `undefined` because Box API changed?
NO, Box API hasn't changed.

Wait... What if `store.config.value.box.accessToken = data.access_token` DOES NOT UPDATE `store.config.value` SYNCHRONOUSLY because of Vue reactivity?
No, Vue updates synchronously.

Could it be that the user has MULTIPLE ACCOUNTS?
And they logged in with the WRONG account?
If they logged in with the WRONG account, it would STILL work, it would just be a different `/users/me`.

Let's step back.
"settings are not saved across browsers"
If the bug is that NO settings are saved across browsers, it MUST be because `appConfig.json` is NEVER SAVED to Box.
Or it's NEVER LOADED from Box.
If it's NEVER SAVED to Box, WHY?
Because `saveConfig` fails.
Why does `saveConfig` fail?
Because `_uploadFile` fails!
Why does `_uploadFile` fail?
Look at `_uploadFile`:
```javascript
            const _uploadFile = async (folderId, fileId, fileName, dataObj) => {
                const store = useAppStore();
                const token = store.config.value.box.accessToken;
                // ...
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
                    formData.append('attributes', JSON.stringify({name: fileName, parent: {id: folderId}}));
                    formData.append('file', new Blob([dataStr], {type: 'application/json'}), fileName);
                    const res = await _fetch(`https://upload.box.com/api/2.0/files/content`, {
                        method: 'POST',
                        headers: {'Authorization': `Bearer ${token}`},
                        body: formData
                    });
                    if (!res.ok) throw new Error(`Failed to upload Box file: ${fileName}`);
                    const responseData = await res.json();
                    // ...
```
What if `upload.box.com` RETURNS 401 UNAUTHORIZED for `POST /files/${fileId}/content`?
If it returns 401, `_fetch` retries with `refreshAccessToken()`.
If that fails, it throws "Unauthorized".
Then `_uploadFile` throws "Failed to update Box file: ...".
Then `saveConfig` catches it and shows "Failed to sync config to Box".

Wait. Look at `_uploadFile` again!
`if (fileId)` uses `https://upload.box.com/api/2.0/files/${fileId}/content`.
Wait! Is it possible Box API requires `PUT` for updating a file?
No, Box Developer Docs say:
"To upload a new version of a file to Box via direct upload, make an API call to the POST /files/:id/content API"
It IS `POST`!

Wait! I see it!
When `saveConfig` saves `appConfig.json`, it saves the `box` object!
```json
{
  "box": {
    "clientId": "ycrdkwilzcotgunudrjhw8auafoaz7sy",
    "clientSecret": "................................",
    "accessToken": "ACCESS_TOKEN",
    "refreshToken": "REFRESH_TOKEN",
    "tokenExpiresAt": 123456789
  }
}
```
Then on Browser B, the user logs in.
Browser B calls `loadState()`.
It downloads `appConfig.json`.
It calls `hydrateFromLoadedState(loadedState, store.config, store.largeData)`.
```javascript
        const hydrateFromLoadedState = (loadedState, config, largeData) => {
            const { genHistory, conversations, box: _ignoredBox, ...rest } = loadedState;
            _.mergeWith(config.value, rest, (objValue, srcValue) => _.isArray(srcValue) ? srcValue : undefined);
        };
```
Browser B ignores `box`.
So Browser B KEEPS its `accessToken`.
Then Browser B makes a change.
Browser B saves to Box.
It saves `config.value` to Box.
BUT WHAT IF `config.value` DOES NOT CONTAIN `clientId` and `clientSecret`?
Wait! Browser B ALREADY HAS `clientId` and `clientSecret` because the user JUST entered them to log in!
So Browser B DOES save them to Box!
So they ARE ALWAYS in Box!

Wait. "settings are not saved across browsers"
Could it be that the user is NOT using Box OAuth?
Could it be that `hydrateFromLoadedState` is NOT merging `tagTest` or `app` correctly?
No, we proved it works.

What if the RED TOAST is from `validateToken()` inside `onMounted()`?
When Browser B opens, `onMounted` runs.
`store.isHydrating.value = true`.
`await boxAPI.validateToken()`.
If the user NEVER logged in on Browser B, `accessToken` is empty.
`if (!accessToken) return false;`
No red toast.
Then the user enters Client ID and Secret.
User clicks "Login with Box".
Popup opens. User logs in.
Code is returned.
`startOAuthFlow` runs.
Gets token. Sets token.
Calls `validateToken()`.
`validateToken()` runs.
Calls `/users/me`.
IT FAILS! Red Toast is shown!
WHY DOES IT FAIL?
I keep coming back to this because it's the ONLY logical sequence that produces the image!
The image MUST HAVE BEEN PRODUCED by `startOAuthFlow`!
Because it shows the Green Toast and the Red Toast at the same time!
WHY DOES `/users/me` FAIL?

Let me look at `startOAuthFlow` again.
```javascript
                                store.isHydrating.value = true;
                                try {
                                    store.config.value.box.accessToken = data.access_token;
                                    store.config.value.box.refreshToken = data.refresh_token;
                                    store.config.value.box.tokenExpiresAt = Date.now() + (data.expires_in * 1000);
                                    store.addToast({msg: 'Box connected successfully!', type: 'success'});

                                    const isValid = await validateToken();
```
Is it possible `validateToken()` is NOT a function inside `useBoxAPI`?
No, it is.
Is it possible that Box API `/users/me` requires the token to be sent differently?
```javascript
                    const res = await fetch('https://api.box.com/2.0/users/me', {
                        headers: { 'Authorization': `Bearer ${store.config.value.box.accessToken}` }
                    });
```
This is standard OAuth 2.0.

Wait! Could it be that `store.config.value.box.accessToken` is NOT mutated?
```javascript
            const config = useLocalStorage('nai-app-settings', { ...
```
If `store.config.value.box` is mutated, Vue reacts.
BUT what if VueUse `useLocalStorage` DOES NOT MAKE DEEP PROXIES?
It DOES! `useLocalStorage` returns a `ref` of an object, which makes the whole object deeply reactive.
BUT wait!
If `useLocalStorage` uses a custom `serializer` or something?
No.
