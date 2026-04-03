const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// 1. Delete PasswordInput component
html = html.replace(/const\s+PasswordInput\s*=\s*{[\s\S]*?template:\s*`[\s\S]*?`\s*};\s*/, '');
html = html.replace(/PasswordInput,\s*/, '');

// 2. Modify SettingInput to support type="password" with toggle button and helpText
// Old setup for SettingInput:
// setup:(p,{emit})=>({val:useVModel(p,'modelValue',emit)}),
// We need to add `show: ref(false)` for the password toggle, and `helpText` prop.
const oldSetup = `setup:(p,{emit})=>({val:useVModel(p,'modelValue',emit)}),`;
const newSetup = `setup:(p,{emit})=>({val:useVModel(p,'modelValue',emit), show:ref(false)}),`;
html = html.replace(oldSetup, newSetup);

// Props of SettingInput:
// props:['label','labelColor','type','options','min','max','step','disabled','modelValue','number']
// Let's add 'helpText', 'placeholder'
html = html.replace(
  /props:\['label','labelColor','type','options','min','max','step','disabled','modelValue','number'\]/,
  "props:['label','labelColor','type','options','min','max','step','disabled','modelValue','number','helpText','placeholder']"
);

// Template of SettingInput:
const oldTemplate = `<input v-else v-model="val" v-bind="$attrs" :type="type||'number'" :step="step" :min="min" :max="max" :disabled="disabled" class="input input-sm input-bordered w-full pt-2 text-sm"></div>\``;
// We need to change the input logic:
// If type === 'password', wrap in a flex box with the toggle button, and append helpText. Wait, actually we can just conditionally render the toggle button.
// For type='password', the input type becomes `show ? 'text' : 'password'`.
// And `<p v-if="helpText" class="text-xs text-neutral-500 mt-2 ml-1" v-html="helpText"></p>`
const newTemplate = `<div v-else class="flex gap-2"><input v-model="val" v-bind="$attrs" :type="type==='password'?(show?'text':'password'):(type||'number')" :step="step" :min="min" :max="max" :disabled="disabled" :placeholder="placeholder" class="input input-sm input-bordered w-full pt-2 text-sm"><toggle-btn v-if="type==='password'" v-model="show" icon="visibility_off" icon-off="visibility" size="btn-sm btn-ghost btn-square border border-white/10 shrink-0 self-end h-8 min-h-0"></toggle-btn></div><p v-if="helpText" class="text-xs text-neutral-500 mt-2 ml-1" v-html="helpText"></p></div>\``;
html = html.replace(oldTemplate, newTemplate);

// Wait, the outer div in SettingInput is `<div class="relative"><floating-label .../>...`. We appended `helpText` correctly before the closing `</div>`.

// 3. Replace all `<password-input>` usages with `<setting-input type="password"`
// Example usage: <password-input v-model="app.apiKey" label="NovelAI API Key" help-text="Stored locally in your browser."></password-input>
html = html.replace(
  /<password-input\s+([^>]*)><\/password-input>/g,
  `<setting-input type="password" $1></setting-input>`
);

// Note: password-input used `help-text`. Vue maps `help-text` attribute to `helpText` prop automatically.

fs.writeFileSync('index.html', html);
console.log('Step 2 complete');
