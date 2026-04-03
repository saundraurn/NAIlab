const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// Find all image viewing logic
const imgTags = html.match(/<img[^>]+>/g);
console.log(`Found ${imgTags ? imgTags.length : 0} <img> tags`);

// Components template lengths
const componentRegex = /const\s+([A-Z][a-zA-Z0-9_]*)\s*=\s*{\s*[\s\S]*?(template:\s*`([\s\S]*?)`)/g;
let match;
while ((match = componentRegex.exec(html)) !== null) {
  console.log(`${match[1]}: template length ${match[3].length}`);
}
