
<template>
  <div class="page dashboard-page">
    <div class="header-bar">
      <div class="timezones">
        <div>{{ tz.NewYork }}</div>
        <div>{{ tz.Valencia }}</div>
        <div>{{ tz.Shanghai }}</div>
      </div>
      <div class="user-controls">
        <span>{{ username }}</span>
        <button class="btn-logout" @click="logout">退出</button>
      </div>
    </div>

    <div class="kpi-grid">
      <div
        class="kpi-card"
        v-for="m in metricsList"
        :key="m.key"
        :class="{clickable: m.key==='profitSyms' || m.key==='lossSyms'}"
        @click="handleKpiClick(m.key)"
      >
        <div class="kpi-value" :class="{positive: m.value>=0, negative: m.value<0}">
          {{ m.display }}
        </div>
        <div class="kpi-title">{{ m.title }}</div>
      </div>
    </div>

    <button class="fab" @click="toRecord" :disabled="!session">+</button>

    <div class="footer">
      <div class="footer-line line-gray">本站功能逐步完善中，敬请期待。对本站感兴趣的可以联系站长共同创建</div>
      <div class="footer-line line-gray">© 魔都万事屋™</div>
      <div class="footer-line line-green">2005 – 2025 版权所有 • 保留所有权利 • MagicCity Global Tec</div>
      <div class="footer-line line-green">版本 v1.3.4</div>
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { supabase } from '../supabaseClient.js';
import { fetchQuote } from '../services/finnhubService.js';

const router = useRouter();
const tz = ref({ NewYork:'', Valencia:'', Shanghai:'' });
const username = ref('');
const session = ref(null);
const metricsList = ref([]);

function updateTime() {
  const now = new Date();
  tz.value.NewYork = '纽约 (UTC-4): ' + now.toLocaleString('en-US', { timeZone:'America/New_York', hour12:false });
  tz.value.Valencia = '瓦伦西亚 (UTC+2): ' + now.toLocaleString('en-ES', { timeZone:'Europe/Madrid', hour12:false });
  tz.value.Shanghai = '上海 (UTC+8): ' + now.toLocaleString('zh-CN', { timeZone:'Asia/Shanghai', hour12:false });
}

function logout() {
  supabase.auth.signOut();
  router.push('/login');
}

function toRecord() {
  router.push('/record');
}

function handleKpiClick(key) {
  if (key==='profitSyms') router.push('/profit');
  else if (key==='lossSyms') router.push('/loss');
}

function formatNum(num) {
  return num.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2});
}

async function loadData() {
  const { data:{ session: sess } } = await supabase.auth.getSession();
  session.value = sess;
  const user = supabase.auth.user();
  username.value = user?.user_metadata?.full_name || user?.email.split('@')[0] || 'User';

  const { data: positions } = await supabase.from('positions').select('symbol,cost_per_share,qty');
  const { data: trades } = await supabase.from('trades').select('*');
  const totalCost = positions.reduce((s,p)=>s+p.cost_per_share*p.qty,0);
  const today = new Date().toISOString().slice(0,10);
  const todays = trades.filter(t=>t.inserted_at.startsWith(today));
  const dailyPL = todays.reduce((s,t)=>{
    const sign = ['Sell','Cover'].includes(t.type) ? 1 : -1;
    return s + t.price*t.quantity*sign;
  },0);
  const unreal = 0;
  const dailyCount = todays.length;
  const { count: totalCount } = await supabase.from('trades').select('*',{head:true,count:'exact'});
  const profitSymsArr = positions.filter(p=> (0-p.cost_per_share)*p.qty>0).map(p=>p.symbol);
  const lossSymsArr = positions.filter(p=> (0-p.cost_per_share)*p.qty<0).map(p=>p.symbol);
  const mtd=0, ytd=0;

  metricsList.value = [
    { key:'totalCost', title:'账户总持仓成本', value: totalCost, display:'$'+formatNum(totalCost) },
    { key:'dailyPL', title:'日内交易盈亏', value: dailyPL, display:(dailyPL>=0?'+':'')+'$'+dailyPL.toFixed(2) },
    { key:'unrealized', title:'当日浮盈/浮亏', value: unreal, display:(unreal>=0?'+':'')+'$'+unreal.toFixed(2) },
    { key:'dailyCount', title:'当日交易次数', value: dailyCount, display: dailyCount },
    { key:'totalCount', title:'累计交易次数', value: totalCount, display: totalCount },
    { key:'profitSyms', title:'盈利标的数量', value: profitSymsArr.length, display: profitSymsArr.length },
    { key:'lossSyms', title:'亏损标的数量', value: lossSymsArr.length, display: lossSymsArr.length },
    { key:'mtd', title:'本月盈利总和', value: mtd, display:'$'+formatNum(mtd) },
    { key:'ytd', title:'本年盈利总和', value: ytd, display:'$'+formatNum(ytd) },
  ];
  updateTime();
  setInterval(updateTime,1000);
}

onMounted(loadData);
</script>

<style scoped>
</style>
