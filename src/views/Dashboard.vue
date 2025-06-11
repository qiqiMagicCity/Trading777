<template>
  <div>
    <div class="header" id="headerTitle">📊 加载中...</div>
    <div v-if="!user" class="section">
      ⚠️ 用户未登录，无法加载数据。
    </div>
    <div v-else>
      <div class="section">
        <h3>账户汇总</h3>
        <div v-html="accountSummary"></div>
      </div>
      <div class="section">
        <h3>当前持仓</h3>
        <table>
          <thead>
            <tr><th>标的</th><th>名称</th><th>持仓</th><th>均价</th><th>当前价</th><th>浮动盈亏</th></tr>
          </thead>
          <tbody>
            <tr v-for="pos in positions" :key="pos.symbol">
              <td>{{pos.symbol}}</td><td>{{pos.name}}</td><td>{{pos.qty}}</td>
              <td>{{pos.avg.toFixed(2)}}</td><td>{{pos.now}}</td><td>{{pos.profit}}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="section">
        <h3>今日交易记录明细</h3>
        <table>
          <thead>
            <tr><th>标的</th><th>方向</th><th>单价</th><th>数量</th><th>金额</th><th>日期</th><th>备注</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in todayRecords" :key="r.id">
              <td>{{r.symbol}}</td><td>{{r.side}}</td><td>{{r.price}}</td>
              <td>{{r.quantity}}</td><td>{{r.amount}}</td><td>{{r.trade_date}}</td><td>{{r.note}}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="section">
        <h3>盈亏结构分析图</h3>
        <canvas id="pieChart" width="400" height="300"></canvas>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { createClient } from '@supabase/supabase-js'
import Chart from 'chart.js/auto'

const supabase = createClient(
  'https://zcosfwmtatuheqrytvad.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpjb3Nmd210YXR1aGVxcnl0dmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk0MTE0ODUsImV4cCI6MjA2NDk4NzQ4NX0.y5T5cf8BNsbbM5Va0kjHX1i359J1aAB4RYO6p16TKqk'
)

const user = ref(null)
const records = ref([])
const positions = ref([])
const todayRecords = ref([])
const accountSummary = ref('加载中...')
const currentPriceMap = { AAPL:190, NVDA:130, TSLA:180, MSFT:430, AMZN:130 }

async function loadDashboard() {
  const { data: udata } = await supabase.auth.getUser()
  user.value = udata?.user
  if (!user.value) return
  document.getElementById('headerTitle').innerText = `📊 ${user.value.email.split('@')[0]} 的账户统计`
  const { data: rec } = await supabase.from('records').select('*').eq('user_id', user.value.id)
  records.value = rec || []
  // compute positions and summary
  const holdings = {}
  let totalAmount = 0
  for (const r of records.value) {
    if (!holdings[r.symbol]) holdings[r.symbol] = { symbol:r.symbol, name:r.name, qty:0, cost:0 }
    if (r.side==='BOUGHT') {
      holdings[r.symbol].qty += r.quantity
      holdings[r.symbol].cost += r.price * r.quantity
    } else {
      holdings[r.symbol].qty -= r.quantity
      holdings[r.symbol].cost -= (holdings[r.symbol].cost / (holdings[r.symbol].qty + r.quantity)) * r.quantity
    }
    totalAmount += r.amount
  }
  positions.value = Object.values(holdings).filter(h=>h.qty>0).map(h=>{
    const avg = h.cost / h.qty
    const now = currentPriceMap[h.symbol]||avg
    const profit = ((now-avg)*h.qty).toFixed(2)
    return { ...h, avg, now, profit }
  })
  // summary html
  const today = new Date().toISOString().slice(0,10)
  const todayCount = records.value.filter(r=>r.trade_date===today).length
  accountSummary.value = `
    总成交金额：$${totalAmount.toFixed(2)}<br/>
    当日交易次数：${todayCount} 次<br/>
    历史总交易次数：${records.value.length} 次<br/>
    当前持仓股票数量：${positions.value.length} 个
  `
  // today records
  todayRecords.value = records.value.filter(r=>r.trade_date===today)
  // pie chart
  const ctx = document.getElementById('pieChart').getContext('2d')
  new Chart(ctx, { type:'pie', data:{ labels:positions.value.map(p=>p.symbol), datasets:[{ data: positions.value.map(p=>Number(p.profit)), backgroundColor: positions.value.map(p=>p.profit>=0?'#00ff99':'#ff3366') }] }, options:{ plugins:{ legend:{ labels:{ color:'#00ff99' } } } } })
}

onMounted(loadDashboard)
</script>

<style scoped>
body { margin:0; font-family:'Segoe UI',sans-serif; background:radial-gradient(circle at center, #002b36, #000); color:#00ff99; }
.header { padding:20px; text-align:center; font-size:1.8em; font-weight:bold; }
.section { margin:20px; background:rgba(0,0,0,0.8); border-radius:10px; box-shadow:0 0 20px #00ff99; padding:20px; }
h3 { margin-top:0; }
table { width:100%; border-collapse:collapse; margin-top:10px; }
th,td { border:1px solid #00ff99; padding:8px; text-align:center; }
canvas { background:rgba(0,0,0,0.8); border-radius:10px; margin-top:10px; }
</style>