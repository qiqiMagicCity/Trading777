
# Trading777 v1.7.0

完整实现 8 大功能区（KPI 卡片 / 持仓 / 交易列表）——可直接推 GitHub & 部署 Vercel。

## 快速开始

```bash
npm ci
cp .env.example .env   # 填入 Supabase & Finnhub key
npm run dev            # 本地预览
```

## 构建

```
npm run build
```

输出文件位于 `dist/`，符合 Vercel 静态托管。

## 数据库迁移

在 Supabase **SQL Editor** 执行 `supabase/schema_v1.7.0.sql` 脚本（见随包提供或下方聊天）。

