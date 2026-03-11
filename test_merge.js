const _ = require('lodash');

const configValue = {
    app: { model: 'old' },
    box: { token: 'new-token' },
    ui: { theme: 'dark' }
};

const loadedState = {
    app: { model: 'new' },
    box: { token: 'old-token' },
    ui: { theme: 'light' }
};

const { genHistory, conversations, box: _ignoredBox, ...rest } = loadedState;

console.log('rest:', rest);

_.mergeWith(configValue, rest, (objValue, srcValue) => _.isArray(srcValue) ? srcValue : undefined);

console.log('configValue:', configValue);
