<template>
  <div class="container">
    <h2>添加交易</h2>
    <input v-model="symbol" placeholder="股票代码">
    <input v-model.number="quantity" type="number" placeholder="数量">
    <input v-model.number="price" type="number" placeholder="价格">
    <button @click="handleSubmit">提交</button>
    <p v-if="msg">{{ msg }}</p>
    <p v-if="error" style="color:red">{{ error }}</p>
  </div>
  <div class="footer">© 魔都万事屋™ • 版本 v1.0.5</div>
</template>

<script setup>
import { ref } from 'vue';
import { supabase } from '../supabaseClient';
import { useRouter } from 'vue-router';

const router = useRouter();
const symbol = ref('');
const quantity = ref(null);
const price = ref(null);
const msg = ref('');
const error = ref('');

async function handleSubmit() {
  if (!symbol.value || !quantity.value || !price.value) {
    error.value = '请完整填写';
    return;
  }
  const { data, error: insertError } = await supabase.from('trades').insert({
    symbol: symbol.value,
    quantity: quantity.value,
    price: price.value
  });
  if (insertError) {
    error.value = insertError.message;
  } else {
    msg.value = '已提交！即将跳转...';
    setTimeout(() => router.push('/dashboard'), 800);
  }
}
</script>

<style scoped>
.container {
  margin: 120px auto 0;
  width: 400px;
  display:flex;
  flex-direction:column;
  gap:14px;
  background:#000;
  padding:40px;
  border-radius:10px;
  box-shadow:0 0 20px #00ff99;
  color:#00ff99;
}
input {
  padding:10px;
  border:none;
  border-radius:6px;
}
button {
  padding:12px;
  background:#00ff99;
  border:none;
  color:#002b36;
  font-weight:bold;
  border-radius:8px;
  cursor:pointer;
}
.footer {
  text-align:center;
  margin-top:32px;
  color:#00ff99;
}
</style>
