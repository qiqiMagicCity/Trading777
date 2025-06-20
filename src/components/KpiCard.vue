
<template>
  <div class="card" @click="$emit('click')">
    <div class="value">{{ value }}</div>
    <div class="title">{{ title }}</div>
  </div>
</template>

<script setup>
defineProps({ title:String, value:String });
</script>

<style scoped>
.card{width:200px;height:80px;background:#000;border:1px solid var(--theme-green);box-shadow:0 0 12px var(--theme-green);border-radius:6px;margin:8px;display:flex;flex-direction:column;justify-content:center;align-items:center;}
.value{font-size:18px;font-weight:bold;color:var(--theme-green);}
.title{font-size:12px;margin-top:4px;color:var(--theme-green);}
</style>
