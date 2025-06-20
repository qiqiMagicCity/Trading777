
<template>
  <HeaderBar/>
  <div class="box">
    <h2>注册</h2>
    <input v-model="email" placeholder="邮箱"/>
    <input v-model="password" type="password" placeholder="密码"/>
    <button @click="register">注册</button>
  </div>
  <div class="divider"/>
  <footer class="footer">本站功能逐步完善中… © 魔都万事屋™ 2005–2025 • Version v1.2.91</footer>
</template>

<script setup>
import { ref } from 'vue';
import { supabase } from '../supabaseClient.js';
import HeaderBar from '../components/HeaderBar.vue';

const email = ref('');
const password = ref('');
async function register(){
  const { error } = await supabase.auth.signUp({ email:email.value, password:password.value });
  if(!error) window.location.hash='#/dashboard';
  else alert(error.message);
}
</script>

<style scoped>
.box{width:280px;margin:80px auto;background:#000;border:1px solid var(--theme-green);box-shadow:0 0 12px var(--theme-green);border-radius:8px;padding:24px;text-align:center;}
h2{margin-top:0;color:var(--theme-green);}
</style>
