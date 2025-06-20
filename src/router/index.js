
import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import Login from '../views/Login.vue'
import Register from '../views/Register.vue'
import Dashboard from '../views/Dashboard.vue'
import Record from '../views/Record.vue'
import ProfitList from '../views/ProfitList.vue'
import LossList from '../views/LossList.vue'

const routes = [
  { path: '/', component: Home },
  { path: '/login', component: Login },
  { path: '/register', component: Register },
  { path: '/dashboard', component: Dashboard, meta: { requiresAuth: true } },
  { path: '/record', component: Record, meta: { requiresAuth: true } },
  { path: '/profit', component: ProfitList, meta: { requiresAuth: true } },
  { path: '/loss', component: LossList, meta: { requiresAuth: true } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
