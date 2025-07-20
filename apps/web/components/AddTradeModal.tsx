import { useState, useEffect } from 'react';
import { addTrade, updateTrade } from '@/lib/services/dataService';

/**
 * Props 兼容两种回调写法：
 *   - onAdded   ← 旧代码里用
 *   - onSuccess ← 你在 page.tsx 里用
 * 二选一或同时传都可以。
 */
interface Props {
  onClose: () => void;
  onAdded?: () => void;    // 旧
  onSuccess?: () => void;  // 新
  trade?: any;             // 先不深究类型
}

/* 生成期权代码的小工具（可忽略原理） */
function buildOptionSymbol(root: string, dateStr: string, cp: string, strike: number): string {
  if (!root || !dateStr || !cp || !strike) return '';
  const date = new Date(dateStr);
  const yy = date.getFullYear().toString().slice(-2);
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  const strikeStr = (strike * 1000).toFixed(0).padStart(8, '0');
  return `${root}${yy}${mm}${dd}${cp.toUpperCase()}${strikeStr}`;
}

export default function AddTradeModal({ onClose, onAdded, onSuccess, trade }: Props) {
  const editing = !!trade;

  /* ---------------- 表单状态 ---------------- */
  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState<'BUY' | 'SELL' | 'SHORT' | 'COVER'>('BUY');
  const [qty, setQty] = useState<number>(0);
  const [price, setPrice] = useState<number>(0);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  /* 编辑时填充旧值 */
  useEffect(() => {
    if (trade) {
      setSymbol(trade.symbol);
      setSide(trade.action.toUpperCase() as any);
      setQty(trade.quantity);
      setPrice(trade.price);
      try {
        const d = new Date(trade.date);
        setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      } catch {
        /* ignore */ 
      }
    }
  }, [trade]);

  /* ---------------- 提交保存 ---------------- */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const baseTrade = {
      symbol,
      action: side,
      quantity: qty,
      price,
      date,
    };

    if (editing) {
      console.log('[AddTradeModal] 更新交易:', baseTrade);
      await updateTrade(trade!.id, baseTrade);
    } else {
      console.log('[AddTradeModal] 新增交易:', baseTrade);
      await addTrade(baseTrade);
    }

    /* 统一回调：有哪个就调用哪个 */
    (onAdded ?? onSuccess)?.();
    onClose();
  };

  /* ---------------- UI ---------------- */
  return (
    <div className="modal">
      <div className="modal-content" style={{ maxWidth: 400 }}>
        <h3 style={{ marginBottom: 12 }}>{editing ? '编辑交易' : '新增交易'}</h3>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label>股票代码</label>
          <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} required />

          <label>方向</label>
          <select value={side} onChange={e => setSide(e.target.value as any)}>
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
            <option value="SHORT">SHORT</option>
            <option value="COVER">COVER</option>
          </select>

          <label>数量</label>
          <input type="number" value={qty} onChange={e => setQty(parseInt(e.target.value || '0', 10))} required />

          <label>单价</label>
          <input type="number" step="0.01" value={price} onChange={e => setPrice(parseFloat(e.target.value || '0'))} required />

          <label>日期</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} required />

          <div style={{ marginTop: 12, textAlign: 'right' }}>
            <button type="button" className="btn" style={{ marginRight: 6 }} onClick={onClose}>取消</button>
            <button type="submit" className="btn">保存</button>
          </div>
        </form>
      </div>
    </div>
  );
}
