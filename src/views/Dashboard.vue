
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
      <div class="kpi-card" v-for="m in metricsList" :key="m.key">
        <div :class="['kpi-value', m.value>=0?'positive':'negative']">{{ m.display }}</div>
        <div class="kpi-title">{{ m.title }}</div>
      </div>
    </div>
    <div class="charts">
      <div class="chart-container"><canvas id="profitChart"></canvas></div>
      <div class="chart-container"><canvas id="lossChart"></canvas></div>
    </div>
    <table class="records-table">
      <thead>
        <tr><th>时间</th><th>标的</th><th>类型</th><th>数量</th><th>价格</th><th>成交额</th><th>操作</th></tr>
      </thead>
      <tbody>
        <tr v-for="r in records" :key="r.id">
          <td>{{ r.inserted_at }}</td><td>{{ r.symbol }}</td><td>{{ r.type }}</td><td>{{ r.quantity }}</td><td>{{ r.price }}</td><td>{{ (r.price*r.quantity).toFixed(2) }}</td>
          <td><button @click="editRecord(r.id)">编辑</button><button @click="deleteRecord(r.id)">删除</button></td>
        </tr>
        <tr v-if="records.length===0"><td colspan="7">暂无交易记录</td></tr>
      </tbody>
    </table>
    <button class="fab" @click="toRecord">+</button>

    <div class="footer">
      <div class="footer-line">本站功能逐步完善中，敬请期待。对本站感兴趣的可以联系站长共同创建</div>
      <div class="footer-line">© 魔都万事屋™</div>
      <div class="footer-line">2005 – 2025 版权所有 • 保留所有权利 • MagicCity Global Tec</div>
      <div class="footer-line">版本 1.3.93</div>
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { supabase } from '../supabaseClient';
import { fetchQuote } from '../services/finnhubService';

const router = useRouter();
const tz = ref({NewYork:'',Valencia:'',Shanghai:''});
const username = ref('User');
const metricsList = ref([
  { key:'totalCost', title:'账户总持仓成本', display:'$0.00', value:0 },
  { key:'dailyPL', title:'日内交易盈亏', display:'$0.00', value:0 },
  { key:'unrealPL', title:'历史持仓浮盈/浮亏', display:'$0.00', value:0 },
  { key:'todayCount', title:'当日交易次数', display:'0', value:0 },
  { key:'totalCount', title:'累计交易次数', display:'0', value:0 },
  { key:'profitSymbols', title:'盈利标的数量', display:'0', value:0 },
  { key:'lossSymbols', title:'亏损标的数量', display:'0', value:0 },
  { key:'mtd', title:'本月盈利总和', display:'$0.00', value:0 },
  { key:'ytd', title:'本年盈利总和', display:'$0.00', value:0 }
]);
const records = ref([]);

function updateTime() {
  const now = new Date();
  tz.value.NewYork = now.toLocaleString('en-US',{timeZone:'America/New_York',hour12:false});
  tz.value.Valencia = now.toLocaleString('en-ES',{timeZone:'Europe/Madrid',hour12:false});
  tz.value.Shanghai = now.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
}

async function loadData() {
  updateTime(); setInterval(updateTime,1000);
  const { data } = await supabase.auth.getSession();
  if (!data.session) return router.push('/login');
  username.value = data.session.user.user_metadata.full_name || data.session.user.email.split('@')[0] || 'User';
  const { data: pos } = await supabase.from('positions').select('symbol,cost_per_share,qty');
  const { data: trds } = await supabase.from('trades').select('*').order('inserted_at',{ascending:false});
  metricsList.value[0].value = pos.reduce((s,p)=>s+p.cost_per_share*p.qty,0);
  metricsList.value[0].display = '$' + metricsList.value[0].value.toFixed(2);
  records.value = trds;
}

function logout() { supabase.auth.signOut(); router.push('/login'); }
function toRecord() { router.push('/record'); }
function editRecord(id) { router.push(`/record?editId=${id}`); }
function deleteRecord(id) { if(confirm('确认删除？')) supabase.from('trades').delete().eq('id',id).then(loadData); }

onMounted(loadData);
</script>

<style scoped>
</style>
