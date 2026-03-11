Ok, lodash merges correctly into the proxy.

Let's rethink everything from the image alone.
Image:
- ID and Secret are filled.
- Red toast: "Box API Token Expired or Invalid. Please log in again."
- There is NO green toast visible. Wait, the green toast in my previous analysis wasn't there! Let me look at the image again in my mind. The image has a GREEN box that says "Box connected successfully!" on the right. And below it, a RED box that says "Box API Token Expired or Invalid. Please log in again."
YES! The green toast IS THERE!
If BOTH toasts are there AT THE SAME TIME:
This means the green toast was fired, and then the red toast was fired IMMEDIATELY after.
What triggers the green toast?
`store.addToast({msg: 'Box connected successfully!', type: 'success'});`
What triggers the red toast?
`store.addToast({msg: 'Box API Token Expired or Invalid. Please log in again.', type: 'error'});`
They are fired in THIS sequence:
```javascript
                                store.addToast({msg: 'Box connected successfully!', type: 'success'});

                                const isValid = await validateToken();
```
And `validateToken()` fires the red toast!
WHY does `validateToken()` fire the red toast right after the green toast?
```javascript
                    const res = await fetch('https://api.box.com/2.0/users/me', {
                        headers: { 'Authorization': `Bearer ${store.config.value.box.accessToken}` }
                    });
                    isReady.value = res.ok;
                    if (!res.ok) {
                        store.addToast({msg: 'Box API Token Expired or Invalid. Please log in again.', type: 'error'});
                    }
```
Because `/users/me` returned 401 Unauthorized!
WHY DID IT RETURN 401 UNAUTHORIZED for a FRESHLY fetched token??

Wait! Is there ANY other sequence where BOTH toasts appear at the same time?
What if `onMounted` triggers `validateToken()` BEFORE the user clicks "Login with Box"?
If `onMounted` triggers `validateToken()`, it returns `false` (because `accessToken` is empty). It DOES NOT show the red toast!
Then the user clicks "Login with Box".
The popup opens.
Wait... what if the user PREVIOUSLY logged in on Browser A?
Then Browser A has `accessToken`.
Then Browser A reloads the page.
`onMounted` calls `validateToken()`.
If the token is expired, it refreshes. If it fails to refresh, it returns `false` (no toast).
If the token is NOT expired but INVALID, `/users/me` returns 401. It shows the RED toast!
Then the user clicks "Login with Box" because it says "Please log in again."
The popup opens, they log in, they get the token.
The GREEN toast is shown.
Then `validateToken()` runs.
If it succeeds, NO RED TOAST is shown!
BUT the OLD RED TOAST from `onMounted` might STILL BE VISIBLE!
Because toasts have a duration of 5000ms!
Wait! The red toast might be 5 seconds old?
No, if they click "Login with Box", they have to go through the popup. That takes MORE than 5 seconds!
So the old red toast would have disappeared!
So BOTH toasts MUST have been triggered around the SAME TIME!
This confirms that `startOAuthFlow` is the ONE triggering BOTH toasts!
So `validateToken()` FAILS right after `startOAuthFlow` succeeds!

WHY does `/users/me` fail for a freshly fetched token?
Is `store.config.value.box.accessToken` UNDEFINED?
`store.config.value.box.accessToken = data.access_token;`
Does Box `oauth2/token` return `access_token`? YES.
Could `store.config.value.box` be UNDEFINED? NO.
Could `headers: { 'Authorization': \`Bearer ${store.config.value.box.accessToken}\` }` be malformed?
Wait! If `data.access_token` is undefined, it would say `Bearer undefined`.
Does Box API return `access_token` or `accessToken`?
`access_token` is standard OAuth 2.0. Box API documentation says `access_token`.
Is it possible that `fetch` is being intercepted or CORS failing?
If CORS fails, `fetch` THROWS `TypeError: Failed to fetch`.
It does NOT return `res.ok = false`! It goes to the `catch` block!
```javascript
                } catch (e) {
                    isReady.value = false;
                    return false;
                }
```
If it goes to the `catch` block, NO RED TOAST IS SHOWN!
So it IS NOT a CORS failure! It IS a 401 or 403 or 404 from Box API!

Why would Box API `/users/me` return 401/403/404 for a valid, fresh token?
Is it possible the Box App is restricted?
Wait! Box API `/users/me` requires the `Manage enterprise properties` scope? No, just basic `Manage users`?
No, `/users/me` just requires the base "Read and write all files and folders stored in Box" scope. Every app has this.
What if `validateToken()` is NOT returning 401?
What if `res.ok` is TRUE?
If `res.ok` is true, `if (!res.ok)` is FALSE. No red toast.
So `res.ok` MUST be false.

Is there ANY OTHER reason?
Wait... what if the green toast "Box connected successfully!" is NOT from `startOAuthFlow`?
Search for "Box connected successfully!" in `index.html`.
