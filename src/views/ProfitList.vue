
<template>
  <div class="page">
    <h2>盈利标的列表</h2>
    <table>
      <thead><tr><th>标的</th><th>当前浮盈</th><th>占比</th></tr></thead>
      <tbody>
        <tr v-for="item in list" :key="item.symbol">
          <td>{{ item.symbol }}</td>
          <td>{{ item.profit.toFixed(2) }}</td>
          <td>{{ (item.percent*100).toFixed(1) }}%</td>
        </tr>
        <tr v-if="list.length===0"><td colspan="3">暂无盈利标的</td></tr>
      </tbody>
    </table>
  </div>
</template>
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
    const profit = (quote.c - p.cost_per_share) * p.qty;
    if (profit>0) {
      temp.push({ symbol: p.symbol, profit, percent: profit/total });
    }
    total += profit;
  }
  // recalc percent
  list.value = temp.map(i=>({...i, percent: total? i.profit/total:0}));
}
onMounted(load);
</script>
