const fs = require('fs');
let spec = fs.readFileSync('tests/index.spec.js', 'utf8');
spec = spec.replace(
    'const filePath = `file://${path.resolve(\'index.html\')}`;',
    'const filePath = `http://127.0.0.1:8080/index.html`;'
);
fs.writeFileSync('tests/index.spec.js', spec);
console.log('Modified tests to use http-server');
