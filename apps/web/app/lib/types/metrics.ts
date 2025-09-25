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
  _m6?: { overnightPnL: number; warnings: string[] };
  M7?: any; M8?: any; M9?: number; M10?: any; M11?: any; M12?: any; M13?: any;
  aux?: {
    breakdown?: BreakdownRow[];
    m6PriceChange?: number;
    /** 截至昨收的累计已实现盈亏 */
    m6PrevRealizedTotal?: number;
    /** 今日 FIFO 已实现盈亏（与 M5.fifo 一致，便于拆解展示） */
    m6FifoToday?: number;
    /** M6 逐标的 MTM 拆解 */
    m6Legs?: Array<{
      symbol: string;
      qty: number;
      prevClose: number;
      priceNow: number;
      fx: number;
      mtm: number;
    }>;
    /** 因行情缺失等原因未计入 MTM 的标的 */
    m6Excluded?: Array<{
      symbol: string;
      reason: "MISSING_PREV_CLOSE" | "MISSING_MARK";
    }>;
    missingPrevCloseSymbols?: string[];
  };
}
