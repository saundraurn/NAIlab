const { fromUint8Array } = require('js-base64');
const arr = new Uint8Array(1024 * 1024); // 1MB

console.time('js-base64');
const s3 = fromUint8Array(arr);
console.timeEnd('js-base64');
