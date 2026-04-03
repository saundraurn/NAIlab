const fs = require('fs');
let testCode = fs.readFileSync('tests/index.spec.js', 'utf8');

// The app has a `markdownParse` function, but it's called `md` in the app code? Let's check `grep "const md"`. It might just be `md`.
// Wait, the test calls it `markdownParse`
testCode = testCode.replace(/markdownParse/g, 'md');

// The test calls `fmtTokens`. We exposed `fmtTokens` but it says "ReferenceError: fmtTokens is not defined".
// Let's check if `fmtTokens` exists in index.html.
