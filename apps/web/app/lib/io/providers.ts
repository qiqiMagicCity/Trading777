// 统一 IO 接口定义
export type IoProvider = {
  loadTrades: (baseUrl?: string) => Promise<unknown>;
  loadPositions: (baseUrl?: string) => Promise<unknown>;
  loadDailyResults: (baseUrl?: string) => Promise<unknown>;
  loadClosePrices?: (baseUrl?: string) => Promise<unknown>;
};

// API 版（通过已存在的 /api/* 拉取，避免 FS/public 打包进 lambda）
export const apiIoProvider: IoProvider = {
  async loadTrades(base = "") {
    const response = await fetch(`${base}/api/trades`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`loadTrades failed: ${response.status}`);
    }
    return response.json();
  },
  async loadPositions(base = "") {
    const response = await fetch(`${base}/api/trades?kind=positions`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`loadPositions failed: ${response.status}`);
    }
    return response.json();
  },
  async loadDailyResults(base = "") {
    const response = await fetch(`${base}/api/close-price?kind=dailyResults`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`loadDailyResults failed: ${response.status}`);
    }
    return response.json();
  },
  async loadClosePrices(base = "") {
    const response = await fetch(`${base}/api/close-price`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`loadClosePrices failed: ${response.status}`);
    }
    return response.json();
  },
};
