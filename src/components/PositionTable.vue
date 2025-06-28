
<template>
  <div class="position-table">
    <table v-if="positions.length">
      <thead>
        <tr>
          <th>股票</th>
          <th>价格</th>
          <th>总成本</th>
          <th>盈亏平衡点</th>
          <th>持仓成本</th>
          <th>当日涨跌</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in positions" :key="p.symbol">
          <td class="sym">
            <img :src="p.logo" alt="" class="logo" v-if="p.logo"/>
            <div class="code">{{ p.symbol }}</div>
            <div class="qty">{{ formatQty(p.qty) }}</div>
          </td>
          <td>{{ fmt(p.price) }}</td>
          <td>{{ fmt(p.qty * p.avg_cost) }}</td>
          <td :class="colorClass(p.jVal - p.price)">{{ fmt(p.jVal) }}</td>
          <td>{{ fmt(p.avg_cost) }}</td>
          <td :class="colorClass(p.price - p.prevClose)">{{ fmt((p.price - p.prevClose) * p.qty) }}</td>
        </tr>
      </tbody>
    </table>
    <div v-else class="empty">暂无持仓</div>
  </div>
</template>

<script setup>
import { usePositions } from '../services/positionsService'
import { computed } from 'vue'
const { positions, loading, refresh } = usePositions()
function fmt(n) {
  if (n === '--') return '--'
  if (isNaN(n)) return '--'
  return Number(n).toFixed(2)
}
function formatQty(q) {
  if (q === '--') return '--'
  return Number(q).toFixed(q % 1 === 0 ? 0 : 4)
}
function colorClass(v){
  if(v==='--' || isNaN(v)) return ''
  return v>0? 'positive': v<0? 'negative':''
}
</script>

<style scoped>
.position-table{width:100%;overflow-x:auto;margin:24px auto;max-width:1400px}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{padding:8px 12px;border-bottom:1px solid rgba(0,255,128,0.2);text-align:right}
th:first-child,td.sym{text-align:left}
.sym{display:flex;align-items:center;gap:8px}
.logo{width:20px;height:20px;border-radius:50%}
.qty{font-size:12px;color:#888}
.positive{color:#00e68a}
.negative{color:#ff4c4c}
.empty{padding:24px;text-align:center;color:#888}
</style>
