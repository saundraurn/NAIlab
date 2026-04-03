const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

// 1. Delete PromptInput component
html = html.replace(/const\s+PromptInput\s*=\s*{[\s\S]*?template:\s*`[\s\S]*?`\s*};\s*/, '');

// Remove PromptInput from components list registration: `PromptInput, `
html = html.replace(/PromptInput,\s*/, '');

// 2. Add isUc prop to AutocompleteField
// props:{modelVal:String,tag:{type:String,default:'textarea'},label:String,labelClass:String}
// -> props:{modelVal:String,tag:{type:String,default:'textarea'},label:String,labelClass:String,isUc:Boolean}
html = html.replace(
  /props:{modelVal:String,tag:{type:String,default:'textarea'},label:String,labelClass:String}/,
  "props:{modelVal:String,tag:{type:String,default:'textarea'},label:String,labelClass:String,isUc:Boolean}"
);

// We should also add placeholder to AutocompleteField props if it's not there.
// Actually, inheritAttrs: false means it manually binds them somewhere.
// AutocompleteField uses `v-bind="$attrs"` on the textarea.
// Wait, PromptInput also applied a lot of classes! Let's check how AutocompleteField template looks:
// `<component :is="tag" ref="inputRef" :class="{'overflow-hidden':tag==='textarea'}" ... v-bind="$attrs"></component>`
// If we just add those classes to the usages of autocomplete-field, it works because $attrs handles class merging in Vue, except inheritAttrs: false might override class?
// No, class and style are special, but if inheritAttrs is false, class might not merge automatically unless explicitly bound or if `class` is passed down.
// Let's modify AutocompleteField template to include the class binding from PromptInput IF `isUc` is passed, or just hardcode the logic inside AutocompleteField!

// Let's look at AutocompleteField template:
// `<div class="relative"><floating-label :label="label" :color="labelClass"/><component :is="tag" ref="inputRef" :class="{'overflow-hidden':tag==='textarea'}" ... v-bind="$attrs"></component>`
// Change it to:
// `<div class="relative"><floating-label :label="label" :color="isUc ? 'badge-error text-white' : labelClass"/><component :is="tag" ref="inputRef" :class="['textarea textarea-bordered w-full resize-none text-sm leading-relaxed p-3 shadow-inner', isUc?'min-h-[3.5rem] text-neutral-400 focus:text-neutral-200':'min-h-[6rem] focus:min-h-[8rem] transition-[min-height]', {'overflow-hidden':tag==='textarea'}]" ... v-bind="$attrs"></component>`

html = html.replace(
  /<floating-label :label="label" :color="labelClass"\/>/,
  `<floating-label :label="label" :color="isUc ? 'badge-error text-white' : labelClass"/>`
);

// We need to carefully replace the class of the <component> in AutocompleteField.
const oldComponentStart = `<component :is="tag" ref="inputRef" :class="{'overflow-hidden':tag==='textarea'}" :value="modelVal"`;
const newComponentStart = `<component :is="tag" ref="inputRef" :class="['textarea textarea-bordered w-full resize-none text-sm leading-relaxed p-3 shadow-inner', isUc?'min-h-[3.5rem] text-neutral-400 focus:text-neutral-200':'min-h-[6rem] focus:min-h-[8rem] transition-[min-height]', {'overflow-hidden':tag==='textarea'}]" :value="modelVal"`;

html = html.replace(oldComponentStart, newComponentStart);

// 3. Replace all `<prompt-input>` usages with `<autocomplete-field tag="textarea"`
// Wait, prompt-input usages:
// <prompt-input label="Positive" v-model="genState.prompt" placeholder="Masterpiece, best quality..."></prompt-input>
// <prompt-input label="Negative" v-model="genState.uc" is-uc placeholder="Lowres, bad anatomy, text, error..."></prompt-input>
// <prompt-input tag="input" label="Blacklist" v-model="blacklist" is-uc placeholder="e.g. text, blur..." class="!min-h-0 !h-8 !p-0 !px-3 !pt-2 text-sm" @keydown.enter.prevent="search"></prompt-input>
// <prompt-input label="Global Negative" v-model="tagTest.unwantedContent" is-uc placeholder="Global unwanted content..."></prompt-input>
// <prompt-input label="Tags" v-model="tagTest.tagsToTest" placeholder="Enter tags separated by newlines..."></prompt-input>

html = html.replace(
  /<prompt-input\s+([^>]*?)v-model="([^"]+)"([^>]*)><\/prompt-input>/g,
  (match, before, vmodel, after) => {
    // If it doesn't have tag="...", we add it (AutocompleteField defaults to textarea, but let's be safe or just rely on default)
    // We need to change v-model to v-model:model-val
    return `<autocomplete-field ${before}v-model:model-val="${vmodel}"${after}></autocomplete-field>`;
  }
);

fs.writeFileSync('index.html', html);
console.log('Step 1 complete');
