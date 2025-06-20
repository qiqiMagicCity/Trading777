<template>
  <div class="page">
    <div class="auth-box">
      <h2>登录</h2>
      <input v-model="email" placeholder="邮箱" />
      <input v-model="password" placeholder="密码" type="password" />
      <button @click="login">登录</button>
      <p v-if="err" class="error-msg">{ err }</p>
    </div>
  </div>
  <FooterBar />
</template>
<script setup>
import FooterBar from '@/components/FooterBar.vue';
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
