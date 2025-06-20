
<template>
  <header class="topbar">
    <div class="times">
      <span>NY {{ nyTime }}</span>
      <span>· VA {{ vaTime }}</span>
      <span>· SH {{ shTime }}</span>
    </div>
    <div class="spacer"></div>
    <div class="user">
      <span>{{ userPrefix }}</span>
      <button @click="logout">Logout</button>
    </div>
  </header>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { supabase } from '@/supabaseClient'

const nyTime = ref('')
const vaTime = ref('')
const shTime = ref('')
const userPrefix = ref('—')

function tick(){
  const now = new Date()
  nyTime.value = now.toLocaleTimeString('en-US', { timeZone:'America/New_York', hour12:false })
  vaTime.value = now.toLocaleTimeString('en-GB', { timeZone:'Europe/Madrid', hour12:false })
  shTime.value = now.toLocaleTimeString('zh-CN', { timeZone:'Asia/Shanghai', hour12:false })
}
let interval
onMounted(()=>{
  tick()
  interval = setInterval(tick, 1000)
  const user = supabase.auth.getUser()
  userPrefix.value = user?.user?.email?.split('@')[0] ?? 'Guest'
})
onUnmounted(()=> clearInterval(interval))

async function logout(){
  await supabase.auth.signOut()
  window.location.href = '/login.html'
}
</script>

<style scoped>
.topbar{
  display:flex;
  align-items:center;
  padding:8px 16px;
  background:#001f26;
  color:#00ff99;
  font-size:14px;
}
.times span+span{
  margin-left:8px;
}
.spacer{
  flex:1;
}
.user button{
  margin-left:8px;
  background:transparent;
  border:1px solid #00ff99;
  color:#00ff99;
  padding:2px 6px;
  border-radius:4px;
  cursor:pointer;
}
</style>
