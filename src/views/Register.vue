<template>
  <div class="form-box">
    <h2>用户注册</h2>
    <form @submit.prevent="signup">
      <input v-model="email" type="email" placeholder="邮箱" required />
      <input v-model="password" type="password" placeholder="密码（至少6位）" minlength="6" required />
      <button type="submit">注册</button>
      <p style="margin-top:.5rem;" :style="{ color: ok ? '#00ff9c' : '#ff6470' }">{{ msg }}</p>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const email = ref('');
const password = ref('');
const msg = ref('');
const ok = ref(false);

async function signup() {
  msg.value = ''; ok.value = false;
  const supabase = window.__supabaseClient;
  const { error } = await supabase.auth.signUp({
    email: email.value.trim().toLowerCase(),
    password: password.value
  });
  if (error) {
    msg.value = error.message;
  } else {
    ok.value = true;
    msg.value = '注册成功！请检查邮箱完成验证，然后返回登录。';
  }
}
</script>