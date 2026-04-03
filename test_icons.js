const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const spinIconMatch = html.match(/const\s+SpinIcon\s*=\s*{[\s\S]*?template:\s*`([\s\S]*?)`/);
console.log("SpinIcon:\n", spinIconMatch[1]);
console.log(html.match(/<spin-icon[^>]*>/g));
