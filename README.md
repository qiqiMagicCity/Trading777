
# Trading777 v1.7.0

## 快速开始

```bash
npm install
cp .env.example .env      # 填写 Supabase & Finnhub Key
npm run dev
```

### 部署

```bash
npm run build
```

### 数据库迁移

```sql
\i supabase/schema_v1.7.0.sql
```

## KPI 公式

| 指标 | 公式 |
|------|------|
| 账户持仓金额 | Σ |qty| × cost |
| 日内交易统计 | 卖买差价 × qty (当日) |
| 当日盈亏统计 | (实时价 - 昨收) × 当前持仓数 |
| 当日交易次数 | COUNT(*) 当日 |
| 累计交易笔数 | COUNT(*) |
| WTD / MTD / YTD | 同上，按周/月/年筛选 |
