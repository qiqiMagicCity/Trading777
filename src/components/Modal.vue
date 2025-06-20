
<template>
  <div v-if="show" class="overlay" @click.self="close">
    <div class="window">
      <header>
        <slot name="title">详情</slot>
        <button class="close" @click="close">✕</button>
      </header>
      <section class="content">
        <slot></slot>
      </section>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({ show: Boolean })
const emit = defineEmits(['update:show'])
function close(){ emit('update:show', false) }
</script>

<style scoped>
.overlay{
  position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;justify-content:center;align-items:center;z-index:1000;
}
.window{
  background:#fff;color:#000;border-radius:10px;padding:18px;width:85%;max-width:620px;max-height:80vh;display:flex;flex-direction:column;
}
header{display:flex;justify-content:space-between;align-items:center;font-size:16px;margin-bottom:12px;font-weight:bold}
.close{border:none;background:transparent;font-size:20px;cursor:pointer}
.content{overflow:auto}
</style>
