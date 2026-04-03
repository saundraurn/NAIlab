const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// I replaced app.mount("#app") with something earlier, maybe it got reverted or something failed.
console.log(html.includes('__VUE_APP_MOUNTED__'));
console.log(html.includes('app.mount("#app")'));
