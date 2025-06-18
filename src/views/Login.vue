<template>
  <div class="container">
    <h2>登录</h2>
    <input v-model="email" type="email" placeholder="邮箱">
    <input v-model="password" type="password" placeholder="密码">
    <button @click="handleLogin">登录</button>
    <p v-if="error" style="color:red">{{ error }}</p>
  </div>
  <div class="footer">© 魔都万事屋™ • 版本 v1.0.5</div>
</template>

<script setup>
import { ref } from 'vue';
import { supabase } from '../supabaseClient';
import { useRouter } from 'vue-router';

const router = useRouter();
const email = ref('');
const password = ref('');
const error = ref('');

async function handleLogin() {
  const { data, error: signInError } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value
  });
  if (signInError) {
    error.value = signInError.message;
  } else {
    setTimeout(() => router.push('/dashboard'), 500);
  }
}
</script>

<style scoped>
.container {
  margin: 120px auto 0;
  width: 400px;
  display:flex;
  flex-direction:column;
  gap:14px;
  background:#000;
  padding:40px;
  border-radius:10px;
  box-shadow:0 0 20px #00ff99;
  color:#00ff99;
}
input {
  padding:10px;
  border:none;
  border-radius:6px;
}
button {
  padding:12px;
  background:#00ff99;
  border:none;
  color:#002b36;
  font-weight:bold;
  border-radius:8px;
  cursor:pointer;
}
.footer {
  text-align:center;
  margin-top:32px;
  color:#00ff99;
}
</style>
