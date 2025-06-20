
<template>
  <div class="page dashboard-page">
    <!-- HeaderBar 顶栏 -->
    <div class="header-bar">
      <div class="timezones">
        <div class="timezone">纽约 (UTC-4): {{ tzNewYork }}</div>
        <div class="timezone">瓦伦西亚 (UTC+2): {{ tzValencia }}</div>
        <div class="timezone">上海 (UTC+8): {{ tzShanghai }}</div>
      </div>
      <div class="user-controls">
        <span class="username">{{ username }}</span>
        <button class="btn-outline" @click="handleLogout">退出</button>
      </div>
    </div>

    <!-- KPI 汇总区 -->
    <div class="kpi-grid">
      <div class="kpi-card" v-for="metric in metricsList" :key="metric.key">
        <div class="kpi-title">{{ metric.title }}</div>
        <div
          class="kpi-value"
          :class="{ positive: metric.value >= 0, negative: metric.value < 0 }"
        >
          {{ metric.display }}
        </div>
      </div>
    </div>

    <!-- 添加交易按钮 -->
    <div class="record-toolbar">
      <button class="btn-outline" @click="goRecord" :disabled="!session">
        添加交易
      </button>
    </div>

    <!-- 盈亏饼图区 -->
    <div class="charts">
      <div class="chart-container">
        <canvas id="profitChart"></canvas>
      </div>
      <div class="chart-container">
        <canvas id="lossChart"></canvas>
      </div>
    </div>

    <!-- 交易记录表 -->
    <div class="records-table">
      <table>
        <thead>
          <tr>
            <th>时间</th>
            <th>标的</th>
            <th>类型</th>
            <th>数量</th>
            <th>价格</th>
            <th>成交额</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="rec in records" :key="rec.id">
            <td>{{ formatDate(rec.inserted_at) }}</td>
            <td>
              <a @click.prevent="goSymbol(rec.symbol)" href="#">{{ rec.symbol }}</a>
            </td>
            <td>{{ rec.type }}</td>
            <td>{{ rec.quantity }}</td>
            <td>{{ rec.price.toFixed(2) }}</td>
            <td>{{ (rec.quantity * rec.price).toFixed(2) }}</td>
            <td>
              <button @click="editRecord(rec.id)" class="btn-outline btn-small">编辑</button>
              <button @click="deleteRecord(rec.id)" class="btn-outline btn-small">删除</button>
            </td>
          </tr>
          <tr v-if="records.length === 0">
            <td colspan="7" style="text-align:center;">暂无交易记录</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Footer -->
    <div class="footer">
      <hr class="divider"/>
      <div>本站功能逐步完善中，敬请期待。对本站感兴趣的可以联系站长共同创建</div>
      <div>© 魔都万事屋™ 2005 – 2025 版权所有 • 保留所有权利 • MagicCity Global Tec</div>
      <div>版本 v1.3.0</div>
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
const tzNewYork = ref('');
const tzValencia = ref('');
const tzShanghai = ref('');
const username = ref('User');
const session = ref(null);
const metricsList = ref([]);
const records = ref([]);

function updateTimezones() {
  const now = new Date();
  tzNewYork.value = now.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  tzValencia.value = now.toLocaleString('en-ES', {
    timeZone: 'Europe/Madrid',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  tzShanghai.value = now.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

async function loadData() {
  // 获取 session
  const { data: { session: sess } } = await supabase.auth.getSession();
  session.value = sess;
  // 用户名
  const user = supabase.auth.user();
  username.value = user?.user_metadata?.full_name || user?.email || 'User';

  // 1. 账户总持仓成本 Σ(cost_per_share * qty)
  const { data: positions } = await supabase
    .from('positions')
    .select('symbol,cost_per_share,qty');

  const totalCost = positions?.reduce((sum, p) => sum + p.cost_per_share * p.qty, 0) || 0;

  // 2. 日内交易盈亏 Σ(今日已平仓交易盈亏)
  const today = new Date().toISOString().split('T')[0];
  const { data: trades } = await supabase
    .from('trades')
    .select('*')
    .gte('inserted_at', `${today}T00:00:00.000Z`)
    .lte('inserted_at', `${today}T23:59:59.999Z`);
  const closed = trades?.filter(t => ['Sell','Cover'].includes(t.type)) || [];
  const dailyPL = closed.reduce((sum, t) => sum + (t.quantity * t.price * (t.type==='Sell'||t.type==='Cover'?1:-1)), 0);

  // 3. 历史持仓当日浮盈/浮亏
  const unrealized = positions?.map(p => {
    // TODO: 获取昨日收盘价 yesterdayClose
    const yesterdayClose = 0; // placeholder
    // TODO: fetchQuote for current price
    const current = 0;
    const floatPL = (current - yesterdayClose) * p.qty;
    return floatPL;
  });
  const totalUnrealized = unrealized?.reduce((a,b)=>a+b,0) || 0;

  // 4. 当日交易次数
  const dailyCount = trades?.length || 0;
  // 5. 累计交易次数
  const { count: totalCount } = await supabase.from('trades').select('*', { count: 'exact', head: true });
  // 6. 盈利标的数量 & 列表
  const profitSyms = positions?.filter(p => {
    // TODO: compute total P&L per symbol
    return false;
  }).map(p => p.symbol) || [];
  // 7. 亏损标的数量
  const lossSyms = positions?.filter(p => false).map(p => p.symbol) || [];
  // 8. 本月盈利总和 (已实现+未实现)
  const mtd = 0; // placeholder
  // 9. 本年盈利总和
  const ytd = 0;

  metricsList.value = [
    { key: 'totalCost', title: '账户总持仓成本', value: totalCost, display: `$${totalCost.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}` },
    { key: 'dailyPL', title: '日内交易盈亏', value: dailyPL, display: `${dailyPL>=0?'+':''}$${dailyPL.toFixed(2)}` },
    { key: 'unrealized', title: '历史持仓当日浮盈/浮亏', value: totalUnrealized, display: `${totalUnrealized>=0?'+':''}$${totalUnrealized.toFixed(2)}` },
    { key: 'dailyCount', title: '当日交易次数', value: dailyCount, display: dailyCount },
    { key: 'totalCount', title: '累计交易次数', value: totalCount, display: totalCount },
    { key: 'profitSyms', title: '盈利标的数量', value: profitSyms.length, display: profitSyms.length },
    { key: 'lossSyms', title: '亏损标的数量', value: lossSyms.length, display: lossSyms.length },
    { key: 'mtd', title: '本月盈利总和', value: mtd, display: mtd || '$0.00' },
    { key: 'ytd', title: '本年盈利总和', value: ytd, display: ytd || '$0.00' },
  ];

  // 交易记录
  records.value = trades?.sort((a,b)=>new Date(b.inserted_at)-new Date(a.inserted_at)) || [];

  // 初始化图表（可选：在真正绘制时再调用）
  // TODO: draw Chart.js pie charts
}

function formatDate(dt) {
  const d = new Date(dt);
  return d.toLocaleString();
}

function handleLogout() {
  supabase.auth.signOut();
  router.push('/login');
}

function goRecord() {
  router.push('/record');
}

function goSymbol(sym) {
  router.push(`/symbol/${sym}`);
}

function editRecord(id) {
  router.push(`/record?editId=${id}`);
}

async function deleteRecord(id) {
  if (confirm('确认删除该记录？')) {
    await supabase.from('trades').delete().eq('id', id);
    await loadData();
  }
}

onMounted(() => {
  updateTimezones();
  setInterval(updateTimezones, 1000);
  loadData();
});
</script>

<style scoped>
/* 如需局部样式，可在此处补充 */
</style>
