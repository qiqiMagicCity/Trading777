'use client';

import { useQueries } from "@tanstack/react-query";
import type { Position } from "@/lib/services/dataService";
import { fetchRealtimeQuote } from "@/lib/services/priceService";
import { useEffect, useState, useMemo } from "react";
import type { EnrichedTrade } from '@/lib/fifo';

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

export function PositionsTable({ positions, trades }: Props) {
  const results = useQueries({
    queries: positions.map((pos) => ({
      queryKey: ['quote', pos.symbol],
      queryFn: () => fetchRealtimeQuote(pos.symbol),
      staleTime: 1000 * 30, // 30秒内不重新请求
      refetchInterval: 1000 * 60, // 每分钟自动刷新
      retry: 2, // 失败时重试2次
      refetchOnWindowFocus: true,
      refetchOnMount: true
    })),
  });

  // Chinese name map
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch('/data/symbol_name_map.json')
      .then((res) => res.json())
      .then((json) => setNameMap(json))
      .catch(() => { });
  }, []);

  const getTradeCount = (symbol: string) => {
    if (!trades) return '--';
    return trades.filter((t) => t.symbol === symbol).length;
  };

  const getRealized = (symbol: string) => {
    if (!trades) return 0;
    return trades.filter(t => t.symbol === symbol && t.realizedPnl !== undefined)
      .reduce((sum, t) => sum + (t.realizedPnl || 0), 0);
  };

  // 计算总市值和总盈亏
  const totals = useMemo(() => {
    let totalMarketValue = 0;
    let totalUnrealized = 0;
    let totalRealized = 0;

    positions.forEach((pos, idx) => {
      const result = results[idx];
      if (result?.data) {
        const lastPrice = result.data;
        totalMarketValue += lastPrice * pos.qty;
        totalUnrealized += (lastPrice - pos.avgPrice) * pos.qty;
      }
      totalRealized += getRealized(pos.symbol);
    });

    return {
      marketValue: totalMarketValue,
      unrealized: totalUnrealized,
      realized: totalRealized,
      total: totalUnrealized + totalRealized
    };
  }, [positions, results, trades]);

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
            const lastPrice = result?.data;
            const isLoading = result?.isLoading;
            const isError = result?.isError;

            // 只有在有价格时才计算
            const marketValue = lastPrice ? lastPrice * pos.qty : undefined;
            const unrealized = lastPrice ? (lastPrice - pos.avgPrice) * pos.qty : undefined;
            const unrealizedPercent = lastPrice && pos.avgPrice ? (lastPrice - pos.avgPrice) / pos.avgPrice : undefined;

            const realized = getRealized(pos.symbol);
            const totalPNL = unrealized !== undefined ? unrealized + realized : realized;

            const pnlClass = unrealized !== undefined ? (unrealized > 0 ? 'green' : unrealized < 0 ? 'red' : '') : '';
            const totalClass = totalPNL > 0 ? 'green' : totalPNL < 0 ? 'red' : '';
            const percentClass = unrealizedPercent !== undefined ? (unrealizedPercent > 0 ? 'green' : unrealizedPercent < 0 ? 'red' : '') : '';

            return (
              <tr key={pos.symbol}>
                <td><img className="logo" src={`/logos/${pos.symbol}.png`} alt={pos.symbol} /></td>
                <td>{pos.symbol}</td>
                <td>{nameMap[pos.symbol] || '--'}</td>
                <td>
                  {isLoading && <span className="loading">加载中...</span>}
                  {isError && <span className="error">获取失败</span>}
                  {!isLoading && !isError && lastPrice !== undefined && formatNumber(lastPrice)}
                </td>
                <td>{pos.qty}</td>
                <td>{formatNumber(pos.avgPrice)}</td>
                <td>{marketValue !== undefined ? formatNumber(marketValue) : '--'}</td>
                <td>{formatNumber(pos.avgPrice)}</td>
                <td className={pnlClass}>{unrealized !== undefined ? formatNumber(unrealized) : '--'}</td>
                <td className={percentClass}>{unrealizedPercent !== undefined ? formatPercent(unrealizedPercent) : '--'}</td>
                <td className={totalClass}>{formatNumber(totalPNL)}</td>
                <td>{getTradeCount(pos.symbol)}</td>
                <td><a href={`/stock?symbol=${pos.symbol}`} className="details">详情</a></td>
              </tr>
            );
          })}
          {/* 总计行 */}
          <tr className="summary-row">
            <td colSpan={6}><strong>总计</strong></td>
            <td><strong>{formatNumber(totals.marketValue)}</strong></td>
            <td></td>
            <td className={totals.unrealized > 0 ? 'green' : totals.unrealized < 0 ? 'red' : ''}>
              <strong>{formatNumber(totals.unrealized)}</strong>
            </td>
            <td></td>
            <td className={totals.total > 0 ? 'green' : totals.total < 0 ? 'red' : ''}>
              <strong>{formatNumber(totals.total)}</strong>
            </td>
            <td colSpan={2}></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
} 