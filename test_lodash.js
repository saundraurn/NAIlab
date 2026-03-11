const { ref, reactive } = require('vue');
const _ = require('lodash');

const config = ref({
    app: { model: 'old', key: '123' },
    box: { clientId: 'client', accessToken: 'token' }
});

const rest = {
    app: { model: 'new' } // missing key
};

_.mergeWith(config.value, rest, (objValue, srcValue) => _.isArray(srcValue) ? srcValue : undefined);

console.log(config.value);
