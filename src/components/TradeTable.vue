
<template>
  <div class="trade-table">
    <table v-if="trades.length">
      <thead>
        <tr>
          <th>时间</th>
          <th>股票</th>
          <th>动作</th>
          <th>数量</th>
          <th>价格</th>
          <th>盈亏平衡点</th>
          <th>成交后持仓</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="t in trades" :key="t.id">
          <td>{{ new Date(t.trade_at).toLocaleString() }}</td>
          <td>{{ t.symbol }}</td>
          <td :class="actionClass(t.action)">{{ t.action }}</td>
          <td class="num">{{ formatQty(t.quantity) }}</td>
          <td class="num">{{ fmt(t.price) }}</td>
          <td class="num">{{ fmt(t.jVal) }}</td>
          <td class="num">{{ formatQty(t.netAfter) }}</td>
        </tr>
      </tbody>
    </table>
    <div v-else class="empty">暂无交易</div>
  </div>
</template>

<script setup>
import { useLatestTrades } from '../services/tradesService'
const { trades } = useLatestTrades()
function fmt(n){
  if(n===undefined || n===null) return '--'
  return Number(n).toFixed(2)
}
function formatQty(q){
  if(q===undefined || q===null) return '--'
  return Number(q).toFixed(q%1===0?0:4)
}
function actionClass(a){
  if(!a) return ''
  if(a==='BUY' || a==='COVER') return 'positive'
  if(a==='SELL' || a==='SHORT') return 'negative'
  return ''
}
</script>

<style scoped>
.trade-table{width:100%;overflow-x:auto;margin:24px auto;max-width:1400px}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{padding:8px 12px;border-bottom:1px solid rgba(0,255,128,0.2);text-align:right}
th:first-child,td:first-child{text-align:left}
.num{text-align:right}
.positive{color:#00e68a}
.negative{color:#ff4c4c}
.empty{padding:24px;text-align:center;color:#888}
</style>
