
<script setup>
defineEmits(['open']);
</script>

<template>
  <button class="fab-fixed" @click="$emit('open')">添加交易</button>
</template>

<style>
.fab-fixed{
  position:fixed !important;
  left:50% !important;
  transform:translateX(-50%) !important;
  bottom:154px !important;          /* 1304 - 1150 */
  z-index:10000 !important;

  padding:18px 54px !important;
  font-size:2rem !important;
  font-weight:600 !important;

  border-radius:28px;
  background:rgba(0,255,153,0.77);
  border:2px solid rgba(0,255,153,0.77);
  color:#000;
  cursor:pointer;
}
.fab-fixed:hover{
  background:rgba(18,255,176,0.77);
}
</style>
