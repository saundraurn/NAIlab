const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const imageViewerComponent = `const ImageViewer={props:['src','alt','text'],template:\`<div class="glass-nested rounded-xl p-3 aspect-square flex-center"><transition name="fade" mode="out-in"><placeholder v-if="!src" key="p" icon="image" :text="text"/><img v-else :key="src" :src="src" :alt="alt" class="max-w-full max-h-full object-contain rounded"></transition></div>\`};`;

console.log("Is ImageViewer in the code?", html.includes(imageViewerComponent));

const ivUsages = html.match(/<image-viewer\b[^>]*><\/image-viewer>/g);
console.log("ImageViewer usages:", ivUsages);
