const { ref, watch, nextTick, reactive } = require('vue');
const _ = require('lodash');

async function test() {
    // Mocking VueUse useLocalStorage
    const config = ref({ a: 1, b: 2 });

    // Watch that behaves like the code
    watch(config, (newVal) => {
        console.log('Watch triggered, a:', newVal.a);
    }, { deep: true });

    // Let's mock hydration
    console.log('Hydrating');
    const loaded = { a: 99 };

    // Simulate what hydrateFromLoadedState does
    _.mergeWith(config.value, loaded, (objValue, srcValue) => _.isArray(srcValue) ? srcValue : undefined);

    await nextTick();

    console.log('Done');
}

test();
