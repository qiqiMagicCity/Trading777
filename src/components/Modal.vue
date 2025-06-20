
<template>
  <div v-if="show" class="overlay" @click.self="close">
    <div class="window">
      <header>
        <slot name="title"></slot>
        <button class="close" @click="close">✕</button>
      </header>
      <section class="content">
        <slot></slot>
      </section>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({ show:Boolean })
const emit = defineEmits(['update:show'])
function close(){ emit('update:show', false) }
</script>

<style scoped>
.overlay{
  position:fixed;
  inset:0;
  background:rgba(0,0,0,.4);
  display:flex;
  align-items:center;
  justify-content:center;
  z-index:1000;
}
.window{
  background:#fff;
  color:#000;
  border-radius:10px;
  padding:20px;
  width:80%;
  max-width:600px;
  max-height:80vh;
  display:flex;
  flex-direction:column;
}
header{
  display:flex;
  justify-content:space-between;
  align-items:center;
  margin-bottom:12px;
}
.close{
  background:none;
  border:none;
  font-size:20px;
  cursor:pointer;
}
.content{
  overflow:auto;
}
</style>
