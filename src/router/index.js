import { createRouter, createWebHashHistory } from 'vue-router'

import Login from '../views/Login.vue'
import Register from '../views/Register.vue'
import Dashboard from '../views/Dashboard.vue'
import Record from '../views/Record.vue'

const routes = [
  { path: '/', redirect: '/login' },
  { path: '/login', component: Login },
  { path: '/register', component: Register },
  { path: '/dashboard', component: Dashboard },
  { path: '/record', component: Record },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router