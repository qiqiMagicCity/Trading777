// 全局 Supabase 初始化。请在 Vercel Dashboard 的 Environment Variables
// 中设置 SUPABASE_URL 与 SUPABASE_ANON_KEY，然后在 HTML 中通过
// <script>window.SUPABASE_URL = "..."; window.SUPABASE_ANON_KEY = "...";</script>
// 或者直接把下面两行改成你的值。
const SUPABASE_URL  = window.SUPABASE_URL  || 'YOUR_SUPABASE_URL';
const SUPABASE_KEY  = window.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.3'
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);