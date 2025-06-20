<template>
  <HeaderBar/>
  <HeaderBar/>
  <div class="page">
    <div class="auth-box">
      <h2>登录</h2>
      <input v-model="email" placeholder="邮箱" />
      <input v-model="password" placeholder="密码" type="password" />
      <button @click="login">登录</button>
      <p v-if="err" class="error-msg">{ err }</p>
    </div>
  </div>
  <div class="footer">
  <span class="grey">本站功能逐步完善中，敬请期待。对本站感兴趣的可以联系站长共同创建</span>
  <span class="green">© 魔都万事屋™</span>
  <span class="green">2005 – 2025 版权所有 • 保留所有权利 • MagicCity Global Tec</span>
  <span class="green">版本 v1.1.2</span>
</div>

<div class="divider"/>



  <div class="divider"/>
  <footer class="footer">
    本站功能逐步完善中… © 魔都万事屋™ 2005–2025 • Version v1.2.6
  </footer>
</template>

 <script setup>
import HeaderBar from '../components/HeaderBar.vue';

import { ref } from 'vue';
import { supabase } from '../supabaseClient';
import { useRouter } from 'vue-router';
const email = ref(''), password = ref(''), err = ref(''), router = useRouter();
async function login() {
  err.value = '';
  const { error } = await supabase.auth.signInWithPassword({email:email.value, password:password.value});
  if (error) err.value = error.message; else router.push('/dashboard');
}
</script>
<style src="../styles/base.css"></style>
