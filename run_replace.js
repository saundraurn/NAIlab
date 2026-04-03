const fs = require('fs');

function main() {
  let html = fs.readFileSync('index.html', 'utf8');

  // 1. Remove PromptInput and merge into AutocompleteField
  // AutocompleteField current: class="relative" ...
  const pInputStr = `const PromptInput={props:['label','modelValue','isUc','placeholder'],emits:['update:modelValue'],setup:(p,{emit})=>({modelValue:useVModel(p,'modelValue',emit)}),template:\`<autocomplete-field :tag="tag" :label="label" :label-class="isUc?'badge-error text-white':undefined" :model-val="modelValue" @update:model-val="$emit('update:modelValue',$event)" class="textarea textarea-bordered w-full resize-none text-sm leading-relaxed p-3 shadow-inner" :class="isUc?'min-h-[3.5rem] text-neutral-400 focus:text-neutral-200':'min-h-[6rem] focus:min-h-[8rem] transition-[min-height]'" :rows="isUc?2:3" :placeholder="placeholder" v-bind="$attrs"></autocomplete-field>\`};`;

  // To avoid breaking things, we'll just replace PromptInput tag usages and delete PromptInput.
  html = html.replace(/<prompt-input\s+label="([^"]+)"\s+v-model="([^"]+)"\s*(is-uc)?\s*placeholder="([^"]+)"([^>]*)><\/prompt-input>/g, (m, label, vmodel, isUc, placeholder, attrs) => {
    return `<autocomplete-field tag="textarea" label="${label}" ${isUc ? 'label-class="badge-error text-white" ' : ''}v-model="${vmodel}" class="textarea textarea-bordered w-full resize-none text-sm leading-relaxed p-3 shadow-inner ${isUc ? 'min-h-[3.5rem] text-neutral-400 focus:text-neutral-200' : 'min-h-[6rem] focus:min-h-[8rem] transition-[min-height]'}" :rows="${isUc ? 2 : 3}" placeholder="${placeholder}"${attrs}></autocomplete-field>`;
  });

  // What if prompt-input has :tag="tag"? It doesn't in usages. Wait, wait, v-model works differently on AutocompleteField! It uses `model-val` and `update:model-val`!
  html = html.replace(/<prompt-input\s+tag="([^"]+)"\s+label="([^"]+)"\s+v-model="([^"]+)"\s*(is-uc)?\s*placeholder="([^"]+)"([^>]*)><\/prompt-input>/g, (m, tag, label, vmodel, isUc, placeholder, attrs) => {
    return `<autocomplete-field tag="${tag}" label="${label}" ${isUc ? 'label-class="badge-error text-white" ' : ''}v-model="${vmodel}" class="textarea textarea-bordered w-full resize-none text-sm leading-relaxed p-3 shadow-inner ${isUc ? 'min-h-[3.5rem] text-neutral-400 focus:text-neutral-200' : 'min-h-[6rem] focus:min-h-[8rem] transition-[min-height]'}" :rows="${isUc ? 2 : 3}" placeholder="${placeholder}"${attrs}></autocomplete-field>`;
  });

  // Wait, does AutocompleteField support v-model?
  // Let's check AutocompleteField props: props:['tag','label','labelClass','modelVal','suggestionsUrl'...], emits:['update:modelVal',...].
  // Ah! AutocompleteField expects `v-model:model-val="..."`.
  // Wait, no. If we use `v-model="..."`, Vue 3 translates it to `modelValue` and `@update:modelValue`. But AutocompleteField expects `modelVal`.
}
