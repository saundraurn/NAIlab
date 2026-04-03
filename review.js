// Wait, looking at ImageViewer:
// <image-viewer :src="viewedImg?.url" alt="Generated Image" text="Your generated image will appear here."></image-viewer>
// In NAITagTest:
// <image-viewer :src="image.url" :alt="'Image '+image.name" :text="'Image '+image.name"></image-viewer>

// What if I just replace `<image-viewer>` tags with its inline template, but customized for the context, or just keep it since it's a small abstraction.
// BUT I can definitely remove Lodash! It's an entire external library imported.
// `<script src="https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js"></script>`

// Let's do `grep -oP '_\.[a-zA-Z]+' index.html | sort | uniq -c | sort -nr` to see all Lodash usage counts.
