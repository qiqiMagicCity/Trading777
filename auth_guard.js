/**
 * 在需要登录的页面调用 checkAuth()，无 session 则重定向到 login.html
 */
async function checkAuth(redirect = 'login.html') {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) window.location.href = redirect;
  } catch (err) {
    console.error('Auth check failed', err);
    window.location.href = redirect;
  }
}