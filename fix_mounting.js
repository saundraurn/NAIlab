const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// I also removed the `window.__VUE_APP_MOUNTED__ = true;` flag, which is needed by the tests to wait for Vue to load.
// Wait, the test uses `page.waitForFunction(() => window.__VUE_APP_MOUNTED__ === true)`.
// If I remove it, the tests will fail. I will put just the flag back.
html = html.replace("app.mount('#app');", "app.mount('#app');\nwindow.__VUE_APP_MOUNTED__ = true;");
fs.writeFileSync('index.html', html);
console.log('Restored the mounted flag.');
