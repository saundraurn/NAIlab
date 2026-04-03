const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// Look for similar or identical templates
const components = {};
const componentRegex = /const\s+([A-Z][a-zA-Z0-9_]*)\s*=\s*{[\s\S]*?template:\s*`([\s\S]*?)`/g;
let match;
while ((match = componentRegex.exec(html)) !== null) {
  components[match[1]] = match[2];
}

console.log("Component names:", Object.keys(components));
