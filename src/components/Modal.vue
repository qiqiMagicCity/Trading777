
<template><div v-if="show" class="overlay" @click.self="close"><div class="win"><header><slot name='title'>详情</slot><button @click="close">✕</button></header><section class="body"><slot></slot></section></div></div></template>
<script setup>const props=defineProps({show:Boolean});const emit=defineEmits(['update:show']);function close(){emit('update:show',false)}</script>
<style scoped>.overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:1000}.win{background:#fff;color:#000;border-radius:10px;padding:18px;width:85%;max-width:620px;max-height:80vh;display:flex;flex-direction:column}.body{overflow:auto}button{border:none;background:transparent;font-size:20px;cursor:pointer}</style>
