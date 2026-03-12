const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const scripts = html.matchAll(/<script>(.*?)<\/script>/gs);
for (const match of scripts) {
    try {
        new Function(match[1]);
    } catch (e) {
        console.error("Syntax error in script:", e);
        console.error("Script snippet:", match[1].substring(0, 100));
    }
}
