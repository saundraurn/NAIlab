## Ideas for reducing file size and logic

1. **Remove `lodash` completely (if possible without a ton of manual polyfilling) or replace lodash methods with native equivalents.**
   - Actually, wait. The prompt says "reduce the amount of code in this app... i.e. the file size of the logic is reduced, measured in KB". Removing the `<script src="...lodash.min.js">` line and replacing 85 usages with native code might end up *increasing* the logic size in KB if native equivalents are longer.
   - Wait, "How could we better use existing dependencies to streamline the code?" -> Lodash is an existing dependency! Maybe we aren't using it enough, or maybe we are doing something else manually that lodash could do?
   - Wait, "This app was most recently reworked so that all images use the hover-card component if they need it, replacing prior bespoke solutions. Another example avenue is finding other consolidations we could do; what UI elements or features are pretty similar that they could use a shared abstraction?"

2. **Consolidate similar UI components:**
   - **Inputs:** `PromptInput`, `PasswordInput`, `SettingInput`, `AutocompleteField`. Some of these might be wrapping `AutocompleteField` or `SettingInput` in redundant ways. `SettingInput` has range, text, select, password logic inside it? Wait, let's look at `SettingInput`.

3. **Images & Hover-card:**
   - "This app was most recently reworked so that all images use the hover-card component if they need it, replacing prior bespoke solutions." -> Let's check all `<img` tags.
   - In `ImageViewer`, there is an `img` tag. We can use `hover-card` and `lazy-image` instead? Wait, `ImageViewer` has no hover logic, it just centers an image or shows a placeholder. But if we replace `<image-viewer>` uses with `<hover-card :overflow="false"><lazy-image ...></lazy-image></hover-card>`, we can delete the `ImageViewer` component! Wait, `LazyImage` has placeholder logic (`skeleton` background). But it doesn't have an icon placeholder like `ImageViewer`.
   - What about `ChatMessage` and `NanoBanana` and `DanbooruBrowser`?
   - Let's find all `img` tags not wrapped in `hover-card` or `lazy-image`.

4. **Component consolidation:**
   - Let's look for repeated template strings.
