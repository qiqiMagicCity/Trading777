import { supabase } from '../supabaseClient';
import useSWR from 'swr';
import { useQuote } from '../hooks/useQuote';

type PositionRow = {
  symbol: string;
  qty: number;
  avg_cost: number;
};

async function fetchPositions() {
  const { data, error } = await supabase.from('vw_positions').select('*');
  if (error) throw error;
  return data as PositionRow[];
}

export default function PositionTable(){
  const { data } = useSWR('positions', fetchPositions, { refreshInterval: 12000 });

  return (
    <div className="mt-8">
      <h2 className="text-lg mb-2 font-semibold">当前持仓</h2>
      <div className="border-t-2 border-emerald-400/60 mb-4"></div>
      <table className="w-full text-sm">
        <thead className="text-left text-neutral-400">
          <tr>
            <th>Symbol</th><th>Price</th><th>Total Cost</th><th>jVal</th><th>mVal</th><th>ΔDay</th>
          </tr>
        </thead>
        <tbody>
          {data?.map(row=>{
            const { data: quote } = useQuote(row.symbol);
            const price = quote?.c ?? 0;
            const yClose = quote?.pc ?? 0;
            const total = Math.abs(row.qty) * row.avg_cost;
            const dayChg = (price - yClose) * Math.abs(row.qty);
            const cls = dayChg >=0 ? 'text-emerald-400' : 'text-red-400';
            return (
              <tr key={row.symbol} className="border-b border-neutral-700">
                <td className="py-1">{row.symbol} <span className="text-neutral-500">({row.qty.toFixed(4)})</span></td>
                <td>{price.toFixed(2)}</td>
                <td>{total.toFixed(2)}</td>
                <td>{/* jVal placeholder */}</td>
                <td>{row.avg_cost.toFixed(2)}</td>
                <td className={cls}>{dayChg.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
