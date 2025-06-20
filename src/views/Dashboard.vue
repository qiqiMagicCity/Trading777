
<template>
  <div class="dashboard-page">
    <!-- 顶部栏 -->
    <header class="top-bar">
      <div class="time-group">
        <span class="time-item">NY {{ times.ny }}</span>
        <span class="time-item">VLC {{ times.vlc }}</span>
        <span class="time-item">SHA {{ times.sha }}</span>
      </div>
      <div class="user-group">
        <span class="user-email">{{ userEmailPrefix }}</span>
        <button class="logout-btn" @click="logout">退出登录</button>
      </div>
    </header>

    <!-- KPI 指标模块 -->
    <section class="kpi-section">
      <div class="kpi-card" v-for="k in kpiList" :key="k.key" @click="handleCardClick(k.key)">
        <div class="kpi-title">{{ k.title }}</div>
        <div class="kpi-value">
          <span v-if="loading">{{ k.loadingText }}</span>
          <span v-else :class="{ positive: k.value > 0, negative: k.value < 0 }">
            {{ formatValue(k.value, k.emptyText) }}
          </span>
        </div>
      </div>
    </section>

    <!-- 详细弹窗 -->
    <div v-if="dialog.visible" class="dialog-mask" @click.self="dialog.visible=false">
      <div class="dialog-box">
        <header class="dialog-header">
          <span>{{ dialog.title }}</span>
          <button class="dialog-close" @click="dialog.visible=false">X</button>
        </header>
        <div class="dialog-body">
          <template v-if="dialog.rows.length">
            <table>
              <thead><tr><th v-for="h in dialog.headers" :key="h">{{ h }}</th></tr></thead>
              <tbody>
                <tr v-for="(row, idx) in dialog.rows" :key="idx">
                  <td v-for="cell in row">{{ cell }}</td>
                </tr>
              </tbody>
            </table>
          </template>
          <p v-else>暂无数据</p>
        </div>
      </div>
    </div>

    <!-- 页脚 -->
    <footer class="footer">
      <span class="grey">本站功能逐步完善中，敬请期待。对本站感兴趣的可以联系站长共同创建</span>
      <span class="green">© 魔都万事屋™</span>
      <span class="green">2005 – 2025 版权所有 • 保留所有权利 • MagicCity Global Tec</span>
      <span class="green">版本 v1.3.0</span>
    </footer>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { supabase } from '@/supabaseClient'

/** 顶部时间显示 **/
const times = ref({ ny: '--:--:--', vlc: '--:--:--', sha: '--:--:--' })
let timeTimer = null
function updateTimes(){
  const now = Date.now()
  times.value = {
    ny: new Intl.DateTimeFormat('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZone:'America/New_York'}).format(now),
    vlc: new Intl.DateTimeFormat('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZone:'Europe/Madrid'}).format(now),
    sha: new Intl.DateTimeFormat('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZone:'Asia/Shanghai'}).format(now)
  }
}

/** 用户信息 **/
const userEmailPrefix = ref('User')
async function fetchUserInfo(){
  const { data: { user } } = await supabase.auth.getUser()
  if(user && user.email){
    userEmailPrefix.value = user.email.split('@')[0]
  }
}

/** KPI 数据 **/
const kpiList = ref([
  { key:'positionCost', title:'账户持仓成本', value:null, loadingText:'加载中...', emptyText:'暂无数据' },
  { key:'todayPnL', title:'当天盈亏统计', value:null, loadingText:'加载中...', emptyText:'暂无数据' },
  { key:'todayFloatPnL', title:'当日浮盈浮亏', value:null, loadingText:'加载中...', emptyText:'暂无数据' },
  { key:'todayTrades', title:'当日交易次数', value:null, loadingText:'加载中...', emptyText:'暂无数据' },
  { key:'totalTrades', title:'累计交易笔数', value:null, loadingText:'加载中...', emptyText:'暂无数据' },
  { key:'mtdPnL', title:'MTD（月度盈亏）', value:null, loadingText:'加载中...', emptyText:'暂无数据' },
  { key:'ytdPnL', title:'YTD（年度盈亏）', value:null, loadingText:'加载中...', emptyText:'暂无数据' },
  { key:'intradayPnL', title:'日内盈亏', value:null, loadingText:'加载中...', emptyText:'暂无数据' }
])
const loading = ref(true)

function formatValue(val, empty){
  if(val === null || val === undefined){ return empty }
  return typeof val === 'number' ? val.toFixed(2) : val
}

async function fetchKPI(){
  loading.value = true
  try{
    // TODO: 真实实现 - 以下仅为示例占位
    kpiList.value.forEach(k=>k.value=null)
    // 示例: 模拟请求
    await new Promise(r=>setTimeout(r,500))
    // 假数据
    const demo = { positionCost: 12345.67, todayPnL: -120.55, todayFloatPnL: 89.12, todayTrades: 5, totalTrades: 120,
                   mtdPnL: 345.88, ytdPnL: -2345.66, intradayPnL: 45.00 }
    kpiList.value.forEach(k=>k.value = demo[k.key] ?? null)
  }catch(e){
    console.error(e)
    // 处理失败提示
    kpiList.value.forEach(k=>k.value='数据加载失败，请刷新页面')
  }finally{
    loading.value = false
  }
}

/** 刷新定时器 **/
let refreshTimer = null

onMounted(()=>{
  updateTimes()
  timeTimer = setInterval(updateTimes, 1000)
  fetchUserInfo()
  fetchKPI()
  refreshTimer = setInterval(fetchKPI, 30000)
})

onBeforeUnmount(()=>{
  clearInterval(timeTimer)
  clearInterval(refreshTimer)
})

/** 退出登录 **/
async function logout(){
  await supabase.auth.signOut()
  window.location.href = '/login'
}

/** 弹窗逻辑 **/
const dialog = ref({ visible:false, title:'', headers:[], rows:[] })
function handleCardClick(key){
  // 根据 key 填充详细数据
  dialog.value = {
    visible:true,
    title: kpiList.value.find(k=>k.key===key)?.title || '',
    headers:['字段','值'],
    rows:[['示例','暂无数据']]
  }
}
</script>

<style scoped>
.dashboard-page{
  display:flex;
  flex-direction:column;
  min-height:100vh;
  color:#00ff99;
  background:#000;
  align-items:center;
  font-family:'Segoe UI',sans-serif;
}
.top-bar{
  width:100%;
  background:#001a18;
  color:#00ff99;
  display:flex;
  justify-content:space-between;
  align-items:center;
  padding:10px 20px;
  box-shadow:0 2px 6px rgba(0,0,0,.6);
}
.time-item{ margin-right:12px; }
.user-group{ display:flex; align-items:center; }
.logout-btn{
  margin-left:12px;
  padding:6px 12px;
  background:#00352f;
  border:none;
  border-radius:6px;
  color:#00ff99;
  cursor:pointer;
}
.logout-btn:hover{ background:#005348; }

.kpi-section{
  display:flex;
  flex-wrap:wrap;
  justify-content:center;
  gap:16px;
  margin-top:40px;
  max-width:1200px;
}
.kpi-card{
  background:#000;
  border:1px solid #00ff99;
  border-radius:8px;
  width:160px;
  height:120px;
  display:flex;
  flex-direction:column;
  justify-content:center;
  align-items:center;
  cursor:pointer;
  position:relative;
  box-shadow:0 0 12px #00ff9933;
}
.kpi-title{
  font-size:16px;
  font-weight:bold;
  margin-bottom:4px;
  text-align:center;
}
.kpi-value{
  font-size:24px;
  text-align:center;
}
.positive{ color:#00ff99; }
.negative{ color:#ff4b4b; }

.dialog-mask{
  position:fixed;
  left:0;top:0;right:0;bottom:0;
  background:rgba(0,0,0,.4);
  display:flex;
  justify-content:center;
  align-items:center;
  z-index:999;
}
.dialog-box{
  background:#fff;
  color:#000;
  border-radius:10px;
  width:90%;
  max-width:600px;
  max-height:80vh;
  display:flex;
  flex-direction:column;
  box-shadow:0 0 20px rgba(0,0,0,.6);
}
.dialog-header{
  display:flex;
  justify-content:space-between;
  align-items:center;
  padding:12px 16px;
  font-weight:bold;
  border-bottom:1px solid #ddd;
}
.dialog-body{
  padding:16px;
  overflow:auto;
}
.dialog-close{
  background:none;
  border:none;
  font-size:18px;
  cursor:pointer;
}
.footer{
  margin-top:auto;
  background:#001a18;
  width:100%;
  text-align:center;
  padding:10px 0;
  font-size:12px;
}
.green{ color:#00ff99; }
.grey{ color:#888; }
</style>
