<template>
  <div class="page">
    <div class="intro">
      <h1>交易通往财富之路</h1>
      <p>精细化管理 科学 理性 务实</p>
    </div>
    <div class="button-group">
      <router-link to="/login"><button class="button-simple">登录</button></router-link>
      <router-link to="/register"><button class="button-simple">注册</button></router-link>
    </div>
  </div>
  <div class="footer">
  <span class="grey">本站功能逐步完善中，敬请期待。对本站感兴趣的可以联系站长共同创建</span>
  <span class="green">© 魔都万事屋™</span>
  <span class="green">2005 – 2025 版权所有 • 保留所有权利 • MagicCity Global Tec</span>
  <span class="green">版本 v1.3.2</span>
</div>

    <div class="footer">
      <div class="footer-line line-gray">本站功能逐步完善中，敬请期待。对本站感兴趣的可以联系站长共同创建</div>
      <div class="footer-line line-gray">© 魔都万事屋™</div>
      <div class="footer-line line-green">2005 – 2025 版权所有 • 保留所有权利 • MagicCity Global Tec</div>
      <div class="footer-line line-green">版本 v1.3.2</div>
    </div>

</template>
<style scoped>
.intro { transform: translateY(-15vh); }
h1 { font-size: 5rem; margin-bottom:0.5rem; }
p { font-size:1.3rem; margin-bottom:2rem; transform: translateY(5vh); }
.button-group { display:flex; gap:3cm; margin-bottom:30px; }
</style>
