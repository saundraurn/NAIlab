const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const match = html.match(/const\s+LazyImage\s*=\s*{[\s\S]*?(template:\s*`([\s\S]*?)`)/);
if (match) {
  console.log(match[1]);
}
