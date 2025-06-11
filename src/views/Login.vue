<template>
  <div class="page">
    <div class="content">
      <div class="container">
  <div class="login-box">
    <h2>用户登录</h2>
    <input type="email" v-model="email" placeholder="请输入邮箱" />
    <br />
    <input type="password" v-model="password" placeholder="请输入密码" />
    <br />
    <button @click="login">登录</button>
    <div class="message">{{ message }}</div>
  </div>
      </div>
    </div>
    <footer class="footer">© 魔都万事屋™ 2005–2025</footer>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'vue-router'

const supabase = createClient(
  'https://zcosfwmtatuheqrytvad.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpjb3Nmd210YXR1aGVxcnl0dmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk0MTE0ODUsImV4cCI6MjA2NDk4NzQ4NX0.y5T5cf8BNsbbM5Va0kjHX1i359J1aAB4RYO6p16TKqk'
)

const email = ref('')
const password = ref('')
const message = ref('')
const router = useRouter()

async function login() {
  if (!email.value || !password.value) {
    message.value = '❌ 邮箱和密码不能为空'
    return
  }
  const { error } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value
  })
  if (error) {
    message.value = `❌ 登录失败：${error.message}`
  } else {
    message.value = '✅ 登录成功，正在跳转...'
    setTimeout(() => {
      router.push('/dashboard')
    }, 800)
  }
}
</script>

<style>

.page {
  position: relative;
  height: 100vh;
  background: radial-gradient(circle at center, #002b36, #000);
  display: flex;
  flex-direction: column;
  align-items: center;
  color: #00ff99;
}
.content {
  margin-top: 35vh;
  width: 100%;
  display: flex;
  justify-content: center;
}
.container {
  background: rgba(0,0,0,0.8);
  padding: 2em;
  border-radius: 10px;
  box-shadow: 0 0 20px #00ff99;
  width: 90%;
  max-width: 500px;
}
.footer {
  position: absolute;
  bottom: 20px;
  text-align: center;
  font-size: 0.9em;
  color: #66ffcc;
}
 scoped>
body {
  margin: 0;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  font-family: 'Segoe UI', sans-serif;
  background: radial-gradient(circle at center, #002b36, #000);
  color: #00ff99;
}
.login-box {
  text-align: center;
  background: rgba(0,0,0,0.8);
  padding: 40px;
  border-radius: 10px;
  box-shadow: 0 0 20px #00ff99;
}
h2 {
  margin-bottom: 20px;
}
input[type='email'],
input[type='password'] {
  width: 260px;
  padding: 10px;
  margin: 10px 0;
  background: rgba(0,0,0,0.8);
  color: #00ff99;
  border: 1px solid #00ff99;
  border-radius: 4px;
}
button {
  padding: 10px 20px;
  background: #00ff99;
  color: #000;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
  box-shadow: 0 0 10px #00ff99;
}
button:hover {
  background: #00ffcc;
}
.message {
  margin-top: 20px;
  font-size: 0.95em;
}
</style>