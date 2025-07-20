
'use client';

import { useState, useEffect } from 'react';
import { addTrade, updateTrade } from '@/lib/services/dataService';
import type { EnrichedTrade } from '@/lib/fifo';

/** 与 dataService.Trade 对齐的字段 */
interface BaseFields {
  symbol: string;
  price: number;
  quantity: number;
  date: string;
  action: 'buy' | 'sell' | 'short' | 'cover';
}

interface Props {
  onClose: () => void;
  onAdded?: () => void;     // 旧版回调
  onSuccess?: () => void;   // 新版回调
  trade?: EnrichedTrade | null; // 可为空，id 可选——与 page.tsx 完全匹配
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
  const [side,   setSide]   = useState<'BUY' | 'SELL' | 'SHORT' | 'COVER'>('BUY');
  const [qty,    setQty]    = useState(0);
  const [price,  setPrice]  = useState(0);
  const [date,   setDate]   = useState(new Date().toISOString().slice(0, 10));

  /* ---------- 编辑模式：回填 ---------- */
  useEffect(() => {
    if (!trade) return;
    setSymbol(trade.symbol);
    setSide((trade.action?.toUpperCase() ?? 'BUY') as any);
    setQty(trade.quantity);
    setPrice(trade.price);
    setDate(trade.date);
  }, [trade]);

  /* ---------- 保存 ---------- */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // 整理成 dataService.Trade 所需字段（action 小写）
    const payload: BaseFields = {
      symbol: symbol.toUpperCase(),
      price,
      quantity: qty,
      date,
      action: side.toLowerCase() as BaseFields['action'],
    };

    if (editing && trade?.id !== undefined) {
      // 仅传一个对象参数
      await updateTrade({ id: trade.id, ...payload });
    } else {
      await addTrade(payload);
    }

    // 顺序兼容旧新回调
    onAdded?.();
    onSuccess?.();
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{editing ? '编辑交易' : '新增交易'}</h2>

        <form onSubmit={handleSubmit}>
          <label>代码</label>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            required
          />

          <label>方向</label>
          <select value={side} onChange={(e) => setSide(e.target.value as any)}>
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
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            step="0.0001"
            required
          />

          <label>日期</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />

          <div className="modal-actions">
            <button type="button" className="btn btn-cancel" onClick={onClose}>
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
