const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const name = process.argv[2];

const regex = new RegExp(`const\\s+${name}\\s*=\\s*{[\\s\\S]*?(template:\\s*\`([\\s\\S]*?)\`)`);
const match = html.match(regex);
if (match) {
  console.log(match[1]);
} else {
  console.log("Not found.");
}
