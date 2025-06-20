import { createRouter, createWebHistory } from 'vue-router';
import Home from '../views/Home.vue';
import Login from '../views/Login.vue';
import Register from '../views/Register.vue';
import Dashboard from '../views/Dashboard.vue';
import Record from '../views/Record.vue';
import ProfitList from '../views/ProfitList.vue';
import LossList from '../views/LossList.vue';
const routes = [
  { path: '/', component: Home },
  { path: '/login', component: Login },
  { path: '/register', component: Register },
  { path: '/dashboard', component: Dashboard },
  { path: '/record', component: Record },
  { path: '/profit', component: ProfitList },
  { path: '/loss', component: LossList },
];
export default createRouter({ history: createWebHistory(), routes });
