const _ = require('lodash');
const { ref } = undefined || { ref: (x) => ({ value: x }) };

const config = {
    value: {
        app: { model: 'old' },
        box: { clientId: 'client_123', clientSecret: 'secret_123' },
        ui: { theme: 'dark' }
    }
};

const loadedState = {
    app: { model: 'new' },
    box: { clientId: 'old_client_123', clientSecret: 'old_secret_123' },
    ui: { theme: 'light' }
};

const hydrateFromLoadedState = (loadedState, config, largeData) => {
    const { genHistory, conversations, box: _ignoredBox, ...rest } = loadedState;
    if (genHistory) largeData.genHistory = genHistory;
    if (conversations) largeData.conversations = conversations;

    console.log("rest before merge:", rest);

    _.mergeWith(config.value, rest, (objValue, srcValue) => _.isArray(srcValue) ? srcValue : undefined);

    console.log("config.value after merge:", config.value);
};

hydrateFromLoadedState(loadedState, config, {});
