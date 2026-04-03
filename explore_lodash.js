const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

let lodashUsages = html.match(/_\.[a-zA-Z]+/g);
lodashUsages = [...new Set(lodashUsages)];

for (const usage of lodashUsages) {
  console.log(`\n--- ${usage} ---`);
  const lines = html.split('\n');
  lines.forEach((line, i) => {
    if (line.includes(usage)) {
      console.log(`Line ${i+1}: ${line.trim()}`);
    }
  });
}
