<template>
  <div class="page home-page">

      <div class="intro">
        <h1>交易通往财富之路</h1>
        <p>精细化管理 科学 理性 务实</p>
      </div>
      <div class="button-group">
        <router-link to="/login"><button class="btn-outline">登录</button></router-link>
        <router-link to="/register"><button class="btn-outline">注册</button></router-link>
      </div>


    <div class="footer">
      <div class="footer-line">本站功能逐步完善中，敬请期待。对本站感兴趣的可以联系站长共同创建</div>
      <div class="footer-line">© 魔都万事屋™</div>
      <div class="footer-line">2005 – 2025 版权所有 • 保留所有权利 • MagicCity Global Tec</div>
      <div class="footer-line">版本 1.3.93</div>
    </div>

  </div>
</template>

<script setup>
</script>

<style scoped>
.intro { text-align:center; margin-top:100px; }
.button-group { display:flex; gap:24px; justify-content:center; margin-top:40px; }
.btn-outline { padding:10px 20px; border:2px solid #00ff99; border-radius:8px; background:transparent; color:#00ff99; cursor:pointer; }
</style>
