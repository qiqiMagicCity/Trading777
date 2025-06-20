
<template><div class="kpi" @click="$emit('click')"><h4>{{title}}</h4><div class="value">{{text}}</div></div></template>
<script setup>
import {computed} from 'vue'
const props=defineProps({title:String,value:[Number,String]})
const text=computed(()=>props.value==null?'暂无数据':(typeof props.value==='number'?props.value.toFixed(2):props.value))
</script>
<style scoped>
.kpi{min-width:180px;text-align:center;padding:16px 8px;border:2px solid #00ff99;border-radius:8px;margin:8px;box-shadow:0 0 10px #00ff99}
h4{margin:0 0 6px;font-size:16px;font-weight:bold}.value{font-size:24px}
</style>
