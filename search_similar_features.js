const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// I should look at components to identify UI elements or features that are pretty similar that they could use a shared abstraction.
// Let's examine `PromptInput`, `PasswordInput`, `SettingInput`, `AutocompleteField`

const inputs = ['PromptInput', 'PasswordInput', 'SettingInput', 'AutocompleteField'];
inputs.forEach(name => {
  const regex = new RegExp(`const\\s+${name}\\s*=\\s*{[\\s\\S]*?template:\\s*\`([\\s\\S]*?)\``);
  const match = html.match(regex);
  if (match) {
    console.log(`--- ${name} ---`);
    console.log(match[1].substring(0, 500));
  }
});
