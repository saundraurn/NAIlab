const { ref } = require('vue');
const _ = require('lodash');

const config = ref({
    app: { model: 'old' },
    box: { clientId: 'client_123', clientSecret: 'secret_123', accessToken: 'token_123' },
    ui: { theme: 'dark' }
});

const loadedState = {
    app: { model: 'new' },
    box: { clientId: 'old_client_123', clientSecret: 'old_secret_123', accessToken: 'old_token_123' },
    ui: { theme: 'light' }
};

const hydrateFromLoadedState = (loadedState, config, largeData) => {
    // We shouldn't ignore the ENTIRE box object, just the tokens!
    // If we ignore the tokens, we still want to keep clientId and clientSecret.
    // Wait... if we are loading settings from Box...
    // The Box tokens allow us to connect to Box. If we are downloading settings FROM Box, we obviously ALREADY HAVE the valid tokens!
    // So we don't want to overwrite our *current* tokens with whatever tokens were saved in the Box config file!
    // BUT we DO want to load other stuff, although if we have tokens we probably have clientId and clientSecret too...

    // Actually, what if the user wants to sync the clientId and clientSecret themselves across devices?
    // They put clientId/clientSecret in Device A, login, it saves to Box.
    // Device B comes along. They CANNOT login to Box on Device B without the clientId/clientSecret!
    // So how could they possibly load the config from Box to get the clientId/clientSecret if they need them to load the config in the first place?
    // Wait, the prompt says: "settings are not saved across browsers."
    // Wait... the Box API Key is stored locally in the browser!
    // Ah, wait. Are the OTHER settings saving across browsers, but NOT the Box settings?
    // Let's look at the image!
};

hydrateFromLoadedState(loadedState, config, {});
