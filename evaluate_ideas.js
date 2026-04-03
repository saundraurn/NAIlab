// Ideas:
// 1. Remove `ImageViewer` component and replace it with its template directly, or use `hover-card` if it needs hovering. Wait, `hover-card` is used for hover actions. `ImageViewer` just shows a placeholder if no src, else an image. In NAIImageGenerator it's used as `<image-viewer :src="viewedImg?.url" ...>`. If we replace it with `hover-card` + `lazy-image`, we can remove `ImageViewer`. Wait, `lazy-image` has its own placeholder skeleton logic!
// Let's check `LazyImage`:
// const LazyImage={props:['src','alt','aspectRatio'],setup(){return{ready:ref(false)}},template:`<div class="image-container bg-neutral-900/50" :class="{skeleton:!ready}" :style="{aspectRatio}"><img :src="src" :alt="alt" loading="lazy" class="transition-opacity duration-500 w-full rounded-lg" :class="ready?'opacity-100':'opacity-0'" @load="ready=true" @error="ready=true"><slot></slot></div>`};

// 2. Reduce lodash usage by using native array methods or optional chaining.
// E.g., _.compact(arr) -> arr.filter(Boolean)
// _.find(arr, {id: val}) -> arr.find(x => x.id === val)
// _.isEqual -> maybe keep if used for deep equal, but maybe JSON.stringify?
