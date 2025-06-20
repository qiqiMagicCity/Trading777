
<template>
  <div class="hero"><h1>交易通往财富之路</h1><p>精细化管理 科学 理性 务实</p></div>
  <FooterBar :version="'v1.3.05'"/>
</template>
<script setup>import FooterBar from '@/components/FooterBar.vue'</script>
<style scoped>
.hero{height:calc(100vh - 120px);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#00ff99;font-size:2rem;text-align:center}
</style>
