const { ref, watch, nextTick, reactive } = require('vue');
const _ = require('lodash');

async function test() {
    const config = ref({ a: 1 });
    const isHydrating = ref(false);

    watch(config, (val) => {
        if (isHydrating.value) {
            console.log('Watch triggered but ignored');
            return;
        }
        console.log('Watch triggered and accepted!', val.a);
    }, { deep: true });

    isHydrating.value = true;

    // simulate hydrate
    const loadedState = { a: 99 };
    _.mergeWith(config.value, loadedState, (o, s) => _.isArray(s) ? s : undefined);

    await nextTick();
    isHydrating.value = false;

    // Wait
    await new Promise(r => setTimeout(r, 10));
}
test();
