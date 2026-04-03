const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const globalsToExpose = [
    'formatDisplayNum', 'parsePrompt', 'prepareGenConfig', 'uid', 'imgSrc', 'fmtTokens', 'markdownParse', 'updateItemNum', 'abortableSleep'
];

let exposeScript = '\n// Expose for tests\n';
globalsToExpose.forEach(g => {
    exposeScript += `if (typeof ${g} !== 'undefined') window.${g} = ${g};\n`;
});
exposeScript += 'window.__VUE_APP_MOUNTED__ = true;\n';

html = html.replace("app.mount('#app');", exposeScript + "app.mount('#app');");
fs.writeFileSync('index.html', html);
console.log('Fixed globals and flag');
