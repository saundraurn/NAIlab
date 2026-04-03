const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

console.log("PasswordInput usages:");
console.log(html.match(/<password-input[^>]*>/g));

console.log("\nSettingInput usages:");
console.log(html.match(/<setting-input[^>]*>/g));
