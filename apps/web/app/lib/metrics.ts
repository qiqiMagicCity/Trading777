function _calcM6Strict(params: {
  positions: Position[];
  todayTrades: EnrichedTrade[]; // 仅 todayStr 的交易
  M4: number;
  M5_2: number; // FIFO 未实现（当日）
  lastPriceFallback?: (symbol: string) => number | null; // 可选：没有行情时从当日成交价取
}) {
  const { positions, todayTrades, M4, M5_2, lastPriceFallback } = params;

  // 1) 当日新开且仍未平的 lots（按 FIFO 剩余）
  const todayLots = _buildTodayLots(todayTrades);

  // 2) 做一个 Position 索引
  const posMap = new Map<string, Position>();
  for (const p of positions) if (p?.symbol) posMap.set(p.symbol, p);

  let overnightPnL = 0;
  const warnings: string[] = [];

  for (const [symbol, lots] of Object.entries(todayLots)) {
    const pos = posMap.get(symbol);
    const currentQty = Number(pos?.qty ?? 0); // 净数量（可为负）
    // 关键点：允许 currentQty===0（纯日内腿）仍计算当日未平的浮盈
    if (!Number.isFinite(currentQty)) continue;

    // 2.1 实时价与昨收
    let mark = Number(pos?.last);
    if (!Number.isFinite(mark) && typeof lastPriceFallback === "function") {
      const v = lastPriceFallback(symbol);
      if (Number.isFinite(Number(v))) mark = Number(v);
    }
    const prevClose = Number(pos?.prevClose);
    const hasMark = Number.isFinite(mark);
    const hasPrev = Number.isFinite(prevClose);

    // 2.2 当日新开仍未平的净数量（多为正、空为负）
    const todayNewSigned = (lots.longQty ?? 0) - (lots.shortQty ?? 0);

    // 2.3 过夜净数量 = 当前净仓 − 今日新开仍未平净仓
    const overnightSigned = currentQty - todayNewSigned;

    // === 当日新开未平部分 ===
    if (hasMark) {
      if (lots.longQty > 0) {
        overnightPnL += (mark - (lots.longCost || 0)) * lots.longQty;
      }
      if (lots.shortQty > 0) {
        overnightPnL += ((lots.shortCost || 0) - mark) * lots.shortQty;
      }
    } else {
      warnings.push(`SafePrice: ${symbol} 缺少实时价，当日新开未平不计入。`);
    }

    // === 过夜部分 ===
    if (Math.abs(overnightSigned) > 1e-9) {
      if (hasMark && hasPrev) {
        if (overnightSigned > 0) {
          overnightPnL += (mark - prevClose) * overnightSigned; // 多头过夜
        } else {
          overnightPnL += (prevClose - mark) * Math.abs(overnightSigned); // 空头过夜
        }
      } else {
        const miss: string[] = [];
        if (!hasMark) miss.push("实时价");
        if (!hasPrev) miss.push("昨收价");
        warnings.push(`SafePrice: ${symbol} 缺少${miss.join("与")}，过夜部分按 0 计入。`);
      }
    }
  }

  // 3) 还需考虑那些“今天没有任何交易但有持仓”的标的（全部算作过夜）
  for (const p of positions) {
    const symbol = p.symbol;
    if (!symbol || todayLots[symbol]) continue; // 已处理
    const currentQty = Number(p.qty ?? 0);
    if (!Number.isFinite(currentQty) || Math.abs(currentQty) < 1e-9) continue;

    let mark = Number(p.last);
    if (!Number.isFinite(mark) && typeof lastPriceFallback === "function") {
      const v = lastPriceFallback(symbol);
      if (Number.isFinite(Number(v))) mark = Number(v);
    }
    const prevClose = Number(p.prevClose);
    const hasMark = Number.isFinite(mark);
    const hasPrev = Number.isFinite(prevClose);

    if (hasMark && hasPrev) {
      if (currentQty > 0) overnightPnL += (mark - prevClose) * currentQty;
      else overnightPnL += (prevClose - mark) * Math.abs(currentQty);
    } else {
      const miss: string[] = [];
      if (!hasMark) miss.push("实时价");
      if (!hasPrev) miss.push("昨收价");
      warnings.push(`SafePrice: ${symbol} 缺少${miss.join("与")}，过夜部分按 0 计入。`);
    }
  }

  const M6 = M4 + M5_2 + overnightPnL;
  // 去重 warnings，避免当日未平与过夜都缺价时重复提示
  return { M6, overnightPnL, warnings: Array.from(new Set(warnings)) };
}

// === [DEBUG] M6 明细诊断：对外导出 getM6DebugBreakdown ===
export function getM6DebugBreakdown(params: {
  positions: Position[];
  todayTrades: EnrichedTrade[];
  M4: number;
  M5_2: number;
}): {
  totals: { M4: number; M5_2: number; overnightPnL: number; M6: number };
  perSymbol: Array<{
    symbol: string;
    overnightSigned: number;
    prevClose: number | null;
    mark: number | null;
    overnightPnL: number;
    today: {
      longQty: number;
      longCost: number;
      shortQty: number;
      shortCost: number;
      intradayUnrealizedPnL: number;
    };
  }>;
  warnings: string[];
} {
  const todayLots = _buildTodayLots(params.todayTrades ?? []);

  const lastTradePriceToday = new Map<string, number>();
  for (const trade of params.todayTrades ?? []) {
    if (!trade?.symbol) continue;
    const px = Number(trade.price);
    if (!Number.isFinite(px)) continue;
    lastTradePriceToday.set(trade.symbol, px);
  }

  const lastPriceFallback = (symbol: string): number | null => {
    const px = lastTradePriceToday.get(symbol);
    if (typeof px === "number" && Number.isFinite(px)) return px;
    return null;
  };

  const strict = _calcM6Strict({
    positions: params.positions ?? [],
    todayTrades: params.todayTrades ?? [],
    M4: params.M4,
    M5_2: params.M5_2,
    lastPriceFallback,
  });

  const posMap = new Map<string, Position>();
  for (const pos of params.positions ?? []) {
    if (pos?.symbol) posMap.set(pos.symbol, pos);
  }

  const symbols = new Set<string>([
    ...Object.keys(todayLots),
    ...Array.from(posMap.keys()),
  ]);

  const perSymbol: Array<{
    symbol: string;
    overnightSigned: number;
    prevClose: number | null;
    mark: number | null;
    overnightPnL: number;
    today: {
      longQty: number;
      longCost: number;
      shortQty: number;
      shortCost: number;
      intradayUnrealizedPnL: number;
    };
  }> = [];
  const warnings = new Set<string>(strict.warnings ?? []);
  let breakdownSum = 0;

  for (const symbol of symbols) {
    const lots = todayLots[symbol] ?? {
      longQty: 0,
      longCost: 0,
      shortQty: 0,
      shortCost: 0,
    };
    const pos = posMap.get(symbol);
    const currentQty = Number(pos?.qty ?? 0);

    let mark = Number(pos?.last);
    if (!Number.isFinite(mark)) {
      const fallback = lastPriceFallback(symbol);
      if (fallback !== null) mark = fallback;
    }
    const prevClose = Number(pos?.prevClose);
    const hasMark = Number.isFinite(mark);
    const hasPrev = Number.isFinite(prevClose);

    const todayNewSigned = (lots.longQty ?? 0) - (lots.shortQty ?? 0);
    const overnightSigned = currentQty - todayNewSigned;

    let intradayUnrealized = 0;
    if (hasMark) {
      if (lots.longQty > 0) {
        intradayUnrealized += (mark - (lots.longCost || 0)) * lots.longQty;
      }
      if (lots.shortQty > 0) {
        intradayUnrealized += ((lots.shortCost || 0) - mark) * lots.shortQty;
      }
    } else if ((lots.longQty ?? 0) > 0 || (lots.shortQty ?? 0) > 0) {
      warnings.add(`SafePrice: ${symbol} 缺少实时价，当日新开未平按 0 计入`);
    }

    let overnightPnL = 0;
    if (Math.abs(overnightSigned) > 1e-9) {
      if (hasMark && hasPrev) {
        if (overnightSigned > 0) {
          overnightPnL += (mark - prevClose) * overnightSigned;
        } else {
          overnightPnL += (prevClose - mark) * Math.abs(overnightSigned);
        }
      } else {
        const miss: string[] = [];
        if (!hasMark) miss.push("实时价");
        if (!hasPrev) miss.push("昨收价");
        warnings.add(`SafePrice: ${symbol} 缺少${miss.join("与")}，过夜部分按 0 计入`);
      }
    }

    breakdownSum += intradayUnrealized + overnightPnL;

    perSymbol.push({
      symbol,
      overnightSigned,
      prevClose: hasPrev ? prevClose : null,
      mark: hasMark ? mark : null,
      overnightPnL,
      today: {
        longQty: lots.longQty ?? 0,
        longCost: lots.longCost ?? 0,
        shortQty: lots.shortQty ?? 0,
        shortCost: lots.shortCost ?? 0,
        intradayUnrealizedPnL: intradayUnrealized,
      },
    });
  }

  if (Math.abs(breakdownSum - strict.overnightPnL) > 1e-6) {
    warnings.add(
      `M6_DEBUG: perSymbol 明细 (${mRound2(breakdownSum)}) 与严格总计 ${mRound2(strict.overnightPnL)} 存在 ${mRound2(
        breakdownSum - strict.overnightPnL,
      )} 的差异`,
    );
  }

  const totals = {
    M4: params.M4,
    M5_2: params.M5_2,
    overnightPnL: strict.overnightPnL,
    M6: strict.M6,
  };

  return {
    totals,
    perSymbol: perSymbol.sort((a, b) => a.symbol.localeCompare(b.symbol)),
    warnings: Array.from(warnings),
  };
}
