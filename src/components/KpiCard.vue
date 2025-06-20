<template>
  <div class="card" @click="$emit('click')">
    <div class="value">{{ value }}</div>
    <div class="title">{{ title }}</div>
  </div>
</template>
<script setup>
defineProps({ title: String, value: String });
</script>
<style scoped>
.card { width:220px; height:100px; background:#000; border:1px solid var(--theme-green); box-shadow:0 0 12px var(--theme-green); border-radius:8px; margin:8px; display:flex; flex-direction:column; justify-content:center; align-items:center; }
.value { font-size:1.4rem; font-weight:bold; }
.title { font-size:0.8rem; margin-top:4px; }
</style>
