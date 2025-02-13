import Chat from "@gaia-project/vue-beautiful-chat";
import { BootstrapVue, BootstrapVueIcons } from "bootstrap-vue";
import PortalVue from "portal-vue";
import Vue from "vue";
import App from "./App.vue";
import "./filters";
// import './registerServiceWorker';
import "./plugins";
import router from "./router";
import "./services";
import store from "./store";

// import VueNativeSock from 'vue-native-websocket';
// Vue.use(VueNativeSock, `ws://${window.location.host}:50802/chat`, {reconnection: true, store, format: 'json'});

Vue.config.productionTip = false;
Vue.use(BootstrapVue);
Vue.use(BootstrapVueIcons);
Vue.use(Chat);
Vue.use(PortalVue);

new Vue({
  router,
  store,
  render: (h) => h(App),
}).$mount("#app");
