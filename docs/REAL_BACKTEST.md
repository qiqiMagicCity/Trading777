# 真实回放（Real Backtest）

> 目的：把你的“真实多日交易 + 收盘价”导入 `data/real/`，离线回放并生成每日快照（realized、unrealized、M1–M13）。

## 目录结构
```
data/
  real/
    trades.csv           # 或 trades.json（二选一）
    prices.csv           # 或 prices.json（二选一）
    dailyResult.json     # 回放生成
```

## trades.csv 格式
必需列：date,time,symbol,side,qty,price
- date: YYYY-MM-DD（交易日）
- time: HH:mm（本地时间）
- side: BUY | SELL | SHORT | COVER
- qty: 正整数
- price: 成交价

示例：
```csv
date,time,symbol,side,qty,price
2025-08-01,09:35,TSLA,BUY,200,295
2025-08-01,09:38,TSLA,SELL,50,301
```

## prices.csv 格式
必需列：date,symbol,close
示例：
```csv
date,symbol,close
2025-08-01,TSLA,302.63
```

## 运行回放
```bash
npm run backtest -w web -- --from=YYYY-MM-DD --to=YYYY-MM-DD
```

## 产出
- `data/real/dailyResult.json`：按日快照，字段含 realized（M4+M5.2）、unrealized（M3）、以及 M1–M13。
- UI 与脚本口径通过 `normalizeMetrics` 统一，M6 恒等式：M6 = M4 + M3 + M5.2。
