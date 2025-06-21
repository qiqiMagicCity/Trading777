<script setup>
defineEmits(['open']);
</script>

<template>
  
</template>

<style>
.fab-fixed{
  position:fixed !important;
  left:50% !important;
  transform:translateX(-50%) !important;
  bottom:154px !important;
  z-index:10000;
  padding:18px 54px;
  font-size:2rem;
  font-weight:600;
  color:#000;
  border:none;
  border-radius:28px;
  background:linear-gradient(145deg,#00ff99 0%,#00d48c 100%);
  box-shadow:0 0 18px rgba(0,255,153,.55);
  opacity:0.77;
  transition:transform .15s ease,opacity .15s ease,box-shadow .15s ease;
}
.fab-fixed:hover{
  transform:translateX(-50%) scale(1.05);
  opacity:1;
  box-shadow:0 0 25px rgba(0,255,153,.8);
}
button.fab{display:none !important;}
</style>
