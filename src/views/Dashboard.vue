<template>
  <div class="page dashboard-page">
    <!-- HeaderBar -->
    <div class="header-bar">
      <div class="timezones">
        <div>纽约 (UTC-4): {{ tz.NewYork }}</div>
        <div>瓦伦西亚 (UTC+2): {{ tz.Valencia }}</div>
        <div>上海 (UTC+8): {{ tz.Shanghai }}</div>
      </div>
      <div class="user-controls">
        <span>{{ username }}</span>
        <button class="btn-logout" @click="logout">退出</button>
      </div>
    </div>

    <!-- KPI Grid -->
    <div class="kpi-grid">
      <div
        class="kpi-card"
        v-for="m in metricsList"
        :key="m.key"
        :class="{clickable: m.key==='profitSyms' || m.key==='lossSyms'}"
        @click="handleKpiClick(m.key)"
      >
        <div class="kpi-value" :class="{positive: m.value>=0, negative: m.value<0}">
          {{ m.display }}
        </div>
        <div class="kpi-title">{{ m.title }}</div>
      </div>
    </div>

    <!-- Floating Add Button -->
    <button class="fab" @click="toRecord" :disabled="!session">+</button>

    <!-- Footer -->
      <div class="footer">
    <div class="footer-line">本站功能逐步完善中，敬请期待。对本站感兴趣的可以联系站长共同创建</div>
    <div class="footer-line">© 魔都万事屋™</div>
    <div class="footer-line">2005 – 2025 版权所有 • 保留所有权利 • MagicCity Global Tec</div>
    <div class="footer-line">版本 v1.3.6</div>
  </div>
</template>