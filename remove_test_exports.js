const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const startIdx = html.indexOf('// Expose for tests');
const endIdx = html.indexOf("app.mount('#app');");

if (startIdx !== -1 && endIdx !== -1) {
    html = html.substring(0, startIdx) + html.substring(endIdx);
    fs.writeFileSync('index.html', html);
    console.log('Removed test exports.');
} else {
    console.log('Test exports block not found.');
}
