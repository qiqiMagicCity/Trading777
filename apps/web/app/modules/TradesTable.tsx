'use client';

import type { EnrichedTrade } from "@/lib/fifo";
import { useEffect, useState } from "react";
import SymbolLogo from "@/components/SymbolLogo";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

const pad = (value: number | string): string => value.toString().padStart(2, '0');

const NY_TIME_ZONE = 'America/New_York';
const TIME_ONLY_REGEX = /^(\d{1,2})(:\d{1,2}){1,2}$/;

const normalizeTimeText = (timeText: string): string => {
  const sanitized = timeText.replace('Z', '').split('.')[0] ?? '';
  const [h = '00', m = '00', s = '00'] = sanitized.split(':');
  return `${pad(h)}:${pad(m)}:${pad(s ?? '00')}`;
};

const parseTimeValue = (trade: EnrichedTrade): Date | null => {
  const { time, date } = trade;
  if (!time) return null;
  if (time instanceof Date) {
    return new Date(time.getTime());
  }
  if (typeof time === 'number') {
    const fromNumber = new Date(time);
    return Number.isNaN(fromNumber.getTime()) ? null : fromNumber;
  }
  if (typeof time === 'string') {
    const trimmed = time.trim();
    if (!trimmed) return null;
    const withoutZ = trimmed.replace(/Z$/i, '');
    const noFractions = withoutZ.replace(/\.\d+/, '');
    const sanitized = noFractions.replace(' ', 'T');

    const hasExplicitDate = sanitized.includes('T') && /^\d{4}-\d{2}-\d{2}/.test(sanitized);
    const maybeTimeOnly = !hasExplicitDate && TIME_ONLY_REGEX.test(sanitized);

    const normalized = (() => {
      if (maybeTimeOnly) {
        const normalizedTime = normalizeTimeText(sanitized);
        const isoDate = typeof date === 'string' && date.trim()
          ? date.trim()
          : '1970-01-01';
        return `${isoDate}T${normalizedTime}`;
      }
      if (sanitized.includes('T')) {
        const [datePart, timePart] = sanitized.split('T');
        if (datePart && timePart) {
          return `${datePart}T${normalizeTimeText(timePart)}`;
        }
      }
      if (typeof date === 'string' && date.trim()) {
        return `${date.trim()}T${normalizeTimeText(sanitized)}`;
      }
      return `${sanitized}T00:00:00`;
    })();

    try {
      const nyUtc = fromZonedTime(normalized, NY_TIME_ZONE);
      if (!Number.isNaN(nyUtc.getTime())) {
        return nyUtc;
      }
    } catch {
      // ignore and fall back to manual parsing
    }

    if (normalized.includes('T')) {
      const [datePart, timePart] = normalized.split('T');
      if (datePart && timePart) {
        const [yearRaw, monthRaw, dayRaw] = datePart.split('-');
        const [hourRaw = '0', minuteRaw = '0', secondRaw = '0'] = timePart.split(':');
        const year = parseInt(yearRaw ?? '', 10);
        const month = parseInt(monthRaw ?? '', 10);
        const day = parseInt(dayRaw ?? '', 10);
        const hour = parseInt(hourRaw ?? '0', 10);
        const minute = parseInt(minuteRaw ?? '0', 10);
        const second = parseInt(secondRaw ?? '0', 10);
        if ([year, month, day, hour, minute, second].every((n) => !Number.isNaN(n))) {
          const constructed = new Date(year, month - 1, day, hour, minute, second);
          if (!Number.isNaN(constructed.getTime())) {
            try {
              const nyConstructed = fromZonedTime(constructed, NY_TIME_ZONE);
              if (!Number.isNaN(nyConstructed.getTime())) {
                return nyConstructed;
              }
            } catch {
              return constructed;
            }
          }
        }
      }
    }
    return null;
  }
  return null;
};

const getWeekdayIndex = (trade: EnrichedTrade): number | null => {
  const parsedTime = parseTimeValue(trade);
  if (parsedTime) {
    try {
      return toZonedTime(parsedTime, NY_TIME_ZONE).getDay();
    } catch {
      const fallback = parsedTime.getDay();
      return Number.isNaN(fallback) ? null : fallback;
    }
  }
  try {
    const midnightUtc = fromZonedTime(`${trade.date}T00:00:00`, NY_TIME_ZONE);
    return toZonedTime(midnightUtc, NY_TIME_ZONE).getDay();
  } catch {
    const direct = new Date(trade.date);
    const fallback = direct.getDay();
    return Number.isNaN(fallback) ? null : fallback;
  }
};

const getTimeDisplay = (trade: EnrichedTrade): string => {
  if (!trade.time) return '数据缺失';
  if (typeof trade.time === 'string') {
    const trimmed = trade.time.trim();
    if (!trimmed) return '数据缺失';
    if (trimmed.includes('T')) {
      const [, timePart] = trimmed.replace('Z', '').split('T');
      if (timePart) {
        return normalizeTimeText(timePart);
      }
    }
    if (trimmed.includes(' ')) {
      const parts = trimmed.split(/\s+/).filter(Boolean);
      const possibleTime = parts.length > 1 ? parts[parts.length - 1] : undefined;
      if (possibleTime) {
        return normalizeTimeText(possibleTime);
      }
    }
    if (TIME_ONLY_REGEX.test(trimmed)) {
      return normalizeTimeText(trimmed);
    }
  }
  const parsed = parseTimeValue(trade);
  if (!parsed) return '数据缺失';
  return `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`;
};

const getSortValue = (trade: EnrichedTrade): number => {
  const parsed = parseTimeValue(trade);
  if (parsed) {
    const time = parsed.getTime();
    if (!Number.isNaN(time)) {
      return time;
    }
  }
  try {
    return fromZonedTime(`${trade.date}T00:00:00`, NY_TIME_ZONE).getTime();
  } catch {
    const direct = new Date(trade.date);
    return Number.isNaN(direct.getTime()) ? 0 : direct.getTime();
  }
};

function formatNumber(value: number | undefined, decimals = 2) {
  if (value === undefined || value === null) return '数据缺失';
  if (!Number.isFinite(value)) return '数据缺失';
  return value.toFixed(decimals);
}

export function TradesTable({ trades }: { trades: EnrichedTrade[] }) {
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch('/data/symbol_name_map.json')
      .then((r) => r.json())
      .then((j) => setNameMap(j))
      .catch(err => console.error('加载符号名称失败', err));
  }, []);

  const invalidTrades = trades.filter(t => !t.action);
  if (invalidTrades.length) {
    console.warn('Invalid trades passed to TradesTable:', invalidTrades);
  }
  const validTrades = trades.filter(t => !!t.action);
  if (validTrades.length === 0) {
    return <div className="text-center p-4">No trades available or import failed.</div>;
  }

  const weekdayMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const sortedRecent = [...validTrades]
    .sort((a, b) => getSortValue(b) - getSortValue(a))
    .slice(0, 100);

  return (
    <table id="trades" className="table">
      <thead>
        <tr>
          <th>日期</th>
          <th>时间</th>
          <th>星期</th>
          <th>图标</th>
          <th>代码</th>
          <th>中文</th>
          <th>方向</th>
          <th>单价</th>
          <th>数量</th>
          <th>订单金额</th>
          <th>详情</th>
        </tr>
      </thead>
      <tbody>
        {sortedRecent.map((trade, idx) => {
          const weekdayIndex = getWeekdayIndex(trade);
          const weekday =
            typeof weekdayIndex === 'number'
              ? weekdayMap[weekdayIndex] ?? '数据缺失'
              : '数据缺失';
          const colorSide = (trade.action === 'buy' || trade.action === 'cover')
            ? 'green'
            : (trade.action === 'sell' || trade.action === 'short')
              ? 'red'
              : 'white';
          const qtyColor = colorSide;
          const amount = trade.price * trade.quantity;
          return (
            <tr key={idx}>
              <td>{trade.date}</td>
              <td>{getTimeDisplay(trade)}</td>
              <td>{weekday}</td>
              <td>
                <SymbolLogo
                  className="logo"
                  symbol={trade.symbol}
                  alt={trade.symbol}
                  width={36}
                  height={36}
                />
              </td>
              <td>{trade.symbol}</td>
              <td className="cn">{nameMap[trade.symbol] || '数据缺失'}</td>
              <td className={colorSide}>{trade.action ? trade.action.toUpperCase() : 'UNKNOWN'}</td>
              <td>{formatNumber(trade.price)}</td>
              <td className={qtyColor}>{trade.quantity}</td>
              <td>{formatNumber(amount)}</td>
              <td><a href={`/stock?symbol=${trade.symbol}`} className="details">详情</a></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}