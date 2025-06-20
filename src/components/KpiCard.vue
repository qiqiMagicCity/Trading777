
<template>
  <div class="kpi" @click="click">
    <h4>{{ title }}</h4>
    <div :class="['value', cls]">{{ valueText }}</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
const props=defineProps({ title:String, value:[Number,String], positive:Boolean, negative:Boolean })
const emit=defineEmits(['click'])
const cls=computed(()=>props.positive?'positive':props.negative?'negative':'')
const valueText=computed(()=>props.value===undefined||props.value===null?'暂无数据':(typeof props.value==='number'?props.value.toFixed(2):props.value))
function click(){emit('click')}
</script>

<style scoped>
.kpi{min-width:180px;text-align:center;padding:16px 8px;border:2px solid #00ff99;border-radius:8px;margin:8px;box-shadow:0 0 10px #00ff99;cursor:pointer}
h4{margin:0 0 6px;font-size:16px;font-weight:bold}
.value{font-size:24px}
.value.positive{color:#00ff99}
.value.negative{color:#ff4c4c}
</style>
