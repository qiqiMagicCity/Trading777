<template>
  <div class="footer">
    <span class="grey">本站功能逐步完善中，敬请期待。对本站感兴趣的可以联系站长共同创建</span>
    <span class="green">© 魔都万事屋™</span>
    <span class="green">2005 – 2025 版权所有 • 保留所有权利 • MagicCity Global Tec</span>
    <span class="green">版本 {{ appVersion }}</span>
  </div>
</template>

<script setup>
import { APP_VERSION as appVersion } from '@/constants/version.js';
</script>

<style scoped>
.footer{
  width:100%;
  text-align:center;
  margin-top:40px;
  font-size:12px;
}
.grey{color:#9e9e9e;display:block;margin-bottom:4px;}
.green{color:#00ff99;display:block;}
</style>
