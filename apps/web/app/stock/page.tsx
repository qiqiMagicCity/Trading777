'use client';

import { useEffect, useState } from 'react';
import SymbolLogo from '@/components/SymbolLogo';
import { useSearchParams } from 'next/navigation';
import { findTrades } from '@/lib/services/dataService';
import { computeFifo, type EnrichedTrade } from '@/lib/fifo';
import { toNY } from '@/lib/timezone';

function formatNumber(value: number | undefined, decimals = 2) {
  if (value === undefined || value === null) return '-';
  return value.toFixed(decimals);
}

function fmtSign(n: number) {
  const cls = n > 0 ? 'green' : n < 0 ? 'red' : 'white';
  const val = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return <span className={cls}>{n < 0 ? '-' : ''}{val}</span>;
}

function fmtDollar(n: number) { return <><span className="white">$&nbsp;</span>{fmtSign(n)}</>; }
function fmtInt(n: number) { return <span className="white">{Number(n).toLocaleString()}</span>; }
function fmtWL(w: number, l: number) { return <><span className="green">W{w}</span>/<span className="red">L{l}</span></>; }

export default function StockPage() {
  const searchParams = useSearchParams();
  const symbol = searchParams.get('symbol') || '';
  const [trades, setTrades] = useState<EnrichedTrade[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!symbol) return;

    async function loadData() {
      try {
        setIsLoading(true);
        const allTrades = await findTrades();
        const validTrades = allTrades.filter(t => !!t.action);
        if (validTrades.length !== allTrades.length) {
          console.warn('Some trades have invalid action and were skipped.');
        }
        const symbolTrades = computeFifo(validTrades.filter(t => t.symbol === symbol));
        setTrades(symbolTrades);

        // 加载中文名称
        fetch('/data/symbol_name_map.json')
          .then((r) => r.json())
          .then((j) => setNameMap(j))
          .catch(err => console.error('加载符号名称失败', err));
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [symbol]);

  const zhName = nameMap[symbol] || '';
  const weekdayMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // 计算个股统计数据
  const longCnt = trades.filter(t => t.action === 'buy').length;
  const shortCnt = trades.filter(t => t.action === 'sell').length;
  const totalCnt = trades.length;
  const wins = trades.filter(t => (t.realizedPnl || 0) > 0).length;
  const losses = trades.filter(t => (t.realizedPnl || 0) < 0).length;
  const realized = trades.reduce((s, t) => s + (t.realizedPnl || 0), 0);

  const statsArr = [
    ['做多次数', fmtInt(longCnt)],
    ['做空次数', fmtInt(shortCnt)],
    ['个股交易次数', fmtInt(totalCnt)],
    ['盈亏笔数', fmtWL(wins, losses)],
    ['个股已实现盈亏', fmtDollar(realized)],
  ];

  if (isLoading) {
    return <div className="text-center p-10">Loading stock data...</div>;
  }

  return (
    <div>
      <div style={{ textAlign: 'center', marginTop: '20px' }}>
        <SymbolLogo
          id="stock-logo"
          symbol={symbol}
          alt="Logo"
          width={150}
          height={150}
          style={{ height: '150px', objectFit: 'contain' }}
        />
        <h2 className="section-title" id="title" style={{ marginTop: '10px' }}>
          {symbol}{zhName ? ` (${zhName})` : ''} 交易详情
        </h2>
      </div>

      <section className="stats-grid" id="stock-stats" style={{ gridTemplateColumns: `repeat(${statsArr.length}, 180px)` }}>
        {statsArr.map((stat, i) => (
          <div className="box" id={`stock-stat-${i + 1}`} key={i}>
            <div className="box-title">{stat[0]}</div>
            <div className="box-value">{stat[1]}</div>
          </div>
        ))}
      </section>

      <table id="detail-table" className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>日期</th>
            <th>星期</th>
            <th>统计</th>
            <th>方向</th>
            <th>单价</th>
            <th>数量</th>
            <th>订单金额</th>
            <th>盈亏平衡点</th>
            <th>盈亏</th>
            <th>目前持仓</th>
            <th>持仓成本</th>
          </tr>
        </thead>
        <tbody>
          {trades.length > 0 ? (
            trades.map((trade, idx) => {
              const dateObj = toNY(trade.date);
              const weekday = weekdayMap[dateObj.getUTCDay()];
              const plCls = (trade.realizedPnl || 0) > 0 ? 'green' : (trade.realizedPnl || 0) < 0 ? 'red' : 'white';
              const sideCls = (trade.action === 'buy' || trade.action === 'cover')
                ? 'green'
                : (trade.action === 'sell' || trade.action === 'short')
                  ? 'red'
                  : 'white';
              const amount = trade.price * trade.quantity;
              const breakEvenJ =
                typeof trade.breakEvenJ === 'number' && Number.isFinite(trade.breakEvenJ)
                  ? trade.breakEvenJ
                  : undefined;
              const breakEvenDirection =
                trade.breakEvenDirection === 'LONG' || trade.breakEvenDirection === 'SHORT'
                  ? trade.breakEvenDirection
                  : undefined;
              const renderDirectionTag = (dir?: 'LONG' | 'SHORT') => {
                if (dir === 'SHORT') {
                  return <span className="text-red-500">（空头）</span>;
                }
                if (dir === 'LONG') {
                  return <span className="text-green-500">（多头）</span>;
                }
                return null;
              };
              const historicalLong =
                typeof trade.breakEvenJStickyLong === 'number' && Number.isFinite(trade.breakEvenJStickyLong)
                  ? trade.breakEvenJStickyLong
                  : undefined;
              const historicalShort =
                typeof trade.breakEvenJStickyShort === 'number' && Number.isFinite(trade.breakEvenJStickyShort)
                  ? trade.breakEvenJStickyShort
                  : undefined;
              const historicalLines: { key: 'LONG' | 'SHORT'; label: string; value: number }[] = [];
              if (historicalLong !== undefined) {
                historicalLines.push({ key: 'LONG', label: '历史多头盈亏平衡点：', value: historicalLong });
              }
              if (historicalShort !== undefined) {
                historicalLines.push({ key: 'SHORT', label: '历史空头盈亏平衡点：', value: historicalShort });
              }
              const breakEvenDisplay = breakEvenJ !== undefined ? (
                <span>
                  {formatNumber(Math.abs(breakEvenJ))}
                  {renderDirectionTag(breakEvenDirection)}
                </span>
              ) : historicalLines.length > 0 ? (
                <div className="flex flex-col items-start leading-tight">
                  {historicalLines.map((line) => (
                    <span
                      key={line.key}
                      className={
                        line.key === 'SHORT'
                          ? 'text-xs text-red-500'
                          : line.key === 'LONG'
                            ? 'text-xs text-green-500'
                            : 'text-xs text-gray-500'
                      }
                    >
                      {line.label}
                      {formatNumber(Math.abs(line.value))}
                    </span>
                  ))}
                </div>
              ) : null;

              return (
                <tr key={idx}>
                  <td>{idx + 1}</td>
                  <td>{trade.date}</td>
                  <td>{weekday}</td>
                  <td>{trade.id}</td>
                  <td className={sideCls}>{trade.action ? trade.action.toUpperCase() : 'UNKNOWN'}</td>
                  <td>{formatNumber(trade.price)}</td>
                  <td className={sideCls}>{trade.quantity}</td>
                  <td>{formatNumber(amount)}</td>
                  <td className="text-center">{breakEvenDisplay}</td>
                  <td className={plCls}>{formatNumber(trade.realizedPnl)}</td>
                  <td>{trade.quantityAfter ?? 0}</td>
                  <td>{formatNumber(trade.averageCost)}</td>
                </tr>
              );
            })
          ) : (
            <tr><td colSpan={12}>暂无数据</td></tr>
          )}
        </tbody>
      </table>

      <div id="watermark" className="watermark">
        {symbol} {zhName}
      </div>
    </div>
  );
} 