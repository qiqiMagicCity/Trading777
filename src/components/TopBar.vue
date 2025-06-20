
<template>
  <header class="topbar">
    <div class="times">
      <span>纽约 {{ ny }}</span>
      <span>· 瓦伦西亚 {{ va }}</span>
      <span>· 上海 {{ sh }}</span>
    </div>
    <div class="spacer"></div>
    <div class="user">
      <span>{{ prefix }}</span>
      <button @click="logout">退出</button>
    </div>
  </header>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { supabase } from '@/supabaseClient'

const ny = ref(''), va = ref(''), sh = ref('')
const prefix = ref('访客')

function tick() {
  const now = new Date()
  ny.value = now.toLocaleTimeString('zh-CN', { timeZone: 'America/New_York', hour12: false })
  va.value = now.toLocaleTimeString('zh-CN', { timeZone: 'Europe/Madrid', hour12: false })
  sh.value = now.toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
}

let timer
onMounted(() => {
  tick()
  timer = setInterval(tick, 1000)
  supabase.auth.getUser().then(({ data }) => {
    prefix.value = data?.user?.email?.split('@')[0] || '访客'
  })
})
onUnmounted(() => clearInterval(timer))

async function logout() {
  await supabase.auth.signOut()
  window.location.href = '/login'
}
</script>

<style scoped>
.topbar{
  width:100%;
  position:relative;
  display:flex;
  align-items:center;
  padding:8px 16px;
  background:#001f26;
  color:#00ff99;
  font-size:14px;
  box-sizing:border-box;
}
.times span+span{
  margin-left:8px;
}
.spacer{flex:1;}
.user button{
  margin-left:8px;
  border:1px solid #00ff99;
  background:transparent;
  color:#00ff99;
  padding:2px 6px;
  border-radius:4px;
  cursor:pointer;
}
</style>
