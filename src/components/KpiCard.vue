
<template>
  <div class="kpi" @click="onClick">
    <h4>{{ title }}</h4>
    <div :class="['value', positiveClass]">{{ displayValue }}</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
const props = defineProps({
  title:String,
  value:[Number,String],
  positive:Boolean,
  negative:Boolean
})
const emit = defineEmits(['click'])
function onClick(){ emit('click') }

const positiveClass = computed(()=>{
  if(props.positive) return 'positive'
  if(props.negative) return 'negative'
  return ''
})
const displayValue = computed(()=>{
  if(props.value===null || props.value===undefined) return '暂无数据'
  return typeof props.value==='number' ? props.value.toFixed(2) : props.value
})
</script>

<style scoped>
.kpi{
  min-width:180px;
  text-align:center;
  padding:16px 8px;
  border:2px solid #00ff99;
  border-radius:8px;
  margin:0 8px;
  box-shadow:0 0 10px #00ff99;
  cursor:pointer;
}
h4{
  margin:0 0 6px 0;
  font-size:16px;
  font-weight:bold;
}
.value{
  font-size:24px;
}
.value.positive{
  color:#00ff99;
}
.value.negative{
  color:#ff4c4c;
}
</style>
