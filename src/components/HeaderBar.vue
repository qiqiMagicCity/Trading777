
<template>
  <header class="header">
    <div class="times">
      <span>{{ ny }}</span>
      <span>{{ es }}</span>
      <span>{{ cn }}</span>
    </div>
    <div class="user">
      <span>{{ userName }}</span>
      <button class="outline" @click="logout">退出</button>
    </div>
  </header>
  <div class="divider"/>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { supabase } from '../supabaseClient.js';

const ny=ref(''),es=ref(''),cn=ref('');
function tick(){
  const now=new Date();
  ny.value = now.toLocaleString('zh-CN',{hour12:false,timeZone:'America/New_York'});
  es.value = now.toLocaleString('zh-CN',{hour12:false,timeZone:'Europe/Madrid'});
  cn.value = now.toLocaleString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'});
}
let t;
onMounted(()=>{tick();t=setInterval(tick,1000);});
onUnmounted(()=>clearInterval(t));

const userName = supabase.auth.user()?.user_metadata?.full_name || supabase.auth.user()?.email || 'User';
async function logout(){
  await supabase.auth.signOut();
  window.location.hash='#/login';
}
</script>

<style scoped>
.header{display:flex;justify-content:space-between;align-items:center;padding:8px 24px;}
.times span{margin-right:12px;}
</style>
