<template>
  <div class="form-box">
    <h2>添加交易记录</h2>
    <label>标的代码:</label>
    <input v-model="symbol" @input="autoFillName" placeholder="如 AAPL"/>
    <label>标的名称:</label>
    <input v-model="name" disabled/>
    <label>买卖方向:</label>
    <select v-model="side">
      <option value="BOUGHT">买入</option>
      <option value="SOLD">卖出</option>
      <option value="SHORT">做空</option>
      <option value="COVER">回补</option>
    </select>
    <label>单价:</label>
    <input type="number" v-model.number="price" @input="calcTotal"/>
    <label>数量:</label>
    <input type="number" v-model.number="quantity" @input="calcTotal"/>
    <label>订单金额:</label>
    <input v-model="amount" disabled/>
    <label>成交日期:</label>
    <input type="date" v-model="trade_date"/>
    <label>备注:</label>
    <input v-model="note"/>
    <button @click="submitForm">提交交易记录</button>
    <div class="message">{{ message }}</div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'vue-router'

const supabase = createClient('https://zcosfwmtatuheqrytvad.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
const symbol = ref('')
const name = ref('')
const side = ref('BOUGHT')
const price = ref(0)
const quantity = ref(0)
const amount = ref(0)
const trade_date = ref(new Date().toISOString().slice(0,10))
const note = ref('')
const message = ref('')
const router = useRouter()

const nameMap = { AAPL:'苹果公司',NVDA:'英伟达',TSLA:'特斯拉',MSFT:'微软',AMZN:'亚马逊' }

function autoFillName(){ name.value=nameMap[symbol.value.trim().toUpperCase()]||'' }
function calcTotal(){ amount.value=(price.value*quantity.value).toFixed(2) }

async function submitForm(){
  message.value='⏳ 提交中...'
  const { data:{ session } } = await supabase.auth.getSession()
  if(!session){ message.value='❌ 用户未登录'; return }
  const { error } = await supabase.from('records').insert([{
    user_id: session.user.id, symbol: symbol.value.trim().toUpperCase(),
    name: name.value, side: side.value, price: price.value,
    quantity: quantity.value, amount: parseFloat(amount.value),
    trade_date: trade_date.value, note: note.value
  }])
  if(error) message.value='❌ 写入失败: '+error.message
  else{ message.value='✅ 写入成功，跳转中...'; setTimeout(()=>router.push('/dangri'),800) }
}
</script>

<style scoped>
body{margin:0;font-family:'Segoe UI',sans-serif;background:radial-gradient(circle at center,#002b36,#000);color:#00ff99;display:flex;justify-content:center;align-items:flex-start;padding-top:40px;}
.form-box{background:rgba(0,0,0,0.8);box-shadow:0 0 20px #00ff99;padding:30px;border-radius:10px;box-shadow:0 0 20px #00ff99;width:400px;}
h2{text-align:center;margin-bottom:20px;}
label{display:block;margin-top:15px;margin-bottom:5px;}
input,select{width:100%;padding:10px;background:#000;color:#00ff99;border:1px solid #00ff99;border-radius:4px;}
button{margin-top:20px;width:100%;padding:12px;background:#00ff99;color:#000;border:none;border-radius:6px;cursor:pointer;font-weight:bold;}
button:hover{background:#00ffcc;}
.message{margin-top:20px;font-size:0.95em;text-align:center;}
</style>