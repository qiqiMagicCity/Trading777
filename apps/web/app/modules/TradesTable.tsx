'use client';

import type { EnrichedTrade } from "@/lib/fifo";
import { useEffect, useState } from "react";
import Image from "next/image";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

const pad = (value: number | string): string => value.toString().padStart(2, '0');

const NY_TIME_ZONE = 'America/New_York';

const normalizeTimeText = (timeText: string): string => {
  const sanitized = timeText.replace('Z', '').split('.')[0] ?? '';
  const [h = '00', m = '00', s = '00'] = sanitized.split(':');
  return `${pad(h)}:${pad(m)}:${pad(s ?? '00')}`;
};

const parseTimeValue = (value: EnrichedTrade['time']): Date | null => {
  if (!value) return null;
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  if (typeof value === 'number') {
    const fromNumber = new Date(value);
    return Number.isNaN(fromNumber.getTime()) ? null : fromNumber;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const withoutZ = trimmed.replace(/Z$/i, '');
    const noFractions = withoutZ.replace(/\.\d+/, '');
    const normalized = noFractions.includes('T')
      ? noFractions.replace(' ', 'T')
      : `${noFractions.replace(' ', 'T')}T00:00:00`;

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
  const parsedTime = parseTimeValue(trade.time);
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
  if (!trade.time) return '--';
  if (typeof trade.time === 'string' && trade.time.includes('T')) {
    const [, timePart] = trade.time.replace('Z', '').split('T');
    if (timePart) {
      return normalizeTimeText(timePart);
    }
  }
  const parsed = parseTimeValue(trade.time);
  if (!parsed) return '--';
  return `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`;
};

const getSortValue = (trade: EnrichedTrade): number => {
  const parsed = parseTimeValue(trade.time);
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
  if (value === undefined || value === null) return '-';
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
          const weekday = typeof weekdayIndex === 'number' ? (weekdayMap[weekdayIndex] ?? '--') : '--';
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
                <Image
                  className="logo"
                  src={`/logos/${trade.symbol}.png`}
                  alt={trade.symbol}
                  width={36}
                  height={36}
                />
              </td>
              <td>{trade.symbol}</td>
              <td className="cn">{nameMap[trade.symbol] || '--'}</td>
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