import { supabase } from '../supabaseClient';
import useSWR from 'swr';

type Trade = {
  id: number;
  trade_at: string;
  symbol: string;
  action: 'BUY'|'SELL'|'SHORT'|'COVER';
  quantity: number;
  price: number;
};

async function fetchTrades() {
  const { data, error } = await supabase.from('vw_trades_latest').select('*').order('trade_at', { ascending: false }).limit(50);
  if (error) throw error;
  return data as Trade[];
}

export default function TradeTable(){
  const { data } = useSWR('trades', fetchTrades, { refreshInterval: 15000 });

  return (
    <div className="mt-8">
      <div className="border-t-2 border-emerald-400/60 mb-4"></div>
      <h2 className="text-lg mb-2 font-semibold">最近交易记录</h2>
      <table className="w-full text-sm">
        <thead className="text-left text-neutral-400">
          <tr><th>时间</th><th>Symbol</th><th>Action</th><th>Qty</th><th>Price</th></tr>
        </thead>
        <tbody>
          {data?.map(t=>{
            const color = (t.action==='BUY'||t.action==='COVER')?'text-emerald-400':'text-red-400';
            return (
              <tr key={t.id} className="border-b border-neutral-700">
                <td>{new Date(t.trade_at).toLocaleString()}</td>
                <td>{t.symbol}</td>
                <td className={color}>{t.action}</td>
                <td>{t.quantity.toFixed(6)}</td>
                <td>{t.price.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
