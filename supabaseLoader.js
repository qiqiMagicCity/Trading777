(() => {
  const cdns = [
    'https://cdn.staticfile.org/@supabase/supabase-js/2.43.3/umd/supabase.min.js',
    'https://unpkg.com/@supabase/supabase-js@2.43.3/dist/umd/supabase.min.js',
    'https://esm.sh/@supabase/supabase-js@2.43.3/dist/supabase.min.js'
  ];
  function load(idx = 0) {
    if (idx >= cdns.length) {
      console.error('[SupabaseLoader] All CDNs failed');
      return;
    }
    const s = document.createElement('script');
    s.src = cdns[idx];
    s.onload = () => {
      console.log('[SupabaseLoader] Loaded from', cdns[idx]);
      window.__supabaseSdkLoaded = true;
      window.__supabaseReady && window.__supabaseReady();
    };
    s.onerror = () => {
      console.warn('[SupabaseLoader] Failed:', cdns[idx]);
      load(idx + 1);
    };
    document.head.appendChild(s);
  }
  load();
})();