<template>
  <div class="mt-8">
    <div class="border-t-2 border-emerald-400/60 mb-4"></div>
    <h2 class="text-lg font-semibold mb-2">最近交易记录</h2>
    <table class="w-full text-sm">
      <thead class="text-left text-neutral-400">
        <tr><th>时间</th><th>Symbol</th><th>动作</th><th>数量</th><th>价格</th></tr>
      </thead>
      <tbody>
        <tr v-for="t in trades" :key="t.id" class="border-b border-neutral-700">
          <td>{{ new Date(t.trade_at).toLocaleString() }}</td>
          <td>{{ t.symbol }}</td>
          <td :class="['BUY','COVER'].includes(t.action)?'text-emerald-400':'text-red-400'">{{ t.action }}</td>
          <td>{{ t.quantity.toFixed(6) }}</td>
          <td>{{ t.price.toFixed(2) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { supabase } from '../supabase';
import { Trade } from '../types';

const trades = ref<Trade[]>([]);

async function load(){
  const { data, error } = await supabase
      .from('TradeDate')
      .select('*')
      .order('trade_at',{ascending:false})
      .limit(50);
  if(error) return;
  trades.value = data as any as Trade[];
}

onMounted(load);
</script>
