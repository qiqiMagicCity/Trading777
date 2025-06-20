<template>
  <div class="page">
    <div class="kpi-grid">
      <div class="kpi-card" v-for="k in kpis" :key="k.label">
        <div style="font-size:1.2rem">{{ k.value }}</div>
        <div style="font-size:.8rem">{{ k.label }}</div>
      </div>
    </div>
    <canvas id="pieChart" style="max-width:380px;margin-bottom:30px;"></canvas>
    <table style="width:90%;max-width:800px;color:#00ff99;border-collapse:collapse;">
      <thead><tr><th>标的</th><th>名称</th><th>数量</th><th>市价</th><th>市值</th><th>PnL%</th></tr></thead>
      <tbody>
        <tr v-for="p in positions" :key="p.symbol">
          <td>{{ p.symbol }}</td><td>{{ p.name }}</td><td>{{ p.qty }}</td><td>{{ p.price }}</td><td>{{ p.value }}</td><td>{{ p.pnl }}</td>
        </tr>
      </tbody>
    </table>
  </div>
  <div class="footer">
  <span class="grey">本站功能逐步完善中，敬请期待。对本站感兴趣的可以联系站长共同创建</span>
  <span class="green">© 魔都万事屋™</span>
  <span class="green">2005 – 2025 版权所有 • 保留所有权利 • MagicCity Global Tec</span>
  <span class="green">版本 v1.2.1</span>
</div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { Chart, ArcElement, Tooltip, Legend } from 'chart.js';
Chart.register(ArcElement, Tooltip, Legend);
import { fetchPrice, fetchProfile } from '../services/finnhubService';

const kpis = ref([
  { label: '总市值', value:'--' },
  { label: '盈利仓位', value:'--' },
  { label: '亏损仓位', value:'--' },
  { label: '持仓数', value:'--' }
]);
const positions = ref([]);

onMounted(async () => {
  const sample = [{ symbol:'AAPL', qty:10, cost:150 }, { symbol:'TSLA', qty:5, cost:200 }];
  let total = 0, win = 0, lose = 0;
  for (const pos of sample) {
    const { price } = await fetchPrice(pos.symbol);
    const { name } = await fetchProfile(pos.symbol);
    const value = price==='--'? '--': (price*pos.qty).toFixed(2);
    const pnl = price==='--'? '--': (((price-pos.cost)/pos.cost)*100).toFixed(1)+'%';
    positions.value.push({...pos, name, price, value, pnl});
    if (price !== '--') {
      total += price * pos.qty;
      if (price > pos.cost) {
        win++;
      } else {
        lose++;
      }
    }
  }
  kpis.value[0].value = total.toFixed(2);
  kpis.value[1].value = win;
  kpis.value[2].value = lose;
  kpis.value[3].value = positions.value.length;

  const ctx = document.getElementById('pieChart');
  new Chart(ctx, {
    type:'pie',
    data:{ labels:['盈利','亏损'], datasets:[{ data:[win||1, lose||1], backgroundColor:['#00ff99','#004d4d'] }] },
    options:{ plugins:{ legend:{ labels:{ color:'#00ff99' } } } }
  });
});
</script>
<style src="../styles/base.css"></style>
