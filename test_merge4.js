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
    // Look at this line specifically:
    const { genHistory, conversations, box: _ignoredBox, ...rest } = loadedState;
    console.log("Rest to merge:", rest);

    // So rest DOES NOT contain box settings from loadedState!
    // But it DOES contain all other settings.

    // Oh wait... the problem is that when the app restarts in a DIFFERENT BROWSER...
    // The Box integration settings (clientId, clientSecret) are not saved across browsers
    // because they are being excluded during hydration!

    // Let's look at the problem description again:
    // "There's a bug somewhere with the Box integration, and it doesn't appear to function as intended; settings are not saved across browsers."
    // And there's a screenshot. The screenshot shows the "Box Cloud Storage" section.
    // The Client ID and Client Secret are filled in.

    // Actually, maybe they ARE saved in Box, but NOT loaded from Box because of this exact line?
    // Let's check!
};

hydrateFromLoadedState(loadedState, config, {});
