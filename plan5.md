Let's consider another angle.
Could it be that Box OAuth uses the REDIRECT URI?
```javascript
const redirectUri = window.location.origin + window.location.pathname;
const authUrl = `https://account.box.com/api/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
```
The popup opens.
The user logs in.
The popup redirects to the redirect URI with `?code=...`
BUT HOW DOES THE POPUP SEND THE CODE TO THE MAIN WINDOW?
Look at `messageListener` in `startOAuthFlow`:
```javascript
                const messageListener = async (event) => {
                    if (event.origin !== window.location.origin) return;
                    if (event.data?.type === 'box-oauth-code') {
                        // ...
```
Where is the code that sends `box-oauth-code` to `window.opener`?
Let's search for `window.opener.postMessage` in `index.html`!
