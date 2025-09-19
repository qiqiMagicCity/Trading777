'use client';

import { useState, useEffect } from 'react';
import { addTrade, updateTrade } from '@/lib/services/dataService';
import type { Trade } from '@/lib/services/dataService';
import { nowNY, toNY } from '@/lib/timezone';
import { logger } from '@/lib/logger';

interface Props {
  onClose: () => void;
  onAdded: () => Promise<void> | void;
  trade?: Trade;
}

const pad = (value: number | string): string => value.toString().padStart(2, '0');

const normalizeTimePart = (timePart: string | undefined): string => {
  const sanitized = (timePart ?? '').replace('Z', '').split('.')[0] ?? '';
  const [h = '00', m = '00', s = '00'] = sanitized.split(':');
  return `${pad(h)}:${pad(m)}:${pad(s ?? '00')}`;
};

const toInputDateTime = (value: string | number | Date): string => {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}` +
      `T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  }

  if (typeof value === 'number') {
    return toInputDateTime(new Date(value));
  }

  if (typeof value === 'string') {
    if (value.includes('T')) {
      const [datePart, timePart] = value.split('T');
      if (!datePart) return '';
      return `${datePart}T${normalizeTimePart(timePart)}`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return `${value}T00:00:00`;
    }
  }

  return '';
};

const sanitizeDateTimeInput = (raw: string): string => {
  if (!raw) return raw;
  if (!raw.includes('T')) {
    return toInputDateTime(`${raw}T00:00:00`);
  }
  const [datePart, timePart] = raw.split('T');
  if (!datePart) return raw;
  return `${datePart}T${normalizeTimePart(timePart)}`;
};

export default function AddTradeModal({ onClose, onAdded, trade }: Props) {
  const editing = !!trade;
  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState<'BUY' | 'SELL' | 'SHORT' | 'COVER'>('BUY');
  const [qty, setQty] = useState<number>(0);
  const [price, setPrice] = useState<number>(0);

  // Get current NY time for default
  const [datetime, setDatetime] = useState(() => toInputDateTime(nowNY()));

  // ---------- 同步传入的 trade 数据 ----------
  useEffect(() => {
    if (trade) {
      logger.debug('[AddTradeModal] 编辑模式载入:', trade);
      setSymbol(trade.symbol.toUpperCase());
      if (!trade.action) {
        console.warn('Editing trade has invalid action, defaulting to BUY.');
      }
      setSide((trade.action ? trade.action.toUpperCase() : 'BUY') as 'BUY' | 'SELL' | 'SHORT' | 'COVER');
      setQty(trade.quantity);
      setPrice(trade.price);

      // 处理日期 -> datetime-local 格式 (YYYY-MM-DDTHH:MM:SS)
      try {
        const baseDateTime = trade.time
          ? toInputDateTime(trade.time)
          : toInputDateTime(`${trade.date}T${normalizeTimePart('00:00:00')}`);
        const fallback = toInputDateTime(toNY(trade.date));
        setDatetime(baseDateTime || fallback);
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

    const normalizedDateTime = sanitizeDateTimeInput(datetime);
    if (!normalizedDateTime || normalizedDateTime.length < 10) {
      alert('请输入有效的交易时间');
      return;
    }
    const tradeDate = normalizedDateTime.slice(0, 10); // YYYY-MM-DD
    const tradeTimestamp = normalizedDateTime.length >= 19
      ? normalizedDateTime.slice(0, 19)
      : `${normalizedDateTime}T00:00:00`;

    const baseTrade = {
      symbol: symbol.toUpperCase(),
      price,
      quantity: qty,
      date: tradeDate,
      action: side.toLowerCase() as 'buy' | 'sell' | 'short' | 'cover',
      time: tradeTimestamp,
    };

    if (editing && trade?.id != null) {
      logger.debug('[AddTradeModal] 更新交易:', { ...baseTrade, id: trade.id });
      await updateTrade({ ...baseTrade, id: trade.id });
    } else {
      logger.debug('[AddTradeModal] 新增交易:', baseTrade);
      await addTrade(baseTrade);
    }
    try {
      await onAdded();
    } catch (err) {
      logger.error('[AddTradeModal] 刷新交易数据失败', err);
    }
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
            step={1}
            value={datetime}
            onChange={e => setDatetime(sanitizeDateTimeInput(e.target.value))}
            required
          />

          <label>股票代码</label>
          <input
            value={symbol}
            onChange={e => {
              const upper = e.target.value.toUpperCase();
              const sanitized = upper.replace(/[^A-Z]/g, '');
              setSymbol(sanitized);
            }}
            pattern="[A-Z]*"
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
