const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// The prompt mentions "This app was most recently reworked so that all images use the hover-card component if they need it, replacing prior bespoke solutions. Another example avenue is finding other consolidations we could do; what UI elements or features are pretty similar that they could use a shared abstraction?"

// Let's check `PromptList` vs `ConvoListItem` vs anything else?
const checkList = html.match(/const\s+ChecklistDropdown\s*=\s*{[\s\S]*?template:\s*`([\s\S]*?)`/);
console.log("ChecklistDropdown:", checkList[1].substring(0, 200));

const promptList = html.match(/const\s+PromptList\s*=\s*{[\s\S]*?template:\s*`([\s\S]*?)`/);
console.log("PromptList:", promptList[1].substring(0, 200));
