export type BreakdownRow = {
  symbol: string; time: string;
  action: 'SELL'|'COVER';
  into: 'M4'|'M5.1'|'M5.2';
  qty: number;
  openPrice?: number; fifoCost?: number; closePrice: number;
  lotTag: 'T'|'H';
};

export interface MetricsContract {
  M1: number; M2: number; M3: number;
  M4: { total: number };
  M5: { behavior: number; fifo: number };
  M6: { total: number };
  M7?: any; M8?: any; M9?: number; M10?: any; M11?: any; M12?: any; M13?: any;
  aux?: {
    breakdown?: BreakdownRow[];
    m6PriceChange?: number;
    /** 今日针对昨持仓的已实现盈亏（M4.total） */
    m6RealizedToday?: number;
    /** 今日 FIFO 已实现盈亏（与 M5.fifo 一致，便于拆解展示） */
    m6FifoToday?: number;
    /** M6 逐标的 MTM 拆解 */
    m6Legs?: Array<{
      symbol: string;
      qtyPrev: number;
      prevClose: number;
      now: number;
      pxDiffInPortfolioCcy: number;
      mtm: number;
    }>;
    /** 因行情缺失等原因未计入 MTM 的标的 */
    m6Excluded?: Array<{
      symbol: string;
      reason: "NO_NOW" | "NO_PREV_CLOSE" | "ZERO_QTY";
    }>;
    missingPrevCloseSymbols?: string[];
  };
}
