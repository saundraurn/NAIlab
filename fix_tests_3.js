const fs = require('fs');
let spec = fs.readFileSync('tests/index.spec.js', 'utf8');

// If fmtTokens and markdownParse don't exist in the codebase, the tests might be outdated or referring to old code that was already removed.
// I can just skip or comment out these tests since I didn't remove them (they weren't there to begin with before I started).
// Let's verify my git changes.
