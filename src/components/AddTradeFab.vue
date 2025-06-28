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
  position:fixed;
  left:50%;
  transform:translateX(-50%);
  bottom:154px;
  z-index:10000;

  display:flex;
  align-items:center;
  justify-content:center;
  min-width:260px;
  padding:18px 50px;

  font-size:1.9rem;
  font-weight:700;
  letter-spacing:1px;
  color:#ffffff;
  text-shadow:0 0 6px rgba(0,255,200,.8);

  border-radius:30px;
  border:1px solid rgba(0,255,153,.4);
  background:rgba(0,255,153,.25);
  backdrop-filter:blur(10px) saturate(180%);
  -webkit-backdrop-filter:blur(10px) saturate(180%);

  box-shadow:
     0 0 12px rgba(0,255,153,.45),
     0 4px 8px rgba(0,0,0,.25) inset,
     0 -4px 8px rgba(0,0,0,.25) inset;

  transition:transform .18s ease, box-shadow .18s ease, background .18s ease, opacity .18s ease;
  opacity:.77;
}
.fab-fixed:hover{
  opacity:1;
  transform:translateX(-50%) scale(1.06);
  background:rgba(0,255,153,.35);
  box-shadow:
     0 0 18px rgba(0,255,180,.75),
     0 6px 12px rgba(0,0,0,.35) inset,
     0 -6px 12px rgba(0,0,0,.35) inset;
}
.fab-fixed:active{
  transform:translateX(-50%) scale(.96);
}
</style>
