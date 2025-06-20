
<template>
  <HeaderBar/>
  <!-- KPI -->
  <section class="kpi">
    <KpiCard v-for="k in kpis" :key="k.title" :title="k.title" :value="k.value" @click="k.click"/>
  </section>

  <div class="divider"/>
  <div class="record-toolbar">
    <button class="outline" @click="goToRecord">添加交易</button>
  </div>

  <!-- 饼图区 -->
  <section class="charts">
    <canvas id="gainChart" width="300" height="300"/>
    <canvas id="lossChart" width="300" height="300"/>
  </section>

  <div class="divider"/>

  <!-- 交易表 -->
  <table class="records">
    <thead>
      <tr><th>时间</th><th>标的</th><th>类型</th><th>数量</th><th>价格</th><th>成交额</th><th>编辑</th><th>删除</th></tr>
    </thead>
    <tbody>
      <tr v-for="r in rows" :key="r.id">
        <td>{{ r.time }}</td><td>{{ r.symbol }}</td><td>{{ r.type }}</td>
        <td>{{ r.qty }}</td><td>{{ r.price }}</td><td>{{ r.amount }}</td>
        <td><button class="outline" @click="edit(r)">编辑</button></td>
        <td><button class="outline" @click="remove(r.id)">删除</button></td>
      </tr>
    </tbody>
  </table>

  <div class="divider"/>
  <footer class="footer">本站功能逐步完善中… © 魔都万事屋™ 2005–2025 • Version v1.2.8</footer>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import HeaderBar from '../components/HeaderBar.vue';
import KpiCard from '../components/KpiCard.vue';
import { useRouter } from 'vue-router';

const router = useRouter();

const rows = ref([]);
const kpis = ref([
  {title:'总市值', value:'0.00', click:()=>{}},
  {title:'盈利仓位', value:'--', click:()=>{}},
  {title:'亏损仓位', value:'--', click:()=>{}},
  {title:'持仓数', value:'--', click:()=>{}},
  {title:'盈利标的', value:'--', click:()=>{}},
  {title:'亏损标的', value:'--', click:()=>{}},
  {title:'MTD', value:'--', click:()=>{}},
  {title:'YTD', value:'--', click:()=>{}},
  {title:'当日交易', value:'--', click:()=>{}}
]);

function goToRecord(){ router.push('/record'); }
function edit(row){ router.push({ path:'/record', query:{ editId:row.id }}); }
function remove(id){ alert('删除示例：'+id); }

onMounted(()=>{
  // 示例数据
  rows.value=[{id:1,time:'2025-01-01',symbol:'AAPL',type:'Buy',qty:10,price:150,amount:1500}];
});
</script>

<style scoped>
.kpi{display:flex;flex-wrap:wrap;justify-content:center;}
.record-toolbar{text-align:center;margin:16px 0;}
.charts{display:flex;justify-content:center;gap:32px;flex-wrap:wrap;}
.records{width:100%;text-align:center;border-collapse:collapse;}
.records th,.records td{padding:6px 8px;color:var(--theme-green);}
</style>
