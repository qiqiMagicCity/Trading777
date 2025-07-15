'use client';

import type { EnrichedTrade } from "@/lib/fifo";
import type { Position } from '@/lib/services/dataService';
import { useEffect, useState } from 'react';

function sum(arr: number[]) { return arr.reduce((a, b) => a + b, 0); }

interface Props { enrichedTrades: EnrichedTrade[]; positions: Position[] }

interface DailyResult { date: string; realized: number; float: number; pnl: number; }

export function DashboardMetrics({ enrichedTrades, positions }: Props) {
  // helper funcs
  const todayStr = new Date().toISOString().slice(0, 10);
  function formatCurrency(value: number) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value).replace('$', '');
  }

  // -------------------- M1–M3 (existing) --------------------
  const totalCost = sum(positions.map(p => p.avgPrice * Math.abs(p.qty)));
  const currentValue = sum(positions.map(p => p.last * p.qty));
  const floatPnl = currentValue - totalCost; // M3

  // -------------------- M4 当日已实现盈亏 --------------------
  const todayRealizedPnl = enrichedTrades
    .filter(t => t.date.startsWith(todayStr))
    .reduce((acc, t) => acc + (t.realizedPnl || 0), 0);

  // -------------------- M5 日内交易：交易视角 vs FIFO视角 --------------------
  // 交易视角: 只匹配今日内部的买卖
  function calcTodayTradePnL() {
    const map: Record<string, { qty: number; price: number }[]> = {};
    let pnl = 0;
    enrichedTrades
      .filter(t => t.date.startsWith(todayStr))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .forEach(t => {
        const { symbol, action, quantity, price } = t;
        if (!map[symbol]) map[symbol] = [];
        const stack = map[symbol];
        if (action === 'buy' || action === 'cover') {
          stack.push({ qty: quantity, price });
        } else { // sell or short
          let remain = quantity;
          while (remain > 0 && stack.length) {
            const batch = stack[0]!;
            const q = Math.min(batch.qty, remain);
            pnl += (price - batch.price) * q;
            batch.qty -= q;
            remain -= q;
            if (batch.qty === 0) stack.shift();
          }
        }
      });
    return pnl;
  }

  // FIFO视角：今日 SELL 针对历史仓位
  function calcTodayFifoPnL() {
    // Build FIFO stacks with trades BEFORE today
    const fifo: Record<string, { qty: number; price: number }[]> = {};
    enrichedTrades
      .filter(t => !t.date.startsWith(todayStr))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .forEach(t => {
        const { symbol, action, quantity, price } = t;
        if (!fifo[symbol]) fifo[symbol] = [];
        const stack = fifo[symbol];
        if (action === 'buy' || action === 'cover') {
          stack.push({ qty: quantity, price });
        } else { // sell or short
          // sell reduces previous buys
          let remain = quantity;
          while (remain > 0 && stack.length) {
            const batch = stack[0]!;
            const q = Math.min(batch.qty, remain);
            batch.qty -= q;
            remain -= q;
            if (batch.qty === 0) stack.shift();
          }
        }
      });

    // Now apply today's sells vs fifo stacks
    let pnl = 0;
    enrichedTrades
      .filter(t => t.date.startsWith(todayStr) && (t.action === 'sell' || t.action === 'short'))
      .forEach(t => {
        const { symbol, quantity, price } = t;
        const stack = fifo[symbol] || [];
        let remain = quantity;
        while (remain > 0 && stack.length) {
          const batch = stack[0]!;
          const q = Math.min(batch.qty, remain);
          pnl += (price - batch.price) * q;
          batch.qty -= q;
          remain -= q;
          if (batch.qty === 0) stack.shift();
        }
      });
    return pnl;
  }
  const pnlTrade = calcTodayTradePnL();
  const pnlFifo = calcTodayFifoPnL();

  // -------------------- M6 当日浮动盈亏 --------------------
  const todayFloatPnl = floatPnl + todayRealizedPnl;

  // -------------------- M7 当日交易次数 --------------------
  const todayTradeCounts = enrichedTrades.filter(t => t.date.startsWith(todayStr)).length;

  // -------------------- M8 累计交易次数 --------------------
  const allCounts = {
    B: enrichedTrades.filter(t => t.action === 'buy' || t.action === 'cover').length,
    S: enrichedTrades.filter(t => t.action === 'sell' || t.action === 'short').length,
    P: 0,
    C: 0,
  };
  const totalTrades = allCounts.B + allCounts.S; // P,C not used

  // -------------------- M9 历史已实现盈亏（不含今日） --------------------
  const historicalRealizedPnl = enrichedTrades
    .filter(t => !t.date.startsWith(todayStr))
    .reduce((acc, t) => acc + (t.realizedPnl || 0), 0);

  // -------------------- M10 胜率 --------------------
  const winningTrades = enrichedTrades.filter(t => (t.realizedPnl || 0) > 0).length;
  const losingTrades = enrichedTrades.filter(t => (t.realizedPnl || 0) < 0).length;
  const winRate = winningTrades + losingTrades > 0 ? (winningTrades / (winningTrades + losingTrades)) * 100 : 0;

  // -------------------- M11–M13 使用 dailyResult.json --------------------
  const [dailyResults, setDailyResults] = useState<DailyResult[]>([]);
  useEffect(() => {
    fetch('/dailyResult.json')
      .then(res => res.json())
      .then((data: DailyResult[]) => setDailyResults(data))
      .catch(() => setDailyResults([]));
  }, []);

  function sumSince(list: DailyResult[], since: string) {
    return list.filter(r => r.date >= since).reduce((acc, r) => acc + r.pnl, 0);
  }
  function calcWTD(list: DailyResult[]) {
    if (!list.length) return 0;
    const lastDate = new Date(list[list.length - 1]!.date);
    const day = (lastDate.getDay() + 6) % 7; // Monday=0
    const monday = new Date(lastDate);
    monday.setDate(lastDate.getDate() - day);
    const mondayStr = monday.toISOString().slice(0, 10);
    return sumSince(list, mondayStr);
  }
  const wtdTotal = calcWTD(dailyResults);
  const mtdTotal = sumSince(dailyResults, todayStr.slice(0, 8) + '01');
  const ytdTotal = sumSince(dailyResults, todayStr.slice(0, 5) + '01-01');

  return (
    <section id="stats" className="stats-grid">
      <div className="box">
        <div className="title">账户总成本</div>
        <div className="value" id="M1-value">{formatCurrency(totalCost)}</div>
      </div>
      <div className="box">
        <div className="title">当前市值</div>
        <div className="value" id="M2-value">{formatCurrency(currentValue)}</div>
      </div>
      <div className="box">
        <div className="title">当前浮动盈亏</div>
        <div className={`value ${floatPnl > 0 ? 'green' : floatPnl < 0 ? 'red' : 'white'}`} id="M3-value">{formatCurrency(floatPnl)}</div>
      </div>
      <div className="box">
        <div className="title">当日已实现盈亏</div>
        <div className={`value ${todayRealizedPnl > 0 ? 'green' : todayRealizedPnl < 0 ? 'red' : 'white'}`} id="M4-value">{formatCurrency(todayRealizedPnl)}</div>
      </div>
      <div className="box">
        <div className="title">日内交易</div>
        <div className="value" id="M5-value">{formatCurrency(pnlTrade)}</div>
      </div>
      <div className="box">
        <div className="title">当日浮动盈亏</div>
        <div className={`value ${todayFloatPnl > 0 ? 'green' : todayFloatPnl < 0 ? 'red' : 'white'}`} id="M6-value">{formatCurrency(todayFloatPnl)}</div>
      </div>
      <div className="box">
        <div className="title">当日交易次数</div>
        <div className="value" id="M7-value">{todayTradeCounts}</div>
      </div>
      <div className="box">
        <div className="title">累计交易次数</div>
        <div className="value" id="M8-value">{totalTrades}</div>
      </div>
      <div className="box">
        <div className="title">历史已实现盈亏</div>
        <div className={`value ${historicalRealizedPnl > 0 ? 'green' : historicalRealizedPnl < 0 ? 'red' : 'white'}`} id="M9-value">{formatCurrency(historicalRealizedPnl)}</div>
      </div>
      <div className="box">
        <div className="title">胜率</div>
        <div className="value" id="M10-value">{winRate.toFixed(1)}%</div>
      </div>
      <div className="box">
        <div className="title">WTD</div>
        <div className={`value ${wtdTotal > 0 ? 'green' : wtdTotal < 0 ? 'red' : 'white'}`} id="M11-value">{formatCurrency(wtdTotal)}</div>
      </div>
      <div className="box">
        <div className="title">MTD</div>
        <div className={`value ${mtdTotal > 0 ? 'green' : mtdTotal < 0 ? 'red' : 'white'}`} id="M12-value">{formatCurrency(mtdTotal)}</div>
      </div>
      <div className="box">
        <div className="title">YTD</div>
        <div className={`value ${ytdTotal > 0 ? 'green' : ytdTotal < 0 ? 'red' : 'white'}`} id="M13-value">{formatCurrency(ytdTotal)}</div>
      </div>
    </section>
  );
} 