const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// There are several plain <img tags. The user states "This app was most recently reworked so that all images use the hover-card component if they need it, replacing prior bespoke solutions"

const imgTagsRegex = /<img[^>]*>/g;
let match;
while ((match = imgTagsRegex.exec(html)) !== null) {
  // Let's get the 100 characters before the <img> to see if it's inside <hover-card>
  const before = html.substring(Math.max(0, match.index - 100), match.index);
  console.log(`\nIMG Tag: ${match[0]}`);
  console.log(`Preceded by: ...${before}`);
}
