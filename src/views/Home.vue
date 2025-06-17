<template>
  <div class="home-container">
    <div class="intro">
      <h1>交易通往财富之路</h1>
      <p>精细化交易管理，科学，理性，务实。</p>
    </div>
    <div class="button-group">
      <router-link class="button" to="/login">登录</router-link>
      <router-link class="button" to="/register">注册</router-link>
    </div>
    <div class="footer">
      本站功能逐步完善中，敬请期待。对本站感兴趣的可以联系站长共同创建<br/>
      © 魔都万事屋™ 2005 – 2025 版权所有 • 保留所有权利 • MagicCity Global Tec<br/>
      版本 0.749
    </div>
  </div>
</template>

<script setup>
</script>

<style scoped>
.home-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at center,#001f1f,#000);
  color: #00ff99;
  font-family: 'Segoe UI',sans-serif;
  position: relative;
  text-align: center;
  min-height: 100vh;
  margin: 0;
}
.intro {
  transform: translateY(-15vh);
}
.intro h1 {
  font-size: 5rem;
  margin-bottom: 0.5rem;
}
.intro p {
  font-size: 1.3rem;
  margin-bottom: 2rem;
  transform: translateY(5vh);
}
.button-group {
  display: flex;
  gap: 3cm;
  margin-bottom: 30px;
}
.button {
  background: #00ff99;
  color: #000;
  padding: 12px 24px;
  font-size: 1rem;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  text-decoration: none;
}
.footer {
  position: absolute;
  bottom: 10px;
  font-size: 0.9rem;
  color: #888;
  text-align: center;
  width: 100%;
  border: 1px solid #00ff99;
  padding: 8px 0;
}
</style>
