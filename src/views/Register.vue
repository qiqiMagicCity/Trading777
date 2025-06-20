<template>
  <div class="page">
    <div class="auth-box">
      <h2>注册</h2>
      <input v-model="email" placeholder="邮箱" />
      <input v-model="password" placeholder="密码" type="password" />
      <button @click="register">注册</button>
      <p v-if="msg" :class="msgClass">{ msg }</p>
    </div>
  </div>
  <div class="footer">
  <span class="grey">本站功能逐步完善中，敬请期待。对本站感兴趣的可以联系站长共同创建</span>
  <span class="green">© 魔都万事屋™</span>
  <span class="green">2005 – 2025 版权所有 • 保留所有权利 • MagicCity Global Tec</span>
  <span class="green">版本 v1.3.03</span>
</div>
</template>
<script setup>
import { ref } from 'vue';
import { supabase } from '../supabaseClient';
import { useRouter } from 'vue-router';
const email = ref(''), password = ref(''), msg = ref(''), msgClass = ref(''), router = useRouter();
async function register() {
  msg.value = ''; msgClass.value = '';
  const { error } = await supabase.auth.signUp({email:email.value, password:password.value});
  if (error) { msg.value = error.message; msgClass.value='error-msg'; }
  else { msg.value='注册成功！请查收邮箱确认'; setTimeout(()=>router.push('/login'),2000); }
}
</script>
<style src="../styles/base.css"></style>
