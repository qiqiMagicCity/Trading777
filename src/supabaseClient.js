import { createClient } from '@supabase/supabase-js';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  alert('❗ 环境变量 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 未配置，功能将受限');
}

export const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey)
  : { auth: { getSession: async () => ({ data: { session: null } }) } };
