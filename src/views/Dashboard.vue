<template>
  <HeaderBar/>
  <HeaderBar/>
  <HeaderBar/>
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
  <span class="green">版本 v1.2.5</span>
</div>
</template>


<script setup>
import { ref, onMounted } from 'vue';
import HeaderBar from '../components/HeaderBar.vue';
import KpiCard from '../components/KpiCard.vue';
import { supabase } from '../supabaseClient.js';
import { fetchQuotes, fetchProfile } from '../services/finnhubService.js';
import { kmb } from '../services/util.js';
import Chart from 'chart.js/auto';
import { useRouter } from 'vue-router';


const kpis=ref([
  {title:'账户总持仓成本',value:'--'},
  {title:'日内交易盈亏',value:'--'},
  {title:'历史持仓当日盈亏',value:'--'},
  {title:'当日交易次数',value:'--'},
  {title:'累计交易次数',value:'--'},
  {title:'盈利标的数量',value:'--',onClick:()=>showList(true)},
  {title:'亏损标的数量',value:'--',onClick:()=>showList(false)},
  {title:'本月盈利',value:'--'},
  {title:'本年盈利',value:'--'}
]);

const rows=ref([]);
const positions=ref([]);
const quotes=ref({});

function showList(isGain){
  const arr=positions.value.filter(p=>{
    const pnl=(quotes.value[p.symbol]-p.cost)*p.qty;
    return isGain? pnl>0 : pnl<0;
  }).map(p=>p.symbol).join(', ');
  alert((isGain?'盈利':'亏损')+'标的: '+(arr||'无'));
}

async function loadData(){
  // trades
  const { data:trades } = await supabase.from('trades').select('*').order('inserted_at',{ascending:false});
  rows.value=trades||[];
  // positions view (symbol, qty, cost)
  const { data:pos } = await supabase.from('positions').select('*');
  positions.value=pos||[];
  const symbols=positions.value.map(p=>p.symbol);
  quotes.value = await fetchQuotes(symbols);
  // fill table price & mv
  rows.value.forEach(r=>{
    r.price=quotes.value[r.symbol]||'--';
  });
  // KPI calculations
  const totalCost = positions.value.reduce((t,p)=>t+p.cost*p.qty,0);
  const totalMarket = positions.value.reduce((t,p)=>t+(quotes.value[p.symbol]||0)*p.qty,0);
  kpis.value[0].value = kmb(totalMarket);

  const today=new Date().toISOString().slice(0,10);
  const intradayTrades = trades.filter(t=>t.trade_date===today && t.closed);
  const intraday = intradayTrades.reduce((s,t)=>s+(t.sell_price-t.buy_price)*t.qty,0);
  kpis.value[1].value = kmb(intraday);

  const histFloat = positions.value.reduce((s,p)=>s+((quotes.value[p.symbol]||0)-p.cost)*p.qty,0);
  kpis.value[2].value = kmb(histFloat);

  kpis.value[3].value = intradayTrades.length.toString();
  kpis.value[4].value = trades.length.toString();

  const gainCnt=positions.value.filter(p=>{
    const pnl=(quotes.value[p.symbol]-p.cost)*p.qty;
    return pnl>0;
  }).length;
  const loseCnt=positions.value.filter(p=>{
    const pnl=(quotes.value[p.symbol]-p.cost)*p.qty;
    return pnl<0;
  }).length;
  kpis.value[5].value = gainCnt.toString();
  kpis.value[6].value = loseCnt.toString();

  // simple MTD/YTD using realized only as placeholder
  kpis.value[7].value = kmb(0)+'+'+kmb(histFloat);
  kpis.value[8].value = kmb(0)+'+'+kmb(histFloat);

  drawCharts();
}

function drawCharts(){
  const gain = positions.value.filter(p=> (quotes.value[p.symbol]-p.cost)>0);
  const loss = positions.value.filter(p=> (quotes.value[p.symbol]-p.cost)<0);
  const gainSum = gain.map(p=>(quotes.value[p.symbol]-p.cost)*p.qty);
  const lossSum = loss.map(p=>Math.abs((quotes.value[p.symbol]-p.cost)*p.qty));
  const gainLabels = gain.map(p=>p.symbol);
  const lossLabels = loss.map(p=>p.symbol);
  new Chart(document.getElementById('gainChart'),{
    type:'doughnut',
    data:{labels:gainLabels,datasets:[{data:gainSum}]}
  });
  new Chart(document.getElementById('lossChart'),{
    type:'doughnut',
    data:{labels:lossLabels,datasets:[{data:lossSum}]}
  });
}

async function remove(id){
  await supabase.from('trades').delete().eq('id',id);
  loadData();
}

onMounted(loadData);

const router = useRouter();
function goToRecord() {
  router.push('/record');
}
function edit(row) {
  router.push({ path: '/record', query: { editId: row.id } });
}



function goToRecord() {
  router.push('/record');
}
function edit(row) {
  router.push({ path: '/record', query: { editId: row.id } });
}


function goToRecord(){
  router.push('/record');
}
function edit(row){
  router.push({ path: '/record', query: { editId: row.id } });
}

</script>

<style src="../styles/base.css"></style>