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
      component?: "OVERNIGHT_LONG" | "OVERNIGHT_SHORT" | "TODAY_LONG" | "TODAY_SHORT";
    }>;
    /** 因行情缺失等原因未计入 MTM 的标的 */
    m6Excluded?: Array<{
      symbol: string;
      reason: "MISSING_PREV_CLOSE" | "MISSING_MARK";
    }>;
    missingPrevCloseSymbols?: string[];
  };
}

/**
 * 概览接口（直接对应后端 summary 对象）。
 * - M6 等字段沿用后端命名，不在前端重命名/复算；
 * - tradingDateStr 表示当前交易日（09:30 ET 切换）。
 */
export interface SummaryMetrics {
  M1?: number;
  M2?: number;
  M3?: number;
  M4?: number;
  M5_2?: number; // 今日未平日内（FIFO 未实现）
  M6?: number;   // 今日总盈亏（后端已按规则计算）
  M7?: number;
  _m6?: { overnightPnL: number; warnings: string[] };
  tradingDateStr?: string;
}
