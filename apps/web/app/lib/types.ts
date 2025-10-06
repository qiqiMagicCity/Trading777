type DailyResultBase<T extends number | string | null | undefined> = {
  date: string; // YYYY-MM-DD
  realized: T; // M4 + M5.2
  unrealized: T; // M3
  /** 每日浮盈变化量 */
  unrealizedDelta?: T;
};

export type DailyResultInput = DailyResultBase<number | string | null | undefined>;

export type DailyResult = DailyResultBase<number>;
