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
    <div class="footer">
    <div class="footer-line">本站功能逐步完善中，敬请期待。对本站感兴趣的可以联系站长共同创建</div>
    <div class="footer-line">© 魔都万事屋™</div>
    <div class="footer-line">2005 – 2025 版权所有 • 保留所有权利 • MagicCity Global Tec</div>
    <div class="footer-line">版本 v1.3.6</div>
  </div>
</template>