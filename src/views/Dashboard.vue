<template>
  <div class="page dashboard-page">
    <div class="header-bar">
      <div class="timezones">
        <div>{{ tz.NewYork }}</div>
        <div>{{ tz.Valencia }}</div>
        <div>{{ tz.Shanghai }}</div>
      </div>
      <div class="user-controls">
        <span>{{ username }}</span>
        <button class="btn-logout" @click="logout">退出</button>
      </div>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card" v-for="m in metricsList" :key="m.key">
        <div :class="['kpi-value', m.value>=0?'positive':'negative']">{{ m.display }}</div>
        <div class="kpi-title">{{ m.title }}</div>
      </div>
    </div>
    <button class="fab" @click="toRecord">+</button>
    <div class="footer">
      <div class="footer-line">本站功能逐步完善中，敬请期待。对本站感兴趣的可以联系站长共同创建</div>
      <div class="footer-line">© 魔都万事屋™</div>
      <div class="footer-line">2005 – 2025 版权所有 • 保留所有权利 • MagicCity Global Tec</div>
      <div class="footer-line">版本 v1.3.92</div>
    </div>
  </div>
</template>

<script setup>
</script>

<style scoped>
</style>