<template>
  <div class="mt-8">
    <h2 class="text-lg font-semibold mb-2">当前持仓</h2>
    <div class="border-t-2 border-emerald-400/60 mb-4"></div>
    <table class="w-full text-sm">
      <thead class="text-left text-neutral-400">
        <tr>
          <th>股票</th><th>实时价</th><th>总成本</th><th>盈亏平衡点</th><th>持仓成本</th><th>当日涨跌</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.symbol" class="border-b border-neutral-700">
          <td>{{ row.symbol }} <span class="text-neutral-500">({{ row.qty.toFixed(6) }})</span></td>
          <td>{{ row.price.toFixed(2) }}</td>
          <td>{{ row.totalCost.toFixed(2) }}</td>
          <td>{{ row.jVal.toFixed(2) }}</td>
          <td>{{ row.mVal.toFixed(2) }}</td>
          <td :class="row.dayChg>=0?'text-emerald-400':'text-red-400'">{{ row.dayChg.toFixed(2) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { supabase } from '../supabase';
import { Trade } from '../types';
import axios from 'axios';

// simplified rolling algorithm
function calcPosition(trades: Trade[]){
  const map: Record<string, any> = {};
  trades.forEach(t=>{
    const m = map[t.symbol] || {qty:0, cost:0};
    if(t.action==='BUY'){
      m.cost += t.quantity*t.price;
      m.qty += t.quantity;
    }else if(t.action==='SELL'){
      m.cost -= t.quantity*t.price;
      m.qty -= t.quantity;
    }else if(t.action==='SHORT'){
      m.cost -= t.quantity*t.price;
      m.qty -= t.quantity;
    }else{ // COVER
      m.cost += t.quantity*t.price;
      m.qty += t.quantity;
    }
    map[t.symbol]=m;
  });
  return map;
}

const rows = ref<any[]>([]);

async function load(){
  const { data, error } = await supabase.from('TradeDate').select('*');
  if(error) return;
  const trades = data as any as Trade[];
  const pos = calcPosition(trades);

  const token = (import.meta.env.VITE_FINNHUB_TOKEN as string) || 'd19cvm9r01qmm7tudrk0d19cvm9r01qmm7tudrkg';
  const symbols = Object.keys(pos);
  const quotes: Record<string,{c:number,pc:number}> = {};
  await Promise.all(symbols.map(async s=>{
    const {data} = await axios.get(`https://finnhub.io/api/v1/quote?symbol=${s}&token=${token}`);
    quotes[s]=data;
  }));

  rows.value = symbols.map(s=>{
    const info = pos[s];
    const price = quotes[s]?.c ?? 0;
    const yclose = quotes[s]?.pc ?? 0;
    const qty = info.qty;
    const avgCost = qty!==0? Math.abs(info.cost/qty):0;
    return {
      symbol:s,
      qty,
      price,
      totalCost: Math.abs(qty)*avgCost,
      jVal: avgCost, // placeholder
      mVal: avgCost,
      dayChg: (price - yclose)*Math.abs(qty)
    };
  });
}

onMounted(load);
</script>
