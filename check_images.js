const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// Find all occurrences of `<img` in templates
const imgTags = html.match(/<img[^>]*>/g) || [];
console.log("All IMG tags:");
imgTags.forEach(t => console.log(t));

console.log("\nImage components:");
console.log("ImageViewer:", html.match(/<image-viewer[^>]*>/g));
console.log("LazyImage:", html.match(/<lazy-image[^>]*>/g));
