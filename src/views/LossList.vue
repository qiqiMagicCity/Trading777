
<template>
  <div class="page">
    <h2>亏损标的列表</h2>
    <table>
      <thead><tr><th>标的</th><th>当前浮亏</th><th>占比</th></tr></thead>
      <tbody>
        <tr v-for="item in list" :key="item.symbol">
          <td>{{ item.symbol }}</td>
          <td>{{ item.loss.toFixed(2) }}</td>
          <td>{{ (item.percent*100).toFixed(1) }}%</td>
        </tr>
        <tr v-if="list.length===0"><td colspan="3">暂无亏损标的</td></tr>
      </tbody>
    </table>
  </div>
  <div class="footer">
    <div class="footer-line">本站功能逐步完善中，敬请期待。对本站感兴趣的可以联系站长共同创建</div>
    <div class="footer-line">© 魔都万事屋™</div>
    <div class="footer-line">2005 – 2025 版权所有 • 保留所有权利 • MagicCity Global Tec</div>
    <div class="footer-line">版本 v1.3.8</div>
  </div>
</template></template>
<script setup>
import { ref, onMounted } from 'vue';
import { supabase } from '@/supabaseClient';
import { fetchQuote } from '@/services/finnhubService';
const list = ref([]);
async function load() {
  const { data: positions } = await supabase.from('positions').select('*');
  let total = 0;
  const temp = [];
  for (const p of positions) {
    const quote = await fetchQuote(p.symbol);
    const loss = (quote.c - p.cost_per_share) * p.qty;
    if (loss<0) {
      temp.push({ symbol: p.symbol, loss: -loss, percent: -loss/total });
    }
    total += -loss;
  }
  list.value = temp.map(i=>({...i, percent: total? i.loss/total:0}));
}
onMounted(load);
</script>
