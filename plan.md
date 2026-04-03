1.  **Remove `ImageViewer` component:**
    - Replaced with `<hover-card :overflow="false" class="glass-nested rounded-xl p-3 aspect-square flex-center"><lazy-image v-if="imgSrc" :src="imgSrc" ... /><placeholder v-else ... /></hover-card>` or similar, using `lazy-image` which has `loading="lazy"` and better UX. Or maybe just `<div class="glass-nested rounded-xl p-3 aspect-square flex-center"><transition ...><placeholder v-if="..." /><img v-else ... /></transition></div>`. Actually, let's just do `<div ...>...<img ...>...</div>` directly in the two places it's used, but wrapped in `<hover-card>` if it should be a hover card, or wait, does it need a hover card?
    - If "all images use the hover-card component if they need it", the single image viewers might not *need* it unless we want to show a download button, but they're currently just plain `img` tags wrapped in a border. We can just use `<hover-card class="aspect-square glass-nested rounded-xl p-3" overflow="false"><lazy-image :src="..."/></hover-card>`. If no src, show Placeholder.

2.  **Consolidate Input components:**
    - `PasswordInput`, `PromptInput` and `SettingInput` can be reduced.
    - `PasswordInput` is basically `<setting-input type="password" ...>` with a toggle button. We can just move the toggle button inside `SettingInput`'s template for `type="password"`.
    - `PromptInput` is just `<autocomplete-field tag="textarea" ...>`. We can just use `<autocomplete-field>` directly!

3.  **Replace `lodash` usages:**
    - Rewrite all `_.compact`, `_.find`, `_.pick`, `_.forOwn`, etc., with native JS functions.
    - Remove the lodash script tag. This saves a huge chunk of dependency and parsing time. But the prompt says "reduce the amount of code in this app... file size of the logic is reduced, measure in KB". Does removing lodash count as reducing logic? "How could we better use existing dependencies to streamline the code?" -> Oh! If lodash is already there, maybe we shouldn't *remove* it, but *use it more*!
    - Wait! "How could we better use existing dependencies to streamline the code?" It implies we shouldn't remove it, but instead replace native code that does something lodash could do in fewer characters? Or maybe lodash is NOT needed and VueUse has something? Or maybe the prompt means "VueUse" is an existing dependency we could better use?
    - VueUse provides `useStorage` (instead of `useLocalStorage` / `useSessionStorage` boilerplate), `useToggle`, etc. Wait, we are already importing VueUse (`useLocalStorage`, `useSessionStorage`, etc.).
    - What about "How could we better use existing dependencies to streamline the code?" Wait, look at `_.find` versus `Array.prototype.find`. `_.find(arr, {id: val})` is 18 chars, `arr.find(x=>x.id==val)` is 22 chars. Lodash *is* streamlining the code! So we should probably keep lodash, or use lodash for more things to save characters.
    - Let's look for places where native code is verbose and lodash could be used. For example, `posts.value.findIndex(p => p.id === activeId.value)` -> `_.findIndex(posts.value, {id: activeId.value})`.
    - Wait! Is `lodash` included as a script? Yes, `<script src="https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js"></script>`.

4.  **Refactor components for character reduction and visual consistency:**
    - Can `PasswordInput` be merged into `SettingInput`? Yes! We can add a `isPassword` prop or handle `type==="password"` to `SettingInput` to include the show/hide toggle.
    - Can `PromptInput` be merged or replaced by `AutocompleteField`? Yes, `PromptInput` is literally just an `AutocompleteField` with a few specific classes and `isUc` boolean.

5.  **Let's check the Vue imports:**
    - `<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>`
    - We have VueUse, VueRouter, fflate, isomorphic-git, textarea-caret.
