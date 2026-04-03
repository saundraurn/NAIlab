const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// I notice SpinIcon might just be a MaterialIcon that spins? Let's see.
const spinMatch = html.match(/const\s+SpinIcon\s*=\s*{[\s\S]*?template:\s*\`([\s\S]*?)\`/);
if (spinMatch) {
  console.log("SpinIcon:\n", spinMatch[1]);
}

const matMatch = html.match(/const\s+MaterialIcon\s*=\s*{[\s\S]*?template:\s*\`([\s\S]*?)\`/);
if (matMatch) {
  console.log("MaterialIcon:\n", matMatch[1]);
}
