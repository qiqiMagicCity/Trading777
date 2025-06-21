import '@/assets/fab.v1_5_6.css';
import '@/assets/toast.css';
import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './styles/base.css';

createApp(App).use(router).mount('#app');