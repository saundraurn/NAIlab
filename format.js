const fs = require('fs');
const content = fs.readFileSync('index.html', 'utf-8');
const prettified = content.replace(/(<\/[a-zA-Z0-9-]+>)/g, '$1\n');
fs.writeFileSync('formatted_index.html', prettified);
