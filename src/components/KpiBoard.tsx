import { supabase } from '../supabaseClient';
import useSWR from 'swr';
import { useEffect } from 'react';

type Kpi = {
  position_cost: number;
  intraday_realized: number;
  intraday_unreal: number;
  day_trades: number;
  total_trades: number;
  wtd_pnl: number;
  mtd_pnl: number;
  ytd_pnl: number;
};

async function fetchKpi() {
  const { data, error } = await supabase.from('vw_kpi_stats').select('*').single();
  if (error) throw error;
  return data as Kpi;
}

const labelMap: Record<keyof Kpi, string> = {
  position_cost: '账户持仓金额',
  intraday_realized: '日内交易统计',
  intraday_unreal: '当日盈亏统计',
  day_trades: '当日交易次数',
  total_trades: '累计交易笔数',
  wtd_pnl: 'WTD 盈亏',
  mtd_pnl: 'MTD 盈亏',
  ytd_pnl: 'YTD 盈亏'
};

export default function KpiBoard(){
  const { data } = useSWR('kpi', fetchKpi, { refreshInterval: 10000 });

  if (!data) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Object.entries(labelMap).map(([field, label])=>{
        const val = (data as any)[field] as number;
        const cls = val >= 0 ? 'text-emerald-400' : 'text-red-400';
        return (
          <div key={field} className="p-4 rounded-xl bg-neutral-800 shadow">
            <div className="text-sm text-neutral-400">{label}</div>
            <div className={`text-xl font-semibold ${cls}`}>{val.toFixed(2)}</div>
          </div>
        );
      })}
    </div>
  );
}
