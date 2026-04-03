const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// Look for common long class strings
const classRegex = /class="([^"]+)"/g;
const classCounts = {};
let match;
while ((match = classRegex.exec(html)) !== null) {
  const cls = match[1];
  classCounts[cls] = (classCounts[cls] || 0) + 1;
}

const sortedClasses = Object.entries(classCounts).sort((a, b) => b[1] - a[1]);
console.log("Most common exact class strings:");
sortedClasses.slice(0, 20).forEach(([cls, count]) => {
  if (cls.length > 20 && count > 1) {
    console.log(`${count}x: ${cls}`);
  }
});
