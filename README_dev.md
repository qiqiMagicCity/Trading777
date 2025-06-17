# Trading777 v0.753

本版本在 0.752 基础上 **修复 Supabase “Invalid URL” 报错**，并再次优化首页长度及输入框/按钮宽度。

## 关键修复
1. **Supabase 客户端初始化**
   - 在 `js_supabaseClient.js` 中直接硬编码项目公共 Anon Key，避免静态站点无法注入环境变量导致 `Invalid URL`。
   - 若需隐藏，可删除硬编码并在每个 HTML 顶部插入：
     ```html
     <script>
       window.SUPABASE_URL = 'https://zcosfwmtatuheqrytvad.supabase.co';
       window.SUPABASE_ANON_KEY = '...';
     </script>
     ```

2. **页面长度 / 滚动条**
   - `body` 使用 `min-height:100vh` + flex 布局，`main` 垂直居中。移除多余空白滚动。

3. **输入框与按钮宽度统一**
   - `max-width: 260px`，保证视觉对齐。

## 部署
1. 在 Vercel Dashboard 新建 / 更新项目，**Framework Preset 选 Other**。
2. 上传 / 推送 `Trading777_0.753.zip`。
3. 部署完成后，即可在 `/login` 使用已注册账户登录。

## 版本号
全站 Footer 已更新为 `Version 0.753`。