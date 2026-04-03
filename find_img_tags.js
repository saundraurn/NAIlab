const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// Find all <img tags and context
const lines = html.split('\n');
lines.forEach((line, index) => {
  if (line.includes('<img')) {
    console.log(`Line ${index + 1}:`);
    console.log(line);
    console.log("---");
  }
});
