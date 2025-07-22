'use client';

import { useQueries } from "@tanstack/react-query";
import type { Position } from "@/lib/services/dataService";
import { fetchRealtimeQuote } from "@/lib/services/priceService";
import { useEffect, useState, useMemo } from "react";
import type { EnrichedTrade } from '@/lib/fifo';
import { useStore } from '@/lib/store';
import { formatCurrency } from '@/lib/metrics';

function formatNumber(value: number | undefined, decimals = 2) {
  if (value === undefined || value === null) return '--';
  return value.toFixed(decimals);
}

// 格式化百分比
function formatPercent(value: number | undefined) {
  if (value === undefined || value === null) return '--';
  return `${(value * 100).toFixed(2)}%`;
}

interface Props {
  positions: Position[];
  trades?: EnrichedTrade[];
}

/** 根据 trades 动态计算每个标的的「盈亏平衡价」——即在经历过部分平仓后，为剩余仓位分摊历史已实现盈亏后的成本价 */
function getBreakEvenPrice(symbol: string, qty: number, trades?: EnrichedTrade[]): number | undefined {
  if (!trades || qty === 0) return undefined;
  // 找到该 symbol 最新的一笔（即最后一笔）交易的 breakEvenPrice 字段
  for (let i = trades.length - 1; i >= 0; i--) {
    const t = trades[i];
    if (t.symbol === symbol && typeof t.breakEvenPrice === 'number') {
      return t.breakEvenPrice;
    }
  }
  return undefined;
}

export function PositionsTable({ positions, trades }: Props) {
  const metrics = useStore(state => state.metrics);

  const results = useQueries({
    queries: positions.map((pos) => ({
      queryKey: ['quote', pos.symbol],
      queryFn: () => fetchRealtimeQuote(pos.symbol),
      staleTime: 0,
      cacheTime: 0,
      refetchInterval: 1000 * 60, // 每分钟刷新
      retry: 2,
      refetchOnWindowFocus: true,
      refetchOnMount: true,
    })),
  });

  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch('/data/symbol_name_map.json')
      .then((res) => res.json())
      .then((data) => setNameMap(data || {}))
      .catch(() => {});
  }, []);

  /** 取某只股票的历史已实现盈亏 */
  const getRealized = (symbol: string) => {
    if (!trades) return 0;
    return trades
      .filter((t) => t.symbol === symbol && t.realizedPnl !== undefined)
      .reduce((sum, t) => sum + (t.realizedPnl || 0), 0);
  };

  /** 取某只股票的历史成交次数 */
  const getTradeCount = (symbol: string) => {
    if (!trades) return '--';
    return trades.filter((t) => t.symbol === symbol).length;
  };

  /** 预先根据行情结果与 break-even 价计算市值 / 浮动盈亏 */
  const marketValues = useMemo(() => {
    return positions.map((pos, idx) => {
      const result = results[idx];
      const lastPrice = result?.data !== undefined ? result.data : pos.avgPrice; // 若报价失败则使用 avgPrice 兜底

      // 优先使用动态 breakEvenPrice；若不可用再回退 avgPrice
      const breakEvenPrice = getBreakEvenPrice(pos.symbol, pos.qty, trades) ?? pos.avgPrice;

      const unrealized = (lastPrice - breakEvenPrice) * pos.qty;

      const isShort = pos.qty < 0;
      const marketValue = isShort ? Math.abs(lastPrice * pos.qty) : lastPrice * pos.qty;

      return { marketValue, unrealized };
    });
  }, [positions, results, trades]);

  /** 汇总 */
  const totals = useMemo(() => {
    const totalMarketValue = marketValues.reduce((sum, m) => sum + m.marketValue, 0);
    const totalUnrealized = marketValues.reduce((sum, m) => sum + m.unrealized, 0);
    const totalRealized = metrics?.M9 || 0;
    return {
      marketValue: totalMarketValue,
      unrealized: totalUnrealized,
      total: totalUnrealized + totalRealized,
    };
  }, [marketValues, metrics?.M9]);

  return (
    <div>
      <table id="positions" className="table">
        <thead>
          <tr>
            <th>logo</th>
            <th>代码</th>
            <th>中文</th>
            <th>实时价格</th>
            <th>目前持仓</th>
            <th>持仓单价</th>
            <th>持仓金额</th>
            <th>盈亏平衡点</th>
            <th>当前浮盈亏</th>
            <th>浮动百分比</th>
            <th>标的盈亏</th>
            <th>历史交易次数</th>
            <th>详情</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((pos, idx) => {
            const result = results[idx];
            const lastPrice = result?.data !== undefined ? result.data : pos.avgPrice;
            const isLoading = result?.isLoading;
            const isError = result?.isError;

            const breakEvenPrice = getBreakEvenPrice(pos.symbol, pos.qty, trades) ?? pos.avgPrice;

            const unrealized = (lastPrice - breakEvenPrice) * pos.qty;
            const unrealizedPercent = breakEvenPrice ? (lastPrice - breakEvenPrice) / breakEvenPrice : undefined;

            const realized = getRealized(pos.symbol);

            const isShort = pos.qty < 0;
            const marketValue = isShort ? Math.abs(lastPrice * pos.qty) : lastPrice * pos.qty;

            const pnlClass = unrealized > 0 ? 'green' : unrealized < 0 ? 'red' : '';
            const totalPNL = unrealized + realized;
            const totalClass = totalPNL > 0 ? 'green' : totalPNL < 0 ? 'red' : '';
            const percentClass = unrealizedPercent !== undefined
              ? (unrealizedPercent > 0 ? 'green' : unrealizedPercent < 0 ? 'red' : '')
              : '';

            return (
              <tr key={pos.symbol}>
                <td><img className="logo" src={`/logos/${pos.symbol}.png`} alt={pos.symbol} /></td>
                <td>{pos.symbol}</td>
                <td>{nameMap[pos.symbol] || '--'}</td>
                <td>
                  {isLoading && <span className="loading">加载中...</span>}
                  {isError && <span className="error">获取失败</span>}
                  {!isLoading && !isError && formatNumber(lastPrice)}
                </td>
                <td>{pos.qty}</td>
                <td>{formatNumber(pos.avgPrice)}</td>
                <td>{formatNumber(marketValue)}</td>
                <td>{formatNumber(breakEvenPrice)}</td>
                <td className={pnlClass}>{formatNumber(unrealized)}</td>
                <td className={percentClass}>{unrealizedPercent !== undefined ? formatPercent(unrealizedPercent) : '--'}</td>
                <td className={totalClass}>{formatNumber(totalPNL)}</td>
                <td>{getTradeCount(pos.symbol)}</td>
                <td><a href={`/stock?symbol=${pos.symbol}`} className="details">详情</a></td>
              </tr>
            );
          })}
          <tr className="summary-row">
            <td colSpan={6}><strong>总计</strong></td>
            <td><strong>{formatCurrency(totals.marketValue)}</strong></td>
            <td></td>
            <td className={totals.unrealized > 0 ? 'green' : totals.unrealized < 0 ? 'red' : ''}>
              <strong>{formatCurrency(totals.unrealized)}</strong>
            </td>
            <td></td>
            <td className={totals.total > 0 ? 'green' : totals.total < 0 ? 'red' : ''}>
              <strong>{formatCurrency(totals.total)}</strong>
            </td>
            <td colSpan={2}></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}