
<template>
  <header class="topbar">
    <div class="times">
      <span>NY {{ ny }}</span>
      <span>· VA {{ va }}</span>
      <span>· SH {{ sh }}</span>
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

const ny=ref(''), va=ref(''), sh=ref('')
const prefix=ref('访客')

function tick(){
  const d=new Date()
  ny.value=d.toLocaleTimeString('en-US',{timeZone:'America/New_York',hour12:false})
  va.value=d.toLocaleTimeString('en-GB',{timeZone:'Europe/Madrid',hour12:false})
  sh.value=d.toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})
}
onMounted(()=>{
  tick()
  const t=setInterval(tick,1000)
  onUnmounted(()=>clearInterval(t))
  supabase.auth.getUser().then(({data})=>{
    prefix.value=data?.user?.email?.split('@')[0]||'访客'
  })
})

async function logout(){
  await supabase.auth.signOut()
  location.href='/login'
}
</script>

<style scoped>
.topbar{
  display:flex;align-items:center;padding:8px 16px;background:#001f26;color:#00ff99
}
.times span+span{margin-left:8px}
.spacer{flex:1}
.user button{margin-left:8px;border:1px solid #00ff99;background:transparent;color:#00ff99;padding:2px 6px;border-radius:4px;cursor:pointer}
</style>
