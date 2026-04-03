const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// Things that might benefit from lodash:
// 1. Array filtering: .filter(x => x) -> _.compact()
// 2. Finding index: .findIndex(x => x.id === id) -> _.findIndex(..., {id})
// 3. Finding element: .find(x => x.id === id) -> _.find(..., {id})
// 4. Checking if empty: Object.keys(obj).length === 0 -> _.isEmpty(obj)
// 5. Plucking properties: .map(x => x.id) -> _.map(..., 'id')

const matches = [
  ...html.matchAll(/\.filter\([^)]*\)/g),
  ...html.matchAll(/\.findIndex\([^)]*\)/g),
  ...html.matchAll(/\.find\([^)]*\)/g),
  ...html.matchAll(/\.map\([^)]*\)/g)
];

matches.forEach(m => {
  if (m[0].length > 15) {
    // console.log(m[0]);
  }
});
