
<template>
  <div>
    <button class="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl" @click="open=true">新增交易</button>
    <div v-if="open" class="fixed inset-0 bg-black/40 flex items-center justify-center">
      <div class="bg-white rounded-2xl shadow-xl p-6 w-[90%] max-w-md space-y-4">
        <h2 class="text-xl font-semibold">录入交易</h2>
        <form @submit.prevent="submit">
          <div class="space-y-2">
            <input v-model="form.symbol" class="border p-2 rounded w-full" placeholder="代码 (e.g. AAPL)" required>
            <select v-model="form.action" class="border p-2 rounded w-full">
              <option value="BUY">买入</option>
              <option value="SELL">卖出</option>
              <option value="SHORT">卖空</option>
              <option value="COVER">回补</option>
            </select>
            <input v-model.number="form.price" step="0.0001" type="number" class="border p-2 rounded w-full" placeholder="价格" required>
            <input v-model.number="form.quantity" step="0.000001" type="number" class="border p-2 rounded w-full" placeholder="数量" required>
            <button :disabled="loading" class="bg-emerald-500 hover:bg-emerald-600 w-full text-white py-2 rounded-xl">
              {{ loading ? '提交中…' : '提交' }}
            </button>
            <button type="button" class="text-gray-500 underline text-sm w-full" @click="open=false">关闭</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { supabase } from '../supabaseClient'
import useSWRV from 'swrv'

const open = ref(false)
const loading = ref(false)
const form = ref({ symbol:'', action:'BUY', price:null, quantity:null })

async function submit() {
  loading.value = true
  const { error } = await supabase.from('TradeDate').insert({ ...form.value, trade_at: new Date().toISOString() })
  loading.value = false
  if(error){ alert(error.message) } else { open.value=false }
}
</script>
