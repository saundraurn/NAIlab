const { ref, watch, nextTick, reactive } = require('vue');

async function test() {
    const config = ref({ a: 1 });
    const isHydrating = ref(false);
    let watchTriggered = false;

    watch(config, () => {
        if (isHydrating.value) {
            console.log('Watch ignored due to hydration');
            return;
        }
        console.log('Watch triggered and not hydrating!');
        watchTriggered = true;
    }, { deep: true });

    isHydrating.value = true;
    config.value.a = 2; // Mutate
    await nextTick();
    isHydrating.value = false;

    // Wait a bit to ensure no late triggers
    await new Promise(r => setTimeout(r, 10));

    console.log('Finished. watchTriggered:', watchTriggered);
}

test();
