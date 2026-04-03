const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

if (!html.includes('window.fmtNum = fmtNum;')) {
    html = html.replace('window.uid = uid;', 'window.fmtNum = fmtNum;\nif (typeof window.uid !== "undefined") window.uid = uid;');
    fs.writeFileSync('index.html', html);
}
