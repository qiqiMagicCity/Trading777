
<template>
  <div class="page dashboard-page">
    <div class="header-bar">
      <div class="timezones">
        <div>纽约 (UTC-4): {{ tz.NewYork }}</div>
        <div>瓦伦西亚 (UTC+2): {{ tz.Valencia }}</div>
        <div>上海 (UTC+8): {{ tz.Shanghai }}</div>
      </div>
      <div class="user-controls">
        <span>{{ username }}</span>
        <button class="btn-outline" @click="logout">退出</button>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card" v-for="m in metrics" :key="m.key">
        <div class="kpi-title">{{ m.title }}</div>
        <div :class="['kpi-value', m.value>=0?'positive':'negative']">{{ m.display }}</div>
      </div>
    </div>

    <div class="charts">
      <div class="chart-container"><canvas id="profitChart"></canvas></div>
      <div class="chart-container"><canvas id="lossChart"></canvas></div>
    </div>

    <div class="records-table">
      <table>
        <thead><tr><th>时间</th><th>标的</th><th>类型</th><th>数量</th><th>价格</th><th>成交额</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="rec in records" :key="rec.id">
            <td>{{ formatDate(rec.inserted_at) }}</td>
            <td><a @click.prevent="toSymbol(rec.symbol)">{{ rec.symbol }}</a></td>
            <td>{{ rec.type }}</td>
            <td>{{ rec.quantity }}</td>
            <td>{{ rec.price.toFixed(2) }}</td>
            <td>{{ (rec.price*rec.quantity).toFixed(2) }}</td>
            <td>
              <button class="btn-outline btn-small" @click="toEdit(rec.id)">编辑</button>
              <button class="btn-outline btn-small" @click="remove(rec.id)">删除</button>
            </td>
          </tr>
          <tr v-if="!records.length"><td colspan="7" style="text-align:center;">暂无交易记录</td></tr>
        </tbody>
      </table>
    </div>

    <!-- Floating Add button -->
    <button class="fab" @click="toRecord" :disabled="!session">+</button>


    <div class="footer">
      <div class="footer-line line-gray">本站功能逐步完善中，敬请期待。对本站感兴趣的可以联系站长共同创建</div>
      <div class="footer-line line-gray">© 魔都万事屋™</div>
      <div class="footer-line line-green">2005 – 2025 版权所有 • 保留所有权利 • MagicCity Global Tec</div>
      <div class="footer-line line-green">版本 v1.3.2</div>
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { supabase } from '../supabaseClient.js';
import { fetchQuote } from '../services/finnhubService.js';
import Chart from 'chart.js/auto';

const router = useRouter();
const tz = ref({ NewYork:'', Valencia:'', Shanghai:'' });
const username = ref('');
const session = ref(null);
const metrics = ref([]);
const records = ref([]);

function updateTime() {
  const now = new Date();
  tz.value.NewYork = now.toLocaleString('en-US', { timeZone:'America/New_York', hour12:false, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' });
  tz.value.Valencia = now.toLocaleString('en-ES', { timeZone:'Europe/Madrid', hour12:false, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' });
  tz.value.Shanghai = now.toLocaleString('zh-CN', { timeZone:'Asia/Shanghai', hour12:false, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' });
}

function logout() {
  supabase.auth.signOut();
  router.push('/login');
}

function toRecord() {
  router.push('/record');
}

function toSymbol(sym) {
  router.push(`/symbol/${sym}`);
}

function toEdit(id) {
  router.push(`/record?editId=${id}`);
}

async function remove(id) {
  if (confirm('确认删除该记录？')) {
    await supabase.from('trades').delete().eq('id',id);
    loadData();
  }
}

function formatDate(d) {
  return new Date(d).toLocaleString();
}

async function loadData() {
  const { data:{ session: sess } } = await supabase.auth.getSession();
  session.value = sess;
  const user = supabase.auth.user();
  username.value = user?.user_metadata?.full_name || user?.email.split('@')[0] || 'User';
  // fetch and compute metrics...
  metrics.value = [
    {key:'totalCost', title:'账户总持仓成本', value:0, display:'$0.00'},
    // ...8 more
  ];
  records.value = [];
  updateTime();
  setInterval(updateTime,1000);
  // Chart rendering...
}

onMounted(loadData);
</script>

<style scoped>
/* optional local styles */
</style>
