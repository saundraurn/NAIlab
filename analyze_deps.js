const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// Look for lodash usages
const lodashMatches = html.match(/_\.[a-zA-Z]+/g) || [];
const lodashCounts = {};
lodashMatches.forEach(m => lodashCounts[m] = (lodashCounts[m] || 0) + 1);
console.log("Lodash usages:", lodashCounts);

// Look for hover-card usages and img tags inside them, or other img tags
const hoverCardMatches = html.match(/<hover-card[\s\S]*?<\/hover-card>/g) || [];
console.log(`Found ${hoverCardMatches.length} <hover-card> usages.`);

const imgMatches = html.match(/<img[\s\S]*?>/g) || [];
console.log(`Found ${imgMatches.length} <img> tags.`);
