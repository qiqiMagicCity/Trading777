<template>
  <div class="page">
    <div class="auth-box">
      <h2>添加交易</h2>
      <input v-model="symbol" placeholder="股票代码" />
      <input v-model.number="quantity" placeholder="数量" />
      <input v-model.number="price" placeholder="价格" />
      <button @click="submit">提交</button>
      <p v-if="info" style="color:#00ff99">{ info }</p>
      <p v-if="err" class="error-msg">{ err }</p>
    </div>
  </div>
  <FooterBar />
</template>
<script setup>
import FooterBar from '@/components/FooterBar.vue';
import { ref } from 'vue';
import { supabase } from '../supabaseClient';
import { useRouter } from 'vue-router';
const symbol = ref(''), quantity = ref(null), price = ref(null), info = ref(''), err = ref(''), router = useRouter();
async function submit() {
  if (!symbol.value || !quantity.value || !price.value) { err.value='请完整填写'; return; }
  const { error } = await supabase.from('trades').insert({ symbol:symbol.value, quantity:quantity.value, price:price.value });
  if (error) err.value = error.message; else { info.value='记录已添加'; setTimeout(()=>router.push('/dashboard'),1000); }
}
</script>
<style src="../styles/base.css"></style>
