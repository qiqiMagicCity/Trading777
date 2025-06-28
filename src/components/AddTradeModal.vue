<template>
  <dialog v-show="open" class="rounded-2xl p-6 backdrop:bg-black/40">
    <h2 class="text-xl font-semibold mb-4">添加交易</h2>
    <form @submit.prevent="submit" class="grid gap-3">
      <label class="grid">
        <span>代码</span>
        <input v-model="form.symbol" class="input input-bordered" required />
      </label>
      <label class="grid">
        <span>类型</span>
        <select v-model="form.trade_type" class="select select-bordered">
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
          <option value="SHORT">SHORT</option>
          <option value="COVER">COVER</option>
        </select>
      </label>
      <label class="grid">
        <span>数量</span>
        <input type="number" v-model.number="form.quantity" min="1" class="input input-bordered" required/>
      </label>
      <label class="grid">
        <span>价格</span>
        <input type="number" step="0.01" v-model.number="form.price" class="input input-bordered" required/>
      </label>
      <div class="flex justify-end gap-2 mt-4">
        <button type="button" class="btn" @click="close">取消</button>
        <button class="btn btn-primary">保存</button>
      </div>
    </form>
  </dialog>
</template>

<script setup>
import { reactive, ref, watch } from 'vue';
import { addTrade } from '../services/tradeService';

const props = defineProps({ modelValue: Boolean });
const emit = defineEmits(['update:modelValue','saved']);
const open = ref(props.modelValue);
watch(()=>props.modelValue,v=>open.value=v);

const form = reactive({ symbol:'', trade_type:'BUY', quantity:1, price:0 });

async function submit() {
  await addTrade({
    trade_at: new Date().toISOString(),
    symbol: form.symbol.toUpperCase(),
    trade_type: form.trade_type,
    quantity: form.quantity,
    price: form.price
  });
  emit('saved');
  close();
}
function close(){ emit('update:modelValue',false); }
</script>
