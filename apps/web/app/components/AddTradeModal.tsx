'use client';

import { useState, useEffect } from 'react';
import { addTrade, updateTrade } from '@/lib/services/dataService';
import type { Trade } from '@/lib/services/dataService';
import { nowNY, toNY, ymdInNY } from '@/lib/timezone';
import { logger } from '@/lib/logger';

const SYMBOL_HISTORY_KEY = 'tradeSymbolHistory';
const SYMBOL_HISTORY_LIMIT = 10;

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

const normalizeSymbol = (value: string): string => value.toUpperCase().replace(/[^A-Z]/g, '');

const DATETIME_LOCAL_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

const resolveNyDayFromLocal = (value: string): string | null => {
  const match = DATETIME_LOCAL_RE.exec(value);
  if (!match) return null;
  const [, y, m, d, hh, mm, ss] = match;
  const nyDate = ymdInNY(
    toNY(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss ?? '0'),
    ),
  );
  return /^\d{4}-\d{2}-\d{2}$/.test(nyDate) ? nyDate : null;
};

export default function AddTradeModal({ onClose, onAdded, trade }: Props) {
  const editing = !!trade;
  const [symbol, setSymbol] = useState('');
  const [symbolHistory, setSymbolHistory] = useState<string[]>([]);
  const [side, setSide] = useState<'BUY' | 'SELL' | 'SHORT' | 'COVER'>('BUY');
  const [qty, setQty] = useState<number>(0);
  const [price, setPrice] = useState<number>(0);

  // Get current NY time for default
  const [datetime, setDatetime] = useState(() => toInputDateTime(nowNY()));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(SYMBOL_HISTORY_KEY);
      if (!stored) return;
      const parsed: unknown = JSON.parse(stored);
      if (!Array.isArray(parsed)) return;
      const sanitized: string[] = [];
      for (const item of parsed) {
        if (typeof item !== 'string') continue;
        const normalized = normalizeSymbol(item);
        if (!normalized) continue;
        if (!sanitized.includes(normalized)) {
          sanitized.push(normalized);
        }
        if (sanitized.length >= SYMBOL_HISTORY_LIMIT) {
          break;
        }
      }
      setSymbolHistory(sanitized);
    } catch (error) {
      logger.warn('[AddTradeModal] 读取股票代码历史失败', error);
    }
  }, []);

  const persistSymbolHistory = (nextSymbol: string) => {
    const normalized = normalizeSymbol(nextSymbol);
    if (!normalized) return;
    const deduped = [normalized, ...symbolHistory.filter(item => item !== normalized)];
    const limited = deduped.slice(0, SYMBOL_HISTORY_LIMIT);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(SYMBOL_HISTORY_KEY, JSON.stringify(limited));
      } catch (error) {
        logger.warn('[AddTradeModal] 写入股票代码历史失败', error);
      }
    }
    setSymbolHistory(limited);
  };

  // ---------- 同步传入的 trade 数据 ----------
  useEffect(() => {
    if (trade) {
      logger.debug('[AddTradeModal] 编辑模式载入:', trade);
      setSymbol(normalizeSymbol(trade.symbol));
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
    const tradeDate = resolveNyDayFromLocal(normalizedDateTime);
    if (!tradeDate) {
      alert('无法解析交易日期，请检查输入的时间');
      return;
    }
    const timePart = normalizedDateTime.length >= 19
      ? normalizedDateTime.slice(11, 19)
      : '00:00:00';
    const tradeTimestamp = `${tradeDate}T${timePart}`;

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
    persistSymbolHistory(baseTrade.symbol);
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

          <label>单价</label>
          <input
            type="number"
            step="0.01"
            value={price || ''}
            onChange={e => setPrice(parseFloat(e.target.value || '0'))}
            required
          />

          <label>股票代码</label>
          <input
            value={symbol}
            onChange={e => {
              setSymbol(normalizeSymbol(e.target.value));
            }}
            pattern="[A-Z]*"
            required
            list={symbolHistory.length > 0 ? 'trade-symbol-history' : undefined}
          />
          {symbolHistory.length > 0 && (
            <datalist id="trade-symbol-history">
              {symbolHistory.map(item => (
                <option key={item} value={item} />
              ))}
            </datalist>
          )}

          <label>数量(张)</label>
          <input
            type="number"
            step="any"
            inputMode="decimal"
            value={qty || ''}
            onChange={e => setQty(Number(e.target.value || '0'))}
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

          <div style={{ marginTop: 12, textAlign: 'right' }}>
            <button type="button" className="btn" style={{ marginRight: 6 }} onClick={onClose}>取消</button>
            <button type="submit" className="btn">确定</button>
          </div>
        </form>
      </div>
    </div>
  );
}
