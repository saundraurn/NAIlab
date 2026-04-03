const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const m = html.match(/const\s+IconBtn\s*=\s*{[\s\S]*?template:\s*`([\s\S]*?)`/);
console.log(m[1]);
