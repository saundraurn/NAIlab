const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const lines = html.split('\n');
lines.forEach((line, i) => {
  if (line.includes('.filter(') || line.includes('.findIndex(') || line.includes('.find(') || line.includes('.map(') || line.includes('.some(')) {
    if (!line.includes('_.') && line.length > 50) {
      // console.log(`Line ${i + 1}: ${line.trim()}`);
    }
  }
});
