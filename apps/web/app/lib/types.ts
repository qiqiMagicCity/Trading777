export type DailyResult = {
  date: string;       // YYYY-MM-DD
  realized: number;   // M4 + M5.2
  unrealized: number; // M3
  /** 每日浮盈变化量 */
  unrealizedDelta?: number;
};
