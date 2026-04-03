const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// I notice one PromptInput component is still registered, though its definition is gone.
console.log("Is PromptInput exported?", html.includes('PromptInput'));
