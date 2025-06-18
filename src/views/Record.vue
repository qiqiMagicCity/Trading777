<template>
  <div class="page">
    <div class="auth-box">
      <h2>添加交易</h2>
      <input v-model="symbol" placeholder="股票代码">
      <input v-model.number="quantity" placeholder="数量">
      <input v-model.number="price" placeholder="价格">
      <button @click="submit">提交</button>
      <p v-if="info">{{ info }}</p>
      <p v-if="err" class="error-msg">{{ err }}</p>
    </div>
  </div>
  <div class="footer">
    本站功能逐步完善中，敬请期待。对本站感兴趣的可以联系站长共同创建<br/>
    © 魔都万事屋™ 2005 – 2025 版权所有 • 保留所有权利 • MagicCity Global Tec<br/>
    版本 v1.1.0
</div>
</template>

<script setup>
import { ref } from 'vue';
import { supabase } from '../supabaseClient';
import { useRouter } from 'vue-router';
const symbol = ref('');
const quantity = ref(null);
const price = ref(null);
const info = ref('');
const err = ref('');
const router = useRouter();

async function submit(){
  if(!symbol.value||!quantity.value||!price.value){
    err.value='请完整填写';
    return;
  }
  const { error } = await supabase.from('trades').insert({ symbol:symbol.value, quantity:quantity.value, price:price.value });
  if(error) err.value = error.message;
  else {
    info.value='记录已添加';
    setTimeout(()=>router.push('/dashboard'),1000);
  }
}
</script>

<style src="../styles/base.css"></style>
