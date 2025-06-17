<template>
  <div class="record-container">
    <div class="record-form">
      <h2>录入交易</h2>
      <form @submit.prevent="submitTrade">
        <div><label>股票代码</label><input v-model="symbol" required/></div>
        <div><label>数量</label><input v-model.number="quantity" type="number" required/></div>
        <div><label>价格</label><input v-model.number="price" type="number" step="0.01" required/></div>
        <button type="submit">提交</button>
      </form>
    </div>
  </div>
  <div class="footer">
    © 魔都万事屋™ 2005 – 2025 版权所有 • 保留所有权利 • MagicCity Global Tec • 版本 0.750
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { supabase } from '@/supabaseClient';

const router = useRouter();
const symbol = ref('');
const quantity = ref(0);
const price = ref(0);

async function submitTrade() {
  const { data, error } = await supabase.from('transactions').insert([{
    symbol: symbol.value,
    quantity: quantity.value,
    price: price.value
  }]);
  console.log(data, error);
  router.push('/dashboard');
}
</script>

<style scoped>
.record-container {display:flex;justify-content:center;padding:40px 0;}
.record-form {background:#000;color:#00ff99;padding:30px;border-radius:10px;width:400px;}
.record-form div {margin-bottom:15px;}
.record-form label {display:block;margin-bottom:5px;}
.record-form input {width:100%;padding:8px;background:#111;border:1px solid #00ff99;color:#fff;}
.record-form button {background:#00ff99;color:#000;padding:10px 20px;border:none;border-radius:5px;}
.footer {text-align:center;color:#888;margin-top:20px;font-size:0.9rem;}
</style>
