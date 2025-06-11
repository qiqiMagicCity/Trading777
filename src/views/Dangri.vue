<template>
  <div class="record-list">
    <h2>📅 当日交易明细</h2>
    <table>
      <thead>
        <tr>
          <th>标的代码</th><th>标的名称</th><th>方向</th><th>单价</th><th>数量</th>
          <th>订单金额</th><th>成交日期</th><th>备注</th><th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id">
          <td>{{row.symbol}}</td><td>{{row.name}}</td><td>{{row.side}}</td><td>{{row.price}}</td>
          <td>{{row.quantity}}</td><td>{{row.amount}}</td><td>{{row.trade_date}}</td><td>{{row.note}}</td>
          <td>
            <button @click="editRecord(row.id)">编辑</button>
            <button @click="deleteRecord(row.id)">删除</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient('https://zcosfwmtatuheqrytvad.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
const rows = ref([])

async function loadData(){
  const { data:{ user } } = await supabase.auth.getUser()
  const today = new Date().toISOString().slice(0,10)
  const { data } = await supabase.from('records').select('*').eq('user_id', user.id).eq('trade_date', today)
  rows.value = data || []
}

function editRecord(id){ alert('编辑记录ID: '+id) }
function deleteRecord(id){ alert('删除记录ID: '+id) }

onMounted(loadData)
</script>

<style scoped>
body{background:black;color:#00ff99;font-family:sans-serif;}
table{width:100%;border-collapse:collapse;margin-top:20px;}
th,td{border:1px solid #00ff99;padding:8px;text-align:center;}
button{padding:4px 8px;cursor:pointer;}
</style>