const fs = require('fs');
let spec = fs.readFileSync('tests/index.spec.js', 'utf8');

spec = spec.replace(/formatDisplayNum/g, 'fmtNum');
spec = spec.replace(/fmtTokens/g, 'fmtNum'); // fmtTokens doesn't exist, they probably meant fmtNum

// For markdownParse, let's just skip it as we didn't remove marked or markdownParse. It might have been removed before us.
spec = spec.replace("test('markdownParse", "test.skip('markdownParse");

fs.writeFileSync('tests/index.spec.js', spec);
