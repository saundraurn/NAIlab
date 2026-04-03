const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// The prompt mentions "This app was most recently reworked so that all images use the hover-card component if they need it, replacing prior bespoke solutions."
// We found `ImageViewer`, which is essentially a bespoke solution for displaying an image with a placeholder. Can we replace it with `hover-card` and `lazy-image` or `placeholder` + `img` directly in the few places it's used, or remove `ImageViewer` entirely?

console.log("ImageViewer component code:");
const ivMatch = html.match(/const\s+ImageViewer\s*=\s*{[\s\S]*?};/);
if (ivMatch) console.log(ivMatch[0]);

console.log("\nUsages of <image-viewer>:");
const usages = html.match(/<image-viewer[^>]*><\/image-viewer>/g);
if (usages) console.log(usages);
