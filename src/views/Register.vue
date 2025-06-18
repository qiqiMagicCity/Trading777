<template>
  <div class="page">
    <div class="auth-box">
      <h2>注册</h2>
      <input v-model="email" placeholder="邮箱" type="email">
      <input v-model="password" placeholder="密码" type="password">
      <button @click="register">注册</button>
      <p v-if="msg" :class="msgClass">{{ msg }}</p>
    </div>
  </div>
  <div class="footer">
    本站功能逐步完善中，敬请期待。对本站感兴趣的可以联系站长共同创建<br/>
    © 魔都万事屋™ 2005 – 2025 版权所有 • 保留所有权利 • MagicCity Global Tec<br/>
    版本 v1.1.0
</div>
</template>

<script setup>
import { ref } from 'vue';
import { supabase } from '../supabaseClient';
import { useRouter } from 'vue-router';
const email = ref('');
const password = ref('');
const msg = ref('');
const msgClass = ref('');
const router = useRouter();

async function register(){
  msg.value='';
  const { error } = await supabase.auth.signUp({ email:email.value, password:password.value });
  if(error){
    msgClass.value='error-msg';
    msg.value = error.message;
  } else {
    msgClass.value='';
    msg.value='注册成功！请查收邮箱确认';
    setTimeout(()=>router.push('/login'),2000);
  }
}
</script>

<style src="../styles/base.css"></style>
