const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const piMatch = html.match(/const\s+PromptInput\s*=\s*{[\s\S]*?template:\s*`([\s\S]*?)`/);
console.log(piMatch[1]);
