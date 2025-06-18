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
  <div class="footer">
    本站功能逐步完善中，敬请期待。对本站感兴趣的可以联系站长共同创建<br/>
    © 魔都万事屋™ 2005 – 2025 版权所有 • 保留所有权利 • MagicCity Global Tec<br/>
    版本 v1.0.8
  </div>
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
  const { error: insertError } = await supabase.from?.('trades').insert({
    symbol: symbol.value,
    quantity: quantity.value,
    price: price.value
  }) ?? {};
  if (insertError) {
    error.value = insertError.message;
  } else {
    msg.value = '已提交！即将跳转...';
    setTimeout(() => router.push('/dashboard'), 800);
  }
}
</script>

<style scoped src="../styles/auth.css"></style>
