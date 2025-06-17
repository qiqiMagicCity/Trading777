/**
 * 在 SDK 加载完成后，创建全局 Supabase 实例：
 * 1. 优先使用环境变量注入 (import.meta.env.VITE_SUPABASE_* )
 * 2. 若变量为空，则回退到硬编码的 URL & anon key
 */
(function createClientWhenSDKReady() {
  const ensure = () => {
    if (!window.__supabaseSdkLoaded || !window.supabase) {
      return false;
    }
    if (!window.__supabaseClient) {
      const supabaseUrl = import.meta?.env?.VITE_SUPABASE_URL || 'https://zcosfwmtatuheqrytvad.supabase.co';
      const supabaseAnonKey = import.meta?.env?.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpjb3Nmd210YXR1aGVxcnl0dmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk0MTE0ODUsImV4cCI6MjA2NDk4NzQ4NX0.y5T5cf8BNsbbM5Va0kjHX1i359J1aAB4RYO6p16TKqk';
      window.__supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
      console.log('[Supabase] Client created');
    }
    return true;
  };

  window.__supabaseReady = () => {
    if (ensure() && typeof window.__afterSupabaseReady === 'function') {
      window.__afterSupabaseReady();
    }
  };
})();