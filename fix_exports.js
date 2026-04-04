const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// I will append the exports back so the tests can run.
const exposeScript = `
// Expose for tests
if (typeof fmtNum !== 'undefined') window.fmtNum = fmtNum;
if (typeof parsePrompt !== 'undefined') window.parsePrompt = parsePrompt;
if (typeof prepareGenConfig !== 'undefined') window.prepareGenConfig = prepareGenConfig;
if (typeof uid !== 'undefined') window.uid = uid;
if (typeof imgSrc !== 'undefined') window.imgSrc = imgSrc;
if (typeof updateItemNum !== 'undefined') window.updateItemNum = updateItemNum;
if (typeof abortableSleep !== 'undefined') window.abortableSleep = abortableSleep;
`;

html = html.replace("app.mount('#app');\nwindow.__VUE_APP_MOUNTED__ = true;", exposeScript + "app.mount('#app');\nwindow.__VUE_APP_MOUNTED__ = true;");
fs.writeFileSync('index.html', html);
console.log('Restored test exports.');
