const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

console.log(html.slice(-200));
