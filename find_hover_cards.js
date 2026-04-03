const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// Find hover-card usage lines and print context
const lines = html.split('\n');
lines.forEach((line, index) => {
  if (line.includes('<hover-card')) {
    console.log(`Line ${index + 1}:`);
    console.log(line.substring(0, Math.min(line.length, 300)) + "...");
    console.log("---");
  }
});
