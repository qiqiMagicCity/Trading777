import { createApp } from 'vue';
import App from './App.vue';
import router from './router';

window.__afterSupabaseReady = () => {
  const app = createApp(App);
  app.config.globalProperties.$supabase = window.__supabaseClient;
  app.use(router);
  app.mount('#app');
};