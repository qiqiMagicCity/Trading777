
<script setup>
defineEmits(['open']);
</script>

<template>
  <button class="fab-fixed" @click="$emit('open')">
    <span class="label">添加交易</span>
  </button>
</template>

<style>
.fab-fixed{
  position:fixed !important;
  left:50% !important;
  transform:translateX(-50%) !important;
  bottom:154px !important;
  z-index:10000;
  display:flex;
  align-items:center;
  justify-content:center;

  min-width:240px;
  padding:20px 60px;
  font-size:2rem;
  font-weight:700;
  color:#021;               /* dark text for contrast */
  text-shadow:0 2px 4px rgba(0,0,0,0.4);

  border:none;
  border-radius:36px;
  background:linear-gradient(145deg,#00ffd1 0%, #00c27a 100%);
  box-shadow:
      0 0 20px rgba(0,255,200,.45),
      0 10px 25px rgba(0,0,0,.35) inset;
  opacity:.77;
  transition:transform .2s ease,opacity .2s ease,box-shadow .2s ease;
}
.fab-fixed:hover{
  transform:translateX(-50%) scale(1.08);
  opacity:1;
  box-shadow:
      0 0 28px rgba(0,255,200,.75),
      0 12px 30px rgba(0,0,0,.4) inset;
}
.fab-fixed:active{
  transform:translateX(-50%) scale(0.96);
}
.label{
  background:linear-gradient(45deg,rgba(255,255,255,.3),rgba(255,255,255,0));
  -webkit-background-clip:text;
  color:transparent;
}
</style>