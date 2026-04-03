const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// I will look at the PromptInput, PasswordInput, SettingInput components to see if we can consolidate them.

console.log("PasswordInput:");
console.log(html.match(/const\s+PasswordInput\s*=\s*{[\s\S]*?};/)[0]);

console.log("\nSettingInput:");
console.log(html.match(/const\s+SettingInput\s*=\s*{[\s\S]*?};/)[0]);
