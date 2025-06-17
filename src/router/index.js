import { createRouter, createWebHashHistory } from 'vue-router';
import Home from '@/views/Home.vue';
import Login from '@/views/Login.vue';
import Register from '@/views/Register.vue';
import Dashboard from '@/views/Dashboard.vue';
import Record from '@/views/Record.vue';
import { supabase } from '@/supabaseClient';

const routes = [
  { path: '/', component: Home },
  { path: '/login', component: Login },
  { path: '/register', component: Register },
  { path: '/dashboard', component: Dashboard, meta: { requiresAuth: true } },
  { path: '/record', component: Record, meta: { requiresAuth: true } },
  { path: '/:pathMatch(.*)*', redirect: '/login' }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});

router.beforeEach(async (to, from, next) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (to.meta.requiresAuth && !session) next('/login');
  else next();
});

router.beforeEach(async (to, from, next) => {
  if (!to.meta.requiresAuth) {
    // 公共路由无需检查会话，直接放行
    return next();
  }
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) next('/login');
    else next();
  } catch (error) {
    console.error('Session check failed', error);
    next('/login');
  }
});

export default router;
