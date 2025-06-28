import { supabase } from '../supabaseClient';

export async function fetchKpi() {
  try {
    const { data, error } = await supabase.from('vw_kpi_stats').select('*');
    if (error) throw error;
    const row = data?.[0] || {};
    return [
      { label: '账户持仓成本', value: row.position_cost || 0 },
      { label: '当日已实现盈亏', value: row.daily_pl || 0 },
      { label: '当日浮盈浮亏', value: 0 },
      { label: '当日盈亏笔数', value: row.daily_pl_trade_count || 0 },
      { label: '当日交易次数', value: row.daily_trade_count || 0 },
      { label: '累计交易次数', value: row.cumulative_trade_count || 0 },
      { label: 'WTD 盈亏', value: 0 },
      { label: 'MTD/YTD 盈亏', value: 0 }
    ];
  } catch (e) {
    console.error(e);
    return Array(8).fill().map((_,i)=>({label:'KPI'+i,value:0}));
  }
}
