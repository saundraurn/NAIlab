const arr = new Uint8Array(1024 * 1024); // 1MB
console.time('Array.from');
const s = btoa(Array.from(arr, c => String.fromCharCode(c)).join(''));
console.timeEnd('Array.from');

console.time('reduce');
const s2 = btoa(arr.reduce((d, b) => d + String.fromCharCode(b), ''));
console.timeEnd('reduce');
