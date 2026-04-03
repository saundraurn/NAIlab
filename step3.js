const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// 1. Delete ImageViewer component
html = html.replace(/const\s+ImageViewer\s*=\s*{[\s\S]*?template:\s*`[\s\S]*?`\s*};\s*/, '');
html = html.replace(/ImageViewer,\s*/, '');

// 2. Replace `<image-viewer>` usages
// They look like:
// <image-viewer :src="viewedImg?.url" alt="Generated Image" text="Your generated image will appear here."></image-viewer>
// <image-viewer :src="image.url" :alt="'Image '+image.name" :text="'Image '+image.name"></image-viewer>

html = html.replace(
  /<image-viewer\s+:src="([^"]+)"\s+alt="([^"]+)"\s+text="([^"]+)"><\/image-viewer>/g,
  `<div class="glass-nested rounded-xl p-3 aspect-square flex-center"><transition name="fade" mode="out-in"><placeholder v-if="!$1" key="p" icon="image" text="$3"/><lazy-image v-else :key="$1" :src="$1" alt="$2" class="max-w-full max-h-full object-contain rounded"></lazy-image></transition></div>`
);

html = html.replace(
  /<image-viewer\s+:src="([^"]+)"\s+:alt="([^"]+)"\s+:text="([^"]+)"><\/image-viewer>/g,
  `<div class="glass-nested rounded-xl p-3 aspect-square flex-center"><transition name="fade" mode="out-in"><placeholder v-if="!$1" key="p" icon="image" :text="$3"/><lazy-image v-else :key="$1" :src="$1" :alt="$2" class="max-w-full max-h-full object-contain rounded"></lazy-image></transition></div>`
);

fs.writeFileSync('index.html', html);
console.log('Step 3 complete');
