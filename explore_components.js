const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const auMatch = html.match(/const\s+AutocompleteField\s*=\s*{[\s\S]*?template:\s*`([\s\S]*?)`/);
console.log(auMatch[0].substring(0, 500));
