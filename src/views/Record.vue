<template>
  <HeaderBar/>
  <HeaderBar/>
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
  <div class="footer">
  <span class="grey">本站功能逐步完善中，敬请期待。对本站感兴趣的可以联系站长共同创建</span>
  <span class="green">© 魔都万事屋™</span>
  <span class="green">2005 – 2025 版权所有 • 保留所有权利 • MagicCity Global Tec</span>
  <span class="green">版本 v1.1.2</span>
</div>

<div class="divider"/>



  <div class="divider"/>
  <footer class="footer">
    本站功能逐步完善中… © 魔都万事屋™ 2005–2025 • Version v1.2.6
  </footer>
</template>

 <script setup>
import HeaderBar from '../components/HeaderBar.vue';

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
