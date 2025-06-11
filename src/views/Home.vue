<template>
  <div class="container">
    <h1>财富从交易开始，</h1>
    <h1>交易从交易管理开始！💹💹💹</h1>
    <div class="button-group">
      <router-link to="/login" class="button">登录</router-link>
      <router-link to="/register" class="button">注册</router-link>
    </div>
  </div>
  <div class="bottom-text">本站功能逐步完善中，敬请期待。对本站感兴趣的可以联系站长共同创建</div>
  <footer>
    <div class="logo">© 魔都万事屋™</div>
    <small>2005 – 2025 版权所有 • 保留所有权利 • MagicCity Global Tech</small>
  </footer>
</template>

<script setup>
</script>

<style scoped>
body {
  margin: 0;
  background-color: #000;
  font-family: 'Segoe UI', sans-serif;
  color: #00ff99;
  background-image: radial-gradient(circle at center, #002b36, #000);
  overflow: hidden;
}
.container {
  text-align: center;
  animation: fadeIn 2s ease-in-out;
  margin-top: 80px;
}
h1 {
  font-size: 3em;
  letter-spacing: 2px;
  margin: 0 0 0.5em 0;
  text-shadow: 0 0 10px #00ff99;
}
.button-group {
  margin-top: 100px;
}
.button {
  display: inline-block;
  margin: 0 10px;
  padding: 12px 24px;
  background-color: #00ff99;
  color: #000;
  text-decoration: none;
  font-weight: bold;
  border-radius: 6px;
  box-shadow: 0 0 10px #00ff99;
  transition: transform 0.3s, box-shadow 0.3s;
}
.button:hover {
  transform: scale(1.1);
  box-shadow: 0 0 15px #00ffcc;
}
.bottom-text {
  margin-top: 100px;
  text-align: center;
  font-size: 0.95em;
  color: #aaa;
}
footer {
  margin-top: 20px;
  text-align: center;
  font-size: 0.9em;
  color: #888;
}
footer .logo {
  font-weight: bold;
  color: #00ff99;
}
footer small {
  display: block;
  margin-top: 5px;
  font-size: 0.75em;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-20px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>