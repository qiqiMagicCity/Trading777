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
import {
  buildIntradayFloatingBreakdown,
  buildIntradayFloatingPnlMap,
  calculateIntradayValue,
  getResolvedPrice,
  normalizeSymbol,
  type IntradayFloatingBreakdownEntry,
  type IntradayValueResult,
} from "./positionMetrics";
import { round4 } from "@/app/lib/precision";

function formatNumber(value: number | undefined, decimals = 2) {
  if (value === undefined || value === null) return '--';
  return value.toFixed(decimals);
}

// 格式化百分比
function formatPercent(value: number | undefined) {
  if (value === undefined || value === null) return '--';
  return `${(value * 100).toFixed(2)}%`;
}

function format4(value: number | undefined): string {
  if (!Number.isFinite(value)) return "--";
  return round4(value as number).toFixed(4);
}

function formatQuantity(value: number | undefined): string {
  if (!Number.isFinite(value)) return "--";
  return (value as number).toString();
}

function formatAmount(value: number | undefined): string {
  if (!Number.isFinite(value)) return "0.0000";
  return round4(value as number).toFixed(4);
}

function buildIntradayTooltip(
  result: IntradayValueResult,
  entry: IntradayFloatingBreakdownEntry | undefined,
): string | undefined {
  if (!entry) {
    if (result.status === "missing") {
      return result.message;
    }
    if (result.status === "ok") {
      return "缺少拆解明细，暂无法展示两桶法细节。";
    }
    return undefined;
  }

  const qNow = Number.isFinite(entry.qNow) ? (entry.qNow as number) : 0;
  const qOvernight = Number.isFinite(entry.qOvernight)
    ? (entry.qOvernight as number)
    : 0;
  const todayQty = Math.abs(qNow - qOvernight);
  const direction = qNow > 0 ? 1 : qNow < 0 ? -1 : qOvernight < 0 ? -1 : 1;
  const isLong = direction >= 0;
  const multiplier = entry.multiplier ?? 1;

  const mark = entry.mark;
  const prevClose = entry.prevClose;
  const avgToday = isLong ? entry.avgTodayLong : entry.avgTodayShort;

  let overnightPerUnit: number | undefined;
  const absOvernightQty = Math.abs(qOvernight);
  if (
    absOvernightQty > 0 &&
    Number.isFinite(mark) &&
    Number.isFinite(prevClose)
  ) {
    if (isLong) {
      overnightPerUnit = round4((mark! - prevClose!) * absOvernightQty);
    } else {
      overnightPerUnit = round4((prevClose! - mark!) * absOvernightQty);
    }
  }

  let intradayPerUnit: number | undefined;
  if (
    todayQty > 0 &&
    Number.isFinite(mark) &&
    Number.isFinite(avgToday)
  ) {
    if (isLong) {
      intradayPerUnit = round4((mark! - avgToday!) * todayQty);
    } else {
      intradayPerUnit = round4((avgToday! - mark!) * todayQty);
    }
  }

  const overnightDisplay = overnightPerUnit !== undefined
    ? round4(overnightPerUnit * multiplier)
    : 0;
  const intradayDisplay = intradayPerUnit !== undefined
    ? round4(intradayPerUnit * multiplier)
    : 0;
  const floatingDisplay = round4(
    ((overnightPerUnit ?? 0) + (intradayPerUnit ?? 0)) * multiplier,
  );

  const lines: string[] = [];
  if (overnightPerUnit !== undefined) {
    const formula = isLong
      ? `${format4(mark)}−${format4(prevClose)}`
      : `${format4(prevClose)}−${format4(mark)}`;
    const multiplierNote = multiplier !== 1
      ? `（×乘数=${multiplier} → ${formatAmount(overnightDisplay)})`
      : '';
    lines.push(
      `过夜桶 = (${formula})×${formatQuantity(absOvernightQty)} = ${formatAmount(overnightPerUnit)}${multiplierNote}`,
    );
  } else {
    if (entry.missingPrevClose) {
      lines.push("缺昨收/首日：过夜=0");
    } else {
      lines.push("过夜桶 = 0（无过夜余量或缺少昨收/实时价）");
    }
  }

  if (intradayPerUnit !== undefined) {
    const avgLabel = format4(avgToday);
    const formula = isLong
      ? `${format4(mark)}−${avgLabel}`
      : `${avgLabel}−${format4(mark)}`;
    const multiplierNote = multiplier !== 1
      ? `（×乘数=${multiplier} → ${formatAmount(intradayDisplay)})`
      : '';
    lines.push(
      `当日新开桶 = (${formula})×${formatQuantity(todayQty)} = ${formatAmount(intradayPerUnit)}${multiplierNote}`,
    );
  } else {
    lines.push("当日新开桶 = 0（无当日新开未平余量或缺少今日均价）");
  }

  if (multiplier !== 1) {
    lines.push(`乘数 = ${multiplier}`);
  }

  const overnightUnitDisplay = formatAmount(overnightPerUnit ?? 0);
  const intradayUnitDisplay = formatAmount(intradayPerUnit ?? 0);
  lines.push(
    `浮动合计 = round4((${overnightUnitDisplay} + ${intradayUnitDisplay}) × ${multiplier}) = ${formatAmount(floatingDisplay)}`,
  );
  lines.push(
    `昨净仓 / 今净仓 = ${formatQuantity(qOvernight)} / ${formatQuantity(qNow)}`,
  );
  lines.push("仅包含浮动部分；今日已实现请看‘今日已实现’栏位/明细。");
  lines.push("缺昨收时过夜桶=0；当日已实现请见‘今日已实现’。");

  return lines.join("\n");
}

interface Props {
  positions: Position[];
  trades?: EnrichedTrade[];
}

export function PositionsTable({ positions, trades }: Props) {
  const metrics = useStore(state => state.metrics);
  const intradayDataset = useMemo(
    () => buildIntradayFloatingPnlMap(metrics, positions),
    [metrics, positions],
  );
  const floatingBreakdown = useMemo(
    () => buildIntradayFloatingBreakdown(metrics, positions),
    [metrics, positions],
  );

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
      const resolvedPrice = getResolvedPrice(pos, result?.data?.price);
      const prevClose = Number(pos.prevClose);
      const hasPrevClose = Number.isFinite(prevClose);

      // 修改：对于空头持仓，市值应该是正数（使用绝对值）
      const isShort = pos.qty < 0;
      const signedMarketValue = resolvedPrice * pos.qty;
      const marketValue = isShort ? Math.abs(signedMarketValue) : signedMarketValue;
      // 按 (实时价格 - 成本价格) × 数量 计算浮动盈亏
      const unrealized = (resolvedPrice - pos.avgPrice) * pos.qty;
      const intradayResult = calculateIntradayValue(pos, intradayDataset);
      const intraday = intradayResult.status === "ok" ? intradayResult.value : undefined;

      logger.debug(`${pos.symbol} 市值计算:`, {
        lastPrice: resolvedPrice,
        qty: pos.qty,
        isShort,
        rawMarket: resolvedPrice * pos.qty,
        market: marketValue,
        avgPrice: pos.avgPrice,
        unrealized,
        prevClose,
        hasPrevClose,
        intraday,
        intradayDetail: intradayResult,
        intradayFromLegs: intradayDataset.values.get(pos.symbol?.trim().toUpperCase() ?? ""),
      });

      return { market: marketValue, unrealized, intraday, intradayResult };
    });
  }, [positions, results, intradayDataset]);

  // 计算总计
  const totals = useMemo(() => {
    logger.debug('计算总计，positionSummaries:', positionSummaries);

    const totalMarketValue = positionSummaries.reduce((sum, item) => sum + item.market, 0);
    const totalUnrealized = positionSummaries.reduce((sum, item) => sum + item.unrealized, 0);
    const allIntradayReady = positionSummaries.every(item => item.intradayResult.status === "ok");
    const totalIntraday = allIntradayReady
      ? positionSummaries.reduce((sum, item) => sum + (item.intraday ?? 0), 0)
      : undefined;
    const intradayIssueSet = new Set<string>();
    if (!allIntradayReady) {
      for (const item of positionSummaries) {
        if (item.intradayResult.status === "missing") {
          intradayIssueSet.add(item.intradayResult.message);
        }
      }
    }
    const intradayIssues = Array.from(intradayIssueSet);
    const totalRealized = metrics?.M9 || 0; // 所有历史平仓盈利
    const totalPnL = totalUnrealized + totalRealized;

    logger.debug('总计结果:', {
      totalMarketValue,
      totalUnrealized,
      totalIntraday,
      intradayIssues,
      totalRealized,
      totalPnL
    });

    return {
      marketValue: totalMarketValue,
      unrealized: totalUnrealized,
      intraday: totalIntraday,
      intradayIssues,
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
            <th
              title="仅包含过夜与今日新开未平的浮动盈亏；乘数仅在两桶求和后应用一次。今日已实现请看‘今日已实现’栏位/明细。"
            >
              当日浮动盈亏
            </th>
            <th>浮动百分比</th>
            <th>标的盈亏</th>
            <th>历史交易次数</th>
            <th>详情</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((pos, idx) => {
            const result = results[idx];
            const summary = positionSummaries[idx];
            const resolvedPrice = getResolvedPrice(pos, result?.data?.price);
            const isStale = result?.data?.stale ?? pos.stale;
            const isPending = result?.isFetching ?? false;
            const isError = result?.isError;

            // 使用回退价格计算市值和浮动盈亏
            const isShort = pos.qty < 0;
            const signedMarketValue = resolvedPrice * pos.qty;
            const marketValue = isShort ? Math.abs(signedMarketValue) : signedMarketValue;
            const unrealized = (resolvedPrice - pos.avgPrice) * pos.qty;
            // 当日盈亏：若缺乏拆解则提示待补充
            const intradayResult: IntradayValueResult = summary?.intradayResult ?? {
              status: "missing",
              reason: "missing_legs",
              message: "缺少 M6 legs 拆解数据，请补充隔夜与当日未平拆解后再查看当日盈亏。",
            };
            const intraday = intradayResult.status === "ok" ? intradayResult.value : undefined;
            const symbolKey = normalizeSymbol(pos.symbol);
            const breakdownEntry = symbolKey
              ? floatingBreakdown.values.get(symbolKey)
              : undefined;
            const intradayTooltip = buildIntradayTooltip(
              intradayResult,
              breakdownEntry,
            );
            const unrealizedPercent =
              resolvedPrice && pos.avgPrice ? (resolvedPrice - pos.avgPrice) / pos.avgPrice : undefined;

            const realized = getRealized(pos.symbol);
            const totalPNL = unrealized + realized;
            const breakEvenJ =
              typeof pos.breakEvenJ === 'number' && Number.isFinite(pos.breakEvenJ)
                ? pos.breakEvenJ
                : undefined;
            const breakEvenJSticky =
              typeof pos.breakEvenJSticky === 'number' && Number.isFinite(pos.breakEvenJSticky)
                ? pos.breakEvenJSticky
                : undefined;
            const breakEvenDirection =
              pos.breakEvenDirection === 'LONG' || pos.breakEvenDirection === 'SHORT'
                ? pos.breakEvenDirection
                : undefined;
            const breakEvenDirectionSticky =
              pos.breakEvenDirectionSticky === 'LONG' || pos.breakEvenDirectionSticky === 'SHORT'
                ? pos.breakEvenDirectionSticky
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
            const stickyPrefix = breakEvenDirectionSticky === 'SHORT'
              ? '上次空头保本价 '
              : breakEvenDirectionSticky === 'LONG'
                ? '上次多头保本价 '
                : '上次保本价 ';
            const stickyClass = breakEvenDirectionSticky === 'SHORT'
              ? 'text-xs text-red-500'
              : breakEvenDirectionSticky === 'LONG'
                ? 'text-xs text-green-500'
                : 'text-xs text-gray-500';
            const breakEvenDisplay = breakEvenJ !== undefined ? (
              <span>
                {formatNumber(Math.abs(breakEvenJ))}
                {renderDirectionTag(breakEvenDirection)}
              </span>
            ) : breakEvenJSticky !== undefined ? (
              <div className="flex flex-col items-center leading-tight">
                <span>—</span>
                <span className={stickyClass}>
                  {stickyPrefix}
                  {formatNumber(Math.abs(breakEvenJSticky))}
                </span>
              </div>
            ) : (
              <span>—</span>
            );

            const intradayClass = (() => {
              if (intradayResult.status === "missing") return "text-yellow-600";
              if (intraday === undefined) return "";
              if (intraday > 0) return "green";
              if (intraday < 0) return "red";
              return "";
            })();
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
                <td className="text-center">{breakEvenDisplay}</td>
                <td className={intradayClass} title={intradayTooltip}>
                  {intradayResult.status === "ok" ? (
                    formatNumber(intraday)
                  ) : (
                    <span>{`待补充：${intradayResult.message}`}</span>
                  )}
                </td>
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
                  : totals.intradayIssues.length > 0
                    ? 'text-yellow-600'
                    : ''
              }
            >
              <strong>
                {totals.intraday !== undefined
                  ? formatCurrency(totals.intraday)
                  : totals.intradayIssues.length > 0
                    ? `待补充：${totals.intradayIssues.join('；')}`
                    : '--'}
              </strong>
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