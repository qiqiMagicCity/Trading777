<template>
  <div class="page">
    <div class="headline">
      <h1>财富从交易开始，</h1>
      <h1>交易从交易管理开始！💹💹💹</h1>
    </div>
    <div class="button-group">
      <router-link to="/login" class="button">登录</router-link>
      <router-link to="/register" class="button">注册</router-link>
    </div>
    <div class="notice">
      本站功能逐步完善中，敬请期待。对本站感兴趣的可以联系站长共同创建
    </div>
    <footer>
      <div class="logo">© 魔都万事屋™</div>
      <small>2005 – 2025 版权所有 • 保留所有权利 • MagicCity Global Tech</small>
    </footer>
  </div>
</template>

<script setup></script>

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
.headline {
  margin-top: 35vh;
  text-align: center;
}
.headline h1 {
  font-size: 3em;
  margin: 0.2em 0;
  text-shadow: 0 0 10px #00ff99;
}
.button-group {
  margin-top: 15vh;
}
.button {
  margin: 0 1em;
  padding: 1em 2em;
  background: #00ff99;
  color: #000;
  border-radius: 0.5em;
  box-shadow: 0 0 10px #00ff99;
  text-decoration: none;
}
.notice {
  margin-top: auto;
  margin-bottom: 80px;
  background: rgba(0,0,0,0.5);
  padding: 0.5em 1em;
  border: 1px solid #00ff99;
  border-radius: 0.5em;
}
footer {
  position: absolute;
  bottom: 20px;
  text-align: center;
  font-size: 0.9em;
  color: #66ffcc;
}
</style>