const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// The tests fail because the functions are defined as `const` inside a script, but the tests call them on `window`.
// In a module script, top-level const are NOT added to window.
// They are inside `<script type="module">`?
// Let's check `<script>` vs `<script type="module">`
const scriptTags = html.match(/<script.*?>/g);
console.log(scriptTags);

// We need to expose them for tests.
const globalsToExpose = [
    'formatDisplayNum', 'parsePrompt', 'prepareGenConfig', 'uid', 'imgSrc', 'fmtTokens', 'markdownParse', 'updateItemNum', 'abortableSleep'
];

let exposeScript = '\n// Expose for tests\n';
globalsToExpose.forEach(g => {
    exposeScript += `if (typeof ${g} !== 'undefined') window.${g} = ${g};\n`;
});

// we'll inject this just before the app is mounted.
if (!html.includes('Expose for tests')) {
    html = html.replace('app.mount("#app");', exposeScript + 'app.mount("#app");');
    fs.writeFileSync('index.html', html);
    console.log('Added global exposures for tests.');
}
