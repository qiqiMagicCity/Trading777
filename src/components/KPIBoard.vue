<template>
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
    <div v-for="item in items" :key="item.key" class="p-4 rounded-xl bg-neutral-800">
      <div class="text-sm text-neutral-400">{{ item.label }}</div>
      <div :class="[item.value>=0?'text-emerald-400':'text-red-400','text-xl font-semibold']">
        {{ item.value.toFixed(2) }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { supabase } from '../supabase';
import { Trade } from '../types';
import { computeKPIs, KPI } from '../utils/compute';
import axios from 'axios';

const items = ref<{key:string,label:string,value:number}[]>([]);

async function load(){
  const { data, error } = await supabase.from('TradeDate').select('*');
  if(error) return console.error(error);
  const trades = data as any as Trade[];

  // fetch quotes for all symbols
  const symbols = [...new Set(trades.map(t=>t.symbol))];
  const quotes: Record<string,{c:number,pc:number}> = {};
  const token = (import.meta.env.VITE_FINNHUB_TOKEN as string) || 'd19cvm9r01qmm7tudrk0d19cvm9r01qmm7tudrkg';
  await Promise.all(symbols.map(async s=>{
    const {data} = await axios.get(`https://finnhub.io/api/v1/quote?symbol=${s}&token=${token}`);
    quotes[s]=data;
  }));

  const kpi: KPI = computeKPIs(trades, quotes);

  items.value = [
    {key:'positionCost',label:'账户持仓金额',value:kpi.positionCost},
    {key:'intradayRealized',label:'日内交易统计',value:kpi.intradayRealized},
    {key:'intradayUnreal',label:'当日盈亏统计',value:kpi.intradayUnreal},
    {key:'dayTrades',label:'当日交易次数',value:kpi.dayTrades},
    {key:'totalTrades',label:'累计交易笔数',value:kpi.totalTrades},
    {key:'wtdPnl',label:'WTD 盈亏',value:kpi.wtdPnl},
    {key:'mtdPnl',label:'MTD 盈亏',value:kpi.mtdPnl},
    {key:'ytdPnl',label:'YTD 盈亏',value:kpi.ytdPnl},
  ];
}

onMounted(load);
</script>
