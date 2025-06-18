<template>
  <div class="container">
    <h2>登录</h2>
    <input v-model="email" type="email" placeholder="邮箱">
    <input v-model="password" type="password" placeholder="密码">
    <button @click="handleLogin">登录</button>
    <p v-if="error" style="color:red">{{ error }}</p>
  </div>
  <div class="footer">© 魔都万事屋™ • 版本 v1.0.6</div>
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
  const { error: signInError } = await supabase.auth.signInWithPassword({
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

<style scoped src="../styles/auth.css"></style>
