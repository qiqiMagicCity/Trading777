<template>
  <div class="form-box">
    <h2>用户登录</h2>
    <form @submit.prevent="login">
      <input v-model="email" type="email" placeholder="邮箱" required />
      <input v-model="password" type="password" placeholder="密码" required />
      <button type="submit">登录</button>
      <p style="margin-top:.5rem;color:#ff6470;">{{ msg }}</p>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const email = ref('');
const password = ref('');
const msg = ref('');
const router = useRouter();

async function login() {
  msg.value = '';
  const supabase = window.__supabaseClient;
  const { error } = await supabase.auth.signInWithPassword({
    email: email.value.trim().toLowerCase(),
    password: password.value
  });
  if (error) msg.value = error.message;
  else router.push('/dashboard');
}
</script>