// Apply the saved/system theme before rendering to avoid a light flash.
(() => {
  let preference = 'system';
  try { const saved = localStorage.getItem('ok-finance-theme'); if (saved === 'light' || saved === 'dark') preference = saved; } catch {}
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = preference === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : preference;
})();
