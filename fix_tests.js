const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// The tests timed out because `__VUE_APP_MOUNTED__` is false or the page doesn't fully load.
// Wait, isomorphic-git requires an internet connection if it tries to load or we just set window._resolveGitReady() inside the script.
// `window._resolveGitReady` is called in the module script.
// Module scripts don't run on `file://` protocol because of CORS.
// `await page.goto(filePath);` where filePath is `file://.../index.html`.
// Wait, if it's `file://`, type="module" scripts will fail with CORS!
// So Vue, the global exposures, and `__VUE_APP_MOUNTED__` won't execute!

// Since it's testing globals, and all globals are inside the <script> block, we can either:
// 1. start a local server for the tests
// OR we already have tests running in a different way or Playwright handles it.
