Let's look at `index.html` line 1802.
```javascript
                    box: useAppStore().config.value.box,
```
What if `hydrateFromLoadedState` IS THE ONLY PLACE where settings are loaded from Box?
Yes.
And we know it uses Lodash `_.mergeWith` to merge `rest` into `config.value`.
Wait! Is it possible that `config.value` is deeply merged correctly, BUT the UI doesn't react because Vue's reactivity system doesn't detect it?
NO! `_.mergeWith` mutates the proxy, so Vue detects it.
BUT wait! `lodash.mergeWith` checks `isObject` to decide if it should merge recursively.
Vue's Proxy is an object, but `lodash` `isPlainObject` might return `false` for Vue Proxies!
Wait! Lodash `merge` uses `isPlainObject`?
If `lodash.merge` doesn't think the Proxy is a plain object, it might OVERWRITE it completely!
Let's check `test_lodash.js`!
