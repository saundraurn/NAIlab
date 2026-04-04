const { JSDOM } = require("jsdom");
const { window } = new JSDOM();
global.window = window;
global.document = window.document;
global.navigator = window.navigator;

const Vue = require("vue");
global.Vue = Vue;

const VueUse = require("@vueuse/core");
console.log(Object.keys(VueUse).filter(k => k.toLowerCase().includes('timeago')));
