const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// See if we can just delete ImageViewer and replace it with HoverCard and/or LazyImage
// Let's check where <image-viewer> is used
console.log(html.match(/<image-viewer[\s\S]*?>[\s\S]*?<\/image-viewer>/g));
