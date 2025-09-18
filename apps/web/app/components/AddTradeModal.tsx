'use client';

import { useState, useEffect } from 'react';
import { addTrade, updateTrade } from '@/lib/services/dataService';
import type { Trade } from '@/lib/services/dataService';
import { nowNY, toNY } from '@/lib/timezone';
import { logger } from '@/lib/logger';

interface Props {
  onClose: () => void;
  onAdded: () => void;
  trade?: Trade;
}

export default function AddTradeModal({ onClose, onAdded, trade }: Props) {
  const editing = !!trade;
  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState<'BUY' | 'SELL' | 'SHORT' | 'COVER'>('BUY');
  const [qty, setQty] = useState<number>(0);
  const [price, setPrice] = useState<number>(0);

  // Get current NY time for default
  const defaultDatetime = nowNY().toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM format

  const [datetime, setDatetime] = useState(defaultDatetime);

  // ---------- 同步传入的 trade 数据 ----------
  useEffect(() => {
    if (trade) {
      logger.debug('[AddTradeModal] 编辑模式载入:', trade);
      setSymbol(trade.symbol);
      if (!trade.action) {
        console.warn('Editing trade has invalid action, defaulting to BUY.');
      }
      setSide((trade.action ? trade.action.toUpperCase() : 'BUY') as 'BUY' | 'SELL' | 'SHORT' | 'COVER');
      setQty(trade.quantity);
      setPrice(trade.price);

      // 处理日期 -> datetime-local 格式 (YYYY-MM-DDTHH:MM)
      try {
        const iso = toNY(trade.date).toISOString(); // YYYY-MM-DDTHH:MM:SSZ
        setDatetime(iso.slice(0, 16));
      } catch (e) {
        console.error('无法解析日期:', trade.date, e);
      }

    }
  }, [trade]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol || qty <= 0 || price <= 0) {
      alert('请输入完整信息');
      return;
    }

    const tradeDate = datetime.slice(0, 10); // YYYY-MM-DD

    const baseTrade = {
      symbol: symbol.toUpperCase(),
      price,
      quantity: qty,
      date: tradeDate,
      action: side.toLowerCase() as 'buy' | 'sell' | 'short' | 'cover',
    };

    if (editing && trade?.id != null) {
      logger.debug('[AddTradeModal] 更新交易:', { ...baseTrade, id: trade.id });
      await updateTrade({ ...baseTrade, id: trade.id });
    } else {
      logger.debug('[AddTradeModal] 新增交易:', baseTrade);
      await addTrade(baseTrade);
    }

    onAdded();
    onClose();
  };

  return (
    <div className="modal">
      <div className="modal-content">
        <h3>{editing ? '编辑交易' : '添加交易'}</h3>
        <form onSubmit={handleSubmit}>
          <label>交易时间</label>
          <input
            type="datetime-local"
            value={datetime}
            onChange={e => setDatetime(e.target.value)}
            required
          />

          <label>股票代码</label>
          <input
            value={symbol}
            onChange={e => setSymbol(e.target.value)}
            required
          />

          <label>交易方向</label>
          <select
            value={side}
            onChange={e => setSide(e.target.value as 'BUY' | 'SELL' | 'SHORT' | 'COVER')}
          >
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
            <option value="SHORT">SHORT</option>
            <option value="COVER">COVER</option>
          </select>

          <label>数量(张)</label>
          <input
            type="number"
            value={qty || ''}
            onChange={e => setQty(parseInt(e.target.value || '0', 10))}
            required
          />

          <label>单价</label>
          <input
            type="number"
            step="0.01"
            value={price || ''}
            onChange={e => setPrice(parseFloat(e.target.value || '0'))}
            required
          />

          <div style={{ marginTop: 12, textAlign: 'right' }}>
            <button type="button" className="btn" style={{ marginRight: 6 }} onClick={onClose}>取消</button>
            <button type="submit" className="btn">确定</button>
          </div>
        </form>
      </div>
    </div>
  );
}
