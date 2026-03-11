const _ = require('lodash');

const config = {
    value: {
        app: { model: 'old' },
        box: { clientId: 'client_123', clientSecret: 'secret_123' },
        ui: { theme: 'dark' }
    }
};

const loadedState = {
    app: { model: 'new' },
    ui: { theme: 'light' }
};
// Notice how I removed 'box' from loadedState, just like the real code strips it!
// Ah wait! The user says "settings are not saved across browsers".
// Oh! It is not *loading* properly or it is not *saving* properly?
