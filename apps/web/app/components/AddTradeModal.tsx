'use client';

import { useState, useEffect } from 'react';
import { addTrade, updateTrade } from '@/lib/services/dataService';

/** 与 dataService.Trade 对齐的字段 */
interface BaseFields {
  symbol: string;
  price: number;
  quantity: number;
  date: string;
  action: 'buy' | 'sell' | 'short' | 'cover';
}

/** 组件 Props：旧写法 onAdded， 新写法 onSuccess，二选一或都传 */
interface Props {
  onClose: () => void;
  onAdded?: () => void;
  onSuccess?: () => void;
  trade?: { id: number } & BaseFields;
}

export default function AddTradeModal({
  onClose,
  onAdded,
  onSuccess,
  trade,
}: Props) {
  const editing = Boolean(trade);

  /* ---------- 表单状态 ---------- */
  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState<'BUY' | 'SELL' | 'SHORT' | 'COVER'>('BUY');
  const [qty, setQty] = useState(0);
  const [price, setPrice] = useState(0);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  /* ---------- 编辑模式回填 ---------- */
  useEffect(() => {
    if (!trade) return;
    setSymbol(trade.symbol);
    setSide(trade.action.toUpperCase() as any);
    setQty(trade.quantity);
    setPrice(trade.price);
    setDate(trade.date);
  }, [trade]);

  /* ---------- 保存 ---------- */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // 转成 dataService.Trade 需要的字段 & 小写 action
    const payload: BaseFields = {
      symbol: symbol.toUpperCase(),
      price,
      quantity: qty,
      date,
      action: side.toLowerCase() as BaseFields['action'],
    };

    if (editing) {
      // ❗ 只传 1 个对象参数
      await updateTrade({ id: trade!.id, ...payload });
    } else {
      await addTrade(payload);
    }

    // 触发回调
    onAdded?.();
    if (onSuccess && onSuccess !== onAdded) onSuccess();
    onClose();
  }

  /* ---------- UI ---------- */
  return (
    <div className="modal">
      <div className="modal-content" style={{ maxWidth: 420 }}>
        <h3 style={{ marginBottom: 12 }}>{editing ? '编辑交易' : '新增交易'}</h3>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label>股票代码</label>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            required
          />

          <label>方向</label>
          <select
            value={side}
            onChange={(e) => setSide(e.target.value as any)}
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
              style={{ marginRight: 8 }}
              onClick={onClose}
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
