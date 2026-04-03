const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// Wait, the tests ask for `markdownParse` and `fmtTokens`, but these don't exist in `index.html`?
// Let's check `formatDisplayNum` -> `fmtNum`.
// Is there a `fmtTokens`?
// Maybe they were renamed. Let's look for formatting functions.
console.log(html.match(/const\s+fmt[A-Za-z0-9_]*/g));

// Let's look for marked.
console.log(html.includes('marked'));
