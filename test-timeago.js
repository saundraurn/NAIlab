const { formatTimeAgo } = require('@vueuse/core');
console.log(formatTimeAgo(new Date(Date.now() - 60000)));
console.log(formatTimeAgo(new Date(Date.now() - 3600000)));
console.log(formatTimeAgo(new Date(Date.now() - 86400000 * 2)));
