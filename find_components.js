const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// Use simple regex to find component definitions: `const ComponentName = {`
const componentRegex = /const\s+([A-Z][a-zA-Z0-9_]*)\s*=\s*{/g;
let match;
while ((match = componentRegex.exec(html)) !== null) {
  console.log(match[1]);
}
