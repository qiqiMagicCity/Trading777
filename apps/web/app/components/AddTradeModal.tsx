'use client';

import { useState, useEffect } from 'react';
import { addTrade, updateTrade } from '@/lib/services/dataService';

/**
 * Props 说明——兼容两种写法：
 *   • onAdded   ← 项目旧代码使用
 *   • onSuccess ← page.tsx 里使用
 * 传 1 个或 2 个都行；有则依次调用。
 */
interface Props {
  onClose: () => void;
  onAdded?: () => void;
  onSuccess?: () => void;
  trade?: {
    id: number;
    symbol: string;
    action: string;
    quantity: number;
    price: number;
    date: string;
  };
}

export default function AddTradeModal({
  onClose,
  onAdded,
  onSuccess,
  trade,
}: Props) {
  const editing = Boolean(trade);

  /* -------- 表单状态 -------- */
  const [symbol, setSymbol] = useState('');
  const [action, setAction] = useState<'BUY' | 'SELL' | 'SHORT' | 'COVER'>(
    'BUY'
  );
  const [qty, setQty] = useState(0);
  const [price, setPrice] = useState(0);
  const [date, setDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );

  /* -------- 编辑模式：回填旧值 -------- */
  useEffect(() => {
    if (!trade) return;
    setSymbol(trade.symbol);
    setAction(trade.action.toUpperCase() as any);
    setQty(trade.quantity);
    setPrice(trade.price);
    const d = new Date(trade.date);
    setDate(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`
    );
  }, [trade]);

  /* -------- 保存 -------- */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const payload = {
      symbol: symbol.toUpperCase(),
      action,
      quantity: qty,
      price,
      date,
    };

    if (editing) {
      await updateTrade(trade!.id, payload);
    } else {
      await addTrade(payload);
    }

    // 依次触发回调（若有）
    if (onAdded) onAdded();
    if (onSuccess && onSuccess !== onAdded) onSuccess();

    onClose();
  }

  /* -------- UI -------- */
  return (
    <div className="modal">
      <div className="modal-content" style={{ maxWidth: 420 }}>
        <h3 style={{ marginBottom: 12 }}>
          {editing ? '编辑交易' : '新增交易'}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label>股票代码</label>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            required
          />

          <label>方向</label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as any)}
          >
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
            <option value="SHORT">SHORT</option>
            <option value="COVER">COVER</option>
          </select>

          <label>数量</label>
          <input
            type="number"
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            required
          />

          <label>单价</label>
          <input
            type="number"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            required
          />

          <label>日期</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />

          <div style={{ textAlign: 'right', marginTop: 12 }}>
            <button
              type="button"
              className="btn"
              onClick={onClose}
              style={{ marginRight: 8 }}
            >
              取消
            </button>
            <button type="submit" className="btn">
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
