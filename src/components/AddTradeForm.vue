<template>
  <div class="form">
    <label>股票代码</label>
    <input v-model="symbol" @input="onSearch(symbol)" placeholder="如 AAPL" />
    <ul v-if="options.length" class="dropdown">
      <li v-for="opt in options" :key="opt.value" @click="onSelect(opt.value, opt)">
        {{ opt.label }}
      </li>
    </ul>

    <label>数量</label>
    <input v-model.number="quantity" type="number" />

    <label>价格</label>
    <input v-model.number="price" type="number" />

    <label>类型</label>
    <select v-model="action">
      <option value="buy">买入</option>
      <option value="sell">卖出</option>
    </select>

    <div class="btn-row">
      <button class="cancel" @click="handleCancel">取消</button>
      <button class="submit" @click="handleSubmit" :disabled="loadingSave">提交</button>
    </div>
  </div>
</template>
<script setup>
import { ref } from 'vue';
import { searchSymbols } from '@/services/finnhubService.js';
import { supabase } from '@/utils/supabaseClient.js';
import { showToast } from '@/utils/toast.js';

const emit=defineEmits(['close','saved']);
const symbol=ref('');
const quantity=ref(0);
const price=ref(0);
const action=ref('buy');
const options=ref([]);

let timer;
function onSearch(val){
  clearTimeout(timer);
  timer=setTimeout(async ()=>{
    if(!val){options.value=[];return;}
    const list=await searchSymbols(val);
    options.value=list.map(i=>({value:i.symbol,label:`${i.symbol} — ${i.description}`}));
  },300);
}
function selectOpt(opt){
  symbol.value=opt.value;
  options.value=[];
}

async function submit(){
  const { data:{user}}=await supabase.auth.getUser();
  if(!user){showToast('请先登录','error');return;}
  const {error}=await supabase.from('TradeDate').insert({user_id:user.id,symbol:symbol.value.toUpperCase(),action:action.value,quantity:Number(quantity.value),price:Number(price.value)});
  if(error){showToast('保存失败:'+error.message,'error');}else{showToast('保存成功');emit('saved');emit('close');}
}
</script>
<style scoped>
.form{display:flex;flex-direction:column;gap:12px;font-weight:600;}
input,select{padding:6px;font-size:14px;}
.btn-row{display:flex;justify-content:flex-end;gap:12px;margin-top:12px;}
.cancel{background:#c0392b;color:#fff;padding:6px 16px;border:none;border-radius:4px;cursor:pointer;}
.submit{background:#00ff99;color:#000;font-weight:600;padding:6px 16px;border:none;border-radius:4px;cursor:pointer;}
.dropdown{list-style:none;padding:0;margin:0;border:1px solid #00ff99;max-height:160px;overflow:auto;}
.dropdown li{padding:4px 8px;cursor:pointer;}
.dropdown li:hover{background:#00ff99;color:#000;}
li{cursor:pointer;} li:hover{background:#00ff99;color:#000;}
</style>
