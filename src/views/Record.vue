<template>
  <div class="page">
    <div class="auth-box">
      <h2>添加交易</h2>
      <input v-model="symbol" placeholder="股票代码" />
      <input v-model.number="quantity" placeholder="数量" />
      <input v-model.number="price" placeholder="价格" />
      <button @click="submit">提交</button>
      <p v-if="info" style="color:#00ff99">{ info }</p>
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