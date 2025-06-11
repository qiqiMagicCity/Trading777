import { createRouter, createWebHashHistory } from 'vue-router'

import Login from '../views/Login.vue'
import Register from '../views/Register.vue'
import Dashboard from '../views/Dashboard.vue'
import Record from '../views/Record.vue'
import Dangri from '../views/Dangri.vue'

const routes = [
  { path: '/', redirect: '/login' },
  { path: '/login', component: Login },
  { path: '/register', component: Register },
  { path: '/dashboard', component: Dashboard },
  { path: '/record', component: Record },
  { path: '/dangri', component: Dangri }
]

export default createRouter({
  history: createWebHashHistory(),
  routes
})