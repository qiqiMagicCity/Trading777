
import {createRouter,createWebHashHistory} from 'vue-router'
import Home from '@/views/Home.vue'
import Dashboard from '@/views/Dashboard.vue'
export default createRouter({history:createWebHashHistory(),routes:[
  {path:'/',component:Home},
  {path:'/dashboard',component:Dashboard},
  {path:'/:pathMatch(.*)*',redirect:'/'}
]})
