'use client';

import { useQueries } from "@tanstack/react-query";
import type { Position } from "@/lib/services/dataService";
import { fetchRealtimeQuote } from "@/lib/services/priceService";
import { useEffect, useState, useMemo } from "react";
import SymbolLogo from "@/components/SymbolLogo";
import type { EnrichedTrade } from '@/lib/fifo';
import { useStore } from '@/lib/store';
import { formatCurrency } from '@/lib/metrics';
import { logger } from '@/lib/logger';
import { PriceBadge } from '@/components/PriceBadge';

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
  const metrics = useStore(state => state.metrics);

  const results = useQueries({
    queries: positions.map((pos) => ({
      queryKey: ['quote', pos.symbol],
      queryFn: () => fetchRealtimeQuote(pos.symbol),
      staleTime: 0, // 立即过期，每次都重新请求
      cacheTime: 0, // 不缓存
      // 为减少频繁请求导致的加载压力，改为每5分钟刷新一次
      refetchInterval: 1000 * 60 * 5, // 每5分钟自动刷新
      retry: 2, // 失败时重试2次
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      initialData: () => {
        const last = Number.isFinite(pos.last) ? pos.last : undefined;
        if (last === undefined) return undefined;
        return {
          price: last,
          stale: pos.stale,
          priceOk: pos.priceOk,
          updatedAt: pos.lastUpdatedAt,
        };
      },
      initialDataUpdatedAt: pos.lastUpdatedAt,
    })),
  });

  // Chinese name map
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch('/data/symbol_name_map.json')
      .then((res) => res.json())
      .then((json) => setNameMap(json))
      .catch(err => console.error('加载符号名称失败', err));
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

  // 计算市值、浮动盈亏和当日盈亏
  const positionSummaries = useMemo(() => {
    // 添加日志帮助调试
    logger.debug('持仓数据:', positions);
    logger.debug('Price API results:', positions.map((pos, idx) => ({
      symbol: pos.symbol,
      qty: pos.qty,
      avgPrice: pos.avgPrice,
      apiResult: results[idx]?.status,
      hasData: results[idx]?.data !== undefined,
      data: results[idx]?.data,
      error: results[idx]?.error
    })));

    return positions.map((pos, idx) => {
      const result = results[idx];
      const fallbackPrice = Number.isFinite(pos.last) ? pos.last : pos.avgPrice;
      const lastPrice =
        result?.data && typeof result.data.price === 'number'
          ? result.data.price
          : fallbackPrice;
      const resolvedPrice = Number.isFinite(lastPrice) ? lastPrice : pos.avgPrice;
      const prevClose = Number(pos.prevClose);
      const hasPrevClose = Number.isFinite(prevClose);

      // 修改：对于空头持仓，市值应该是正数（使用绝对值）
      const isShort = pos.qty < 0;
      const signedMarketValue = resolvedPrice * pos.qty;
      const marketValue = isShort ? Math.abs(signedMarketValue) : signedMarketValue;
      // 按 (实时价格 - 成本价格) × 数量 计算浮动盈亏
      const unrealized = (resolvedPrice - pos.avgPrice) * pos.qty;
      const intraday = hasPrevClose
        ? signedMarketValue - prevClose * pos.qty
        : undefined;

      logger.debug(`${pos.symbol} 市值计算:`, {
        lastPrice: resolvedPrice,
        qty: pos.qty,
        isShort,
        rawMarket: resolvedPrice * pos.qty,
        market: marketValue,
        avgPrice: pos.avgPrice,
        unrealized,
        prevClose,
        intraday,
      });

      return { market: marketValue, unrealized, intraday };
    });
  }, [positions, results]);

  // 计算总计
  const totals = useMemo(() => {
    logger.debug('计算总计，positionSummaries:', positionSummaries);

    const totalMarketValue = positionSummaries.reduce((sum, item) => sum + item.market, 0);
    const totalUnrealized = positionSummaries.reduce((sum, item) => sum + item.unrealized, 0);
    const hasIntraday = positionSummaries.some(item => item.intraday !== undefined);
    const totalIntraday = positionSummaries.reduce((sum, item) => sum + (item.intraday ?? 0), 0);
    const totalRealized = metrics?.M9 || 0; // 所有历史平仓盈利
    const totalPnL = totalUnrealized + totalRealized;

    logger.debug('总计结果:', {
      totalMarketValue,
      totalUnrealized,
      totalIntraday,
      totalRealized,
      totalPnL
    });

    return {
      marketValue: totalMarketValue,
      unrealized: totalUnrealized,
      intraday: hasIntraday ? totalIntraday : undefined,
      realized: totalRealized,
      total: totalPnL
    };
  }, [positionSummaries, metrics?.M9]);

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
            <th>当日浮盈亏</th>
            <th>浮动百分比</th>
            <th>标的盈亏</th>
            <th>历史交易次数</th>
            <th>详情</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((pos, idx) => {
            const result = results[idx];
            const fallbackPrice = Number.isFinite(pos.last) ? pos.last : pos.avgPrice;
            const lastPrice =
              result?.data && typeof result.data.price === 'number'
                ? result.data.price
                : fallbackPrice;
            const resolvedPrice = Number.isFinite(lastPrice) ? lastPrice : pos.avgPrice;
            const isStale = result?.data?.stale ?? pos.stale;
            const isPending = result?.isFetching ?? false;
            const isError = result?.isError;
            const prevClose = Number(pos.prevClose);
            const hasPrevClose = Number.isFinite(prevClose);

            // 使用回退价格计算市值和浮动盈亏
            const isShort = pos.qty < 0;
            const signedMarketValue = resolvedPrice * pos.qty;
            const marketValue = isShort ? Math.abs(signedMarketValue) : signedMarketValue;
            const unrealized = (resolvedPrice - pos.avgPrice) * pos.qty;
            // 当日浮盈亏 = 今日市值 - 昨日市值
            const intraday = hasPrevClose
              ? signedMarketValue - prevClose * pos.qty
              : undefined;
            const unrealizedPercent =
              resolvedPrice && pos.avgPrice ? (resolvedPrice - pos.avgPrice) / pos.avgPrice : undefined;

            const realized = getRealized(pos.symbol);
            const totalPNL = unrealized + realized;

            const intradayClass =
              intraday !== undefined ? (intraday > 0 ? 'green' : intraday < 0 ? 'red' : '') : '';
            const totalClass = totalPNL > 0 ? 'green' : totalPNL < 0 ? 'red' : '';
            const percentClass = unrealizedPercent !== undefined ? (unrealizedPercent > 0 ? 'green' : unrealizedPercent < 0 ? 'red' : '') : '';

            return (
              <tr key={pos.symbol}>
                <td>
                  <SymbolLogo
                    className="logo"
                    symbol={pos.symbol}
                    alt={pos.symbol}
                    width={36}
                    height={36}
                  />
                </td>
                <td>{pos.symbol}</td>
                <td>{nameMap[pos.symbol] || '--'}</td>
                <td>
                  <PriceBadge price={resolvedPrice} stale={isStale} pending={isPending} />
                  {isError && !isPending && (
                    <span className="ml-2 text-xs text-red-500">获取失败</span>
                  )}
                </td>
                <td>{pos.qty}</td>
                <td>{formatNumber(pos.avgPrice)}</td>
                <td>{formatNumber(marketValue)}</td>
                <td>{formatNumber(pos.avgPrice)}</td>
                <td className={intradayClass}>{formatNumber(intraday)}</td>
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
            <td><strong>{formatCurrency(totals.marketValue)}</strong></td>
            <td></td>
            <td
              className={
                totals.intraday !== undefined
                  ? totals.intraday > 0
                    ? 'green'
                    : totals.intraday < 0
                      ? 'red'
                      : ''
                  : ''
              }
            >
              <strong>{totals.intraday !== undefined ? formatCurrency(totals.intraday) : '--'}</strong>
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