const fs = require('fs');
let testCode = fs.readFileSync('tests/index.spec.js', 'utf8');

// The tests call functions that have different names in the app code.
// formatDisplayNum -> fmtNum
testCode = testCode.replace(/formatDisplayNum/g, 'fmtNum');

// The test 'markdownParse uses marked if available or returns raw text' calls `markdownParse`.
// Wait, the code doesn't have `markdownParse`. Let's search what parses markdown.
