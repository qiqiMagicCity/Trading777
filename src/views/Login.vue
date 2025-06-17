<template>
  <div class="login-container">
    <div class="login-box">
      <h2>用户登录</h2>
      <form @submit.prevent="handleLogin">
        <div><label for="email">邮箱</label><input id="email" v-model="email" type="email" required /></div>
        <div><label for="password">密码</label><input id="password" v-model="password" type="password" required /></div>
        <button type="submit">登录</button>
        <p v-if="error" class="error">{{ error }}</p>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { supabase } from '@/supabaseClient';

const email = ref('');
const password = ref('');
const error = ref(null);
const router = useRouter();

async function handleLogin() {
  error.value = null;
  const { data, error: signInError } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value,
  });
  console.log(data, signInError);
  if (signInError) {
    error.value = signInError.message;
  } else {
    setTimeout(() => router.push('/dashboard'), 500);
  }
}
</script>

<style scoped>
.login-container {display:flex;justify-content:center;align-items:center;min-height:100vh;}
.login-box {background:#000;color:#00ff99;padding:40px;border-radius:10px;box-shadow:0 0 20px #00ff99;width:400px;}
.error {color:#ff4d4f;margin-top:10px;}
</style>
