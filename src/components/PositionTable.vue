<template>
  <div class="position-table">
    <table>
      <thead>
        <tr>
          <th>日期</th>
          <th>星期</th>
          <th>实时价格</th>
          <th>交易方向</th>
          <th>单价</th>
          <th>数量</th>
          <th>订单金额</th>
          <th>盈亏平衡点</th>
          <th>累计盈亏</th>
          <th>交易次数</th>
          <th>手续费</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="positions.length === 0">
          <td colspan="11" class="empty">暂无持仓数据</td>
        </tr>
        <tr v-for="row in sortedPositions" :key="row.id">
          <td>{{ row.date || '-' }}</td>
          <td>{{ row.weekday || '-' }}</td>
          <td>{{ row.price !== undefined ? row.price : '-' }}</td>
          <td>{{ row.direction || '-' }}</td>
          <td>{{ row.unitPrice !== undefined ? row.unitPrice : '-' }}</td>
          <td>{{ row.quantity !== undefined ? row.quantity : '-' }}</td>
          <td>{{ row.amount !== undefined ? row.amount : '-' }}</td>
          <td>{{ row.bep !== undefined ? row.bep : '-' }}</td>
          <td>{{ row.totalPnL !== undefined ? row.totalPnL : '-' }}</td>
          <td>{{ row.tradeCount !== undefined ? row.tradeCount : '-' }}</td>
          <td>{{ row.fee !== undefined ? row.fee : '-' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { computed } from 'vue'
const props = defineProps({
  positions: { type: Array, default: () => [] }
})

const sortedPositions = computed(() => {
  return [...props.positions].sort((a, b) => {
    // 按时间倒序排列（最新在最上）
    return (b.timestamp || 0) - (a.timestamp || 0)
  })
})
</script>

<style scoped>
.position-table {
  width: 85%;
  background: #02121a;
  border-radius: 10px;
  box-shadow: 0 0 12px #00ffe055;
  margin-bottom: 16px;
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  color: #00ffd0;
  font-size: 1.1rem;
}
th, td {
  border-bottom: 1px solid #066;
  padding: 9px 8px;
  text-align: center;
}
th {
  background: #082f2f;
  font-size: 1.1rem;
  font-weight: bold;
}
.empty {
  color: #fff;
  padding: 20px 0;
}
tr:hover {
  background: #044 !important;
}
</style>
