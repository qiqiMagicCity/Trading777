<template>
  <div class="form">
    <label>股票代码</label>
    <input v-model="symbol" @input="onSearch(symbol)" placeholder="如 AAPL" />
    <ul v-if="showOptions && options.length" class="dropdown">
      <li v-for="opt in options" :key="opt.value" @click="selectOpt(opt)">
        {{ opt.label }}
      </li>
    </ul>

    <label>数量</label>
    <input v-model.number="quantity" type="number" step="0.0001" />

    <label>价格</label>
    <input v-model.number="price" type="number" step="0.0001" />

    <label>类型</label>
    <select v-model="action">
      <option value="BUY">买入</option>
      <option value="SELL">卖出</option>
      <option value="SHORT">卖空</option>
      <option value="COVER">回补</option>
    </select>

    <div class="btn-row">      <button class="submit" @click="handleSubmit" :disabled="loadingSave">提交</button>
    </div>
  </div>
</template>
<script setup>
const showOptions = ref(false);
import { ref } from 'vue';
import { searchSymbols } from '@/services/finnhubService.js';
import { supabase } from '@/utils/supabaseClient.js';
import { showToast } from '@/utils/toast.js';

const emit=defineEmits(['close','saved']);
const symbol=ref('');
const quantity=ref(0);
const price=ref(0);
const action=ref('BUY');
const options=ref([]);
const loadingSave = ref(false);

let timer;
function onSearch(val){
  clearTimeout(timer);
  timer=setTimeout(async ()=>{
    if(!val){options.value=[];return;}
    const list=await searchSymbols(val);
    showOptions.value = true;
    options.value = list.map(i=>({value:i.symbol,label:`${i.symbol} — ${i.description}`}));
  },300);
}
function selectOpt(opt){
  symbol.value = opt.value;
  showOptions.value = false;
  options.value = [];
}

async function handleSubmit(){
  loadingSave.value = true;
  const { data:{user} } = await supabase.auth.getUser();
  if(!user){
    showToast('请先登录','error');
    loadingSave.value = false;
    return;
  }
  const { error } = await supabase
    .from('TradeDate')
    .insert([{
      user_id: user.id,
      symbol: symbol.value,
      action: action.value,
      quantity: Number(quantity.value),
      price: Number(price.value),
    }]);

  loadingSave.value = false;

  if (error) {
    showToast('保存失败: ' + error.message, 'error');
  } else {
    showToast('保存成功');
    emit('saved');
    emit('close');
  }
}
</script>
<style scoped>
.form{display:flex;flex-direction:column;gap:12px;font-weight:600;}
input,select{padding:6px;font-size:14px;}
.btn-row{display:flex;justify-content:center;margin-top:12px;}

.submit{background:#00ff99;color:#000;font-weight:600;padding:12px 0;border:none;border-radius:8px;width:100%;cursor:pointer;}
.dropdown{list-style:none;padding:0;margin:0;border:1px solid #00ff99;max-height:160px;overflow:auto;}
.dropdown li{padding:4px 8px;cursor:pointer;}
.dropdown li:hover{background:#00ff99;color:#000;}
li{cursor:pointer;} li:hover{background:#00ff99;color:#000;}
</style>